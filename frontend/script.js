// ================= CONFIG =================
const HOST = location.hostname || "localhost";
const IS_PROD = HOST.endsWith(".run.app") || HOST.endsWith(".web.app");
const CONFIG = {
  WS_URL: IS_PROD ? `wss://${HOST}/ws/session` : `ws://${HOST}:8080/ws/session`,
  API_URL: IS_PROD ? `https://${HOST}` : `http://${HOST}:8080`
};

const ALLOWED_TYPES = ['application/pdf','image/png','image/jpeg','image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB per spec

// ================= FILE VALIDATION (#5/#13) =================
function validateFile(file) {
  if (!file) return "No file selected.";
  if (!ALLOWED_TYPES.includes(file.type)) return `File type "${file.type}" is not allowed. Use PDF, PNG, JPEG, or WebP.`;
  if (file.size > MAX_SIZE) return `File is too large (${(file.size/1024/1024).toFixed(1)}MB). Max is 10MB.`;
  if (!/^[\w\-. ]+$/.test(file.name)) return "Filename contains invalid characters.";
  return null; // valid
}

// ================= STATE =================
let isRecording = false;
let videoStream = null;
let ws = null;
let SESSION_TOKEN = null;

let audioCtx = null;
let scriptProcessor = null;
let micStream = null;

let playbackContext = null;
let audioQueue = [];
let isPlaying = false;

// Feature B: Web Speech API STT
let speechRecognizer = null;
let currentSpeechBubble = null;
let currentAiTooltip = null; // Renamed to avoid confusion
let currentModelTranscriptBubble = null; // Model-side transcripts
let lastAiSpeechTime = 0; 

let mockWords = ["This","is","a","mock","text","for","highlighting","test"];

// UI State
let currentMode = null;
let originalHTML = ""; 
let pureOriginalHTML = ""; 
let analyzedHTML = ""; 
let rawText = ""; 
let isLexiTalking = false; 
let reconnectAttempts = 0;
let currentView = "original"; 
let isRulerActive = false; 
let isBionicActive = false; 
let audioPlaybackRate = 1.0; 
let screenCaptureInterval = null; 

// ================= INIT =================
window.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  initSpeechRecognition();
  initDyslexiaFeatures();

  if (!sessionStorage.getItem("privacy_consented")) {
    document.getElementById("privacy-modal").classList.add("show");
  } else {
    updateStatus("offline", "Initializing...");
    initSession();
  }

  renderTextWithHighlight(mockWords.join(" "), false);
  setupDragAndDrop();
});

async function safeAudioContext() {
  if (!playbackContext) {
    playbackContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (playbackContext.state === "suspended") {
    await playbackContext.resume();
  }
  return playbackContext;
}

function sendMessage(type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      session_token: SESSION_TOKEN,
      type: type,
      ...payload
    }));
  } else {
    console.warn("WS not ready, could not send:", type);
  }
}

// ================= SESSION =================
async function initSession() {
  try {
    // 1. Fetch official session token from backend
    const resp = await fetch(`${CONFIG.API_URL}/api/session`, { method: "POST" });
    const data = await resp.json();
    SESSION_TOKEN = data.session_token;
    
    if (!SESSION_TOKEN) throw new Error("No session token received");
    
    console.log("Session token acquired:", SESSION_TOKEN.substring(0, 8));
    
    // 2. Init components
    await initWebSocket();
    await initCamera();
  } catch (err) {
    console.error("Session init failed:", err);
    updateStatus("offline", "Connection Failed");
  }
}

function updateStatus(type, text) {
  const el = document.getElementById("status-indicator");
  if (!el) return;
  el.className = `status-${type}`;
  el.textContent = text;
}

