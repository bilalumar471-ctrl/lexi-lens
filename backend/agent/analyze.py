"""
LexiLens - Text Analysis Agent.

Uses the Gemini API to analyze text, identify difficult words,
and provide targeted explanations for selected text.
"""

from __future__ import annotations

import json
import logging
import re

import functools
from google import genai
from google.genai import types
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
)

from config import get_settings

logger = logging.getLogger(__name__)

# System prompt for analyzing difficult words
ANALYZE_PROMPT = """\
You are an expert reading assistant helping young readers, English learners, and people with dyslexia.

TASK: Find 3-8 difficult or uncommon words in the text below. For each word, give a short child-friendly definition (max 10 words).

You MUST return ONLY a valid JSON object in this exact format, nothing else:
{"difficult_words": [{"word": "example", "explanation": "a simple definition here"}]}

If the text is very simple, still find at least 2 words that a young reader might not know.

Text:
"""

# System prompt for explaining a specific selection
EXPLAIN_SELECTION_PROMPT = """\
You are Lexi, a kind and patient reading companion.
The user highlighted a part of the text and wants a simple explanation.
Provide a very brief (max 2 sentences), easy-to-understand explanation of the selected text within its context.
Context text:
{context}

Selected text to explain:
{selection}
Explanation:
"""

# System prompt for summarizing text
SUMMARIZE_PROMPT = """\
You are an expert reading assistant. Summarize the following text into 3-6 short, easy-to-read bullet points.
Use simple language suitable for a young reader, an English language learner, or someone with dyslexia.

You MUST return ONLY a valid JSON object in this exact format, nothing else:
{"notes": ["Short bullet point 1", "Short bullet point 2", "Short bullet point 3"]}

Text:
"""


def _safe_parse_json(text: str, fallback_key: str) -> dict:
    """Try to parse JSON from model output, handling markdown code blocks."""
    if not text:
        return {}
    # Strip markdown code fences if present
    cleaned = text.strip()
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    cleaned = cleaned.strip()
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        logger.error(f"Failed to parse JSON from model output: {text[:200]}")
        return {}


def _is_retryable_error(exception):
    """Check if the error is a transient capacity or rate limit issue."""
    err_str = str(exception).upper()
    return "503" in err_str or "429" in err_str or "CAPACITY_EXHAUSTED" in err_str


def _get_api_client():
    """Helper to create a configured GenAI client with v1alpha."""
    settings = get_settings()
    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options={'api_version': 'v1alpha'}
    )


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(_is_retryable_error),
    before_sleep=lambda retry_state: logger.warning(
        f"Retrying AI call (attempt {retry_state.attempt_number}) due to capacity/rate limit..."
    ),
)
async def analyze_text(text: str) -> dict:
    """Analyze text to find difficult words and simple explanations."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        return {"difficult_words": []}
        
    client = _get_api_client()
    
    try:
        response = await client.aio.models.generate_content(
            model=settings.REST_GEMINI_MODEL,
            contents=f"{ANALYZE_PROMPT}\n{text}",
        )
        if response.text:
            logger.info(f"Analyze response: {response.text[:300]}")
            result = _safe_parse_json(response.text, "difficult_words")
            if "difficult_words" in result:
                return result
        return {"difficult_words": []}
    except Exception as e:
        logger.error(f"Error analyzing text: {e}")
        return {"difficult_words": []}


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(_is_retryable_error),
)
async def explain_selection(context: str, selection: str) -> str:
    """Provide a simple explanation for selected text."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        return "I'm sorry, my connection is not set up."
        
    client = _get_api_client()
    
    prompt = EXPLAIN_SELECTION_PROMPT.format(context=context, selection=selection)
    
    try:
        response = await client.aio.models.generate_content(
            model=settings.REST_GEMINI_MODEL,
            contents=prompt,
        )
        return response.text or "I'm not sure how to explain that."
    except Exception as e:
        logger.error(f"Error explaining selection: {e}")
        return "Sorry, I had trouble thinking of an explanation just now."


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(_is_retryable_error),
)
async def analyze_notes(text: str) -> dict:
    """Generate simple bullet-point notes for the provided text."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        return {"notes": ["My connection is not set up."]}
        
    client = _get_api_client()
    
    try:
        response = await client.aio.models.generate_content(
            model=settings.REST_GEMINI_MODEL,
            contents=f"{SUMMARIZE_PROMPT}\n{text}",
        )
        if response.text:
            logger.info(f"Notes response: {response.text[:300]}")
            result = _safe_parse_json(response.text, "notes")
            if "notes" in result:
                return result
        return {"notes": ["Could not generate notes at this time."]}
    except Exception as e:
        logger.error(f"Error generating notes: {e}")
        return {"notes": ["Sorry, I had trouble creating notes for this text."]}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=6),
    retry=retry_if_exception(_is_retryable_error),
)
async def provide_gentle_suggestions(text: str) -> dict:
    """Provide gentle spelling and grammar suggestions without overwriting."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        return {"suggestions": []}
    
    client = _get_api_client()
    
    prompt = f"""
    You are a gentle writing assistant for someone with dyslexia. 
    Analyze the following sentence: "{text}"
    
    If there are spelling or grammar issues, provide a maximum of 2 gentle suggestions. 
    Focus on encouraging the user. 
    
    You MUST return ONLY a valid JSON object in this format:
    {{"suggestions": ["suggestion 1", "suggestion 2"]}}
    
    If it's perfect, return an empty list.
    """
    
    try:
        response = await client.aio.models.generate_content(
            model=settings.REST_GEMINI_MODEL,
            contents=prompt,
        )
        if response.text:
            return _safe_parse_json(response.text, "suggestions")
        return {"suggestions": []}
    except Exception as e:
        logger.error(f"Error providing suggestions: {e}")
        return {"suggestions": []}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    retry=retry_if_exception(_is_retryable_error),
)
async def predict_next_words(text: str) -> dict:
    """Predict the next likely words to help a user type faster."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        return {"predictions": []}
    
    client = _get_api_client()
    
    prompt = f"""
    Based on this text: "{text}", what are the 3 most likely words or short phrases the user might type next?
    
    You MUST return ONLY a valid JSON object in this format:
    {{"predictions": ["word1", "word2", "word3"]}}
    """
    
    try:
        response = await client.aio.models.generate_content(
            model=settings.REST_GEMINI_MODEL,
            contents=prompt,
        )
        if response.text:
            return _safe_parse_json(response.text, "predictions")
        return {"predictions": []}
    except Exception as e:
        logger.error(f"Error predicting words: {e}")
        return {"predictions": []}
