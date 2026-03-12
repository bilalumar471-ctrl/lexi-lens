# Implementation Plan - Phase 11: Advanced Write Mode & Model Stabilization

This plan covers the implementation of advanced interactive writing features and the final resolution of model-API compatibility issues.

## Final Technical Architecture

### 1. Configuration Strategy
- **File**: [config.py](file:///c:/Users/nicol/lexi-lens-latest/backend/config.py)
- **REST_GEMINI_MODEL**: `gemini-2.5-flash` (Stable for REST calls on this key).
- **LIVE_GEMINI_MODEL**: `gemini-2.5-flash-native-audio-preview-12-2025` (Required for Live WebSockets).
- **API Versioning**: Standardized on `v1alpha` for all AI clients.

### 2. Feature Implementation

#### Feature A: Interactive Hover-to-Fix
- **Backend**: `agent/analyze.py` -> `provide_gentle_suggestions` endpoint.
- **Frontend**: `script.js` -> `suggestion-tooltip` logic.
- **Logic**: Debounced spell-check on input; interactive tooltip displays corrections; click-to-apply corrected text.

#### Feature B: AI Story Pushing
- **Agent**: `agent/lexi.py` uses enhanced system prompt.
- **Protocol**: Custom `[PUSH_TO_WRITE_AREA]` token handled via WebSocket.
- **Frontend**: Injects received story text directly into the `lexi-write-area`.

#### Feature C: Predictive Typing
- **API**: `/api/predict-next` endpoint in `main.py`.
- **Backend**: `agent/analyze.py` -> `predict_next_words`.
- **Frontend**: Debounced calls on space/punctuation; modern UI bar with click-to-insert functionality.

## Verification Checklist

- [x] REST API calls (404/400 resolved via `v1alpha` + `gemini-2.5-flash`).
- [x] Live API connection (Policy violations resolved via explicit ID).
- [x] Predictive typing bar UI and logic.
- [x] Hover-to-fix tooltip interactivity and correction logic.
- [x] AI story injection flow.

---
Final Phase 11 build is stable and verified.