// ================= DYSLEXIA FEATURES =================
function initDyslexiaFeatures() {
  const rulerToggle = document.getElementById("ruler-toggle");
  const ruler = document.getElementById("reading-ruler");
  const textDisplay = document.querySelector(".text-display");
  
  if (rulerToggle && ruler) {
    rulerToggle.addEventListener("click", () => {
      isRulerActive = !isRulerActive;
      ruler.classList.toggle("active", isRulerActive);
      rulerToggle.classList.toggle("active-toggle", isRulerActive);
      ruler.style.display = isRulerActive ? "block" : "none";
    });
    
    document.addEventListener("mousemove", (e) => {
      if (isRulerActive && ruler && textDisplay) {
        const containerRect = textDisplay.getBoundingClientRect();
        if (e.clientX >= containerRect.left && e.clientX <= containerRect.right &&
            e.clientY >= containerRect.top && e.clientY <= containerRect.bottom) {
          ruler.style.display = "block";
          ruler.style.top = `${e.clientY - 25}px`;
        } else {
          ruler.style.display = "none";
        }
      }
    });
  }

  const colorDots = document.querySelectorAll(".color-dot");
  colorDots.forEach(dot => {
    dot.addEventListener("click", (e) => {
      const newColor = e.target.dataset.color;
      document.documentElement.style.setProperty("--bg", newColor);
      if (textDisplay) textDisplay.style.background = newColor;
      colorDots.forEach(d => d.classList.remove("active"));
      e.target.classList.add("active");
    });
  });

  document.getElementById("reading-tools-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("reading-tools-panel");
    panel.classList.toggle("hidden"); 
    panel.classList.toggle("active");
    document.getElementById("reading-tools-btn").classList.toggle("active-toggle");
  });

  document.getElementById("bionic-toggle")?.addEventListener("click", (e) => {
    isBionicActive = !isBionicActive;
    e.target.classList.toggle("active-toggle", isBionicActive);
    if (currentView === "original" && rawText) {
      document.querySelectorAll("#reading-text .word").forEach(span => {
        const cleanText = span.textContent.trim();
        if (!isBionicActive) span.innerHTML = cleanText + " ";
        else if (cleanText.length > 1) {
          const mid = Math.ceil(cleanText.length / 2);
          span.innerHTML = `<b>${cleanText.substring(0, mid)}</b>${cleanText.substring(mid)} `;
        }
      });
    }
  });

  document.getElementById("focus-mode-toggle")?.addEventListener("click", (e) => {
    textDisplay.classList.toggle("focus-mode-active");
    e.target.classList.toggle("active-toggle");
  });

  document.getElementById("font-increase")?.addEventListener("click", increaseFont);
  document.getElementById("font-decrease")?.addEventListener("click", decreaseFont);

  const speedSelect = document.getElementById("voice-speed-select");
  if (speedSelect) {
    speedSelect.addEventListener("change", (e) => {
      audioPlaybackRate = parseFloat(e.target.value);
      updateSpeedIndicator(audioPlaybackRate);
    });
  }
}

function increaseFont(){
  const el = document.getElementById("reading-text");
  const style = window.getComputedStyle(el);
  const size = parseFloat(style.fontSize);
  el.style.fontSize = (size + 2) + "px";
}

function decreaseFont(){
  const el = document.getElementById("reading-text");
  const style = window.getComputedStyle(el);
  const size = parseFloat(style.fontSize);
  if(size > 12) el.style.fontSize = (size - 2) + "px";
}

function updateSpeedIndicator(rate) {
  const indicator = document.getElementById("speed-indicator");
  if (!indicator) return;
  if (rate < 1.0) indicator.textContent = "🐢 Slow (" + rate.toFixed(1) + "x)";
  else if (rate > 1.0) indicator.textContent = "🐇 Fast (" + rate.toFixed(1) + "x)";
  else indicator.textContent = "▶ Normal";
}

// ================= CAMERA =================
async function initCamera(){
  try{
    videoStream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:"user", width:{ideal:1280}, height:{ideal:720} }
    });
    const videoEl = document.getElementById("video");
    videoEl.srcObject = videoStream;
    await videoEl.play();
  }catch(err){
    console.error("Camera error:", err);
    showInlineError("Camera not accessible.");
  }
}

