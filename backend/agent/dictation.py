"""
LexiLens — Dictation Engine.

Pipeline: transcribe audio → clean transcript → read back →
accept user edits → store final text in Firestore.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import uuid

from google import genai
from google.genai import types

from config import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Firestore helper (lazy-initialised)
# ---------------------------------------------------------------------------

_firestore_client = None


def _get_firestore():
    """Return a cached Firestore client."""
    global _firestore_client
    if _firestore_client is None:
        from google.cloud import firestore
        _firestore_client = firestore.Client(
            project=get_settings().PROJECT_ID,
        )
    return _firestore_client


# ---------------------------------------------------------------------------
# Dictation Engine
# ---------------------------------------------------------------------------

class DictationEngine:
    """Transcribe, clean, and store dictated text."""

    # ---- transcribe -------------------------------------------------------

    @staticmethod
    async def transcribe(audio_base64: str) -> str:
        """Send base64-encoded audio to Gemini for speech-to-text.

        Returns the raw transcription string.
        """
        settings = get_settings()
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        try:
            audio_bytes = base64.b64decode(audio_base64)
        except Exception:
            logger.error("Invalid base64 audio data in dictation")
            return ""

        try:
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Content(
                        parts=[
                            types.Part.from_bytes(
                                data=audio_bytes,
                                mime_type="audio/webm",
                            ),
                            types.Part(
                                text=(
                                    "Transcribe the spoken words in this audio clip. "
                                    "Return ONLY the transcription, nothing else."
                                )
                            ),
                        ]
                    )
                ],
            )
            raw = (response.text or "").strip()
            logger.info("Dictation transcribed: %s", raw[:120])
            return raw
        except Exception as e:
            logger.error("Dictation transcription failed: %s", e)
            return ""

    # ---- clean ------------------------------------------------------------

    @staticmethod
    def clean(raw: str) -> str:
        """Clean a raw transcript: capitalise, fix punctuation, strip fillers."""
        if not raw:
            return ""

        # Remove common filler words / hesitations
        fillers = [
            r"\b(um+|uh+|er+|ah+|hmm+|like,?\s)\b",
            r"\b(you know|i mean|sort of|kind of)\b",
        ]
        text = raw
        for pattern in fillers:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)

        # Collapse whitespace
        text = re.sub(r"\s{2,}", " ", text).strip()

        # Capitalise first letter
        if text:
            text = text[0].upper() + text[1:]

        # Ensure sentence-ending punctuation
        if text and text[-1] not in ".!?":
            text += "."

        return text

    # ---- store ------------------------------------------------------------

    @staticmethod
    def store(session_id: str, text: str) -> str:
        """Write the finalised dictation to Firestore.

        Path: ``sessions/{session_id}/dictations/{doc_id}``

        Returns the auto-generated document ID.
        """
        try:
            db = _get_firestore()
            doc_ref = (
                db.collection("sessions")
                .document(session_id)
                .collection("dictations")
                .document()
            )
            doc_ref.set({
                "text": text,
                "created_at": genai.types.to_value(None),  # server timestamp
            })
            logger.info(
                "Dictation stored: session=%s doc=%s",
                session_id,
                doc_ref.id,
            )
            return doc_ref.id
        except Exception as e:
            logger.error("Failed to store dictation: %s", e)
            # Fallback: return a local UUID so the client knows it was attempted
            return f"local-{uuid.uuid4().hex[:8]}"

    # ---- full pipeline ----------------------------------------------------

    @classmethod
    async def process(cls, session_id: str, audio_base64: str) -> dict:
        """Run the full dictation pipeline.

        Returns ``{raw, cleaned}`` (storage happens later on user acceptance).
        """
        raw = await cls.transcribe(audio_base64)
        cleaned = cls.clean(raw)
        return {"raw": raw, "cleaned": cleaned}
