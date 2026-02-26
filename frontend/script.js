const CONFIG = {
  WS_URL: "ws://localhost:8080/ws/session",
  API_URL: "http://localhost:8080"
};

let isRecording = false;
let mediaRecorder = null;
let videoStream = null;

window.addEventListener("DOMContentLoaded", () => {
  initCamera();
  setupEvents();
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
  document.getElementById("file-input").addEventListener("change", handleUpload);
  document.getElementById("mock-btn")?.addEventListener("click", playMock);
  document.getElementById("stop-btn")?.addEventListener("click", stopSpeech);
  document.getElementById("explain-btn")?.addEventListener("click", explainSimply);
  document.getElementById("font-increase")?.addEventListener("click", increaseFont);
  document.getElementById("font-decrease")?.addEventListener("click", decreaseFont);
}

async function toggleMic() {
  if (!isRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    isRecording = true;
    addChat("Listening...", "user");
  } else {
    mediaRecorder.stop();
    isRecording = false;
  }
}

function takeSnapshot() {
  const video = document.getElementById("video");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  addChat("Snapshot captured.", "ai");
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