async function takeSnapshot(){
  const video = document.getElementById("video");
  if(!videoStream){ showInlineError("Camera not ready"); return; }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
  const base64 = canvas.toDataURL("image/jpeg", 0.9);
  document.getElementById("snapshot-img").src = base64;
  document.getElementById("snapshot-thumb").style.display="block";
  addChat("Scanning text from camera...","user");
  try {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    const formData = new FormData();
    formData.append("file", blob, "snapshot.jpg");
    const res = await fetch(`${CONFIG.API_URL}/api/upload-image`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("API " + res.status);
    const data = await res.json();
    if(data.full_text){
      addChat(`Snapshot scanned: ${data.words.length} words.`,"ai");
      renderTextWithHighlight(data.full_text, true); 
    } else addChat("No text found.","ai");
  } catch (err) {
    console.error("OCR error:", err);
    addChat("Error scanning snapshot. Please check connection.","ai");
  }
}

async function toggleScreenReader() {
  const btn = document.getElementById("screen-reader-btn");
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval); screenCaptureInterval = null;
    btn.classList.remove("recording"); btn.textContent = "🖥 Read Screen";
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    btn.classList.add("recording"); btn.textContent = "⏹ Stop Screen";
    const video = document.createElement("video"); video.srcObject = stream; await video.play();
    const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    screenCaptureInterval = setInterval(() => {
      ctx.drawImage(video, 0, 0, 1280, 720);
      sendMessage("screen_frame", { frame: canvas.toDataURL("image/jpeg", 0.6).split(",")[1] });
    }, 2000);
    stream.getVideoTracks()[0].onended = () => { if(screenCaptureInterval) toggleScreenReader(); };
  } catch (err) { addChat("Screen reader failed to start.","ai"); }
}

// ================= MIC =================
async function toggleMic(){
  await safeAudioContext();
  if(!isRecording){
    isRecording = true;
    document.getElementById("mic-btn")?.classList.add("recording");
    document.getElementById("voice-visualiser")?.classList.add("active");
    startMic();
  } else {
    isRecording = false;
    document.getElementById("mic-btn")?.classList.remove("recording");
    document.getElementById("voice-visualiser")?.classList.remove("active");
    stopMic();
  }
}

async function startMic(){
  if(!ws || ws.readyState !== WebSocket.OPEN){ addChat("Connecting to backend...","ai"); return; }
  try {
    if(speechRecognizer) try { speechRecognizer.start(); } catch(e){}
    micStream = await navigator.mediaDevices.getUserMedia({audio:true});
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({sampleRate:16000});
    const source = audioCtx.createMediaStreamSource(micStream);
    scriptProcessor = audioCtx.createScriptProcessor(4096,1,1);
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);
    scriptProcessor.onaudioprocess = (e) => {
      if(!isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      for(let i=0;i<input.length;i++) pcm16[i] = Math.max(-1,Math.min(1,input[i])) * 0x7fff;
      if(ws.readyState === WebSocket.OPEN) ws.send(pcm16.buffer);
    };
    addChat("Mic is on. Say something!","user");
  } catch(e) { console.error("Mic error:", e); addChat("Mic access failed.","ai"); }
}

function stopMic(){
  if(scriptProcessor) scriptProcessor.disconnect();
  if(audioCtx) audioCtx.close();
  if(micStream) micStream.getTracks().forEach(t=>t.stop());
  if(speechRecognizer) try { speechRecognizer.stop(); } catch(e){}
  isLexiTalking = false; isPlaying = false; audioQueue = [];
}

// ================= FILE UPLOAD =================
async function handleUpload(event){
  const file = event.target.files[0];
  if(!file) return;
  const err = validateFile(file);
  if (err) { showInlineError(err); return; }
  addChat(`Uploading: ${file.name}`,"user");
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if(data.full_text) {
      renderTextWithHighlight(data.full_text, true);
      addChat("File loaded successfully.","ai");
    }
  } catch(err) {
    addChat("File upload failed. Check connection.", "ai");
  } finally {
    document.getElementById("file-input").value = "";
  }
}  

function setupDragAndDrop() {
  const dropZone = document.getElementById("reading-text");
  if (!dropZone) return;
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleUpload({ target: { files: e.dataTransfer.files } });
  });
}

