/**
 * LexiLens Frontend - Refactored for Stability & UX
 * Main script handling WebSocket, Audio, Vision, and Modes.
 */

// ================= 1. CONFIG =================
const CONFIG = {
  WS_URL: "ws://127.0.0.1:8000/ws/session",
  API_URL: "http://127.0.0.1:8000"
};

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

// ================= 2. GLOBAL STATE =================
let ws = null;
let SESSION_TOKEN = null;
let isRecording = false;
let currentMode = "read";
let isRealContentActive = false; // Track if real text (not mock) is loaded
let isAIPushingToWrite = false; // TRACK IF AI IS GENERATING FOR THE EDITOR

// Audio
let audioCtx = null;
let micStream = null;
let scriptProcessor = null;
let playbackContext = null;
let window_shouldReconnect = true;
let reconnectAttempts = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_ATTEMPTS = 10;
let audioQueue = [];
let isPlaying = false;
let activeAudioSource = null;
let audioPlaybackRate = 1.0;

// Speech & Subtitles
let speechRecognizer = null;
let currentSpeechBubble = null;
let lastAiSpeechTime = 0;
let isLexiTalking = false;
let sidekickWindow = null;
let visionInterval = null;
let visionCanvas = document.createElement("canvas");

// Content
let rawText = "";
let originalHTML = "";
let analyzedHTML = "";
let writeRedoStack = [];
let transcriptBuffer = ""; // NEW: Buffer for cross-chunk tag detection
let isDrawingSuggestions = false; // NEW: Block syncOverlay during analysis

// ================= 3. INITIALIZATION =================
window.addEventListener("DOMContentLoaded", () => {
    setupEvents();
    initSpeechRecognition();
    initDyslexiaFeatures();
    initWriteMode();
    initFormMode();
    initVisionFormMode();
    initSelectionHandler();

    if (!sessionStorage.getItem("privacy_consented")) {
        document.getElementById("privacy-modal")?.classList.add("show");
    } else {
        updateStatus("offline", "Initializing...");
        initSession();
    }

    renderMockTextForMode("read");
    setupDragAndDrop();
});

async function initSession() {
    try {
        SESSION_TOKEN = crypto.randomUUID();
        console.log("[INIT] Session token:", SESSION_TOKEN);
        await initWebSocket();
        await initCamera();
    } catch (err) {
        console.error("[INIT] Failed:", err);
        updateStatus("offline", "Session Failed");
    }
}

function updateStatus(type, text) {
    const el = document.getElementById("status-indicator");
    if (!el) return;
    el.className = `status-${type}`;
    el.textContent = text;
}

// ================= 4. WEBSOCKET & CORE BRIDGE ================
async function initWebSocket() {
    if (ws) {
        console.log("[WS] Closing existing connection before new init");
        ws.close();
    }

    ws = new WebSocket(CONFIG.WS_URL);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
        console.log("[WS] Connected");
        reconnectAttempts = 0;
        updateStatus("online", "Lexi Online");
        sendMessage("init");
        
        // SYNC STATE: Re-send current mode and content context after drop
        if (currentMode) {
            console.log("[WS] Restoring mode:", currentMode);
            sendMessage("mode", { mode: currentMode });
        }
        if (isRealContentActive && rawText) {
            console.log("[WS] Restoring context (length):", rawText.length);
            sendMessage("set_context", { text: rawText });
        }
    };

    ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
            handleJsonMessage(JSON.parse(event.data));
        } else if (event.data instanceof ArrayBuffer) {
            playAudioChunk(event.data);
        }
    };

    ws.onclose = (event) => {
        console.warn(`[WS] Disconnected (code=${event.code})`);
        updateStatus("offline", "Lexi Offline");
        isLexiTalking = false;
        
        if (window_shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            console.log(`[WS] Retrying in ${delay}ms... (Attempt ${reconnectAttempts + 1})`);
            reconnectTimeout = setTimeout(initWebSocket, delay);
            reconnectAttempts++;
            updateStatus("offline", "Reconnecting...");
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            updateStatus("error", "Connection Lost - Please Refresh");
        }
    };

    ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        updateStatus("error", "Connection Error");
    };
}

function handleJsonMessage(msg) {
    if (msg.type === "ping") return;
    if (msg.type === "ready") {
        updateStatus("online", "Lexi Ready");
        return;
    }

    switch (msg.type) {
        case "status":
            updateStatus(msg.value, msg.text || "");
            break;
        case "transcript":
        case "explain_transcript":
            handleTranscript(msg);
            break;
        case "talking":
            handleLexiTalkingState(msg.value);
            if (!msg.value) {
                // Increased delay to 3s to ensure all transcript chunks are caught
                console.log("[AI-WRITE] Lexi stopped talking. Starting 3s cooldown for push state.");
                setTimeout(() => {
                    isAIPushingToWrite = false;
                    console.log("[AI-WRITE] State reset to inactive");
                }, 3000);
            }
            break;
        case "highlight":
            highlightWord(msg.word_index);
            break;
        case "highlight_sentence":
            highlightSentence(msg.sentence_index);
            addChat(`📖 Explaining sentence ${msg.sentence_index + 1}...`, "ai");
            break;
        case "explain_done":
            clearSentenceHighlight();
            addChat("✅ Done explaining! Let me know if you need more help.", "ai");
            const explainBtn = document.getElementById("explain-btn");
            if (explainBtn) {
                explainBtn.disabled = false;
                explainBtn.style.opacity = "1";
                document.getElementById("stop-explain-btn").style.display = "none";
            }
            break;
        case "error":
            if (msg.message === "Capacity Limit" || msg.message === "Connection Failed") {
                updateStatus("offline", msg.message);
                window_shouldReconnect = false;
            } else {
                addChat(msg.message, "ai");
            }
            break;
    }
}

