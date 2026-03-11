// ================= CONFIG =================
const CONFIG = {
  WS_URL: "ws://127.0.0.1:8000/ws/session",
  API_URL: "http://127.0.0.1:8000"
};

const ALLOWED_TYPES = ['application/pdf','image/png','image/jpeg','image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

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
let currentAiSpeechBubble = null;
let lastAiSpeechTime = 0; // Timestamp to track when AI last spoke to handle echo tail

let mockWords = ["This","is","a","mock","text","for","highlighting","test"];
let currentWord = 0;

// UI State
let currentMode = null;
let originalHTML = ""; // Store original layout
let analyzedHTML = ""; // Store layout with difficult words replaced
let rawText = ""; // Store the raw text for explanations
let currentSelection = ""; // Store current highlighted text
let isLexiTalking = false; // Server-side talking state
let reconnectAttempts = 0;
let reconnectTimeout = null;
let currentView = "original"; // Track which view is active: "original" or "notes"
let isRulerActive = false; // Track reading ruler state
let isBionicActive = false; // Track Bionic reading mode
let audioPlaybackRate = 1.0; // Dyslexia Audio Speed setting

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

function sendMessage(type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      session_token: SESSION_TOKEN,
      type: type,
      ...payload
    }));
  }
}

// ================= SESSION =================
async function initSession() {
  try {
    // Phase 2 requires client-side generation, removing the /api/session fetch
    SESSION_TOKEN = crypto.randomUUID();
    console.log("Session initialized with token:", SESSION_TOKEN);

    await initWebSocket();
    await initCamera();
  } catch (err) {
    console.error(err);
    updateStatus("offline", "Session Failed");
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
  
  // Initialize global state for the ruler
  window.isRulerActive = false;

  // Reading Ruler Toggle
  if (rulerToggle && ruler) {
    rulerToggle.addEventListener("click", () => {
      window.isRulerActive = !window.isRulerActive;
      ruler.classList.toggle("active", window.isRulerActive);
      rulerToggle.classList.toggle("active-toggle", window.isRulerActive);
      
      if (window.isRulerActive) {
        ruler.style.display = "block";
      } else {
        ruler.style.display = "none";
      }
    });
    
    // Ruler follows mouse Y position
    document.addEventListener("mousemove", (e) => {
      if (window.isRulerActive && ruler && textDisplay) {
        const containerRect = textDisplay.getBoundingClientRect();
        
        // Only show ruler if mouse is inside the text display area
        if (e.clientX >= containerRect.left && e.clientX <= containerRect.right &&
            e.clientY >= containerRect.top && e.clientY <= containerRect.bottom) {
          ruler.style.display = "block";
          ruler.style.top = `${e.clientY - 25}px`; // Fixed position: use viewport clientY
        } else {
          ruler.style.display = "none";
        }
      }
    });
  }

  // Background Color Switcher
  const colorDots = document.querySelectorAll(".color-dot");
  colorDots.forEach(dot => {
    dot.addEventListener("click", (e) => {
      const newColor = e.target.dataset.color;
      
      // Update CSS Variables
      document.documentElement.style.setProperty("--bg", newColor);
      
      // Update text display background as well
      if (textDisplay) {
        textDisplay.style.background = newColor === '#FFF8F0' ? '#FFFDF7' : newColor;
      }

      // Update active state
      colorDots.forEach(d => d.classList.remove("active"));
      e.target.classList.add("active");
    });
  });

  // Reading Tools Panel Toggle
  const toolsBtn = document.getElementById("reading-tools-btn");
  const toolsPanel = document.getElementById("reading-tools-panel");
  
  if (toolsBtn && toolsPanel) {
    toolsBtn.addEventListener("click", () => {
      toolsPanel.classList.toggle("hidden");
      toolsPanel.classList.toggle("active");
      toolsBtn.classList.toggle("active-toggle");
    });
  }

  // Bionic Reading Toggle
  const bionicToggle = document.getElementById("bionic-toggle");
  if (bionicToggle) {
    bionicToggle.addEventListener("click", () => {
      isBionicActive = !isBionicActive;
      bionicToggle.classList.toggle("active-toggle", isBionicActive);
      
      // Update words in-place instead of a full re-render to preserve analysis classes
      if (currentView === "original" && rawText) {
        const wordSpans = document.querySelectorAll("#reading-text .word");
        wordSpans.forEach(span => {
          // If the span contains bionic tags and we are toggling off, remove them
          if (!isBionicActive) {
             const cleanText = span.textContent;
             span.innerHTML = "";
             span.textContent = cleanText;
          } else {
             // We are toggling bionic ON
             const cleanText = span.textContent.trim();
             if (cleanText.length > 1) {
               const mid = Math.ceil(cleanText.length / 2);
               span.innerHTML = `<b>${cleanText.substring(0, mid)}</b>${cleanText.substring(mid)} `;
             }
          }
        });
        originalHTML = document.getElementById("reading-text").innerHTML;
      }
    });
  }

  // Focus Mode Toggle
  const focusModeToggle = document.getElementById("focus-mode-toggle");
  if (focusModeToggle && textDisplay) {
    focusModeToggle.addEventListener("click", () => {
      textDisplay.classList.toggle("focus-mode-active");
      focusModeToggle.classList.toggle("active-toggle");
    });
  }

  // Voice Speed Selector
  const speedSelect = document.getElementById("voice-speed-select");
  if (speedSelect) {
    speedSelect.addEventListener("change", (e) => {
      audioPlaybackRate = parseFloat(e.target.value);
    });
  }
}

// ================= CAMERA =================
async function initCamera(){
  try{
    videoStream = await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:"user",
        width:{ideal:1280},
        height:{ideal:720},
        aspectRatio:16/9
      }
    });

    const videoEl = document.getElementById("video");
    videoEl.srcObject = videoStream;
    await videoEl.play();

  }catch(err){
    console.error(err);
    showInlineError("Cannot access camera.");
  }
}