// ================= CHAT & STT =================
function addChat(text,sender){
  const chatArea = document.getElementById("chat-scroll");
  const div = document.createElement("div");
  div.className = `chat-message ${sender}`;
  div.textContent = text;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true; speechRecognizer.interimResults = true;
  speechRecognizer.onresult = (event) => {
    // SUPPRESS STT IF AI IS TALKING
    if (isLexiTalking || isPlaying || (Date.now() - lastAiSpeechTime < 1000)) return;

    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript) {
      if (!currentSpeechBubble) {
        currentSpeechBubble = addChat(transcript, "user");
        currentSpeechBubble.style.opacity = "0.7";
      }
      currentSpeechBubble.textContent = transcript;
      if (event.results[event.results.length - 1].isFinal) {
        currentSpeechBubble.style.opacity = "1";
        currentSpeechBubble = null;
      }
    }
  };
}

// ================= TEXT & ANALYSIS =================
function renderTextWithHighlight(text, isRealContent = false){
  rawText = text; const container = document.getElementById("reading-text");
  container.innerHTML = ""; currentView = "original";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  sentences.forEach((sentence, sIdx) => {
    const sSpan = document.createElement("span");
    sSpan.className = "sentence"; sSpan.dataset.sentence = sIdx;
    sentence.trim().split(/\s+/).forEach((w, wIdx) => {
      const wSpan = document.createElement("span");
      wSpan.className = "word"; wSpan.dataset.wordIndex = wIdx;
      wSpan.textContent = w + " ";
      sSpan.appendChild(wSpan);
    });
    container.appendChild(sSpan);
  });
  originalHTML = container.innerHTML;
  pureOriginalHTML = container.innerHTML; 
  if(isRealContent) {
    const toggle = document.getElementById("view-toggle-container");
    if(toggle) toggle.style.display = "flex";
    
    // Reset buttons
    const originalBtn = document.getElementById("view-original-btn");
    const notesBtn = document.getElementById("view-analyzed-btn");
    if(originalBtn) originalBtn.classList.add("active-toggle");
    if(notesBtn) {
        notesBtn.classList.remove("active-toggle");
        notesBtn.innerText = "⏳ Generating..."; 
    }
    
    analyzeText(text);
    generateNotes(text);
    sendMessage("set_context", { text: text });
  }
}

