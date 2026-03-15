# LexiLens

LexiLens is an AI-powered reading companion designed to assist users with dyslexia and other reading difficulties. It features real-time voice interaction, screen reading capabilities, text extraction from images and PDFs, guided dictation, and various reading aids like focus mode and bionic reading.

This project consists of a Python FastAPI backend and a vanilla HTML/JS/CSS frontend.

---

## Reproducible Testing Instructions

These instructions will help you verify that the core components of LexiLens (WebSocket connectivity, Gemini Live Audio, Mode routing, file uploads, etc.) are working correctly.

### Prerequisites

1.  **Backend Environment:** Ensure you have your `.env` file configured in the `/backend` folder. It must contain:
    *   `GEMINI_API_KEY` (with access to the Live API standard and preview models)
    *   `PROJECT_ID` (your Google Cloud project ID for Firestore and Secret Manager)
2.  **Run the Backend:** Navigate to `/backend` and run the FastAPI server:
    ```bash
    uvicorn main:app --reload --port 8080
    ```
3.  **Run the Frontend:** Navigate to `/frontend` and host the static files:
    ```bash
    npx serve .
    ```
    *Open the frontend at: `http://localhost:3000`*

---

### Test 1: WebSocket & Connection Initialization

**Purpose:** Verify the client successfully authenticates and establishes a real-time connection with the Google Gemini Live API proxy.

1.  Open the frontend UI in a modern browser (Chrome/Edge).
2.  If prompted, click **"I Understand"** on the Privacy Notice modal.
3.  **Expected Observation:** The status badge in the top-right corner should transition from `Connecting...` (offline) to `Lexi Connected` (reconnecting pulse), and finally settle on a green **`LEXI READY`**.
4.  *Troubleshooting:* If it says `ERROR` or stays offline, check the browser console for `4001` (auth failed) or `4029` (rate-limit) errors. Ensure backend CORS (`FRONTEND_URL`) allows `http://localhost:3000`.

### Test 2: Two-Way Audio Communication & Mode Routing

**Purpose:** Verify the browser effectively captures microphone PCM audio, sends it to the server, and plays back the AI's audio response. Verify basic persona routing.

1.  Ensure the "Mode" badge says **"General Mode"**.
2.  Click the **"🎙 Mic"** button in the bottom left. The voice visualizer rings should appear, and the browser should ask for microphone formatting permissions.
3.  Speak clearly: *"Hello Lexi, can you hear me?"*
4.  **Expected Observation:**
    *   Your spoken words should appear slightly faded as a user bubble in the left-hand chat history box while speaking, solidifying when finished.
    *   Lexi should respond audibly via your speakers/headphones.
    *   Her response text should stream into a purple AI bubble in the chat history.
5.  Click the **"🛑 Stop"** button while she is talking to confirm the audio halts immediately and she is successfully interrupted.

### Test 3: Context Loading & "Explain Simply"

**Purpose:** Verify the frontend accurately routes `set_context` tasks to Gemini and the sentence-by-sentence reading comprehension tools function.

1.  Click the **"📄 Upload Document"** button (or paste a URL and click **"Go"**). Select a basic PDF, text file, or image with text.
2.  **Expected Observation:** The text should render in the Right Panel under "Text Display Area". The large central buttons will smoothly shrink to a compact top bar.
3.  Click the **"Explain Simply"** button (purple button at bottom right).
4.  **Expected Observation:**
    *   Lexi should start reading the text aloud and explaining it.
    *   The current sentence being read should be highlighted with a soft blue background.
    *   Individual words should highlight in yellow sequentially as she speaks.
    *   Her explanations should appear as AI chat bubbles on the left.

### Test 4: Screen Reader Integration

**Purpose:** Verify the Chrome Desktop Capture API can grab frames and stream them to the Gemini Vision multi-modal API correctly.

1.  Ensure you have text visible elsewhere on your monitor.
2.  Click **"🖥 Read Screen"** at the top right of the Text Display Area.
3.  When the browser prompts you, share your **Entire Screen**.
4.  **Expected Observation:** A red recording indicator will appear on the button. Lexi should audibly describe the current contents of your screen (e.g., "I see a webpage about...").
5.  *Highlight Test:* Drag to select specific text on your screen. Lexi should immediately interrupt her general description and read specifically what you highlighted.
6.  Click **"⏹ Stop Screen"** to terminate.

### Test 5: Firestore Session Creation

**Purpose:** Verify the background Firestore integration successfully stores user sessions.

1.  Go to your Google Cloud Console for the configured `PROJECT_ID`.
2.  Navigate to **Firestore Database**.
3.  Check the `sessions` collection.
4.  **Expected Observation:** You should see recent document IDs matching the session tokens generated during testing. These documents will contain an array of `readings` (text context you uploaded) and a `status` of "active" or "completed".
