"""
LexiLens — Lexi AI Agent (Gemini 2.0 Flash Live API).

Lexi is a patient, warm reading companion designed for dyslexic users.
She speaks in short sentences, avoids jargon, and uses the Gemini Live API
for real-time audio-in / audio-out with automatic barge-in (server VAD).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from google import genai
from google.genai import types

from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt — defines the Lexi persona
# ---------------------------------------------------------------------------

LEXI_SYSTEM_PROMPT = """\
You are Lexi, a reading companion for people with dyslexia.

RULES — follow every single one:
1. Keep every reply to a maximum of TWO short sentences.
2. Use simple, everyday words. Never use jargon or long words.
3. Be warm, patient, and encouraging at all times.
4. If the reader struggles with a word, gently help them sound it out.
5. Celebrate small wins — "Nice job!" or "You got it!"
6. Never correct the reader harshly. Always be kind.
7. Pause naturally between sentences so the reader can follow.
8. If asked about something outside reading help, politely redirect:
   "I'm here to help you read. Let's keep going!"
9. Speak in a calm, friendly tone — like a trusted friend.
"""


# ---------------------------------------------------------------------------
# LexiAgent — wraps a Gemini Live API session
# ---------------------------------------------------------------------------

class LexiAgent:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: genai.Client | None = None
        self._session = None
        self._session_cm = None

    async def connect(self) -> None:
        """Open a Gemini Live API session with Lexi's persona."""
        self._client = genai.Client(
            api_key=self._settings.GEMINI_API_KEY,
            http_options=types.HttpOptions(api_version="v1beta"),
        )

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part(text=LEXI_SYSTEM_PROMPT)],
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Kore",
                    ),
                ),
            ),
        )

        self._session_cm = self._client.aio.live.connect(
            model=self._settings.GEMINI_MODEL,
            config=config,
        )
        self._session = await self._session_cm.__aenter__()

        logger.info("Lexi Live session connected (model=%s)", self._settings.GEMINI_MODEL)

    async def close(self) -> None:
        """Tear down the Live API session gracefully."""
        if self._session:
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

        await self._session.send_realtime_input(
            audio=types.Blob(data=chunk, mime_type="audio/pcm;rate=16000"),
        )

    async def receive_audio(self) -> AsyncGenerator[bytes, None]:
        if not self._session:
            raise RuntimeError("LexiAgent is not connected. Call connect() first.")

        while True:
            try:
                async for response in self._session.receive():
                    if response.server_content and response.server_content.model_turn:
                        for part in response.server_content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                yield part.inline_data.data

                        if response.server_content.turn_complete:
                            continue

            except Exception:
                logger.exception("Error in Lexi receive loop")
                break


# ---------------------------------------------------------------------------
# Highlight events — word-by-word highlight for the reading view
# ---------------------------------------------------------------------------

async def emit_highlight_events(
    websocket: Any, words: list[dict], delay: float = 0.3
) -> None:
    """
    Send ``{type: 'highlight', word_index: N}`` for each word in *words*.

    Args:
        websocket: A FastAPI WebSocket instance.
        words:     List of word dicts (each must have an ``index`` key).
        delay:     Seconds to wait between highlight events.
    """
    for w in words:
        msg = json.dumps({"type": "highlight", "word_index": w["index"]})
        await websocket.send_text(msg)
        await asyncio.sleep(delay)