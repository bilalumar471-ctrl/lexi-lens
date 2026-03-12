"""
LexiLens — Reading Speed Controller.

Detects voice commands for pace adjustment and emits
``{type: 'speed_change', speed: <float>}`` events.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Speed presets
# ---------------------------------------------------------------------------

_SPEED_PRESETS: dict[str, float] = {
    "slowest": 0.5,
    "very slow": 0.5,
    "slower": 0.75,
    "slow": 0.75,
    "slow down": 0.75,
    "normal": 1.0,
    "normal speed": 1.0,
    "default": 1.0,
    "reset speed": 1.0,
    "faster": 1.5,
    "fast": 1.5,
    "speed up": 1.5,
    "go faster": 1.5,
    "very fast": 1.75,
    "fastest": 2.0,
    "maximum speed": 2.0,
}

# Regex to match explicit numeric speed commands like "speed 1.5"
_NUMERIC_RE = re.compile(
    r"\bspeed\s+(\d+(?:\.\d+)?)\b",
    re.IGNORECASE,
)

# Relative adjustments
_RELATIVE_UP = re.compile(
    r"\b(faster|speed\s*up|go\s*faster|increase\s*speed|quicker)\b",
    re.IGNORECASE,
)
_RELATIVE_DOWN = re.compile(
    r"\b(slower|slow\s*down|go\s*slower|decrease\s*speed)\b",
    re.IGNORECASE,
)

# Bounds
MIN_SPEED = 0.25
MAX_SPEED = 3.0
SPEED_STEP = 0.25


class ReadingSpeedController:
    """Track and adjust the reading speed based on voice commands."""

    def __init__(self, initial_speed: float = 1.0) -> None:
        self.current_speed: float = max(MIN_SPEED, min(MAX_SPEED, initial_speed))

    # ----- public API -------------------------------------------------------

    def parse_speed_command(self, text: str) -> dict | None:
        """Parse *text* for a speed-change voice command.

        Returns ``{type: 'speed_change', speed: <float>}`` if a command
        is detected, otherwise ``None``.
        """
        if not text:
            return None

        lower = text.strip().lower()

        # 1. Check explicit numeric ("speed 1.5")
        m = _NUMERIC_RE.search(lower)
        if m:
            speed = float(m.group(1))
            return self._apply(speed)

        # 2. Check preset phrases
        for phrase, speed in _SPEED_PRESETS.items():
            if phrase in lower:
                return self._apply(speed)

        # 3. Check relative adjustments
        if _RELATIVE_UP.search(lower):
            return self._apply(self.current_speed + SPEED_STEP)

        if _RELATIVE_DOWN.search(lower):
            return self._apply(self.current_speed - SPEED_STEP)

        return None

    # ----- internal ---------------------------------------------------------

    def _apply(self, new_speed: float) -> dict:
        """Clamp the speed and return the event payload."""
        self.current_speed = round(
            max(MIN_SPEED, min(MAX_SPEED, new_speed)), 2
        )
        logger.info("Reading speed changed to %.2f", self.current_speed)
        return {"type": "speed_change", "speed": self.current_speed}
