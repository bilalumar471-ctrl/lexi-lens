"""
LexiLens — Tone Detection (#22).

Analyses text formality and adjusts Lexi's speaking style.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# Simple heuristic formality indicators
_FORMAL_MARKERS = [
    "therefore", "furthermore", "consequently", "nevertheless",
    "henceforth", "pursuant", "aforementioned", "hereby",
    "notwithstanding", "whereas", "accordingly",
]

_INFORMAL_MARKERS = [
    "gonna", "wanna", "gotta", "kinda", "sorta", "yeah",
    "nah", "lol", "omg", "hey", "yo", "cool", "awesome",
    "stuff", "things", "like", "basically", "literally",
]


def detect_tone(text: str) -> str:
    """Detect whether text is formal, informal, or neutral.

    Returns:
        One of ``'formal'``, ``'informal'``, or ``'neutral'``.
    """
    sample = text[:2000].lower()
    words = re.findall(r'\b\w+\b', sample)
    if not words:
        return "neutral"

    formal_count = sum(1 for w in words if w in _FORMAL_MARKERS)
    informal_count = sum(1 for w in words if w in _INFORMAL_MARKERS)

    # Ratio-based detection
    total = len(words)
    formal_ratio = formal_count / total
    informal_ratio = informal_count / total

    if formal_ratio > 0.02 and formal_count >= 2:
        return "formal"
    elif informal_ratio > 0.03 and informal_count >= 2:
        return "informal"
    return "neutral"


def get_tone_prompt(tone: str) -> str:
    """Return a prompt adjustment for the detected tone."""
    prompts = {
        "formal": (
            "The text appears to be formal/academic. "
            "Match the register slightly — be clear and precise, "
            "but still keep your language simple and accessible."
        ),
        "informal": (
            "The text appears to be casual/informal. "
            "Be relaxed and friendly in your explanations. "
            "Use everyday language and short sentences."
        ),
    }
    return prompts.get(tone, "")