async function analyzeText(text) {
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/analyze-text`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.difficult_words) {
      window.difficultDictMap = {};
      data.difficult_words.forEach(i => { window.difficultDictMap[i.word.trim().toLowerCase()] = i.explanation; });
      document.querySelectorAll(".word").forEach(span => {
        const clean = span.textContent.trim().replace(/[.,!?;:]/g, "").toLowerCase();
        if (window.difficultDictMap[clean]) span.classList.add("difficult-word");
      });
      // Update originalHTML to include highlights for tooltips, but keep pureOriginalHTML clean
      originalHTML = document.getElementById("reading-text").innerHTML;
    }
  } catch(e) {}
}

document.addEventListener("mouseover", (e) => {
  const target = e.target.closest(".difficult-word");
  if (!target) return;
  const key = target.textContent.trim().replace(/[.,!?;:]/g, "").toLowerCase();
  const expl = window.difficultDictMap?.[key];
  if (!expl) return;
  if (!currentAiTooltip) {
    currentAiTooltip = document.createElement("div");
    currentAiTooltip.className = "tooltip";
    document.body.appendChild(currentAiTooltip);
  }
  currentAiTooltip.textContent = expl;
  currentAiTooltip.style.visibility = "visible"; currentAiTooltip.style.opacity = "1";
  const rect = target.getBoundingClientRect();
  currentAiTooltip.style.top = (rect.bottom + 10) + "px";
  currentAiTooltip.style.left = (rect.left) + "px";
});
document.addEventListener("mouseout", (e) => {
  if (!e.target.closest(".difficult-word") && currentAiTooltip) {
    currentAiTooltip.style.opacity = "0"; currentAiTooltip.style.visibility = "hidden";
  }
});

async function generateNotes(text) {
  const btn = document.getElementById("view-analyzed-btn");
  // The 'Generating' text is now set in renderTextWithHighlight for immediate feedback
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/analyze-notes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.notes) {
      // Check if this result is still for the current rawText
      if (text !== rawText) return; 
      analyzedHTML = `<h3>Summary</h3><ul>${data.notes.map(n=>`<li>${n}</li>`).join("")}</ul>`;
      if (btn) btn.innerText = "📝 Summary Notes";
    }
  } catch(e) { if(btn) btn.innerText = "❌ Note Error"; }
}

// ================= WEBSOCKET =================
async function initWebSocket(){
  if(ws) ws.close();
  ws = new WebSocket(CONFIG.WS_URL);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { updateStatus("online", "Lexi Connected"); sendMessage("init"); };
  ws.onmessage = async(e) => {
    if(typeof e.data === "string"){
      const m = JSON.parse(e.data);
      if(m.type === "ready") updateStatus("online", "Lexi Ready");
      if(m.type === "highlight") {
        document.querySelectorAll(".word").forEach(s=>s.classList.remove("active-word"));
        const target = document.querySelector(`.word[data-word-index="${m.word_index}"]`);
        if(target) { target.classList.add("active-word"); target.scrollIntoView({ behavior:"smooth", block:"center"}); }
      }
      if(m.type === "highlight_sentence") {
        document.querySelectorAll(".sentence").forEach(s=>s.classList.remove("active-sentence"));
        const target = document.querySelector(`.sentence[data-sentence="${m.sentence_index}"]`);
        if(target) { target.classList.add("active-sentence"); target.scrollIntoView({ behavior:"smooth", block:"center"}); }
      }
      if(m.type === "transcript" || m.type === "explain_transcript" || m.type === "screen_narration") {
        if(m.text) {
            if (!currentModelTranscriptBubble) {
              currentModelTranscriptBubble = addChat(m.text, "ai");
            } else {
              currentModelTranscriptBubble.textContent += " " + m.text;
            }
        }
      }
      if(m.type === "talking") { 
        isLexiTalking = m.value; 
        if(!m.value) { lastAiSpeechTime = Date.now(); currentModelTranscriptBubble = null; }
      }
      if(m.type === "mode_changed") updateModeBadge(m.mode);
      if(m.type === "speed_change") {
        audioPlaybackRate = m.speed;
        const sel = document.getElementById("voice-speed-select");
        if(sel) sel.value = m.speed.toFixed(1);
        updateSpeedIndicator(m.speed);
      }
      if(m.type === "dictation_result") {
        document.getElementById("dictation-area").classList.remove("hidden");
        document.getElementById("dictation-text-display").textContent = m.cleaned || m.raw;
      }
      if(m.type === "push_to_write_area") {
        const ta = document.getElementById("write-textarea");
        if(ta) {
          ta.value += (ta.value.endsWith(" ") || !ta.value ? "" : " ") + m.text;
          syncOverlay();
          saveState();
        }
      }

      // ----- Sentence pause indicator (#21/#25) -----
      if(m.type === "sentence_pause") {
        const pi = document.getElementById("pause-indicator");
        if(pi) {
          pi.classList.add("active");
          setTimeout(() => pi.classList.remove("active"), m.duration || 2000);
        }
      }

      // ----- Session recall badge (#24) -----
      if(m.type === "recall") {
        const chat = document.getElementById("chat-box");
        if(chat && m.text) {
          const bubble = addChat(m.text, "ai");
          if(bubble) {
            const badge = document.createElement("span");
            badge.className = "recall-badge";
            badge.textContent = "\u23f0 From earlier";
            bubble.appendChild(badge);
          }
        }
      }

      // ----- Progress summary card (#26) -----
      if(m.type === "session_summary") {
        const card = document.getElementById("summary-card");
        const txt = document.getElementById("summary-card-text");
        if(card && txt) {
          txt.textContent = m.message || "Great work today!";
          card.classList.add("active");
        }
      }
    } else {
      playAudioChunk(e.data);
    }
  };
  ws.onclose = () => { updateStatus("offline", "Disconnected"); setTimeout(initSession, 3000); };
}

async function safeAudioContext() {
  if (!playbackContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    playbackContext = new AudioContext({ sampleRate: 24000 });
  }
  if (playbackContext.state === 'suspended') {
    await playbackContext.resume();
  }
}

async function playAudioChunk(buf){
  await safeAudioContext();
  audioQueue.push(buf);
  if(!isPlaying) drainQueue();
}

async function drainQueue(){
  if(!audioQueue.length) { isPlaying = false; return; }
  isPlaying = true;
  try {
    const buf = audioQueue.shift();
    const int16Array = new Int16Array(buf);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }
    const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer; 
    // audioPlaybackRate is set when speed changes. Default 1.0.
    source.playbackRate.value = typeof audioPlaybackRate !== 'undefined' ? audioPlaybackRate : 1.0;
    source.connect(playbackContext.destination);
    source.onended = drainQueue;
    source.start();
  } catch(e) { 
    console.error("Audio playback error", e);
    isPlaying = false; 
    drainQueue(); 
  }
}

// ================= UI HELPERS =================
function updateModeBadge(mode) {
  const badge = document.getElementById("mode-badge"); if (!badge) return;
  const labels = { "book": "Book Mode", "form": "Form Mode", "study": "Study Mode", "write": "Write Mode" };
  badge.textContent = labels[mode] || "General Mode";
  badge.className = "mode-badge mode-" + (mode || "general");
  
  // Toggle Visibility
  const isWrite = (mode === "write");
  document.getElementById("write-mode-panel").style.display = isWrite ? "flex" : "none";
  document.getElementById("reading-text").style.display = isWrite ? "none" : "block";
  document.getElementById("view-toggle-container").style.display = isWrite ? "none" : "flex";
  
  if (isWrite) initWriteMode();
}

function showInlineError(msg){
  const el = document.getElementById("inline-error");
  if(el) { el.textContent = msg; el.style.display="block"; setTimeout(()=>el.style.display="none",4000); }
}

function setupEvents(){
  document.getElementById("mic-btn")?.addEventListener("click", toggleMic);
  document.getElementById("snapshot-btn")?.addEventListener("click", takeSnapshot);
  document.getElementById("upload-btn")?.addEventListener("click", () => document.getElementById("file-input").click());
  document.getElementById("file-input")?.addEventListener("change", handleUpload);
  document.getElementById("screen-reader-btn")?.addEventListener("click", toggleScreenReader);
  document.getElementById("url-submit-btn")?.addEventListener("click", () => {
    const val = document.getElementById("url-input").value;
    if(val) fetch(`${CONFIG.API_URL}/api/fetch-url`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url:val})
    }).then(r=>r.json()).then(d=>{ if(d.full_text) renderTextWithHighlight(d.full_text, true); });
  });

  document.getElementById("mode-toggle")?.addEventListener("click", () => {
    const overlay = document.getElementById("mode-overlay");
    if (overlay) overlay.classList.add("show");
  });

  document.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode; if (!mode) return;
      updateModeBadge(mode); sendMessage("mode", { mode });
      document.getElementById("mode-overlay")?.classList.remove("show");
    });
  });

  document.getElementById("mode-overlay-close")?.addEventListener("click", () => {
    document.getElementById("mode-overlay")?.classList.remove("show");
  });

  document.querySelector(".mode-overlay-backdrop")?.addEventListener("click", () => {
    document.getElementById("mode-overlay")?.classList.remove("show");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.getElementById("mode-overlay")?.classList.remove("show");
    }
  });

  document.getElementById("consent-btn")?.addEventListener("click", () => {
    sessionStorage.setItem("privacy_consented", "true");
    document.getElementById("privacy-modal").classList.remove("show");
    initSession();
  });

  document.getElementById("explain-btn")?.addEventListener("click", (e) => {
    if(!rawText) { showInlineError("No text to explain!"); return; }
    addChat("Explaining text naturally...", "user");
    sendMessage("explain", { text: rawText });
    e.target.disabled = true; e.target.style.opacity = "0.5";
    e.target.innerText = "⏳ Explaining...";
    setTimeout(() => { 
      e.target.disabled = false; e.target.style.opacity = "1"; 
      e.target.innerText = "Explain Simply";
    }, 15000);
  });

  document.getElementById("view-original-btn")?.addEventListener("click", (e) => {
    document.getElementById("reading-text").innerHTML = pureOriginalHTML; currentView = "original";
    document.getElementById("view-original-btn").classList.add("active-toggle");
    document.getElementById("view-analyzed-btn").classList.remove("active-toggle");
  });

  document.getElementById("view-analyzed-btn")?.addEventListener("click", (e) => {
    if(analyzedHTML) { 
      document.getElementById("reading-text").innerHTML = analyzedHTML; currentView = "notes"; 
      document.getElementById("view-analyzed-btn").classList.add("active-toggle");
      document.getElementById("view-original-btn").classList.remove("active-toggle");
    } else {
      showInlineError("Notes still generating...");
    }
  });

  document.getElementById("dictation-copy-btn")?.addEventListener("click", () => {
    const t = document.getElementById("dictation-text-display").textContent;
    if(t) { navigator.clipboard.writeText(t); sendMessage("dictation_accept", { text: t }); }
  });

  // ----- Dictation revision buttons (#18) -----
  document.getElementById("dictation-change-btn")?.addEventListener("click", () => {
    const t = document.getElementById("dictation-text-display").textContent;
    if (t) sendMessage("write_command", { command: "Change the last sentence", current_text: t });
  });
  document.getElementById("dictation-formal-btn")?.addEventListener("click", () => {
    const t = document.getElementById("dictation-text-display").textContent;
    if (t) sendMessage("write_command", { command: "Make it more formal", current_text: t });
  });

  // ----- Dark theme toggle (#27) -----
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    // Restore saved preference
    if (localStorage.getItem("lexi-dark-mode") === "true") {
      document.documentElement.classList.add("dark-mode");
      themeBtn.textContent = "☀️";
    }
    themeBtn.addEventListener("click", () => {
      const isDark = document.documentElement.classList.toggle("dark-mode");
      themeBtn.textContent = isDark ? "☀️" : "🌙";
      localStorage.setItem("lexi-dark-mode", isDark);
    });
  }

  // ----- Font toggle -----
  const fontBtn = document.getElementById("font-toggle");
  if (fontBtn) {
    if (localStorage.getItem("lexi-standard-font") === "true") {
      document.documentElement.classList.add("standard-font");
      fontBtn.textContent = "dys";
      fontBtn.title = "Switch to OpenDyslexic";
    }
    fontBtn.addEventListener("click", () => {
      const isStd = document.documentElement.classList.toggle("standard-font");
      fontBtn.textContent = isStd ? "dys" : "A";
      fontBtn.title = isStd ? "Switch to OpenDyslexic" : "Switch to Arial";
      localStorage.setItem("lexi-standard-font", isStd);
    });
  }

  // ----- Summary card close (#26) -----
  document.getElementById("summary-card-close")?.addEventListener("click", () => {
    document.getElementById("summary-card")?.classList.remove("active");
  });
}

// ================= WRITE MODE LOGIC =================
let writeHistory = [];
let writeRedoStack = [];
let suggestionTooltip = null;
let isWriteMicOn = false;
let writeSpeechRecognizer = null;

function initWriteMode() {
    const textarea = document.getElementById("write-textarea");
    if (!textarea || textarea._initialized) return;
    textarea._initialized = true;

    textarea.addEventListener("input", () => {
        syncOverlay();
        saveState();
        debouncedSuggest();
    });
    textarea.addEventListener("scroll", syncOverlay);

    document.getElementById("write-undo-btn")?.addEventListener("click", undoWrite);
    document.getElementById("write-redo-btn")?.addEventListener("click", redoWrite);
    document.getElementById("write-readback-btn")?.addEventListener("click", () => speakText(textarea.value));
    
    // Voice buttons
    document.getElementById("write-stt-btn")?.addEventListener("click", () => startWriteMic(true));
    document.getElementById("write-ai-btn")?.addEventListener("click", () => startWriteMic(false));

    // Suggestion interactions
    const overlay = document.getElementById("write-highlight-overlay");
    if (overlay) {
        overlay.onmouseenter = () => {
            if (overlay.querySelectorAll(".error-hint").length > 0) {
                initHoverSuggestions();
            }
        };
    }
}

const debouncedSuggest = debounce(() => {
    const text = document.getElementById("write-textarea").value;
    if (text.length > 5) fetchSuggestions(text);
}, 2000);

async function fetchSuggestions(text) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/write-suggest`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.suggestions) {
            highlightErrors(data.suggestions);
        }
    } catch(e) { console.error("Suggestion fetch failed:", e); }
}

