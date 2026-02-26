"""
LexiLens — FastAPI application entry-point.

Endpoints
---------
GET  /health       → {"status": "ok"}
WS   /ws/session   → Real-time audio bridge to Lexi (Gemini Live API)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings, setup_logging
from agent.lexi import LexiAgent

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
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Liveness probe for Cloud Run / load-balancers."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# WebSocket session
# ---------------------------------------------------------------------------

@app.websocket("/ws/session")
async def ws_session(websocket: WebSocket):
    """
    Bidirectional audio bridge between the client and Lexi.

    Protocol (binary frames):
      Client → Server : raw PCM16 audio chunks (16 kHz, mono)
      Server → Client : PCM24 audio response chunks from Gemini
    """
    await websocket.accept()
    logger.info("WebSocket session connected")

    agent = LexiAgent()

    try:
        await agent.connect()

        # --- stream audio from client to model ----
        import asyncio

        async def _forward_client_audio():
            """Read audio frames from the client and feed them to the model."""
            try:
                while True:
                    data = await websocket.receive_bytes()
                    await agent.send_audio(data)
            except WebSocketDisconnect:
                logger.info("Client disconnected (send path)")

        # --- stream audio from model to client ----
        async def _forward_model_audio():
            """Read audio responses from the model and push them to the client."""
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