function handleTranscript(msg) {
    const txt = (msg.text || "");
    if (!txt) return;

    // RESTORE BUFFERING: Accumulated buffer handles tags split across chunks
    transcriptBuffer += txt;
    
    // Check for PUSH_TO_DASHBOARD
    if (transcriptBuffer.includes("[PUSH_TO_DASHBOARD]")) {
        const parts = transcriptBuffer.split("[PUSH_TO_DASHBOARD]");
        const intro = parts[0].trim();
        const content = parts[1].trim();
        if (intro) addChat(intro, "ai");
        if (content) {
            addChat("✨ Lexi pushed a new story to your dashboard!", "ai");
            renderTextWithHighlight(content, true);
            if (currentMode === "write") forceSwitchMode("read");
        }
        transcriptBuffer = ""; // Clear after consumption
        return;
    }

    // Check for PUSH_TO_WRITE_AREA
    if (transcriptBuffer.includes("[PUSH_TO_WRITE_AREA]")) {
        const parts = transcriptBuffer.split("[PUSH_TO_WRITE_AREA]");
        const intro = parts[0].trim();
        const content = parts[1].trim();
        
        if (intro) addChat(intro, "ai");
        
        if (content) {
            isAIPushingToWrite = true;
            const textarea = document.getElementById("write-textarea");
            if (textarea) {
                const hasVal = textarea.value.trim().length > 0;
                textarea.value += (hasVal ? "\n\n" : "") + content;
                syncOverlay();
                saveState();
            }
        }
        transcriptBuffer = ""; // Clear and start appending chunks directly
        return;
    }

    // If we are currently in "pushing" mode (started by a tag)
    if (isAIPushingToWrite) {
        const textarea = document.getElementById("write-textarea");
        if (textarea) {
            textarea.value += txt; 
            syncOverlay();
            saveState();
        }
        transcriptBuffer = ""; // Keep buffer clean
    } else {
        // Normal chat
        addChat(txt, "ai");
        // Keep limited buffer for split tag detection in next chunks
        if (transcriptBuffer.length > 500) transcriptBuffer = transcriptBuffer.slice(-200);
    }
}

function sendMessage(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            session_token: SESSION_TOKEN,
            type: type,
            ...payload
        }));
        // REMOVED: isAIPushingToWrite = true. This was the bug.
        // It must only be set when the tag is found in the stream.
        if (type === "write_command") {
            console.log("[AI-WRITE] Command sent. Waiting for tag...");
        }
    }
}



// ================= 5. AUDIO HANDLING =================
async function playAudioChunk(buffer) {
    if (!playbackContext) playbackContext = new AudioContext();
    if (playbackContext.state === "suspended") await playbackContext.resume();
    
    audioQueue.push(buffer);
    if (!isPlaying) drainQueue();
}

async function drainQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        lastAiSpeechTime = Date.now();
        return;
    }
    isPlaying = true;

    const buf = audioQueue.shift();
    try {
        const audioBuffer = await playbackContext.decodeAudioData(buf.slice(0));
        const source = playbackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = audioPlaybackRate;
        source.connect(playbackContext.destination);
        source.onended = drainQueue;
        activeAudioSource = source;
        source.start();
    } catch {
        // Fallback for raw PCM if decode fails
        const pcm = new Int16Array(buf);
        const float = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) float[i] = pcm[i] / 32768;
        const audioBuffer = playbackContext.createBuffer(1, float.length, 24000);
        audioBuffer.copyToChannel(float, 0);
        const source = playbackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = audioPlaybackRate;
        source.connect(playbackContext.destination);
        source.onended = drainQueue;
        activeAudioSource = source;
        source.start();
    }
}

function handleLexiTalkingState(isTalking) {
    isLexiTalking = isTalking;
    if (!isTalking) {
        lastAiSpeechTime = Date.now();
        if (currentSpeechBubble && currentSpeechBubble._sender === "ai") {
            currentSpeechBubble.style.opacity = "1";
            currentSpeechBubble = null;
        }
    }
    updateSidekickUI();
}

// ================= 6. TEXT RENDERING & HIGHLIGHTS =================
function renderTextWithHighlight(text, isRealContent = false) {
    rawText = text;
    isRealContentActive = isRealContent;
    const container = document.getElementById("reading-text");
    if (!container) return;
    container.innerHTML = "";
    currentView = "original";
    analyzedHTML = "";

    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

    sentences.forEach((sentence, sIdx) => {
        const sentenceSpan = document.createElement("span");
        sentenceSpan.className = "sentence";
        sentenceSpan.dataset.sentence = sIdx;

        sentence.trim().split(/\s+/).forEach((w, wIdx) => {
            const wordSpan = document.createElement("span");
            wordSpan.className = "word";
            wordSpan.dataset.wordIndex = wIdx;
            
            if (isBionicActive && w.length > 1) {
                const mid = Math.ceil(w.length / 2);
                wordSpan.innerHTML = `<b>${w.substring(0, mid)}</b>${w.substring(mid)} `;
            } else {
                wordSpan.textContent = w + " ";
            }
            sentenceSpan.appendChild(wordSpan);
        });

        if (sIdx % 2 !== 0) {
            sentenceSpan.style.backgroundColor = "rgba(0, 0, 0, 0.03)";
            sentenceSpan.style.borderRadius = "4px";
        }
        container.appendChild(sentenceSpan);
    });

    originalHTML = container.innerHTML;
    
    if (isRealContent) {
        analyzeText(text);
        generateNotes(text);
        sendMessage("set_context", { text: text });
    }
}

async function analyzeText(text) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/analyze-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.difficult_words?.length) {
            window.difficultDictMap = {};
            data.difficult_words.forEach(item => {
                window.difficultDictMap[item.word.trim().toLowerCase()] = item.explanation;
            });
            
            const liveSpans = document.querySelectorAll("#reading-text .word");
            liveSpans.forEach(span => {
                const clean = span.textContent.trim().replace(/[.,!?;:]/g, "").toLowerCase();
                if (window.difficultDictMap[clean]) {
                    span.classList.add("difficult-word");
                    span.setAttribute("data-word", clean);
                }
            });
            originalHTML = document.getElementById("reading-text").innerHTML;
            addChat("💡 Difficult words are highlighted in the Original Text.", "ai");
        }
    } catch (e) {
        console.error("Analysis failed:", e);
    }
}