function highlightErrors(suggestions) {
    let html = document.getElementById("write-textarea").value;
    suggestions.forEach(s => {
        // Expected format: "Change 'word' to 'fix'"
        const match = s.match(/Change '(.*?)' to '(.*?)'/i);
        if (match) {
            const original = match[1];
            const fix = match[2];
            const regex = new RegExp(`\\b${original}\\b`, 'gi');
            html = html.replace(regex, `<span class="error-hint" data-correction="${fix}">${original}</span>`);
        }
    });
    const overlay = document.getElementById("write-highlight-overlay");
    if (overlay) {
        overlay.innerHTML = html + "\u200b";
        initHoverSuggestions();
    }
}

function syncOverlay() {
    const textarea = document.getElementById("write-textarea");
    const overlay = document.getElementById("write-highlight-overlay");
    if (textarea && overlay) {
        overlay.textContent = textarea.value + "\u200b";
        overlay.scrollTop = textarea.scrollTop;
    }
}

function saveState() {
    const val = document.getElementById("write-textarea").value;
    if (!writeHistory.length || writeHistory[writeHistory.length-1] !== val) {
        writeHistory.push(val);
        if (writeHistory.length > 50) writeHistory.shift();
        writeRedoStack = [];
    }
}

function undoWrite() {
    if (writeHistory.length > 1) {
        writeRedoStack.push(writeHistory.pop());
        const ta = document.getElementById("write-textarea");
        ta.value = writeHistory[writeHistory.length-1];
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
            const corr = hint.getAttribute("data-correction") || "Correction Suggestion";
            const original = hint.textContent;
            
            suggestionTooltip.innerHTML = `
                <span class="label">Lexi Suggests:</span>
                <span class="value" onclick="applyCorrection('${original.replace(/'/g, "\\'")}', '${corr.replace(/'/g, "\\")}')">${corr}</span>
                <div style="font-size:10px; color:#999; margin-top:8px;">Click to apply</div>
            `;
            
            suggestionTooltip.style.display = "block";
            const rect = hint.getBoundingClientRect();
            suggestionTooltip.style.left = Math.max(10, rect.left) + "px";
            suggestionTooltip.style.top = (rect.top - 80) + "px";
        };
        
        hint.onmouseout = () => {
            suggestionTooltip._hideTimeout = setTimeout(() => {
                suggestionTooltip.style.display = "none";
            }, 200);
        };
    });
}