async function takeSnapshot(){
  const video = document.getElementById("video");
  if(!videoStream){ showInlineError("No video stream"); return; }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);

  const snapshotImg = document.getElementById("snapshot-img");
  const base64Frame = canvas.toDataURL("image/jpeg");
  snapshotImg.src = base64Frame;
  document.getElementById("snapshot-thumb").style.display="block";

  addChat("Scanning text from camera...","user");
  
  try {
    // Convert directly to a pure binary Blob to avoid base64 header corruption in FastAPI
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const formData = new FormData();
    formData.append("file", blob, "snapshot.jpg");

    // Send to standard image OCR endpoint
    const uploadRes = await fetch(`${CONFIG.API_URL}/api/upload-image`, {
      method: "POST",
      body: formData
    });

    if (!uploadRes.ok) {
       addChat("Failed to scan snapshot. Ensure the API is reachable.","ai");
       return;
    }

    const data = await uploadRes.json();
    if(data.full_text){
      addChat(`Extracted ${data.words.length} words from your snapshot.`,"ai");
      // This will automatically process difficult words and set AI context
      renderTextWithHighlight(data.full_text, true); 
    } else {
      addChat("No text could be found in the image.","ai");
    }
  } catch (err) {
    console.error("Snapshot scan error:", err);
    addChat("Error scanning snapshot.","ai");
  }
}

