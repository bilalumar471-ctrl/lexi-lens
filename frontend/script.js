const CONFIG = {
  WS_URL: "ws://localhost:8080/ws/session",
  API_URL: "http://localhost:8080"
};
const SESSION_TOKEN = crypto.randomUUID();
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
];

const MAX_SIZE = 10 * 1024 * 1024;

let isRecording = false;
let mediaRecorder = null;
let videoStream = null;
let ws = null;

window.addEventListener("DOMContentLoaded", () => {
  setupEvents();

 if (!sessionStorage.getItem("privacy_consented")) {
  document.getElementById("privacy-modal").classList.add("show");
} else {
  initSession();
}
});

function initSession() {
  initCamera();
  initWebSocket();
}

async function initCamera() {
  try {
videoStream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: "user",     // 或 "environment"
    width: { ideal: 1280 },
    height: { ideal: 720 },
    aspectRatio: 16/9
  }
});    document.getElementById("video").srcObject = videoStream;
  } catch (err) {
    console.error("Camera error:", err);
  }
}
function sendMessage(type, payload = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type,
    session_token: SESSION_TOKEN,
    ...payload
  }));
}
function setupEvents() {
  document.getElementById("mic-btn").addEventListener("click", toggleMic);
  document.getElementById("snapshot-btn").addEventListener("click", takeSnapshot);
  document.getElementById("upload-btn").addEventListener("click", () =>
    document.getElementById("file-input").click()
  );
  document.getElementById("mode-toggle").addEventListener("click", () => {
  const menu = document.getElementById("mode-dropdown");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
});
  document.getElementById("consent-btn")?.addEventListener("click", () => {
  sessionStorage.setItem("privacy_consented", "true");

  const modal = document.getElementById("privacy-modal");
  modal.classList.remove("show");   // ✅ 关键：关闭弹窗

  initSession();                    // ✅ 再启动 camera + websocket
});
  document.getElementById("test-voice-btn")?.addEventListener("click", testVoice);
  document.getElementById("file-input").addEventListener("change", handleUpload);
  document.getElementById("mock-btn")?.addEventListener("click", playMock);
  document.getElementById("stop-btn")?.addEventListener("click", stopSpeech);
  document.getElementById("explain-btn")?.addEventListener("click", explainSimply);
  document.getElementById("font-increase")?.addEventListener("click", increaseFont);
  document.getElementById("mode-dropdown").addEventListener("click", (e) => {
  const mode = e.target.dataset.mode;
  if (!mode) return;

  document.getElementById("mode-dropdown").style.display = "none";

  if (ws && ws.readyState === WebSocket.OPEN) {
    sendMessage("mode", { mode });
  }

  renderMockTextForMode(mode);
});
  document.getElementById("font-decrease")?.addEventListener("click", decreaseFont);
}
let audioContext, analyser, dataArray;
function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    showInlineError("Only PDF, PNG, JPG, WEBP allowed.");
    addChat("Invalid file type.", "ai");   // ✅ 加这一行
    return false;
  }

  if (file.size > MAX_SIZE) {
    showInlineError("File too large (max 10MB).");
    addChat("File too large.", "ai");      // ✅ 加这一行
    return false;
  }

  return true;
}


async function toggleMic() {
  let btn = document.getElementById("mic-btn");

  if (!isRecording) {
    btn.classList.add("recording");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);

    dataArray = new Uint8Array(analyser.frequencyBinCount);

    isRecording = true;

    function updateMicAnimation() {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }

      let avg = sum / dataArray.length;
      let normalized = avg / 255;

      let energy = Math.min(normalized * 1.5, 1);

// 1️⃣ 微幅整体放大
btn.style.transform = `scale(${1 + energy * 0.4})`;

// 2️⃣ 设置 CSS 变量给底部能量条
btn.style.setProperty("--energy", energy);

// 3️⃣ 控制安静状态 class
if (energy < 0.05) {
  btn.classList.add("silent");
} else {
  btn.classList.remove("silent");
}
      if (isRecording) {
        requestAnimationFrame(updateMicAnimation);
      } else {
        btn.style.transform = "scale(1)";
      }
    }

    updateMicAnimation();   // ⭐⭐⭐ 关键：启动动画循环

    mediaRecorder.start(500);
    addChat("Listening...", "user");

  } else {

  btn.classList.remove("recording");
  btn.classList.remove("silent");          // ⭐ 加这个
  btn.style.setProperty("--energy", 0);    // ⭐ 加这个

  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach(t => t.stop());
  audioContext.close();

  isRecording = false;

  btn.style.transform = "scale(1)";
}
}
function testVoice() {
  const msg = "Hello, I am Lexi.";
  speak(msg);
  addChat(msg, "ai");
}
function takeSnapshot() {
  const video = document.getElementById("video");
  const canvas = document.createElement("canvas");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas.getContext("2d").drawImage(video, 0, 0);

  // 1️⃣ 生成缩略图 URL 并显示
  const snapshotImg = document.getElementById("snapshot-img");
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    snapshotImg.src = url;
    document.getElementById("snapshot-thumb").style.display = "block";

    // 2️⃣ 发送给后端（可选，后续阶段）
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(blob);
    }
  }, "image/jpeg");

  addChat("Snapshot sent.", "user");
}