async function generateNotes(text) {
    const btn = document.getElementById("view-analyzed-btn");
    if (btn) btn.innerText = "⏳ Generating Notes...";

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/analyze-notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.notes?.length) {
            let html = `<div style="padding:10px;"><h3>Summary Notes</h3><ul>`;
            data.notes.forEach(n => html += `<li>${n}</li>`);
            html += `</ul></div>`;
            analyzedHTML = html;
            if (btn) btn.innerText = "📝 Summary Notes";
            addChat("📝 Summary Notes ready!", "ai");
        }
    } catch (e) {
        console.error("Notes failed:", e);
    }
}

// ================= 7. DYSLEXIA FEATURES =================
let isBionicActive = false;
let isRulerActive = false;

function initDyslexiaFeatures() {
    const rulerToggle = document.getElementById("ruler-toggle");
    const ruler = document.getElementById("reading-ruler");
    const textDisplay = document.querySelector(".text-display");

    rulerToggle?.addEventListener("click", () => {
        isRulerActive = !isRulerActive;
        ruler?.classList.toggle("active", isRulerActive);
        rulerToggle.classList.toggle("active-toggle", isRulerActive);
        if (!isRulerActive && ruler) {
            ruler.style.display = "none";
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (!isRulerActive || !ruler || !textDisplay) return;
        
        const rect = textDisplay.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            ruler.style.display = "block";
            ruler.style.top = `${e.clientY - 25}px`;
        } else {
            ruler.style.display = "none";
        }
    });

    const bionicToggle = document.getElementById("bionic-toggle");
    bionicToggle?.addEventListener("click", () => {
        isBionicActive = !isBionicActive;
        bionicToggle.classList.toggle("active-toggle", isBionicActive);
        if (rawText) renderTextWithHighlight(rawText, false);
    });

    document.querySelectorAll(".color-dot").forEach(dot => {
        dot.addEventListener("click", (e) => {
            const color = e.target.dataset.color;
            document.documentElement.style.setProperty("--bg", color);
            document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
            e.target.classList.add("active");
        });
    });

    const focusToggle = document.getElementById("focus-mode-toggle");
    focusToggle?.addEventListener("click", () => {
        const textDisplay = document.querySelector(".text-display");
        const isActive = textDisplay.classList.toggle("focus-mode-active");
        focusToggle.classList.toggle("active-toggle", isActive);
    });

    const speedSelect = document.getElementById("voice-speed-select");
    speedSelect?.addEventListener("change", (e) => {
        audioPlaybackRate = parseFloat(e.target.value);
        console.log("[SPEED] Playback rate set to:", audioPlaybackRate);
    });
}

// ================= 8. CAMERA & SNAPSHOT =================
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        const video = document.getElementById("video");
        if (video) {
            video.srcObject = stream;
            video.addEventListener('loadedmetadata', () => video.play());
        }
    } catch (err) {
        console.error("Camera access failed", err);
    }
}

async function takeSnapshot() {
    const video = document.getElementById("video");
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
    const formData = new FormData();
    formData.append("file", blob, "snapshot.jpg");

    addChat("Scanning text from camera...", "user");
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/upload-image`, { method: "POST", body: formData });
        const data = await res.json();
        
        // Show thumbnail
        const thumb = document.getElementById("snapshot-thumb");
        const thumbImg = document.getElementById("snapshot-img");
        if (thumb && thumbImg) {
            thumbImg.src = URL.createObjectURL(blob);
            thumb.style.display = "block";
        }

        if (data.full_text) {
            renderTextWithHighlight(data.full_text, true);
            finalizeReadSource();
        } else {
            addChat("No text found in snapshot.", "ai");
        }
    } catch (err) {
        console.error("Snapshot error:", err);
    }
}

// ================= 9. WRITE MODE LOGIC =================
let writeHistory = [];
// writeRedoStack is declared globally to avoid lint errors
let suggestionTooltip = null;

function initWriteMode() {
    const textarea = document.getElementById("write-textarea");
    if (!textarea) return;

    textarea.addEventListener("input", () => {
        syncOverlay();
        saveState();
        debouncedPredict(textarea.value);
        debouncedSuggest(textarea.value);
    });
    textarea.addEventListener("scroll", syncOverlay);

    document.getElementById("write-undo-btn")?.addEventListener("click", undoWrite);
    document.getElementById("write-redo-btn")?.addEventListener("click", redoWrite);
    document.getElementById("write-readback-btn")?.addEventListener("click", () => speakText(textarea.value));
    document.getElementById("write-submit-btn")?.addEventListener("click", () => fetchSuggestions(textarea.value));

    document.getElementById("write-stt-btn")?.addEventListener("click", () => startWriteMic(true)); // Pure STT
    document.getElementById("write-ai-btn")?.addEventListener("click", () => startWriteMic(false)); // AI Command
    document.getElementById("write-fix-all-btn")?.addEventListener("click", applyAllCorrections);
    
    // Suggestion interactions - Event Delegation on the overlay
    const overlay = document.getElementById("write-highlight-overlay");
    if (overlay) {
        overlay.onclick = (e) => {
            const hint = e.target.closest(".error-hint");
            if (hint) {
                const correction = hint.getAttribute("data-correction");
                if (correction && correction !== "Suggestion available") {
                    applyCorrection(hint.textContent, correction);
                }
            }
        };
        // Re-init hover logic if overlay is hovered
        overlay.onmouseenter = () => {
            if (overlay.querySelectorAll(".error-hint").length > 0) {
                initHoverSuggestions();
            }
        };
    }
}

function syncOverlay() {
    if (isDrawingSuggestions) return; // DON'T WIPE OUT RED MARKS

    const textarea = document.getElementById("write-textarea");
    const overlay = document.getElementById("write-highlight-overlay");
    if (textarea && overlay) {
        // Hard sync
        overlay.textContent = textarea.value + "\u200b";
        overlay.scrollTop = textarea.scrollTop;
    }
}

function saveState() {
    const val = document.getElementById("write-textarea").value;
    if (!writeHistory.length || writeHistory[writeHistory.length-1] !== val) {
        writeHistory.push(val);
        if (writeHistory.length > 50) writeHistory.shift();
    }
    localStorage.setItem("lexi_write_session", val);
}

function undoWrite() {
    if (writeHistory.length > 1) {
        writeRedoStack.push(writeHistory.pop());
        const textarea = document.getElementById("write-textarea");
        textarea.value = writeHistory[writeHistory.length-1];
        syncOverlay();
    }
}

function redoWrite() {
    if (writeRedoStack.length) {
        const state = writeRedoStack.pop();
        writeHistory.push(state);
        document.getElementById("write-textarea").value = state;
        syncOverlay();
    }
}

const debouncedPredict = debounce(async (text) => {
    if (text.length < 3) return;
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/predict-next`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        const div = document.getElementById("prediction-bar");
        if (div && data.predictions) {
            div.innerHTML = "";
            data.predictions.forEach(p => {
                const item = document.createElement("div");
                item.className = "prediction-item";
                item.textContent = p;
                item.onclick = () => {
                    const textarea = document.getElementById("write-textarea");
                    const space = textarea.value.endsWith(" ") ? "" : " ";
                    textarea.value += space + p + " ";
                    div.innerHTML = "";
                    syncOverlay();
                    saveState();
                };
                div.appendChild(item);
            });
        }
    } catch {}
}, 400);