async function fetchUrl() {
  const urlInput = document.getElementById("url-input").value;
  if(!urlInput) return;
  
  addChat("Fetching URL article...","user");
  
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/fetch-url`, {
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput })
    });
    
    if (!res.ok) {
       addChat("Failed to fetch URL. Ensure it's reachable.","ai");
       return;
    }
    
    const data = await res.json();
    console.log("[URL FETCH] Response:", data);

    if(data.full_text){
      mockWords = data.full_text.split(" ");
      renderTextWithHighlight(data.full_text, true);
      addChat(`Extracted ${data.words.length} words from the URL.`,"ai");
    }
    
    // Clear input
    document.getElementById("url-input").value = "";
    
  } catch (err) {
    console.error("[URL FETCH] Error:", err);
    addChat("Error fetching URL content.","ai");
  }
}

// ================= MIC =================
async function toggleMic(){
  const btn = document.getElementById("mic-btn");

  // Ensure playback AudioContext exists and is resumed (requires user gesture)
  if (!playbackContext) {
    playbackContext = new AudioContext();
  }
  if (playbackContext.state === "suspended") {
    await playbackContext.resume();
  }

  if(!isRecording){
    btn.classList.add("recording");
    isRecording = true;
    startMic();
  } else {
    stopMic();
    btn.classList.remove("recording");
    isRecording = false;
    addChat("Mic stopped.","user");
  }
}

async function startMic(){
  if(!ws || ws.readyState !== WebSocket.OPEN){
    addChat("WebSocket not connected.","ai");
    return;
  }

  // Start local speech recognition for Chat Log
  if(speechRecognizer) {
    try {
      speechRecognizer.start();
    } catch(e) {
      console.log("Speech recognizer already started or error:", e);
    }
  }

  micStream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioCtx = new AudioContext({sampleRate:16000});

  const source = audioCtx.createMediaStreamSource(micStream);
  scriptProcessor = audioCtx.createScriptProcessor(4096,1,1);

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioCtx.destination);

  scriptProcessor.onaudioprocess = (e) => {
    if(!isRecording) return;

    const input = e.inputBuffer.getChannelData(0);

    // downsample 48000 -> 16000
    const ratio = audioCtx.sampleRate / 16000;
    const newLength = Math.round(input.length / ratio);
    const downsampled = new Float32Array(newLength);

    for(let i=0;i<newLength;i++){
      downsampled[i] = input[Math.floor(i * ratio)];
    }

    const pcm16 = new Int16Array(downsampled.length);
    for(let i=0;i<downsampled.length;i++){
      pcm16[i] = Math.max(-1,Math.min(1,downsampled[i])) * 0x7fff;
    }

    if(ws.readyState === WebSocket.OPEN){
      ws.send(pcm16.buffer);
    }
  };

  addChat("Listening...","user");
}

function stopMic(){
  if(scriptProcessor){ scriptProcessor.disconnect(); scriptProcessor = null; }
  if(audioCtx){ audioCtx.close(); audioCtx = null; }
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
  
  isLexiTalking = false;
  isPlaying = false;
  audioQueue = [];

  if(speechRecognizer){
    try {
      speechRecognizer.stop();
    } catch(e) {}
  }
}

// ================= FILE UPLOAD =================
function handleUpload(event){
  const files = event.target.files;

  for(let f of files){
    if(!validateFile(f)) return;

    addChat(`Uploaded: ${f.name}`,"user");

    const formData = new FormData();
    formData.append("file", f);

    fetch(`${CONFIG.API_URL}/api/upload`, {
      method:"POST",
      body: formData
    })
    .then(r=>r.json())
    .then(d=>{
      if(d.full_text){
        rawText = d.full_text;
        mockWords = d.full_text.split(/\s+/);
        renderTextWithHighlight(d.full_text, true);
      } else if(d.words && Array.isArray(d.words)){
        mockWords = d.words.map(w=>w.word);
        renderTextWithHighlight(mockWords.join(" "), true);
      }
      addChat("File processed.","ai");
    }).catch(e=>{
      console.error("[UPLOAD] Error:", e);
      addChat("File upload failed.","ai");
    });
  }
}  

function setupDragAndDrop() {
  const dropZone = document.getElementById("reading-text");
  if (!dropZone) return;

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload({ target: { files: e.dataTransfer.files } });
    }
  });
}

function validateFile(file){
  if(!ALLOWED_TYPES.includes(file.type)){
    showInlineError("Only PDF/PNG/JPG/WEBP allowed.");
    addChat("Invalid file type.","ai");
    return false;
  }
  if(file.size > MAX_SIZE){
    showInlineError("File too large (max 10MB).");
    return false;
  }
  return true;
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
  if (!SpeechRecognition) {
    console.warn("Web Speech API not supported in this browser.");
    return;
  }
  
  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = true;
  speechRecognizer.lang = 'en-US';
  
  speechRecognizer.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript || interimTranscript) {
      // Lexi's audio playing through speakers is picked up by the mic here.
      // We use this as a free, zero-latency "AI Subtitle" feature since TEXT modality broke the backend.
      // We extend the AI's "ownership" of the microphone for 1200ms after it stops playing
      // to absorb any physical room echo/reverb that hits the mic late.
      const now = Date.now();
      const inEchoTail = (now - lastAiSpeechTime < 1200);
      const isAiTurn = isLexiTalking || isPlaying || inEchoTail;
      
      const sender = isAiTurn ? "ai" : "user";
      
      // If we don't have a bubble, or the sender switched
      if (!currentSpeechBubble || currentSpeechBubble._sender !== sender) {
        if (currentSpeechBubble) {
           currentSpeechBubble.style.opacity = "1";
        }
        currentSpeechBubble = document.createElement("div");
        currentSpeechBubble.className = `chat-message ${sender}`;
        currentSpeechBubble._sender = sender;
        document.getElementById("chat-scroll").appendChild(currentSpeechBubble);
        currentSpeechBubble.style.opacity = "0.7";
      }
      
      currentSpeechBubble.textContent = finalTranscript || interimTranscript;
      document.getElementById("chat-scroll").scrollTop = document.getElementById("chat-scroll").scrollHeight;
      
      if (finalTranscript) {
        currentSpeechBubble.style.opacity = "1";
        currentSpeechBubble = null;
      }
    }
  };
  
  speechRecognizer.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    if(event.error === 'no-speech' && isRecording) {
      // Ignore no speech errors, we just keep listening
    }
  };
  
  speechRecognizer.onend = () => {
    // If we're still recording but the browser auto-stopped the recognizer (happens on pauses), restart it
    if (isRecording) {
      try {
        speechRecognizer.start();
      } catch(e) {}
    }
  };
}

// ================= TEXT & ANALYSIS =================
function renderTextWithHighlight(text, isRealContent = false){
  rawText = text;
  const container = document.getElementById("reading-text");
  container.innerHTML = "";
  currentView = "original";
  analyzedHTML = ""; // Clear previous notes

  // Split text into sentences (by . ! ?)
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  sentences.forEach((sentence, sIdx) => {
    const sentenceSpan = document.createElement("span");
    sentenceSpan.className = "sentence";
    sentenceSpan.dataset.sentence = sIdx;

    sentence.trim().split(/\s+/).forEach((w, wIdx) => {
      const wordSpan = document.createElement("span");
      wordSpan.textContent = w + " ";
      wordSpan.className = "word";
      wordSpan.dataset.wordIndex = wIdx;
      
      // Inject Bionic Reading spans if active
      if (isBionicActive && w.length > 1) {
        const mid = Math.ceil(w.length / 2);
        wordSpan.innerHTML = `<b>${w.substring(0, mid)}</b>${w.substring(mid)} `;
      } else {
        wordSpan.textContent = w + " ";
      }
      
      sentenceSpan.appendChild(wordSpan);
    });

    // Alternating background colors for sentences to prevent line-skipping
    if (sIdx % 2 !== 0) {
      sentenceSpan.style.backgroundColor = "rgba(0, 0, 0, 0.03)";
      sentenceSpan.style.borderRadius = "4px";
      sentenceSpan.style.padding = "2px 0";
    }

    container.appendChild(sentenceSpan);
  });

  // Save the original generated HTML (without highlights)
  originalHTML = container.innerHTML;

  // Show toggle button container (reset to original view)
  const toggleContainer = document.getElementById("view-toggle-container");
  if(toggleContainer) toggleContainer.style.display = "flex";
  
  const btnOriginal = document.getElementById("view-original-btn");
  const btnAnalyzed = document.getElementById("view-analyzed-btn");
  if(btnOriginal) {
    btnOriginal.classList.add("active-toggle");
  }
  if(btnAnalyzed) {
    btnAnalyzed.classList.remove("active-toggle");
    // Reset text inside button just in case
    btnAnalyzed.innerText = "📝 Summary Notes";
  }

  // Only trigger analysis for real uploaded content
  if(isRealContent) {
    analyzeText(text);
    generateNotes(text);
    
    // Send context to Live API session so AI knows about the text
    sendMessage("set_context", { text: text });
  }
}

async function analyzeText(text) {
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/analyze-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });
    const data = await res.json();
    
    if (data.difficult_words && data.difficult_words.length > 0) {
      // Instead of relying on fragile event listeners that get destroyed by innerHTML assignments,
      // we store the definitions globally and use Event Delegation on document.body.
      window.difficultDictMap = {};
      
      data.difficult_words.forEach(item => {
        const word = item.word;
        const explanation = item.explanation;
        window.difficultDictMap[word.trim().toLowerCase()] = explanation;
      });

      const liveContainer = document.getElementById("reading-text");
      if(!liveContainer) return;

      const liveSpans = liveContainer.querySelectorAll(".word");
      liveSpans.forEach(span => {
         const cleanSpanText = span.textContent.trim().replace(/[.,!?;:]/g, "").toLowerCase();
         if (window.difficultDictMap[cleanSpanText] && !span.classList.contains("difficult-word")) {
             span.classList.add("difficult-word");
             // The explanation is bound purely through CSS class + global dictionary lookup now
             span.setAttribute("data-word", cleanSpanText);
         }
      });
      
      // Save the LIVE innerHTML (which now includes the classes) 
      originalHTML = liveContainer.innerHTML;
      
      requestAnimationFrame(() => {
        addChat("💡 Difficult words are highlighted in the Original Text.","ai");
      });
    }
  } catch(e) {
    console.error("Analysis failed:", e);
  }
}

// Global Event Delegation for Tooltips
let globalTooltip = null;

document.addEventListener("mouseover", (e) => {
    const target = e.target.closest(".difficult-word");
    if (!target) return;
    
    const wordKey = target.getAttribute("data-word");
    if (!wordKey || !window.difficultDictMap || !window.difficultDictMap[wordKey]) return;
    
    if (!globalTooltip) {
        globalTooltip = document.createElement("div");
        globalTooltip.className = "tooltip";
        document.body.appendChild(globalTooltip);
    }
    
    globalTooltip.textContent = window.difficultDictMap[wordKey];
    globalTooltip.style.visibility = "visible";
    globalTooltip.style.opacity = "1";
    
    const rect = target.getBoundingClientRect();
    let leftPos = rect.left + (rect.width / 2);
    globalTooltip.style.top = (rect.bottom + 8) + 'px';
    globalTooltip.style.left = leftPos + 'px';
    globalTooltip.style.transform = 'translateX(-50%)';
    globalTooltip.style.setProperty('--arrow-left', '50%');
    globalTooltip.style.setProperty('--arrow-margin', '-6px');
    
    requestAnimationFrame(() => {
        const tRect = globalTooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        if (tRect.right > viewportWidth - 20) {
            globalTooltip.style.transform = 'none';
            globalTooltip.style.left = 'auto';
            globalTooltip.style.right = '20px';
            const tRectNew = globalTooltip.getBoundingClientRect();
            const arrowOffset = (rect.left + rect.width / 2) - tRectNew.left;
            globalTooltip.style.setProperty('--arrow-left', arrowOffset + 'px');
            globalTooltip.style.setProperty('--arrow-margin', '-6px'); 
        }
    });
});

document.addEventListener("mouseout", (e) => {
    const target = e.target.closest(".difficult-word");
    if (!target && globalTooltip) {
        globalTooltip.style.visibility = "hidden";
        globalTooltip.style.opacity = "0";
    }
});

const textContainerDisplay = document.querySelector('.text-display');
if (textContainerDisplay) {
    textContainerDisplay.addEventListener('scroll', () => {
        if (globalTooltip) {
            globalTooltip.style.visibility = 'hidden';
            globalTooltip.style.opacity = '0';
        }
    }, {passive: true});
}

async function generateNotes(text) {
  const btnAnalyzed = document.getElementById("view-analyzed-btn");
  if (btnAnalyzed) {
    btnAnalyzed.innerText = "⏳ Generating Notes...";
    btnAnalyzed.style.opacity = "0.7";
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}/api/analyze-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });
    const data = await res.json();
    
    if (data.notes && data.notes.length > 0) {
      let notesHtmlContent = `<div style="padding: 10px;"><h3>Summary Notes</h3><ul>`;
      data.notes.forEach(note => {
        notesHtmlContent += `<li style="margin-bottom: 8px; line-height: 1.5;">${note}</li>`;
      });
      notesHtmlContent += `</ul></div>`;
      
      
      analyzedHTML = notesHtmlContent;
      requestAnimationFrame(() => {
        if (btnAnalyzed) {
          btnAnalyzed.innerText = "📝 Summary Notes";
          btnAnalyzed.style.opacity = "1";
        }
        addChat("📝 Summary Notes ready! Click the 'Summary Notes' button.","ai");
      });
    } else {
      // Fallback if empty array returned
      if (btnAnalyzed) {
        btnAnalyzed.innerText = "⚠️ generation failed";
      }
    }
  } catch(e) {
    console.error("Notes generation failed:", e);
    if (btnAnalyzed) {
      btnAnalyzed.innerText = "⚠️ error";
    }
  }
}

function highlightWord(index){
  const spans = document.querySelectorAll("#reading-text .word");
  spans.forEach(s=>s.classList.remove("active-word"));
  if(spans[index]){
    spans[index].classList.add("active-word");
    spans[index].scrollIntoView({behavior:"smooth", block:"center"});
  }
}

function highlightSentence(index){
  // Remove previous sentence highlight
  document.querySelectorAll("#reading-text .sentence").forEach(s => {
    s.classList.remove("active-sentence");
  });
  // Highlight the current sentence
  const sentence = document.querySelector(`#reading-text .sentence[data-sentence="${index}"]`);
  if(sentence){
    sentence.classList.add("active-sentence");
    sentence.scrollIntoView({behavior:"smooth", block:"center"});
  }
}