function handleUpload(event) {
  const files = event.target.files;

  for (let f of files) {

    // 🔐 先验证
    if (!validateFile(f)) return;

    addChat(`Uploaded: ${f.name}`, "user");

    // 以后这里再加 fetch 上传
  }
}

function playMock() {
  const msg = "Hello. I am Lexi. I will read this text for you.";
  speak(msg);
  addChat(msg, "ai");
}

function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

function stopSpeech() {
  speechSynthesis.cancel();
}

function explainSimply() {
  const msg = "Here is a simpler explanation of the text.";
  speak(msg);
  addChat(msg, "ai");
}

function addChat(text, sender) {
  const chatArea = document.getElementById("chat-scroll");

  const div = document.createElement("div");
  div.className = `chat-message ${sender}`;
  div.textContent = text;

  chatArea.appendChild(div);

  // 自动滚动到底部
  chatArea.scrollTop = chatArea.scrollHeight;
}

function increaseFont() {
  const el = document.getElementById("reading-text");
  let size = parseFloat(window.getComputedStyle(el).fontSize);
  el.style.fontSize = size + 2 + "px";
}

function decreaseFont() {
  const el = document.getElementById("reading-text");
  let size = parseFloat(window.getComputedStyle(el).fontSize);
  if (size > 16) el.style.fontSize = size - 2 + "px";
}

// ===== Mock Highlight =====
let mockWords = ["This","is","a","mock","text","for","highlighting","test"];
let currentWord = 0;

function renderMockText() {
  const container = document.getElementById("reading-text");
  container.innerHTML = "";

  mockWords.forEach((word, index) => {
    const span = document.createElement("span");
    span.textContent = word + " ";
    span.dataset.index = index;
    container.appendChild(span);
  });
}
function renderMockTextForMode(mode) {
  let words;

  if (mode === "book") {
    words = ["This","is","book","mode","reading","example"];
  }

  if (mode === "form") {
    words = ["Please","fill","out","this","form","carefully"];
  }

  if (mode === "study") {
    words = ["Study","mode","helps","you","learn","faster"];
  }

  if (mode === "write") {
    words = ["Write","mode","assists","your","creativity"];
  }

  mockWords = words;
  currentWord = 0;
  renderMockText();
}
function highlightLoop() {
  const spans = document.querySelectorAll("#reading-text span");

  if (spans.length === 0) return;   // ✅ 先检查

  spans.forEach(s => s.classList.remove("active-word"));

  if (spans[currentWord]) {
    spans[currentWord].classList.add("active-word");
  }

  currentWord = (currentWord + 1) % spans.length;
}
function highlightWord(index) {
  const spans = document.querySelectorAll("#reading-text span");
  spans.forEach(s => s.classList.remove("active-word"));

  if (spans[index]) {
    spans[index].classList.add("active-word");
    spans[index].scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}
function showInlineError(message) {
  const el = document.getElementById("inline-error");
  el.textContent = message;
  el.style.display = "block";

  setTimeout(() => {
    el.style.display = "none";
  }, 3000);
}
function initWebSocket() {
  ws = new WebSocket(CONFIG.WS_URL);

  ws.onopen = () => {
    console.log("WebSocket connected");
    addChat("WebSocket connected.", "ai");
  };

  ws.onmessage = (event) => {
    const data = event.data;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === "text") addChat(parsed.message, "ai");
      if (parsed.type === "highlight") highlightWord(parsed.index);
      if (parsed.type === "mode") renderMockTextForMode(parsed.mode);
    } catch {
      console.log("Non-JSON message:", data);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  ws.onclose = () => {
    console.log("WebSocket closed, retrying in 2s...");
    addChat("WebSocket disconnected. Reconnecting...", "ai");
    setTimeout(initWebSocket, 2000); // 2 秒后重连
  };
}
setInterval(highlightLoop, 800);
renderMockText();
