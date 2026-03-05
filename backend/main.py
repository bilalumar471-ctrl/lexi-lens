"""
LexiLens — FastAPI application entry-point.

Endpoints
---------
GET  /health            → {"status": "ok"}
POST /api/session       → {"session_token": "..."}
POST /api/upload        → PDF text extraction
POST /api/upload-image  → Image OCR via Gemini
WS   /ws/session        → Real-time audio bridge to Lexi (Gemini Live API)
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import get_settings, setup_logging
from agent.lexi import LexiAgent
from processing.documents import router as documents_router
from security import (
    create_session,
    validate_session,
    validate_ws_message,
    check_ws_rate_limit,
    limiter,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run setup on startup, tear-down on shutdown."""
    setup_logging()
    logger.info("LexiLens backend starting up")
    yield
    logger.info("LexiLens backend shutting down")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

settings = get_settings()

app = FastAPI(
    title="LexiLens API",
    version="0.2.0",
    lifespan=lifespan,
)

# -- Rate-limiter state & error handler --
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Document upload routes --
app.include_router(documents_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Liveness probe for Cloud Run / load-balancers."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Session creation
# ---------------------------------------------------------------------------

@app.post("/api/session")
async def create_new_session(request: Request):
    """Create a session token for the calling client."""
    ip = request.client.host if request.client else "unknown"
    token = create_session(ip)
    return {"session_token": token}


# ---------------------------------------------------------------------------
# WebSocket session
# ---------------------------------------------------------------------------

@app.websocket("/ws/session")
async def ws_session(websocket: WebSocket):
    """
    Bidirectional audio bridge between the client and Lexi.

    Protocol:
      1. Client connects.
      2. First JSON message MUST contain a valid ``session_token``.
         If invalid → close with code 4001.
      3. Subsequent messages are validated against the message schema.
      4. Binary frames are forwarded as PCM audio to the Gemini Live API.
    """
    # --- Rate-limit check (before accepting) ---
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_ws_rate_limit(client_ip):
        await websocket.close(code=4029)  # custom "too many requests"
        logger.warning("WS connection rejected (rate limit) for IP %s", client_ip)
        return

    await websocket.accept()
    logger.info("WebSocket session connected from %s", client_ip)

    # --- Step 1: authenticate via first message ---
    try:
        raw_first = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        first_msg = json.loads(raw_first)
    except (asyncio.TimeoutError, json.JSONDecodeError):
        await websocket.close(code=4001)
        logger.warning("WS auth failed: bad first message from %s", client_ip)
        return

    token = first_msg.get("session_token", "")
    if not validate_session(token):
        await websocket.close(code=4001)
        logger.warning("WS auth failed: invalid session_token from %s", client_ip)
        return

    logger.info("WS session authenticated (token=%s…)", token[:8])

    # --- Step 2: main loop ---
    agent = LexiAgent()

    try:
        await agent.connect()

        async def _forward_client_audio():
            """Read frames from the client; dispatch JSON or binary."""
            try:
                while True:
                    message = await websocket.receive()

                    if message.get("bytes"):
                        # Binary frame → audio
                        await agent.send_audio(message["bytes"])

                    elif message.get("text"):
                        # JSON frame → validate then handle
                        try:
                            msg = json.loads(message["text"])
                        except json.JSONDecodeError:
                            logger.warning("Non-JSON text frame ignored")
                            continue

                        if not validate_ws_message(msg):
                            logger.warning("Invalid WS message rejected: %s", msg)
                            continue

                        # Route by type (extend as needed)
                        msg_type = msg.get("type")
                        if msg_type == "mode":
                            logger.info("Mode switch: %s", msg.get("mode"))
                        elif msg_type == "text":
                            logger.info("Text message: %s", msg.get("message"))

            except WebSocketDisconnect:
                logger.info("Client disconnected (send path)")

        async def _forward_model_audio():
            """Read audio responses from the model and push to the client."""
            try:
                async for chunk in agent.receive_audio():
                    await websocket.send_bytes(chunk)
            except WebSocketDisconnect:
                logger.info("Client disconnected (receive path)")

        await asyncio.gather(
            _forward_client_audio(),
            _forward_model_audio(),
        )

    except WebSocketDisconnect:
        logger.info("WebSocket session disconnected")
    except Exception:
        logger.exception("Unexpected error in WebSocket session")
    finally:
        await agent.close()
        logger.info("WebSocket session cleaned up")

from fastapi.responses import FileResponse

@app.get("/test")
async def test_page():
    return FileResponse("test.html")