const debouncedSuggest = debounce((text) => {
    if (text.length > 5) fetchSuggestions(text); // Reduced min length
}, 400); // Reduced delay for faster underlines

async function fetchSuggestions(text) {
    const overlay = document.getElementById("write-highlight-overlay");
    const textarea = document.getElementById("write-textarea");
    if (!overlay || !textarea) return;

    // GHOST LINE FIX: Clear everything before starting the new fetch
    overlay.innerHTML = textarea.value + "\u200b";
    
    isDrawingSuggestions = true;
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/write-suggest`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        console.log("[SUGGESTIONS] Received:", data);
        
        let html = text + "\u200b";
        if (data.suggestions && data.suggestions.length > 0) {
            data.suggestions.forEach(s => {
                if (s.original && s.replacement) {
                    const word = s.original;
                    const corr = s.replacement;
                    // Precise word boundary replacement
                    const regex = new RegExp(`\\b(${word})\\b`, 'gi');
                    html = html.replace(regex, `<span class="error-hint" data-correction="${corr}">$1</span>`);
                }
            });
            overlay.innerHTML = html;
            overlay.scrollTop = textarea.scrollTop;

            // Show Fix All button if >= 2 errors
            const fixAllBtn = document.getElementById("write-fix-all-btn");
            if (fixAllBtn) {
                fixAllBtn.style.display = data.suggestions.length >= 2 ? "flex" : "none";
            }

            initHoverSuggestions();
        } else {
            isDrawingSuggestions = false;
            const fixAllBtn = document.getElementById("write-fix-all-btn");
            if (fixAllBtn) fixAllBtn.style.display = "none";
            syncOverlay(); // Clean up if no suggestions
        }
    } catch (err) {
        console.error("[SUGGESTIONS] Fetch failed:", err);
    } finally {
        isDrawingSuggestions = false;
    }
}

function initHoverSuggestions() {
    const hints = document.querySelectorAll(".error-hint");
    if (!suggestionTooltip) {
        suggestionTooltip = document.createElement("div");
        suggestionTooltip.className = "suggestion-tooltip";
        suggestionTooltip.style.display = "none";
        document.body.appendChild(suggestionTooltip);
        
        suggestionTooltip.onmouseenter = () => {
            clearTimeout(suggestionTooltip._hideTimeout);
            suggestionTooltip.style.display = "block";
        };
        suggestionTooltip.onmouseleave = () => {
            suggestionTooltip.style.display = "none";
        };
    }

    hints.forEach(hint => {
        hint.onmouseover = () => {
            clearTimeout(suggestionTooltip._hideTimeout);
            const corr = hint.getAttribute("data-correction");
            const original = hint.textContent;
            
            suggestionTooltip.innerHTML = `
                <span class="label">Lexi Suggests:</span>
                <span class="value" style="color:var(--g1); cursor:pointer; text-decoration:underline;" 
                      onclick="applyCorrection('${original.replace(/'/g, "\\'")}', '${corr.replace(/'/g, "\\'")}')">${corr}</span>
                <div style="font-size:10px; color:#999; margin-top:8px;">Click to apply correction</div>
            `;
            
            suggestionTooltip.style.display = "block";
            const rect = hint.getBoundingClientRect();
            suggestionTooltip.style.left = Math.max(10, rect.left) + "px";
            // Ensure tooltip is not off-top
            const topPos = rect.top - suggestionTooltip.offsetHeight - 10;
            suggestionTooltip.style.top = (topPos > 10 ? topPos : rect.bottom + 10) + "px";
        };
        
        hint.onmouseout = () => {
            suggestionTooltip._hideTimeout = setTimeout(() => {
                suggestionTooltip.style.display = "none";
            }, 50); // Near-instant hiding
        };
    });
}

window.applyCorrection = function(original, replacement) {
    const textarea = document.getElementById("write-textarea");
    if (!textarea) return;
    
    // Use a precise replace for the word
    const oldText = textarea.value;
    const regex = new RegExp(`\\b${original}\\b`, 'i');
    textarea.value = oldText.replace(regex, replacement);
    
    if (suggestionTooltip) suggestionTooltip.style.display = "none";
    
    // SAVE STATE FIRST
    saveState();
    
    // INSTEAD of generic sync, triggered immediate RE-SUGGEST
    // This solves the "vanishing red lines" problem
    fetchSuggestions(textarea.value);
    
    addChat(`✅ Fixed "${original}" to "${replacement}"`, "ai");
};

window.applyAllCorrections = async function() {
    const textarea = document.getElementById("write-textarea");
    const overlay = document.getElementById("write-highlight-overlay");
    if (!textarea || !overlay) return;

    // Get all corrections currently visible in the overlay
    const hints = Array.from(overlay.querySelectorAll(".error-hint"));
    if (hints.length === 0) return;

    let text = textarea.value;
    let count = 0;

    // Use a Map to store unique corrections to avoid double-replacing
    const uniqueCorrections = new Map();
    hints.forEach(hint => {
        const original = hint.textContent;
        const correction = hint.getAttribute("data-correction");
        if (correction && correction !== "Suggestion available") {
            uniqueCorrections.set(original, correction);
        }
    });

    // Apply all unique corrections
    uniqueCorrections.forEach((correction, original) => {
        const regex = new RegExp(`\\b${original}\\b`, 'gi');
        if (regex.test(text)) {
            text = text.replace(regex, correction);
            count++;
        }
    });

    textarea.value = text;
    saveState();
    
    const fixAllBtn = document.getElementById("write-fix-all-btn");
    if (fixAllBtn) fixAllBtn.style.display = "none";
    
    // GHOST LINE FIX: Immediately clear all marks from the overlay
    overlay.innerHTML = textarea.value + "\u200b";
    overlay.scrollTop = textarea.scrollTop;
    
    addChat(`✨ One-click Magic: Fixed ${count} mistakes!`, "ai");
    
    // Refresh to clear any remaining underlines or find new ones
    fetchSuggestions(textarea.value);
};

// ================= 10. VOICE & STT =================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    speechRecognizer = new SpeechRecognition();
    speechRecognizer.continuous = true;
    speechRecognizer.interimResults = true;
    speechRecognizer.lang = 'en-US';

    speechRecognizer.onresult = (event) => {
        let final = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
        }

        if (final || interim) {
            const now = Date.now();
            const isAi = isLexiTalking || isPlaying || (now - lastAiSpeechTime < 1200);
            
            if (!isAi && (isPlaying || isLexiTalking)) {
                console.log("[BARGE-IN] User interrupted AI");
                cancelAiSpeech();
            }

            const sender = isAi ? "ai" : "user";
            if (!currentSpeechBubble || currentSpeechBubble._sender !== sender) {
                if (currentSpeechBubble) currentSpeechBubble.style.opacity = "1";
                currentSpeechBubble = document.createElement("div");
                currentSpeechBubble.className = `chat-message ${sender}`;
                currentSpeechBubble._sender = sender;
                document.getElementById("chat-scroll").appendChild(currentSpeechBubble);
            }
            currentSpeechBubble.textContent = final || interim;
            document.getElementById("chat-scroll").scrollTop = document.getElementById("chat-scroll").scrollHeight;
            if (final) {
                currentSpeechBubble.style.opacity = "1";
                currentSpeechBubble = null;
            }
        }
    };

    speechRecognizer.onend = () => { if (isRecording) try { speechRecognizer.start(); } catch{} };
}

let isWriteMicOn = false;
let writeSpeechRecognizer = null;

function toggleWriteMic() {
    if (!isWriteMicOn) startWriteMic(true);
    else stopWriteMic();
}

function startWriteMic(isSTT = true) {
    if (isWriteMicOn) { stopWriteMic(); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    isWriteMicOn = true;
    const btn = document.getElementById(isSTT ? "write-stt-btn" : "write-ai-btn");
    if (btn) btn.classList.add("recording");
    
    writeSpeechRecognizer = new SpeechRecognition();
    writeSpeechRecognizer.continuous = true;
    writeSpeechRecognizer.interimResults = true;
    writeSpeechRecognizer.lang = 'en-US';

    writeSpeechRecognizer.onresult = (event) => {
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
        }
        if (final) {
            if (isSTT) {
                const ta = document.getElementById("write-textarea");
                ta.value += (ta.value.endsWith(" ") || !ta.value ? "" : " ") + final;
                syncOverlay();
                saveState();
            } else {
                addChat(`🗣 Command: "${final}"`, "user");
                let cleanCmd = final;
                ["let's see", "let me", "lassie", "lexie"].forEach(v => {
                    cleanCmd = cleanCmd.replace(new RegExp(v, "gi"), "Lexi");
                });
                sendMessage("write_command", { command: cleanCmd, current_text: document.getElementById("write-textarea").value });
                stopWriteMic();
            }
        }
    };
    writeSpeechRecognizer.onerror = () => stopWriteMic();
    writeSpeechRecognizer.onend = () => { if (isWriteMicOn) writeSpeechRecognizer.start(); };
    writeSpeechRecognizer.start();
    addChat(isSTT ? "Listening... 🎙" : "Listening for your request... ✨ (e.g. 'Please help me write a story')", "ai");
}

function stopWriteMic() {
    isWriteMicOn = false;
    document.getElementById("write-stt-btn")?.classList.remove("recording");
    document.getElementById("write-ai-btn")?.classList.remove("recording");
    if (writeSpeechRecognizer) {
        writeSpeechRecognizer.onend = null;
        try { writeSpeechRecognizer.stop(); } catch{}
        writeSpeechRecognizer = null;
    }
}

// ================= 11. FORM MODE =================
let formFields = [];
let currentFormFieldIndex = 0;

function initFormMode() {
    const form = document.getElementById("mock-dyslexia-form");
    if (!form) return;
    formFields = Array.from(form.querySelectorAll("input, textarea, select"));
    formFields.forEach((field, idx) => {
        field.onfocus = () => {
            currentFormFieldIndex = idx;
            highlightFormField(idx);
            updateFormProgress();
            const group = field.closest(".form-field-group");
            const label = group?.querySelector("label")?.textContent || "";
            const hint = group?.dataset.hint || "";
            speakText(`${label}. ${hint}`);
        };
        field.oninput = updateFormProgress;
    });

    document.getElementById("form-prev-btn")?.addEventListener("click", () => {
        if (currentFormFieldIndex > 0) formFields[--currentFormFieldIndex].focus();
    });
    document.getElementById("form-next-btn")?.addEventListener("click", () => {
        if (currentFormFieldIndex < formFields.length - 1) formFields[++currentFormFieldIndex].focus();
        else addChat("Form complete! Well done.", "ai");
    });
}

function highlightFormField(idx) {
    document.querySelectorAll(".form-field-group").forEach(g => g.classList.remove("focused-field"));
    const group = formFields[idx]?.closest(".form-field-group");
    if (group) {
        group.classList.add("focused-field");
        group.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function updateFormProgress() {
    const filled = formFields.filter(f => f.value.trim().length > 0).length;
    const percent = Math.round((filled / (formFields.length || 1)) * 100);
    const bar = document.getElementById("form-progress-bar");
    if (bar) bar.style.width = percent + "%";
    const text = document.getElementById("form-progress-text");
    if (text) text.textContent = percent + "% Complete";
}

// ================= 12. VISION FORM MODE =================
let formStream = null;

function initVisionFormMode() {
    document.getElementById("form-share-btn")?.addEventListener("click", startFormScreenShare);
    document.getElementById("form-upload-btn")?.addEventListener("click", triggerFormImageUpload);
    document.getElementById("form-switch-source")?.addEventListener("click", resetFormSource);
    document.getElementById("form-popout-btn")?.addEventListener("click", toggleSidekick);
}

async function toggleSidekick() {
    if (sidekickWindow) {
        sidekickWindow.close();
        sidekickWindow = null;
        return;
    }

    if (!('documentPictureInPicture' in window)) {
        addChat("Sorry, your browser doesn't support the Sidekick feature. Try using Chrome or Edge.", "ai");
        return;
    }

    try {
        // Open the Pip window - reduced size for "Lexi Bubble"
        sidekickWindow = await window.documentPictureInPicture.requestWindow({
            width: 240,
            height: 240,
        });

        // Copy styles to the new window
        const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
        styleLinks.forEach((link) => {
            sidekickWindow.document.head.appendChild(link.cloneNode(true));
        });

        // Add the Sidekick UI from template
        const template = document.getElementById('sidekick-template');
        const sidekickContent = template.content.cloneNode(true);
        sidekickWindow.document.body.appendChild(sidekickContent);

        // Bind Sidekick controls
        const pipMic = sidekickWindow.document.getElementById('sidekick-mic');
        pipMic.onclick = () => {
            toggleMic();
            updateSidekickUI();
        };

        sidekickWindow.onpagehide = () => {
            sidekickWindow = null;
            console.log("[SIDEKICK] Window closed");
        };

        updateSidekickUI();
        addChat("🚀 Lexi Sidekick is now active! You can switch to other tabs.", "ai");
    } catch (err) {
        console.error("[SIDEKICK] Failed to open:", err);
    }
}

function updateSidekickUI() {
    if (!sidekickWindow) return;
    const doc = sidekickWindow.document;
    const mic = doc.getElementById('sidekick-mic');
    const status = doc.getElementById('sidekick-status');
    const ring = doc.querySelector('.avatar-ring');
    
    if (isRecording) {
        mic.classList.add('recording');
        status.textContent = "Lexi is listening...";
        if (ring) ring.style.animationPlayState = "running";
    } else if (isLexiTalking) {
        mic.classList.remove('recording');
        status.textContent = "Lexi is speaking...";
        if (ring) ring.style.animationPlayState = "running";
    } else {
        mic.classList.remove('recording');
        status.textContent = "Lexi Sidekick";
        if (ring) ring.style.animationPlayState = "paused";
    }
}

async function startFormScreenShare() {
    try {
        formStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.getElementById("form-screen-video");
        video.srcObject = formStream;
        video.style.display = "block";
        document.getElementById("form-upload-img").style.display = "none";
        showFormActiveView();
        addChat("Screen sharing active!", "ai");
        formStream.getTracks()[0].onended = resetFormSource;
        
        // Start vision loop
        if (visionInterval) clearInterval(visionInterval);
        visionInterval = setInterval(captureAndSendFrame, 2000);
    } catch (err) { console.error(err); }
}

function triggerFormImageUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                const img = document.getElementById("form-upload-img");
                img.src = re.target.result;
                img.style.display = "block";
                document.getElementById("form-screen-video").style.display = "none";
                showFormActiveView();
                uploadFormFile(file);
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

async function uploadFormFile(file) {
    addChat("Analyzing form...", "ai");
    const formData = new FormData();
    formData.append("file", file);
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/upload`, { method: "POST", body: formData });
        const data = await res.json();
        if (data.analysis) {
            addChat("Form analyzed. You can now ask questions.", "ai");
            sendMessage("mode_context", { mode: "form", context: data.analysis });
        }
    } catch {}
}