window.applyCorrection = function(original, replacement) {
    const textarea = document.getElementById("write-textarea");
    if (!textarea) return;
    const oldText = textarea.value;
    const regex = new RegExp(`\\b${original}\\b`, 'i');
    textarea.value = oldText.replace(regex, replacement);
    if (suggestionTooltip) suggestionTooltip.style.display = "none";
    syncOverlay();
    saveState();
    addChat(`✅ Fixed "${original}" to "${replacement}"`, "ai");
};

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
                sendMessage("write_command", { command: final, current_text: document.getElementById("write-textarea").value });
                stopWriteMic();
            }
        }
    };
    writeSpeechRecognizer.onerror = () => stopWriteMic();
    writeSpeechRecognizer.onend = () => { if (isWriteMicOn) writeSpeechRecognizer.start(); };
    writeSpeechRecognizer.start();
    addChat(isSTT ? "Dictating..." : "Say 'Lexi, help me write...'", "user");
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

// Utility: debounce
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Dummy for speakText if not defined
function speakText(text) {
  if (window.speechSynthesis) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = audioPlaybackRate || 1.0;
    speechSynthesis.speak(utter);
  }
}

function addChat(text, sender) {
  const scroll = document.getElementById("chat-scroll");
  const msg = document.createElement("div");
  msg.className = `chat-message ${sender}`;
  msg.textContent = text;
  scroll.appendChild(msg);
  scroll.scrollTop = scroll.scrollHeight;
  return msg;
}