function clearSentenceHighlight(){
  document.querySelectorAll("#reading-text .sentence").forEach(s => {
    s.classList.remove("active-sentence");
  });
}

// ================= WEBSOCKET =================
async function initWebSocket(){
  ws = new WebSocket(CONFIG.WS_URL);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("[WS] Connected");
    reconnectAttempts = 0;
    updateStatus("online", "Lexi Online");
    sendMessage("init");
  };

  ws.onmessage = async(event) => {
      if(typeof event.data === "string"){
      const msg = JSON.parse(event.data);
      if(msg.type==="ping") return; // Silent heartbeat
      if(msg.type==="ready") {
          updateStatus("online", "Lexi Ready");
          return;
      }
      if(msg.type==="highlight") highlightWord(msg.word_index);
      if(msg.type==="highlight") highlightWord(msg.word_index);
      if(msg.type==="talking") {
          if (msg.value === true) {
              isLexiTalking = true;
          } else {
              isLexiTalking = false;
              lastAiSpeechTime = Date.now();
              // When AI stops talking, finalize the AI speech bubble so the user gets a fresh one
              if (currentSpeechBubble && currentSpeechBubble._sender === "ai") {
                  currentSpeechBubble.style.opacity = "1";
                  currentSpeechBubble = null;
              }
          }
      }
      if(msg.type==="error") {
          if (msg.message === "Capacity Limit" || msg.message === "Connection Failed") {
              updateStatus("offline", msg.message);
              window.shouldReconnect = false; // Prevent infinite loop if API is exhausted
          } else {
              addChat(msg.message, "ai");
          }
      }

      // Plan C: sentence-by-sentence explanation
      if(msg.type==="highlight_sentence"){
        highlightSentence(msg.sentence_index);
        addChat(`📖 Explaining sentence ${msg.sentence_index + 1}...`,"ai");
      }
      if(msg.type==="transcript" || msg.type==="explain_transcript"){
        const txt = (msg.text || "").trim();
        if (txt.length > 0) {
          addChat(txt, "ai");
        }
      }
      if(msg.type==="explain_done"){
        clearSentenceHighlight();
        addChat("✅ Done explaining! Let me know if you need more help.","ai");
        const btn = document.getElementById("explain-btn");
        if(btn) {
          btn.disabled = false;
          btn.style.opacity = "1";
        }
      }
    }
    if(event.data instanceof ArrayBuffer){
      playAudioChunk(event.data);
    }
  };

  ws.onclose = () => {
    console.log("[WS] Closed");
    isLexiTalking = false;
    isPlaying = false;
    audioQueue = [];
    
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    
    // Stop reconnecting if it was a fatal error
    if (window.shouldReconnect === false) {
       console.log("Auto-reconnect disabled due to fatal error.");
       return;
    }
    
    const delay = Math.min(30000, Math.pow(2, reconnectAttempts) * 1000);
    reconnectAttempts++;
    
    updateStatus("reconnecting", `Reconnecting in ${delay/1000}s...`);
    reconnectTimeout = setTimeout(initSession, delay);
  };
}