function showFormActiveView() {
    document.getElementById("form-source-selector").style.display = "none";
    document.getElementById("form-active-view").style.display = "flex";
}

function resetFormSource() {
    if (formStream) formStream.getTracks().forEach(t => t.stop());
    formStream = null;
    if (visionInterval) { clearInterval(visionInterval); visionInterval = null; }
    document.getElementById("form-source-selector").style.display = "block";
    document.getElementById("form-active-view").style.display = "none";
}

async function captureAndSendFrame() {
    if (!formStream || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    const video = document.getElementById("form-screen-video");
    if (video.videoWidth === 0) return;

    // Scale down for performance
    const scale = 0.5;
    visionCanvas.width = video.videoWidth * scale;
    visionCanvas.height = video.videoHeight * scale;
    
    const ctx = visionCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, visionCanvas.width, visionCanvas.height);
    
    // Low quality JPEG to save bandwidth
    const base64 = visionCanvas.toDataURL('image/jpeg', 0.4);
    sendMessage("vision_frame", { data: base64 });
}

// ================= 13. UI HELPERS & EVENTS =================
function setupEvents() {
    document.getElementById("mic-btn")?.addEventListener("click", toggleMic);
    document.getElementById("read-snapshot-btn")?.addEventListener("click", takeSnapshot);
    document.getElementById("read-upload-btn")?.addEventListener("click", () => document.getElementById("file-input").click());
    document.getElementById("change-source-btn")?.addEventListener("click", resetReadSource);
    document.getElementById("file-input")?.addEventListener("change", (e) => handleUpload(e.target.files));
    document.getElementById("url-submit-btn")?.addEventListener("click", fetchUrl);
    document.getElementById("mode-toggle")?.addEventListener("click", () => {
        const menu = document.getElementById("mode-dropdown");
        menu.style.display = (menu.style.display === "flex" ? "none" : "flex");
    });
    document.getElementById("mode-dropdown")?.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        if (mode) forceSwitchMode(mode);
    });
    document.getElementById("font-increase")?.addEventListener("click", increaseFont);
    document.getElementById("font-decrease")?.addEventListener("click", decreaseFont);
    document.getElementById("explain-btn")?.addEventListener("click", triggerExplain);
    document.getElementById("stop-explain-btn")?.addEventListener("click", cancelAiExplanation);
    document.getElementById("consent-btn")?.addEventListener("click", () => {
        sessionStorage.setItem("privacy_consented", "true");
        document.getElementById("privacy-modal").classList.remove("show");
        initSession();
    });

    document.getElementById("view-original-btn")?.addEventListener("click", () => switchView("original"));
    document.getElementById("view-analyzed-btn")?.addEventListener("click", () => switchView("analyzed"));
    
    document.getElementById("reading-tools-btn")?.addEventListener("click", () => {
        const panel = document.getElementById("reading-tools-panel");
        panel.classList.toggle("hidden");
        document.getElementById("reading-tools-btn").classList.toggle("active-toggle");
    });
    
    // Global delegation for difficult word tooltips
    document.addEventListener("mouseover", handleGlobalTooltip);
}

