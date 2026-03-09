// ================= CONFIG =================
const CONFIG = {
  WS_URL: "ws://127.0.0.1:5000/ws/session",
  API_URL: "http://127.0.0.1:5000"
};

const ALLOWED_TYPES = ['application/pdf','image/png','image/jpeg','image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

// ================= STATE =================
let isRecording = false;
let videoStream = null;
let ws = null;
let SESSION_TOKEN = null;

let audioContext = null;
let processor = null;
let micStream = null;

let playbackContext = new AudioContext();
let audioQueue = [];
let isPlaying = false;

let mockWords = ["This","is","a","mock","text","for","highlighting","test"];
let currentWord = 0;

// ================= INIT =================
window.addEventListener("DOMContentLoaded", () => {
  setupEvents();

  if (!sessionStorage.getItem("privacy_consented")) {
    document.getElementById("privacy-modal").classList.add("show");
  } else {
    initSession();
  }

  renderTextWithHighlight(mockWords.join(" "));
});

// ================= SESSION =================
async function initSession() {
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/session`, { method:"POST" });
    const data = await res.json();
    SESSION_TOKEN = data.session_token;

    await initWebSocket();
    await initCamera();
  } catch (err) {
    console.error(err);
    addChat("Failed to initialize session.","ai");
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

function takeSnapshot(){
  const video = document.getElementById("video");
  if(!videoStream){ showInlineError("No video stream"); return; }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);

  const snapshotImg = document.getElementById("snapshot-img");

  canvas.toBlob(async (blob) => {
    snapshotImg.src = URL.createObjectURL(blob);
    document.getElementById("snapshot-thumb").style.display="block";

    const formData = new FormData();
    formData.append("file", blob, "snapshot.jpg");

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/upload-image`, {
        method:"POST",
        body: formData
      });
      const data = await res.json();
      console.log("[UPLOAD] Response:", data);

      if(data.full_text){
        mockWords = data.full_text.split(" ");
        renderTextWithHighlight(data.full_text);
      }

      addChat("Snapshot processed.","ai");

    } catch(e){
      console.error("[UPLOAD] Error:", e);
      addChat("Snapshot upload failed.","ai");
    }
  }, "image/jpeg");

  addChat("Snapshot taken.","user");
}

// ================= MIC =================
async function toggleMic(){
  const btn = document.getElementById("mic-btn");
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

  micStream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioContext = new AudioContext({sampleRate:16000});

  const source = audioContext.createMediaStreamSource(micStream);
  processor = audioContext.createScriptProcessor(4096,1,1);

  source.connect(processor);
  processor.connect(audioContext.destination);

  processor.onaudioprocess = (e) => {
    if(!isRecording) return;

    const input = e.inputBuffer.getChannelData(0);

    // downsample 48000 -> 16000
    const ratio = audioContext.sampleRate / 16000;
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
  if(processor){ processor.disconnect(); processor = null; }
  if(audioContext){ audioContext.close(); audioContext = null; }
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
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
      addChat("File processed.","ai");
      if(d.words && Array.isArray(d.words)){
        mockWords = d.words.map(w=>w.word);
        renderTextWithHighlight(mockWords.join(" "));
      }
    }).catch(e=>{
      console.error("[UPLOAD] Error:", e);
      addChat("File upload failed.","ai");
    });
  }
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

// ================= CHAT =================
function addChat(text,sender){
  const chatArea = document.getElementById("chat-scroll");
  const div = document.createElement("div");
  div.className = `chat-message ${sender}`;
  div.textContent = text;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ================= TEXT =================
function renderTextWithHighlight(text){
  const container = document.getElementById("reading-text");
  container.innerHTML="";
  text.split(" ").forEach((w,i)=>{
    const span = document.createElement("span");
    span.textContent = w+" ";
    span.dataset.index=i;
    span.onclick=()=>highlightWord(i);
    container.appendChild(span);
  });
}

function highlightWord(index){
  const spans = document.querySelectorAll("#reading-text span");
  spans.forEach(s=>s.classList.remove("active-word"));
  if(spans[index]){
    spans[index].classList.add("active-word");
    spans[index].scrollIntoView({behavior:"smooth", block:"center"});
  }
}

// ================= WEBSOCKET =================
async function initWebSocket(){
  ws = new WebSocket(CONFIG.WS_URL);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("[WS] Connected");
    addChat("WebSocket connected.","ai");
    if(SESSION_TOKEN) ws.send(JSON.stringify({session_token:SESSION_TOKEN}));
  };

  ws.onmessage = async(event) => {
    if(typeof event.data === "string"){
      const msg = JSON.parse(event.data);
      if(msg.type==="ready") addChat("Lexi ready. You can speak now.","ai");
      if(msg.type==="transcript") addChat(msg.text,"ai");
      if(msg.type==="highlight") highlightWord(msg.word_index);
    }
    if(event.data instanceof ArrayBuffer){
      playAudioChunk(event.data);
    }
  };

  ws.onclose = () => {
    console.log("[WS] Closed");
    addChat("Connection lost. Reconnecting...","ai");
    setTimeout(initWebSocket,2000);
  };
}

// ================= AUDIO =================
async function playAudioChunk(buffer){
  audioQueue.push(buffer);
  if(!isPlaying) drainQueue();
}

async function drainQueue(){
  if(audioQueue.length===0){ isPlaying=false; return; }
  isPlaying=true;

  const buf = audioQueue.shift();
  try{
    const audioBuffer = await playbackContext.decodeAudioData(buf.slice(0));
    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
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
  renderTextWithHighlight(words.join(" "));
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

  document.getElementById("mode-toggle")
    .addEventListener("click",()=>{
      const menu = document.getElementById("mode-dropdown");
      menu.style.display = (menu.style.display=="flex"?"none":"flex");
    });

  document.getElementById("mode-dropdown")
    .addEventListener("click",(e)=>{
      const mode = e.target.dataset.mode;
      if(!mode) return;
      renderMockTextForMode(mode);
      if(ws && ws.readyState===WebSocket.OPEN){
        ws.send(JSON.stringify({type:"mode",mode}));
      }
    });

  document.getElementById("consent-btn")
    ?.addEventListener("click",()=>{
      sessionStorage.setItem("privacy_consented","true");
      document.getElementById("privacy-modal").classList.remove("show");
      initSession();
    });
}