// ================= AUDIO =================
async function playAudioChunk(buffer){
  // Lazily create playbackContext if not yet created
  if (!playbackContext) {
    playbackContext = new AudioContext();
  }
  if (playbackContext.state === "suspended") {
    await playbackContext.resume();
  }
  
  audioQueue.push(buffer);
  if(!isPlaying) drainQueue();
}

async function drainQueue(){
  if(audioQueue.length===0){
    isPlaying = false;
    lastAiSpeechTime = Date.now();
    return;
  }
  isPlaying=true;

  if (!playbackContext) {
    playbackContext = new AudioContext();
  }

  const buf = audioQueue.shift();
  try{
    const audioBuffer = await playbackContext.decodeAudioData(buf.slice(0));
    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = audioPlaybackRate; // Apply custom speed
    source.connect(playbackContext.destination);
    source.onended = drainQueue;
    source.start();
  }catch{
    const pcm = new Int16Array(buf);
    const float = new Float32Array(pcm.length);
    for(let i=0;i<pcm.length;i++) float[i] = pcm[i]/32768;
    const audioBuffer = playbackContext.createBuffer(1,float.length,24000);
    audioBuffer.copyToChannel(float,0);
    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = audioPlaybackRate; // Apply custom speed
    source.connect(playbackContext.destination);
    source.onended = drainQueue;
    source.start();
  }
}

