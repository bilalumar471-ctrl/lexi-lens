"""
LexiLens — Security: sessions, rate-limiting, message validation.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. Session token system
# ---------------------------------------------------------------------------

# In-memory store: {token: {"ip": str, "created_at": float}}
_sessions: dict[str, dict[str, Any]] = {}


def create_session(ip: str) -> str:
    """Create a new session token for the given IP address."""
    token = str(uuid.uuid4())
    _sessions[token] = {"ip": ip, "created_at": time.time()}
    logger.info("Session created for IP %s", ip)
    return token


def validate_session(token: str) -> bool:
    """Return True if the token exists in the session store."""
    return token in _sessions


# ---------------------------------------------------------------------------
# 2. WebSocket rate limiting (slowapi for HTTP, manual for WS)
# ---------------------------------------------------------------------------

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Manual WS rate-limit store: {ip: [timestamp, ...]}
_ws_connections: dict[str, list[float]] = defaultdict(list)

WS_RATE_LIMIT = 1000        # max connections
WS_RATE_WINDOW = 3600       # per hour (seconds)


def check_ws_rate_limit(ip: str) -> bool:
    """
    Return True if the IP is still within the WebSocket rate limit.

    Allows up to WS_RATE_LIMIT new connections per WS_RATE_WINDOW seconds.
    """
    now = time.time()
    # Prune timestamps older than the window
    _ws_connections[ip] = [
        ts for ts in _ws_connections[ip] if now - ts < WS_RATE_WINDOW
    ]

    if len(_ws_connections[ip]) >= WS_RATE_LIMIT:
        logger.warning("WS rate limit exceeded for IP %s", ip)
        return False

    _ws_connections[ip].append(now)
    return True


# ---------------------------------------------------------------------------
# 3. Message schema validation
# ---------------------------------------------------------------------------

# Maps message type → set of required keys (beyond "type" itself).
ALLOWED_MESSAGE_TYPES: dict[str, set[str]] = {
    "init":     {"session_token"},
    "audio":    {"session_token"},
    "mode":     {"session_token", "mode"},
    "text":     {"session_token", "message"},
    "explain":  {"session_token", "text"},
    "explain_selection": {"session_token", "context", "selection"},
    "set_context": {"session_token", "text"},
    "snapshot": {"session_token"},
    "stop_explanation": {"session_token"},
    "write_command": {"session_token", "command", "current_text"},
    "mode_context": {"session_token", "mode", "context"},
}


def validate_ws_message(msg: dict) -> bool:
    """
    Validate an incoming WebSocket JSON message against the schema.

    Returns True if the message has a known ``type`` and contains all
    required keys for that type.
    """
    msg_type = msg.get("type")
    if msg_type not in ALLOWED_MESSAGE_TYPES:
        logger.warning("Unknown WS message type: %s", msg_type)
        return False

    required = ALLOWED_MESSAGE_TYPES[msg_type]
    missing = required - msg.keys()
    if missing:
        logger.warning("WS message type '%s' missing keys: %s", msg_type, missing)
        return False

    return True
