"""
LexiLens — Document processing: validation, PDF extraction, image OCR.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import fitz  # PyMuPDF
import magic
from fastapi import APIRouter, HTTPException, UploadFile, File
from google import genai
from google.genai import types

from config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
}

_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._-]")


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------


def validate_upload(
    data: bytes, filename: str, content_type: str
) -> tuple[bool, str | None]:
    """
    Validate an uploaded file.

    Returns (True, sanitised_filename) on success or (False, error_message)
    on failure.
    """
    # 1. Size check
    if len(data) > MAX_UPLOAD_SIZE:
        return False, f"File too large ({len(data)} bytes). Maximum is 10 MB."

    # 2. MIME check via python-magic (actual file bytes, not trust headers)
    detected_mime = magic.from_buffer(data[:2048], mime=True)
    if detected_mime not in ALLOWED_MIME_TYPES:
        return False, f"Unsupported file type: {detected_mime}"

    # 3. Sanitise filename
    safe_name = _FILENAME_RE.sub("_", filename)
    if not safe_name:
        safe_name = "upload"

    return True, safe_name


# ---------------------------------------------------------------------------
# PDF processing → POST /api/upload
# ---------------------------------------------------------------------------


def _extract_pdf_words(data: bytes) -> dict[str, Any]:
    """Extract full text and word-level data from a PDF."""
    doc = fitz.open(stream=data, filetype="pdf")
    all_words: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    word_index = 0

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text()
        full_text_parts.append(text)

        # get_text("words") → list of (x0,y0,x1,y1, word, block, line, word_no)
        for w in page.get_text("words"):
            word_text = w[4]
            all_words.append(
                {"word": word_text, "index": word_index, "page": page_num + 1}
            )
            word_index += 1

    doc.close()
    return {"full_text": "\n".join(full_text_parts), "words": all_words}


@router.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Accept a PDF upload, extract text and word positions."""
    data = await file.read()

    ok, result = validate_upload(data, file.filename or "upload.pdf", file.content_type or "")
    if not ok:
        raise HTTPException(status_code=400, detail=result)

    # Verify it's actually a PDF
    detected = magic.from_buffer(data[:2048], mime=True)
    if detected != "application/pdf":
        raise HTTPException(status_code=400, detail="Expected a PDF file.")

    payload = _extract_pdf_words(data)
    logger.info(
        "PDF processed: %d words extracted from '%s'",
        len(payload["words"]),
        result,  # sanitised filename
    )
    return payload


# ---------------------------------------------------------------------------
# Image processing → POST /api/upload-image
# ---------------------------------------------------------------------------


@router.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Accept an image upload, use Gemini vision to extract text."""
    data = await file.read()

    ok, result = validate_upload(data, file.filename or "upload.png", file.content_type or "")
    if not ok:
        raise HTTPException(status_code=400, detail=result)

    detected_mime = magic.from_buffer(data[:2048], mime=True)
    if detected_mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(status_code=400, detail="Expected an image file (PNG, JPEG, or WebP).")

    settings = get_settings()
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Content(
                    parts=[
                        types.Part.from_bytes(data=data, mime_type=detected_mime),
                        types.Part(
                            text="Extract all visible text from this image. "
                            "Return ONLY the raw text, preserving the original order. "
                            "Do not add any commentary."
                        ),
                    ]
                )
            ],
        )
    except Exception as e:
        logger.exception("Gemini API error during image OCR")
        raw_code = getattr(e, "status_code", None)
        try:
            code = int(raw_code)
        except (TypeError, ValueError):
            code = 500
        raise HTTPException(
            status_code=code,
            detail=f"Gemini API error: {e}",
        )

    extracted_text = response.text.strip() if response.text else ""

    words_list = []
    for idx, word in enumerate(extracted_text.split()):
        words_list.append({"word": word, "index": idx, "page": 1})

    logger.info(
        "Image processed: %d words extracted from '%s'",
        len(words_list),
        result,
    )
    return {"full_text": extracted_text, "words": words_list}
