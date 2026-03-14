"""
LexiLens — Screen Reader.

Receives a base64-encoded screenshot, sends it to Gemini Vision,
and returns an accessibility-friendly narration of the main content.
"""

from __future__ import annotations

import base64
import logging

from google import genai
from google.genai import types

from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Narration prompt (tuned for accessibility)
# ---------------------------------------------------------------------------

_NARRATION_PROMPT = (
    "You are an accessibility screen reader for a person with dyslexia. "
    "Describe the MAIN text content visible on screen in 2-3 simple sentences. "
    "Ignore toolbars, menus, and decorative elements. "
    "Focus on the actual reading content (headings, paragraphs, captions). "
    "Use plain, simple language a 10-year-old can understand. "
    "Return ONLY the narration, nothing else."
)


class ScreenReader:
    """Analyse a screenshot via Gemini Vision and narrate the content."""

    @staticmethod
    async def describe(frame_base64: str) -> str:
        """Send a base64 screenshot to Gemini and return a narration string.

        Args:
            frame_base64: Base64-encoded image (PNG/JPEG).

        Returns:
            A plain-text accessibility narration, or empty string on failure.
        """
        settings = get_settings()
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        try:
            image_bytes = base64.b64decode(frame_base64)
        except Exception:
            logger.error("Invalid base64 image data in screen reader")
            return ""

        try:
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Content(
                        parts=[
                            types.Part.from_bytes(
                                data=image_bytes,
                                mime_type="image/png",
                            ),
                            types.Part(text=_NARRATION_PROMPT),
                        ]
                    )
                ],
            )
            narration = (response.text or "").strip()
            logger.info("Screen narration generated, length=%d", len(narration))
            return narration
        except Exception as e:
            logger.error("Screen reader failed: %s", e)
            return ""
