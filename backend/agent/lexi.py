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
import functools
from typing import Any, AsyncGenerator
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
)

from google import genai
from google.genai import types

from config import get_settings

logger = logging.getLogger(__name__)

def _is_retryable_error(exception):
    """Check if the error is a transient capacity or rate limit issue."""
    err_str = str(exception).upper()
    return "503" in err_str or "429" in err_str or "CAPACITY_EXHAUSTED" in err_str

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
- **Content Pushing**: If the user asks you to write a story, draft, or structured text, provide it in your spoken response but also prefix the text with "[PUSH_TO_DASHBOARD]" in your text-only output if available.
- **Write Mode Support**: If the user is in Write Mode and asks you to write something or fix their writing, you MUST start your response with the tag [PUSH_TO_WRITE_AREA] followed by the generated text. Do NOT speak this tag.
- **Form Mode Support**: The user may share their screen while looking at a form. You can SEE the screen. Use this visual information to guide them on how to fill out the form, explain questions, or suggest what to type.
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

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception(_is_retryable_error),
    )
    async def connect(self):
        """Connect to Gemini Live API."""
        if self._session:
            return

        try:
            self._client = genai.Client(
                api_key=self._settings.GEMINI_API_KEY,
                http_options={'api_version': 'v1alpha'}
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
                model=self._settings.LIVE_GEMINI_MODEL or "gemini-2.5-flash-native-audio-preview-12-2025",
                config=config,
            )
            if self._session_cm:
                # Use a larger timeout for the session establishment (30s)
                self._session = await asyncio.wait_for(self._session_cm.__aenter__(), timeout=30.0)
                logger.info("Connected to Gemini Live API")
            else:
                raise RuntimeError("Failed to create session context manager")
        except asyncio.TimeoutError:
            logger.error("Timeout establishing Gemini Live connection")
            self._session = None
            self._session_cm = None
            raise
        except Exception as e:
            logger.error(f"Failed to connect to Gemini Live: {e}", exc_info=True)
            self._session = None
            self._session_cm = None
            raise

    async def stop_explanation(self):
        """Immediately stop any ongoing explanation or audio generation."""
        logger.info("Stop explanation requested in LexiAgent")
        self._explaining = False
        # If we have an active session, signaling turn_done helps break loops
        self._turn_done.set()


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

    async def send_vision_frame(self, base64_data: str) -> None:
        """Send a base64 encoded image frame to the Live session."""
        if not self._session or self._session_dead.is_set():
            return
        try:
            # base64_data might include "data:image/jpeg;base64," prefix
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]
            
            await self._session.send(
                input=types.Blob(data=base64_data, mime_type="image/jpeg"),
                end_of_turn=False # It's a continuous stream
            )
            # logger.debug("Vision frame sent to Lexi")
        except Exception as e:
            logger.warning(f"Failed to send vision frame: {e}")

    async def receive_audio(self, websocket: Any = None) -> AsyncGenerator[bytes, None]:
        """Stream audio from Gemini and forward transcripts to the client."""
        if not self._session:
            raise RuntimeError("LexiAgent is not connected. Call connect() first.")

        while True:
            if self._session_dead.is_set():
                break
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
                                    logger.debug(f"Model thinking (skipped): {part.text[:80]}")
                                else:
                                    # This is the actual spoken content — forward to chatlog
                                     cleaned = part.text.strip()
                                     if cleaned and websocket:
                                         logger.info(f"AI spoken text: {cleaned[:100]}")
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
                err_msg = str(e)
                logger.error(f"Error in Lexi receive loop: {err_msg}")
                self._session_dead.set()
                self._turn_done.set()
                
                if websocket:
                    friendly_msg = "Lexi disconnected unexpectedly."
                    if "503" in err_msg or "CAPACITY" in err_msg.upper():
                        friendly_msg = "Lexi is overwhelmed (API Capacity). Please wait a moment."
                    elif "429" in err_msg:
                        friendly_msg = "Slow down! Lexi needs a quick break (Rate Limit)."
                    elif "DEADLINE" in err_msg.upper():
                        friendly_msg = "Lexi is taking a bit longer to respond. Reconnecting..."
                        
                    try:
                        await websocket.send_json({
                            "type": "error", 
                            "message": friendly_msg
                        })
                    except: pass
                
                # Resiliency: If it's a transient deadline/internal error, don't kill the loop immediately
                if "DEADLINE" in err_msg.upper() or "INTERNAL" in err_msg.upper() or "TIMEOUT" in err_msg.upper():
                    logger.warning(f"Transient error in Lexi receive loop ({err_msg}), attempting to continue listening...")
                    await asyncio.sleep(1)
                    continue 

                break

    # ------------------------------------------------------------------
    # Pre-computation (Plan D)
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=6),
        retry=retry_if_exception(_is_retryable_error),
    )
    async def _get_clean_explanation(self, prompt: str) -> str:
        """Use the standard API to get a clean simple explanation."""
        settings = get_settings()
        
        for attempt in range(2):
            try:
                # Use fresh client and standard API with timeout
                client = genai.Client(api_key=settings.GEMINI_API_KEY)
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=settings.REST_GEMINI_MODEL,
                        contents=prompt,
                    ),
                    timeout=15.0
                )
                if response.text:
                    cleaned = response.text.strip()
                    logger.info(f"Explain result: {cleaned[:100]}")
                    return cleaned
            except asyncio.TimeoutError:
                logger.warning(f"Explain attempt {attempt+1} timed out")
            except Exception as e:
                logger.warning(f"Explain attempt {attempt+1} failed: {e}")
            await asyncio.sleep(0.5)
        return ""

    async def explain(self, text: str, websocket: Any) -> None:
        """Explain text one sentence at a time."""
        sentences = split_sentences(text)
        if not sentences:
            return

        logger.info(f"Explaining {len(sentences)} sentence(s)")

        self._explaining = True
        try:
            for idx, sentence in enumerate(sentences):
                if not self._explaining:
                    logger.info("Explanation stopped by user signal")
                    break

                try:
                    await websocket.send_json({"type": "highlight_sentence", "sentence_index": idx})
                except: pass

                clean_text = await self._get_clean_explanation(
                    f"You are a patient reading tutor. Rewrite this sentence in very simple words a 10-year-old can understand. "
                    f"Reply with ONLY the simplified sentence, nothing else.\n\nOriginal: \"{sentence}\""
                )
                
                if not clean_text:
                    continue

                try:
                    await websocket.send_json({
                        "type": "explain_transcript",
                        "text": clean_text,
                        "sentence_index": idx
                    })
                except: pass

                if self._session and not self._session_dead.is_set():
                    try:
                        self._turn_done.clear()
                        await self._session.send(input=f"Speak this text exactly: {clean_text}", end_of_turn=True)
                        
                        done = asyncio.ensure_future(self._turn_done.wait())
                        dead = asyncio.ensure_future(self._session_dead.wait())
                        try:
                            await asyncio.wait([done, dead], return_when=asyncio.FIRST_COMPLETED, timeout=10.0)
                        finally:
                            done.cancel()
                            dead.cancel()
                    except Exception as e:
                        logger.error(f"Error in Live speech sync for sentence {idx}: {e}")
                
                await asyncio.sleep(0.3)
        finally:
            self._explaining = False

        try:
            await websocket.send_json({"type": "explain_done"})
        except: pass
        logger.info("Explain flow complete")

    async def set_context(self, text: str) -> None:
        """Send uploaded text context to the Live API session."""
        if not self._session or self._session_dead.is_set():
            return
        try:
            context_msg = (
                f"IGNORE ALL PREVIOUS DOCUMENTS AND FILES I HAVE UPLOADED. "
                f"The user just uploaded a NEW text to the Text Display Area. Here is the NEW content:\n\n"
                f"{text[:3000]}\n\n"
                f"Remember this new content exclusively. The user may ask you to read it, explain parts of it, or ask questions about it."
            )
            await self._session.send(input=context_msg, end_of_turn=True)
            self._turn_done.clear()
            try:
                await asyncio.wait_for(self._turn_done.wait(), timeout=8.0)
            except asyncio.TimeoutError:
                pass
            logger.info("Context sent to Live session")
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
            
    async def send_text(self, text: str) -> None:
        """Send a text message / instruction to the Live session."""
        if not self._session:
            raise RuntimeError("LexiAgent is not connected.")
        # When sending text, it acts as a user turn/instruction in the Live session
        await self._session.send(input=text, end_of_turn=True)
        logger.info(f"Sent text context to Lexi: {text[:50]}...")

    async def handle_write_command(self, command: str, current_text: str, websocket: Any):
        """Handle AI storytelling or fixing text area in Write Mode."""
        if not self._session or self._session_dead.is_set():
            logger.warning("Handle write command failed: No active session")
            return

        logger.info(f"Handling write command: {command}")
        
        # More forceful instruction for the tag
        prompt = (
            f"SYSTEM INSTRUCTION: You are in WRITE MODE. \n"
            f"USER TEXT AREA CONTENT: \"{current_text}\"\n"
            f"USER COMMAND: \"{command}\"\n\n"
            f"TASK: Generate the requested content. \n"
            f"CRITICAL: You MUST provide the generated content in your text-only output STARTING EXACTLY WITH the tag [PUSH_TO_WRITE_AREA]. Do NOT speak the tag aloud.\n"
            f"Example response structure:\n"
            f"[PUSH_TO_WRITE_AREA] Once upon a time...\n"
            f"While pushing the text, speak a very short, separate friendly confirmation like 'I've written that for you!' or 'Here is a draft.'"
        )
        
        try:
            self._turn_done.clear()
            await self._session.send(input=prompt, end_of_turn=True)
            logger.info("Sent write command prompt to Live session")
        except Exception as e:
            logger.error(f"Failed to send write command: {e}")
