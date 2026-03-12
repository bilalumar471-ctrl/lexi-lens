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
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import get_settings, setup_logging
from agent.lexi import LexiAgent
from agent.analyze import analyze_text, explain_selection, analyze_notes, extract_key_points, get_write_suggestions
from agent.dictation import DictationEngine
from agent.screen_reader import ScreenReader
from agent.reading_speed import ReadingSpeedController
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

# -- CORS --
origins = settings.ALLOWED_ORIGINS
if settings.ENV == "development":
    origins = ["*"]  # More permissive in dev

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
# Text Analysis (Feature A)
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    text: str

class ExplainSelectionRequest(BaseModel):
    context: str
    selection: str

@app.post("/api/analyze-text")
def api_analyze_text(req: AnalyzeRequest):
    """Analyze text to find difficult words and definitions."""
    result = analyze_text(req.text)
    return result

@app.post("/api/explain-selection")
def api_explain_selection(req: ExplainSelectionRequest):
    """Explain a specific user selection."""
    explanation = explain_selection(context=req.context, selection=req.selection)
    return {"explanation": explanation}

@app.post("/api/analyze-notes")
def api_analyze_notes(req: AnalyzeRequest):
    """Summarize text into bullet point notes."""
    result = analyze_notes(req.text)
    return result

@app.post("/api/key-points")
def api_key_points(req: AnalyzeRequest):
    """Extract key points from text."""
    result = extract_key_points(req.text)
    return result

@app.post("/api/write-suggest")
def api_write_suggest(req: AnalyzeRequest):
    """Get grammar and spelling suggestions for writing."""
    result = get_write_suggestions(req.text)
    return result


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
    if not token:
        await websocket.close(code=4001)
        logger.warning("WS auth failed: no session_token from %s", client_ip)
        return

    logger.info("WS session authenticated (token=%s…)", token[:8])

    # --- Step 2: main loop ---
    agent = LexiAgent()
    speed_ctrl = ReadingSpeedController()

    async def heartbeat():
        """Send periodic pings to keep the connection alive."""
        try:
            while True:
                await asyncio.sleep(30)
                await websocket.send_json({"type": "ping"})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"Heartbeat failed (likely closed): {e}")

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        # Initialize agent connection with retries for 503 errors
        max_retries = 3
        connected = False
        for attempt in range(max_retries):
            try:
                await agent.connect()
                connected = True
                await websocket.send_json({"type": "ready"})
                break
            except Exception as e:
                err_str = str(e).upper()
                if ("503" in err_str or "CAPACITY_EXHAUSTED" in err_str) and attempt < max_retries - 1:
                    logger.warning(f"Connection attempt {attempt+1} failed (503). Retrying in 7s (per server recommendation)...")
                    await asyncio.sleep(7)
                    continue
                
                logger.error(f"Agent connection failed: {e}")
                error_msg = "Capacity Limit" if ("503" in err_str or "CAPACITY_EXHAUSTED" in err_str) else "Connection Failed"
                try:
                    await websocket.send_json({"type": "error", "message": error_msg})
                    await asyncio.sleep(0.5)
                except: pass
                await websocket.close()
                return

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
                        logger.info(f"==> RECEIVED WS COMMAND: {msg_type}")
                        if msg_type == "mode":
                            new_mode = msg.get("mode", "general")
                            logger.info("Mode switch: %s", new_mode)
                            await agent.set_mode(new_mode)
                            await websocket.send_json({
                                "type": "mode_changed",
                                "mode": new_mode,
                            })
                        elif msg_type == "text":
                            logger.info("Text message: %s", msg.get("message"))
                        elif msg_type == "explain":
                            text_to_explain = msg.get("text", "")
                            logger.info("Explain requested for text length: %d", len(text_to_explain))
                            await agent.explain(text_to_explain, websocket)
                        elif msg_type == "explain_selection":
                            context = msg.get("context", "")
                            selection = msg.get("selection", "")
                            logger.info("Explain selection requested: %s", selection)
                            await agent.explain_selection(context, selection, websocket)
                        elif msg_type == "set_context":
                            context_text = msg.get("text", "")
                            logger.info("Setting context text (length: %d)", len(context_text))
                            await agent.set_context(context_text)
                            # Report auto-detected mode back to client
                            await websocket.send_json({
                                "type": "mode_changed",
                                "mode": agent.current_mode,
                            })
                        elif msg_type == "write_command":
                            cmd = msg.get("command", "")
                            curr = msg.get("current_text", "")
                            logger.info("Write command: %s", cmd)
                            await agent.handle_write_command(cmd, curr, websocket)

                        # ----- Dictation -----
                        elif msg_type == "dictation":
                            audio_b64 = msg.get("audio", "")
                            logger.info("Dictation request received")
                            result = await DictationEngine.process(
                                session_id=token, audio_base64=audio_b64,
                            )
                            await websocket.send_json({
                                "type": "dictation_result",
                                "raw": result["raw"],
                                "cleaned": result["cleaned"],
                            })

                        elif msg_type == "dictation_accept":
                            final_text = msg.get("text", "")
                            logger.info("Dictation accepted, storing")
                            doc_id = DictationEngine.store(
                                session_id=token, text=final_text,
                            )
                            await websocket.send_json({
                                "type": "dictation_stored",
                                "doc_id": doc_id,
                            })

                        # ----- Screen Reader -----
                        elif msg_type == "screen_frame":
                            frame_b64 = msg.get("frame", "")
                            logger.info("Screen reader request received")
                            narration = await ScreenReader.describe(frame_b64)
                            await websocket.send_json({
                                "type": "screen_narration",
                                "text": narration,
                            })
                            # Optionally speak through Live API
                            if narration and agent._session and not agent._session_dead.is_set():
                                try:
                                    await agent._session.send(
                                        input=f"Read this aloud naturally: {narration}",
                                        end_of_turn=True,
                                    )
                                except Exception as e:
                                    logger.warning(f"Screen reader speech failed: {e}")

                        # ----- Reading Speed -----
                        elif msg_type == "speed_command":
                            cmd_text = msg.get("text", "")
                            logger.info("Speed command: %s", cmd_text)
                            speed_event = speed_ctrl.parse_speed_command(cmd_text)
                            if speed_event:
                                await websocket.send_json(speed_event)

            except WebSocketDisconnect:
                logger.info("Client disconnected (send path)")

        async def _forward_model_audio():
            """Read audio responses from the model and push to the client."""
            try:
                # Pass websocket so agent can also send transcripts/highlights
                async for chunk in agent.receive_audio(websocket):
                    await websocket.send_bytes(chunk)

                    # Check transcripts for inline speed commands
                    # (speed_ctrl inspects spoken text passively)
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
        heartbeat_task.cancel()
        await agent.close()
        logger.info("WebSocket session cleaned up")

from fastapi.responses import FileResponse

@app.get("/test")
async def test_page():
    return FileResponse("test.html")
    