// ================= MODES =================
function renderMockTextForMode(mode){
  let words=[];
  if(mode=="book") words=["This","is","book","mode","reading","example"];
  if(mode=="form") words=["Please","fill","out","this","form","carefully"];
  if(mode=="study") words=["Study","mode","helps","you","learn","faster"];
  if(mode=="write") words=["Write","mode","assists","your","creativity"];
  mockWords=words;
  renderTextWithHighlight(words.join(" "), false);
}

// ================= FONT =================
function increaseFont(){
  const el = document.getElementById("reading-text");
  let size = parseFloat(window.getComputedStyle(el).fontSize);
  el.style.fontSize = size+2+"px";
}

function decreaseFont(){
  const el = document.getElementById("reading-text");
  let size = parseFloat(window.getComputedStyle(el).fontSize);
  if(size>16) el.style.fontSize = size-2+"px";
}

// ================= UI =================
function showInlineError(msg){
  const el = document.getElementById("inline-error");
  el.textContent = msg;
  el.style.display="block";
  setTimeout(()=>{ el.style.display="none"; },3000);
}

// ================= EVENTS =================
function setupEvents(){
  document.getElementById("mic-btn").addEventListener("click",toggleMic);
  document.getElementById("snapshot-btn").addEventListener("click",takeSnapshot);
  document.getElementById("upload-btn")
    .addEventListener("click",()=>document.getElementById("file-input").click());
  document.getElementById("file-input")
    .addEventListener("change",handleUpload);

  const urlSubmitBtn = document.getElementById("url-submit-btn");
  if(urlSubmitBtn) urlSubmitBtn.addEventListener("click", fetchUrl);
  
  const urlInput = document.getElementById("url-input");
  if(urlInput) {
      urlInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") fetchUrl();
      });
  }

  document.getElementById("mode-toggle")
    .addEventListener("click",()=>{
      const menu = document.getElementById("mode-dropdown");
      menu.style.display = (menu.style.display=="flex"?"none":"flex");
    });

  document.getElementById("mode-dropdown")
    .addEventListener("click",(e)=>{
      const mode = e.target.dataset.mode;
      if(!mode) return;
      
      CONFIG.MODE = mode;
      document.getElementById("mode-toggle").textContent = "⚙ Mode: " + mode.charAt(0).toUpperCase() + mode.slice(1);
      document.getElementById("mode-dropdown").style.display="none";
      
      // Tell backend if connected
      sendMessage("mode", { mode });
      
      addChat(`Mode switched to: ${mode}`,"ai");
      renderMockTextForMode(mode);
    });

  document.getElementById("consent-btn")
    ?.addEventListener("click",()=>{
      sessionStorage.setItem("privacy_consented","true");
      document.getElementById("privacy-modal").classList.remove("show");
      initSession();
    });

  document.getElementById("font-increase")
    ?.addEventListener("click", increaseFont);
  document.getElementById("font-decrease")
    ?.addEventListener("click", decreaseFont);
  document.getElementById("explain-btn")
    ?.addEventListener("click", async (e) => {
      // Ensure playback AudioContext exists and is resumed (requires user gesture)
      if (!playbackContext) {
        playbackContext = new AudioContext();
      }
      if (playbackContext.state === "suspended") {
        await playbackContext.resume();
      }

      console.log("[UI] Explain requested. rawText length:", rawText?.length);
      if(!rawText || rawText.trim().length === 0){
        addChat("I don't have any text to explain yet. Please upload a file or take a snapshot first!", "ai");
        return;
      }
      const btn = e.target;
      if(btn.disabled) {
        // Already running, allow manual re-enable on double-click
        btn.disabled = false;
        btn.style.opacity = "1";
        addChat("Explain reset. Click again to retry.", "ai");
        return;
      }
      if(ws && ws.readyState === WebSocket.OPEN){
        btn.disabled = true;
        btn.style.opacity = "0.5";
        addChat("🔄 Explaining your text... please wait.", "ai");
        sendMessage("explain", { text: rawText });
        updateStatus("online", "Explaining...");
        // Safety timeout: re-enable button after 30s
        setTimeout(() => {
          if(btn.disabled) {
            btn.disabled = false;
            btn.style.opacity = "1";
            console.log("[UI] Explain button safety timeout - re-enabled");
          }
        }, 30000);
      } else {
        console.warn("[WS] Cannot explain: socket not open. State:", ws?.readyState);
        addChat("I'm not connected to the AI server yet. Please wait a moment!", "ai");
      }
    });
  document.getElementById("test-voice-btn")
    ?.addEventListener("click", () => {
      addChat("Testing voice output...","user");
    });
  document.getElementById("stop-btn")
    ?.addEventListener("click", () => {
      stopMic();
      isRecording = false;
      document.getElementById("mic-btn").classList.remove("recording");
      addChat("Stopped.","user");
    });

  // ================= SMART ANALYSIS (Feature A) =================
  document.getElementById("view-original-btn")?.addEventListener("click", (e) => {
    document.getElementById("reading-text").innerHTML = originalHTML;
    currentView = "original";
    e.target.classList.add("active-toggle");
    document.getElementById("view-analyzed-btn").classList.remove("active-toggle");
  });
  
  // Use Event Delegation for word highlighting because innerHTML assignments destroy direct click listeners
  document.getElementById("reading-text")?.addEventListener("click", (e) => {
    if (currentView !== "original") return;
    const wordSpan = e.target.closest(".word");
    if (wordSpan && wordSpan.dataset.wordIndex) {
      highlightWord(parseInt(wordSpan.dataset.wordIndex, 10));
    }
  });

  document.getElementById("view-analyzed-btn")?.addEventListener("click", (e) => {
    if(!analyzedHTML) {
      // The button text already says "Generating notes...", so we don't need to spam the chat log
      return; 
    }
    document.getElementById("reading-text").innerHTML = analyzedHTML;
    currentView = "notes";
    e.target.classList.add("active-toggle");
    document.getElementById("view-original-btn").classList.remove("active-toggle");
  });

  const readingText = document.getElementById("reading-text");
  const selectionPopup = document.getElementById("selection-popup");
  let currentSelection = "";

  readingText?.addEventListener("mouseup", (e) => {
    const selection = window.getSelection();
    currentSelection = selection.toString().trim();
    if (currentSelection.length > 0) {
      selectionPopup.style.display = "block";
      selectionPopup.style.left = e.clientX + "px";
      selectionPopup.style.top = (e.clientY - 40) + "px";
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (selectionPopup && !selectionPopup.contains(e.target)) {
      selectionPopup.style.display = "none";
    }
  });

  document.getElementById("explain-selection-btn")?.addEventListener("click", async () => {
    selectionPopup.style.display = "none";
    if (!currentSelection) return;
    
    // Ensure playback AudioContext exists and is resumed (requires user gesture)
    if (!playbackContext) {
      playbackContext = new AudioContext();
    }
    if (playbackContext.state === "suspended") {
      await playbackContext.resume();
    }
    
    addChat(`Explain: "${currentSelection}"`, "user");
    
    if(ws && ws.readyState === WebSocket.OPEN){
      sendMessage("explain_selection", {
        context: rawText,
        selection: currentSelection
      });
    } else {
      addChat("I'm not connected yet. Click the mic button to connect!", "ai");
    }
  });
}