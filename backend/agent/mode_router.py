"""
LexiLens — Subject Mode Router.

Detects the subject area of uploaded text and provides
mode-specific system prompt additions for Lexi.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Subject mode definitions
# ---------------------------------------------------------------------------

SUBJECT_MODES: dict[str, dict[str, str]] = {
    "science": {
        "label": "Science",
        "keywords": "experiment hypothesis atom molecule cell organism energy gravity physics chemistry biology ecosystem",
        "prompt_addition": (
            "The user is reading science content. "
            "When explaining, use everyday analogies (e.g. 'atoms are like tiny building blocks'). "
            "Break down cause-and-effect chains step by step. "
            "Avoid technical jargon unless the user asks for it."
        ),
    },
    "history": {
        "label": "History",
        "keywords": "war empire century ancient king queen dynasty revolution colonial independence treaty medieval",
        "prompt_addition": (
            "The user is reading history content. "
            "Anchor explanations to a simple timeline ('first this happened, then…'). "
            "Relate events to things the user already knows. "
            "Keep names and dates to a minimum unless asked."
        ),
    },
    "literature": {
        "label": "Literature",
        "keywords": "character novel poem story author chapter narrator theme metaphor protagonist fiction plot",
        "prompt_addition": (
            "The user is reading literature. "
            "Focus on what is happening in the story and why characters do things. "
            "Avoid literary criticism terms; use simple language like 'the writer shows us…'. "
            "If the user asks about a word, give a story-friendly definition."
        ),
    },
    "math": {
        "label": "Mathematics",
        "keywords": "equation fraction multiply divide sum angle graph formula percent ratio algebra geometry",
        "prompt_addition": (
            "The user is reading maths content. "
            "Walk through every step slowly. Use real-world examples (pizza slices, coins). "
            "Never skip steps. Ask the user if they want to try one themselves."
        ),
    },
    "book": {
        "label": "Book",
        "keywords": "chapter page book read story novel paragraph sentence text passage reading",
        "prompt_addition": (
            "The user is reading a book. "
            "Read at a calm, steady pace. Pause naturally between paragraphs. "
            "If the user seems stuck on a word, offer a quick, friendly definition. "
            "Keep explanations story-focused and avoid spoilers."
        ),
    },
    "form": {
        "label": "Form",
        "keywords": "form field fill name address date signature submit application checkbox dropdown",
        "prompt_addition": (
            "The user is filling in a form. "
            "Read each label and field clearly. Explain what each field expects. "
            "For complex fields (e.g. dates, addresses), give an example. "
            "Be patient and let the user dictate their answers."
        ),
    },
    "study": {
        "label": "Study",
        "keywords": "study revision exam test quiz question answer learn review practice homework",
        "prompt_addition": (
            "The user is studying. "
            "Summarise key points clearly. After reading a section, offer a quick recap. "
            "Ask simple comprehension questions to check understanding. "
            "Encourage the user and keep the pace steady."
        ),
    },
    "write": {
        "label": "Write",
        "keywords": "write compose draft essay type text create paragraph letter email report",
        "prompt_addition": (
            "The user is writing with your help. "
            "Listen to their dictation carefully. Suggest better word choices gently. "
            "Help with spelling and grammar without being critical. "
            "If they say 'help me write', offer sentence starters or continuations."
        ),
    },
    "general": {
        "label": "General",
        "keywords": "",
        "prompt_addition": "",
    },
}

DEFAULT_MODE = "general"


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

def detect_mode(text: str) -> str:
    """Guess the subject mode from the first ~2000 characters of text.

    Uses simple keyword frequency. Returns the mode key with the highest
    score, or ``'general'`` if no strong signal is found.
    """
    sample = text[:2000].lower()
    best_mode = DEFAULT_MODE
    best_score = 0

    for mode, info in SUBJECT_MODES.items():
        if mode == "general" or not info["keywords"]:
            continue
        keywords = info["keywords"].split()
        score = sum(1 for kw in keywords if kw in sample)
        if score > best_score:
            best_score = score
            best_mode = mode

    # Require at least 2 keyword hits to declare a mode
    if best_score < 2:
        return DEFAULT_MODE

    logger.info("Detected subject mode: %s (score=%d)", best_mode, best_score)
    return best_mode


def get_mode_prompt(mode: str) -> str:
    """Return the mode-specific prompt addition, or empty string for general."""
    info = SUBJECT_MODES.get(mode)
    if not info:
        return ""
    return info.get("prompt_addition", "")