function toggleMic() {
    if (!isRecording) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addChat("Connecting to Lexi...", "ai");
            initWebSocket();
            return;
        }
        isRecording = true;
        document.getElementById("mic-btn").classList.add("recording");
        startMic();
    } else {
        isRecording = false;
        document.getElementById("mic-btn").classList.remove("recording");
        stopMic();
    }
    updateSidekickUI(); // Sync Sidekick window if open
}

async function startMic() {
    try {
        if (speechRecognizer) speechRecognizer.start();
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new AudioContext({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(micStream);
        scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
        source.connect(scriptProcessor);
        scriptProcessor.connect(audioCtx.destination);
        scriptProcessor.onaudioprocess = (e) => {
            if (!isRecording) return;
            const input = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) pcm16[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
            if (ws?.readyState === WebSocket.OPEN) ws.send(pcm16.buffer);
        };
        addChat("Listening...", "user");
    } catch (err) { console.error(err); isRecording = false; }
}

function stopMic() {
    if (scriptProcessor) scriptProcessor.disconnect();
    if (audioCtx) audioCtx.close();
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (speechRecognizer) try { speechRecognizer.stop(); } catch{}
    cancelAiSpeech();
}

function cancelAiSpeech() {
    isLexiTalking = false;
    isPlaying = false;
    audioQueue = [];
    if (activeAudioSource) { try { activeAudioSource.stop(); } catch{} activeAudioSource = null; }
}

function cancelAiExplanation() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    cancelAiSpeech();
    sendMessage("stop_explanation", {});
    const btn = document.getElementById("explain-btn");
    if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    document.getElementById("stop-explain-btn").style.display = "none";
}

async function triggerExplain() {
    if (!rawText?.trim()) {
        addChat("Please upload some text first!", "ai");
        return;
    }
    if (ws?.readyState === WebSocket.OPEN) {
        document.getElementById("explain-btn").disabled = true;
        document.getElementById("explain-btn").style.opacity = "0.5";
        document.getElementById("stop-explain-btn").style.display = "flex";
        addChat("🔄 Explaining...", "ai");
        sendMessage("explain", { text: rawText });
    } else {
        addChat("Reconnecting to Lexi...", "ai");
        await initWebSocket();
    }
}

function handleUpload(files) {
    if (!files.length) return;
    const f = files[0];
    if (f.size > MAX_SIZE) { addChat("File too large!", "ai"); return; }
    
    const formData = new FormData();
    formData.append("file", f);
    fetch(`${CONFIG.API_URL}/api/upload`, { method: "POST", body: formData })
        .then(r => r.json())
        .then(d => {
            if (d.full_text) {
                renderTextWithHighlight(d.full_text, true);
                finalizeReadSource();
                addChat("File processed.", "ai");
            }
        });
}

function forceSwitchMode(mode) {
    currentMode = mode;
    document.getElementById("mode-toggle").textContent = "⚙ Mode: " + mode.charAt(0).toUpperCase() + mode.slice(1);
    document.getElementById("mode-dropdown").style.display = "none";
    
    document.getElementById("write-mode-panel").style.display = (mode === "write" ? "flex" : "none");
    document.getElementById("form-mode-panel").style.display = (mode === "form" ? "flex" : "none");
    
    const isRead = (mode === "read");
    const hasContent = isRead && isRealContentActive;
    
    document.getElementById("read-source-selector").style.display = (isRead && !isRealContentActive) ? "block" : "none";
    document.getElementById("reading-text").style.display = hasContent ? "block" : "none";
    document.getElementById("change-source-btn").style.display = hasContent ? "block" : "none";
    document.getElementById("view-toggle-container").style.display = (hasContent && rawText.length > 10) ? "flex" : "none";

    sendMessage("mode", { mode });

    // Automation: Auto-pop sidekick if in Form mode
    if (mode === "form" && !sidekickWindow) {
        setTimeout(toggleSidekick, 500); 
    }
}

function speakText(text) {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = audioPlaybackRate;
    window.speechSynthesis.speak(utt);
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function highlightWord(idx) {
    const spans = document.querySelectorAll("#reading-text .word");
    spans.forEach(s => s.classList.remove("active-word"));
    if (spans[idx]) {
        spans[idx].classList.add("active-word");
        spans[idx].scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function highlightSentence(idx) {
    document.querySelectorAll(".sentence").forEach(s => s.classList.remove("active-sentence"));
    const s = document.querySelector(`.sentence[data-sentence="${idx}"]`);
    if (s) { s.classList.add("active-sentence"); s.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

function clearSentenceHighlight() {
    document.querySelectorAll(".sentence").forEach(s => s.classList.remove("active-sentence"));
}

function finalizeReadSource() {
    isRealContentActive = true;
    document.getElementById("read-source-selector").style.display = "none";
    document.getElementById("reading-text").style.display = "block";
    document.getElementById("change-source-btn").style.display = "block";
    if (rawText.length > 10) document.getElementById("view-toggle-container").style.display = "flex";
}

let currentView = "original";
async function switchView(type) {
    if (type === currentView) return;
    const container = document.getElementById("reading-text");
    const originalBtn = document.getElementById("view-original-btn");
    const analyzedBtn = document.getElementById("view-analyzed-btn");

    if (type === "analyzed") {
        if (!analyzedHTML) {
            addChat("Wait a moment, I'm still preparing those notes for you! ✨", "ai");
            return;
        }
        container.innerHTML = analyzedHTML;
        analyzedBtn.classList.add("active-toggle");
        originalBtn.classList.remove("active-toggle");
    } else {
        container.innerHTML = originalHTML;
        originalBtn.classList.add("active-toggle");
        analyzedBtn.classList.remove("active-toggle");
    }
    currentView = type;
}

function resetReadSource() {
    rawText = "";
    isRealContentActive = false;
    document.getElementById("reading-text").innerHTML = "";
    document.getElementById("reading-text").style.display = "none";
    document.getElementById("read-source-selector").style.display = "block";
    document.getElementById("change-source-btn").style.display = "none";
    document.getElementById("view-toggle-container").style.display = "none";
    
    // Hide thumbnail
    const thumb = document.getElementById("snapshot-thumb");
    if (thumb) thumb.style.display = "none";
}

function handleGlobalTooltip(e) {
    const target = e.target.closest(".difficult-word");
    const tip = document.querySelector(".tooltip") || (function(){
        const d = document.createElement("div"); d.className = "tooltip"; document.body.appendChild(d); return d;
    })();
    
    if (!target) { tip.style.visibility = "hidden"; return; }
    const wordKey = target.getAttribute("data-word");
    if (!window.difficultDictMap?.[wordKey]) return;
    
    tip.textContent = window.difficultDictMap[wordKey];
    tip.style.visibility = "visible";
    tip.style.opacity = "1";
    const rect = target.getBoundingClientRect();
    tip.style.top = (rect.bottom + 8) + 'px';
    tip.style.left = (rect.left + rect.width / 2) + 'px';
    tip.style.transform = 'translateX(-50%)';
}

function setupDragAndDrop() {
    const zone = document.getElementById("reading-text");
    if (!zone) return;
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("dragover"); };
    zone.ondragleave = () => zone.classList.remove("dragover");
    zone.ondrop = (e) => {
        e.preventDefault(); zone.classList.remove("dragover");
        if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
    };
}

function renderMockTextForMode(mode) {
    if (mode === "write") return;
    const txt = mode === "read" ? "Welcome to LexiLens. Upload a document or take a snapshot to begin reading together!" : "Please point your camera at a form or upload an image to get help filling it out.";
    renderTextWithHighlight(txt, false);
}

function addChat(text, sender) {
    const area = document.getElementById("chat-scroll");
    if (!area) return;
    const div = document.createElement("div");
    div.className = `chat-message ${sender}`;
    div.textContent = text;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;

    // Sync to Sidekick transcript
    if (sidekickWindow) {
        const transcript = sidekickWindow.document.querySelector('.sidekick-transcript');
        if (transcript) {
            transcript.textContent = text.length > 60 ? text.substring(0, 57) + "..." : text;
        }
    }

    return div;
}

async function fetchUrl() {
    const input = document.getElementById("url-input");
    const url = input?.value;
    if (!url) return;
    addChat("Fetching URL...", "user");
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/fetch-url`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.full_text) {
            renderTextWithHighlight(data.full_text, true);
            finalizeReadSource();
            input.value = "";
        }
    } catch { addChat("Failed to fetch URL.", "ai"); }
}

function increaseFont() {
    const els = ["reading-text", "write-textarea", "write-highlight-overlay"];
    els.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) + 2) + "px";
    });
}

function decreaseFont() {
    const els = ["reading-text", "write-textarea", "write-highlight-overlay"];
    els.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size > 14) el.style.fontSize = (size - 2) + "px";
        }
    });
}

function initSelectionHandler() {
    const popup = document.getElementById("selection-popup");
    const container = document.getElementById("reading-text");
    const explainBtn = document.getElementById("explain-selection-btn");

    if (!popup || !container || !explainBtn) return;

    document.addEventListener("mouseup", (e) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0 && container.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            popup.style.display = "block";
            popup.style.left = `${rect.left + rect.width / 2}px`;
            popup.style.top = `${rect.top - 40 + window.scrollY}px`;
        } else {
            // Only hide if we didn't click inside the popup itself
            if (!popup.contains(e.target)) {
                popup.style.display = "none";
            }
        }
    });

    explainBtn.onclick = () => {
        const selection = window.getSelection().toString().trim();
        if (selection) {
            addChat(`Explain: "${selection}"`, "user");
            sendMessage("explain_selection", {
                context: rawText,
                selection: selection
            });
            popup.style.display = "none";
        }
    };
}
