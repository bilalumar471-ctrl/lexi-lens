"""
LexiLens — Lexi AI Agent (Gemini 2.0 Flash Live API).

Lexi is a patient, warm reading companion designed for dyslexic users.
She speaks in short sentences, avoids jargon, and uses the Gemini Live API
for real-time audio-in / audio-out with automatic barge-in (server VAD).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, AsyncGenerator

from google import genai
from google.genai import types

from config import get_settings
from agent.mode_router import detect_mode, get_mode_prompt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt — defines the Lexi persona
# ---------------------------------------------------------------------------

LEXI_SYSTEM_PROMPT = """\
You are ALWAYS Lexi, a kind reading companion for people who need help reading.
You are connected to a voice synthesizer — EVERYTHING YOU SAY IS SPOKEN ALOUD.
The user has a "Text Display Area" on their screen showing text they uploaded (a book, article, or document).
When the user asks about "the text" or "what it says", refer to the content they uploaded.
Crucially: If the user asks a question about the text (e.g. "who is the author?", "what is this book about?") and the answer is NOT in the text, you MUST use your own general AI knowledge to answer them as best as you can. Do NOT just say "it's not in the text".
Rules:
- Speak in maximum TWO short, simple sentences.
- NEVER say "I have...", "I am...", "I think...", or describe your process.
- ONLY speak the actual answer or explanation.
- If the user asks you to read something, read it aloud naturally.
"""


def split_sentences(text: str) -> list[str]:
    """Split text into sentences using common delimiters."""
    raw = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in raw if s.strip()]


def clean_transcript(text: str) -> str:
    """
    Structural filtering for REAL-TIME conversation only.
    Discards any sentence that sounds like meta-commentary or self-narration.
    """
    text = re.sub(r'\*\*.*?\*\*\s*', '', text) # Strip bold blocks
    
    # Structural triggers for meta-talk (case insensitive)
    meta_starts = [
        "i ", "i'm ", "i've ", "i am ", "my ", "the text", "this text", 
        "this sentence", "it seems", "based on", "specifically", "the title",
        "the subtitle", "i have ", "now ", "further", "in this", "next",
        "i believe", "i formulated", "i rephrased", "my definition",
        "analyzed", "indicates", "references", "explaining", "focusing",
        "considering", "i understand", "i'm aiming", "therefore", "the Provided",
        "it follows", "the result", "the explanation"
    ]
    
    sentences = split_sentences(text)
    kept = []
    
    for s in sentences:
        s_clean = s.strip()
        s_lower = s_clean.lower()
        
        # Discard if it starts with a meta-trigger
        if any(s_lower.startswith(trigger) for trigger in meta_starts):
            continue
            
        # Also discard if it contains classic "AI reasoning" phrases
        if any(p in s_lower for p in ["analyzed the", "formulated a", "focus is on", "rephrased it", "aim is a"]):
            continue
            
        kept.append(s_clean)
        
    return " ".join(kept).strip()


# ---------------------------------------------------------------------------
# LexiAgent — wraps a Gemini Live API session
# ---------------------------------------------------------------------------

class LexiAgent:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: genai.Client | None = None
        self._session = None
        self._session_cm = None
        self._turn_done = asyncio.Event()
        self._explaining = False 
        self._session_dead = asyncio.Event()
        self.current_mode: str = "general"

    async def connect(self):
        """Connect to Gemini Live API."""
        if self._session:
            return

        try:
            self._client = genai.Client(
                api_key=self._settings.GEMINI_API_KEY,
                http_options={"api_version": "v1alpha"}
            )

            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Puck"
                        )
                    )
                ),
                system_instruction=types.Content(
                    parts=[types.Part(text=LEXI_SYSTEM_PROMPT)]
                )
            )

            self._turn_done.clear()
            self._session_dead.clear()

            self._session_cm = self._client.aio.live.connect(
                model=self._settings.GEMINI_LIVE_MODEL,
                config=config,
            )
            if self._session_cm:
                self._session = await self._session_cm.__aenter__()
                logger.info("Connected to Gemini Live API")
            else:
                raise RuntimeError("Failed to create session context manager")

        except Exception as e:
            logger.error(f"Failed to connect to Gemini Live: {e}")
            self._session = None
            self._session_cm = None
            raise

    async def close(self) -> None:
        """Tear down the Live API session gracefully."""
        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception:
                logger.warning("Error closing Lexi session", exc_info=True)
            finally:
                self._session = None
                self._session_cm = None
                logger.info("Lexi Live session closed")

    async def send_audio(self, chunk: bytes) -> None:
        if not self._session:
            raise RuntimeError("LexiAgent is not connected. Call connect() first.")
        await self._session.send(
            input=types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
        )

    async def receive_audio(self, websocket: Any = None) -> AsyncGenerator[bytes, None]:
        """Stream audio from Gemini and forward transcripts to the client."""
        if not self._session:
            raise RuntimeError("LexiAgent is not connected. Call connect() first.")

        while True:
            try:
                async for response in self._session.receive():
                    if response.server_content and response.server_content.model_turn:
                        if websocket:
                            try:
                                await websocket.send_json({"type": "talking", "value": True})
                            except: pass
                            
                        for part in response.server_content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                yield part.inline_data.data
                            elif part.text:
                                # Check if this is thinking/reasoning (skip) vs spoken output (forward)
                                is_thought = getattr(part, 'thought', False)
                                if is_thought:
                                    logger.debug("Model thinking (skipped), length=%d", len(part.text))
                                else:
                                    # This is the actual spoken content — forward to chatlog
                                    cleaned = part.text.strip()
                                    if cleaned and websocket:
                                        logger.info("AI spoken text, length=%d", len(cleaned))
                                        try:
                                            await websocket.send_json({
                                                "type": "transcript",
                                                "text": cleaned
                                            })
                                        except: pass

                        if response.server_content.turn_complete:
                            self._turn_done.set() # Wake up anyone waiting (like explain())
                            if websocket:
                                try:
                                    await websocket.send_json({"type": "talking", "value": False})
                                except: pass
                            continue

            except Exception as e:
                logger.error(f"Error in Lexi receive loop: {e}")
                self._session_dead.set() # Signal that the session is gone
                self._turn_done.set() # Wake up any waiting explain() task
                if "503" in str(e) or "CAPACITY_EXHAUSTED" in str(e).upper():
                    if websocket:
                        try:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Lexi is a bit overwhelmed right now (AI capacity reached). Please try again in a moment!"
                            })
                        except: pass
                break

    # ------------------------------------------------------------------
    # Pre-computation (Plan D)
    # ------------------------------------------------------------------

    async def _get_clean_explanation(self, prompt: str) -> str:
        """Use the standard API to get a clean simple explanation."""
        settings = get_settings()
        
        for attempt in range(2):
            try:
                # Use v1alpha for standard API calls too
                client = genai.Client(api_key=settings.GEMINI_API_KEY, http_options={"api_version": "v1alpha"})
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=settings.GEMINI_STANDARD_MODEL,
                        contents=prompt,
                    ),
                    timeout=10.0
                )
                if response.text:
                    cleaned = response.text.strip()
                    logger.info("Explain result received, length=%d", len(cleaned))
                    return cleaned
            except asyncio.TimeoutError:
                logger.warning(f"Explain attempt {attempt+1} timed out")
            except Exception as e:
                logger.warning(f"Explain attempt {attempt+1} failed: {e}")
            await asyncio.sleep(0.5)
        return ""

    # ------------------------------------------------------------------
    # Sentence-by-sentence "Explain Simply" (Plan C)
    # ------------------------------------------------------------------

    async def _send_word_highlights(
        self, websocket: Any, word_start_index: int, word_count: int,
        speaking_duration: float = 0.0,
    ) -> None:
        """Send word-by-word highlight events at estimated intervals.

        Args:
            websocket: The client WebSocket connection.
            word_start_index: The global word index of the first word.
            word_count: Number of words to highlight.
            speaking_duration: If >0, spread highlights across this duration.
                                Otherwise default to ~3 words/second.
        """
        if word_count <= 0:
            return

        if speaking_duration > 0:
            interval = speaking_duration / word_count
        else:
            interval = 0.33  # ~3 words per second

        for i in range(word_count):
            try:
                await websocket.send_json({
                    "type": "highlight",
                    "word_index": word_start_index + i,
                })
            except Exception:
                break
            if i < word_count - 1:
                await asyncio.sleep(interval)

    async def explain(self, text: str, websocket: Any) -> None:
        """
        Explain text one sentence at a time with word-level highlights.

        For each sentence:
        1. Send word-by-word highlight events for the original words.
        2. Send sentence-level highlight.
        3. Get a simple explanation via standard API.
        4. Send the explanation text to the chat log.
        5. Optionally send to Live API for speech.
        """
        sentences = split_sentences(text)
        if not sentences:
            return

        logger.info("Explaining %d sentence(s)", len(sentences))

        # Pre-compute word offsets for each sentence
        sentence_word_offsets: list[tuple[int, int]] = []
        global_word_idx = 0
        for sentence in sentences:
            words_in_sentence = len(sentence.strip().split())
            sentence_word_offsets.append((global_word_idx, words_in_sentence))
            global_word_idx += words_in_sentence

        self._explaining = True
        try:
            for idx, sentence in enumerate(sentences):
                word_start, word_count = sentence_word_offsets[idx]

                # 2. Sentence-level highlight
                try:
                    await websocket.send_json({
                        "type": "highlight_sentence",
                        "sentence_index": idx,
                    })
                except Exception:
                    break

                # 3. Get simple explanation
                clean_text = await self._get_clean_explanation(
                    "You are a patient reading tutor. Rewrite this sentence "
                    "in very simple words a 10-year-old can understand. "
                    f'Reply with ONLY the simplified sentence, nothing else.\n\n'
                    f'Original: "{sentence}"'
                )

                if not clean_text:
                    logger.warning("Could not explain sentence %d, skipping", idx)
                    continue

                # 4. Send clean text to chat log
                try:
                    await websocket.send_json({
                        "type": "explain_transcript",
                        "text": clean_text,
                        "sentence_index": idx,
                    })
                except Exception:
                    pass

                # 5. Prompt Lexi Live to SPEAK the text, and SIMULTANEOUSLY highlight words
                tts_task = None
                if self._session and not self._session_dead.is_set():
                    async def speak_text() -> None:
                        try:
                            self._turn_done.clear()
                            await self._session.send(
                                input=f"Speak this text exactly: {clean_text}",
                                end_of_turn=True,
                            )
                            done = asyncio.ensure_future(self._turn_done.wait())
                            dead = asyncio.ensure_future(self._session_dead.wait())
                            try:
                                await asyncio.wait(
                                    [done, dead],
                                    return_when=asyncio.FIRST_COMPLETED,
                                    timeout=10.0 + (word_count * 0.5), # Scale timeout with length
                                )
                            finally:
                                done.cancel()
                                dead.cancel()
                        except Exception as e:
                            logger.error("Error in Live speech sync for sentence %d: %s", idx, e)
                    
                    tts_task = asyncio.create_task(speak_text())

                # Concurrently run the word highlight loop while audio plays (or simulates playing).
                # Estimate 150 WPM -> 2.5 words per second -> 0.4s per word
                estimated_speaking_duration = word_count * 0.4
                highlight_task = asyncio.create_task(
                    self._send_word_highlights(websocket, word_start, word_count, estimated_speaking_duration)
                )

                if tts_task:
                    await asyncio.gather(highlight_task, tts_task)
                else:
                    await highlight_task

                # Emit sentence pause (#21)
                if idx < len(sentences) - 1:
                    try:
                        await websocket.send_json({
                            "type": "sentence_pause",
                            "duration": 2000,
                        })
                    except Exception:
                        pass

                await asyncio.sleep(0.3)
        finally:
            self._explaining = False

        # 6. Signal completion
        try:
            await websocket.send_json({"type": "explain_done"})
        except Exception:
            pass


    async def handle_write_command(self, command: str, current_text: str, websocket: Any) -> None:
        """Process an AI writing command (e.g. 'help me write a story')."""
        prompt = (
            f"The user is writing. Their current text is: \"{current_text}\"\n"
            f"They just gave an instruction: \"{command}\"\n"
            f"Please fulfill the instruction. Your response should be ONLY the NEW or IMPROVED text that should be added to the writing area."
            f"If you generate a story or a paragraph, wrap it with [PUSH_TO_WRITE_AREA] tokens so the frontend knows to insert it.\n"
            f"Example: [PUSH_TO_WRITE_AREA]Once upon a time...[PUSH_TO_WRITE_AREA]"
        )
        
        try:
            settings = get_settings()
            client = genai.Client(api_key=settings.GEMINI_API_KEY, http_options={"api_version": "v1alpha"})
            
            response = client.models.generate_content(
                model=settings.GEMINI_STANDARD_MODEL,
                contents=prompt,
            )
            
            generated = response.text or "I couldn't generate that right now."
            await websocket.send_json({"type": "transcript", "text": generated})
            
            if "[PUSH_TO_WRITE_AREA]" in generated:
                parts = generated.split("[PUSH_TO_WRITE_AREA]")
                if len(parts) >= 2:
                    content_to_push = parts[1].strip()
                    await websocket.send_json({
                        "type": "push_to_write_area",
                        "text": content_to_push
                    })
        except Exception as e:
            logger.error(f"Write command failed: {e}")
            await websocket.send_json({"type": "transcript", "text": "Sorry, I had trouble with that command."})
        logger.info("Explain flow complete")

    async def set_mode(self, mode: str) -> None:
        """Explicitly switch Lexi's subject mode."""
        self.current_mode = mode
        logger.info("Subject mode set to: %s", mode)
        if not self._session or self._session_dead.is_set():
            return
        prompt_addition = get_mode_prompt(mode)
        if prompt_addition:
            try:
                await self._session.send(
                    input=f"UPDATED TEACHING MODE: {prompt_addition}",
                    end_of_turn=True,
                )
                self._turn_done.clear()
                try:
                    await asyncio.wait_for(self._turn_done.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
            except Exception as e:
                logger.warning(f"Failed to send mode update: {e}")

    async def set_context(self, text: str) -> None:
        """Send uploaded text context to the Live API session."""
        if not self._session or self._session_dead.is_set():
            return

        # Auto-detect subject mode from text content
        detected = detect_mode(text)
        if detected != self.current_mode:
            self.current_mode = detected
            logger.info("Auto-detected subject mode: %s", detected)

        mode_prompt = get_mode_prompt(self.current_mode)

        try:
            context_msg = (
                f"IGNORE ALL PREVIOUS DOCUMENTS AND FILES I HAVE UPLOADED. "
                f"The user just uploaded a NEW text to the Text Display Area. Here is the NEW content:\n\n"
                f"{text[:3000]}\n\n"
                f"Remember this new content exclusively. The user may ask you to read it, explain parts of it, or ask questions about it."
            )
            if mode_prompt:
                context_msg += f"\n\nTEACHING MODE: {mode_prompt}"

            await self._session.send(input=context_msg, end_of_turn=True)
            # Wait briefly for acknowledgment
            self._turn_done.clear()
            try:
                await asyncio.wait_for(self._turn_done.wait(), timeout=8.0)
            except asyncio.TimeoutError:
                pass
            logger.info("Context sent to Live session (mode=%s)", self.current_mode)
        except Exception as e:
            logger.warning(f"Failed to send context to Live session: {e}")

    async def explain_selection(self, context: str, selection: str, websocket: Any) -> None:
        """
        Explain a specific highlighted text selection.
        """
        self._explaining = True
        try:
            # Simple, concise prompt
            clean_text = await self._get_clean_explanation(
                f"Explain this in 1-2 very simple sentences for a 10-year-old:\n"
                f"\"{selection}\""
            )
            if not clean_text:
                clean_text = f"That part means {selection}."

            # Send clean text to chat log
            try:
                await websocket.send_json({
                    "type": "explain_transcript",
                    "text": clean_text,
                    "sentence_index": -1
                })
            except: pass

            # Live speech call
            if self._session and not self._session_dead.is_set():
                try:
                    self._turn_done.clear()
                    await self._session.send(input=f"Speak this text exactly: {clean_text}", end_of_turn=True)
                    
                    done = asyncio.ensure_future(self._turn_done.wait())
                    dead = asyncio.ensure_future(self._session_dead.wait())
                    try:
                        await asyncio.wait(
                            [done, dead],
                            return_when=asyncio.FIRST_COMPLETED,
                            timeout=10.0
                        )
                    finally:
                        done.cancel()
                        dead.cancel()
                except Exception as e:
                    logger.error(f"Selection speech failed: {e}")
        finally:
            self._explaining = False

        try:
            await websocket.send_json({"type": "explain_done"})
        except Exception:
            pass