const CONFIG = {
  WS_URL: "ws://localhost:8080/ws/session",
  API_URL: "http://localhost:8080"
};

let isRecording = false;
let mediaRecorder = null;
let videoStream = null;
let ws = null;

window.addEventListener("DOMContentLoaded", () => {
  initCamera();
  setupEvents();
  initWebSocket();
});

async function initCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    document.getElementById("video").srcObject = videoStream;
  } catch (err) {
    console.error("Camera error:", err);
  }
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
    ws.send(JSON.stringify({
      type: "mode",
      mode: mode
    }));
  }

  renderMockTextForMode(mode);
});
  document.getElementById("font-decrease")?.addEventListener("click", decreaseFont);
}
let audioContext, analyser, dataArray;

async function toggleMic() {
  if (!isRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    // 新增：音量分析
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateMicAnimation() {
      analyser.getByteTimeDomainData(dataArray);
     let sum = 0;
for (let i = 0; i < dataArray.length; i++) sum += (dataArray[i]-128)**2;
let rms = Math.sqrt(sum / dataArray.length) / 128;
btn.style.transform = `scale(${1 + rms * 0.6})`;
      if (isRecording) requestAnimationFrame(updateMicAnimation);
      else btn.style.transform = "scale(1)";
    }
    updateMicAnimation();

    mediaRecorder.ondataavailable = (event) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(event.data);
    };

    mediaRecorder.start(500);
    isRecording = true;
    addChat("Listening...", "user");

  } else {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    isRecording = false;
    document.getElementById("mic-btn").style.transform = "scale(1)";
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

  canvas.toBlob((blob) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(blob);
    }
  }, "image/jpeg");

  addChat("Snapshot sent.", "user");
}

function handleUpload(event) {
  const files = event.target.files;
  for (let f of files) {
    addChat(`Uploaded: ${f.name}`, "user");
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
  const chatArea = document.getElementById("chat-history");

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
  }
}
function initWebSocket() {
  ws = new WebSocket(CONFIG.WS_URL);

  ws.onopen = () => {
    console.log("WebSocket connected");
  };

  ws.onmessage = (event) => {
    const data = event.data;

    try {
      const parsed = JSON.parse(data);

      if (parsed.type === "text") {
        addChat(parsed.message, "ai");
      }

      if (parsed.type === "highlight") {
        highlightWord(parsed.index);
      }
      if (parsed.type === "mode") {
  renderMockTextForMode(parsed.mode);
}

    } catch {
      console.log("Non-JSON message:", data);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
  };
}

setInterval(highlightLoop, 800);
renderMockText();
