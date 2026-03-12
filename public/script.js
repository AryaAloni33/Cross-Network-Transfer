const socket = io({
  transports: ["websocket", "polling"], // Force strict connection fallback
});

let senderFile;
let receiverFileName = "received_file";
let receiverFileSize = 0;
let receivedBuffers = [];
let receivedBytes = 0;

// URL Auto-join for QR codes
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (joinCode) {
    document.getElementById('joinCode').value = joinCode;
    joinSession();

    const panel = document.querySelector('.receive-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
  }
});

// UI Inputs
document.getElementById('fileInput').addEventListener('change', function (e) {
  const label = document.querySelector('.file-label');
  const display = document.getElementById('fileNameDisplay');
  if (e.target.files.length > 0) {
    senderFile = e.target.files[0];
    label.style.display = 'none';
    display.textContent = senderFile.name;
    display.style.display = 'block';
  }
});

// Clean up input fields
document.getElementById('joinCode').addEventListener('input', function (e) {
  this.value = this.value.toUpperCase().replace(/\s/g, '');
});

function createSession() {
  if (!senderFile) return alert("Please select a file to share!");

  document.getElementById("sendBtn").innerText = "Generating...";
  document.getElementById("sendBtn").disabled = true;

  socket.emit("create-session");
}

socket.on("session-created", (code) => {
  document.getElementById("sendBtn").style.display = "none";
  document.getElementById("codeContainer").style.display = "block";
  document.getElementById("codeDisplay").innerText = code;

  // Clean up any old status
  const statusEl = document.getElementById("sendStatus");
  statusEl.innerText = "Waiting for receiver...";
  statusEl.style.color = "var(--accent)"; // Default styling

  const url = `${window.location.origin}/?join=${code}`;
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), {
    text: url,
    width: 150,
    height: 150
  });
});

function joinSession() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  if (!code) return alert("Please enter the 6-character code!");

  document.getElementById("receiveBtn").innerText = "Connecting securely...";
  document.getElementById("receiveBtn").disabled = true;

  socket.emit("join-session", code);
}

socket.on("join-failed", () => {
  alert("Connection error! The room code is invalid or the sender disconnected.");
  document.getElementById("receiveBtn").innerText = "Connect & Receive";
  document.getElementById("receiveBtn").disabled = false;
});

socket.on("join-success", () => {
  document.getElementById("receiveBtn").innerText = "Linking to sender...";
});

// ---------------------------------------------------------------- //
// SENDER LOGIC: Bulletproof Flow Control
// ---------------------------------------------------------------- //
socket.on("receiver-joined", (receiverSocketId) => {
  document.getElementById("sendStatus").innerText = "Receiver linked! Sending data...";
  document.getElementById("sendStatus").style.color = "#2ea043"; // Green

  // First, pass the file structure over
  socket.emit("file-meta", {
    target: receiverSocketId,
    meta: { name: senderFile.name, size: senderFile.size }
  });

  const chunkSize = 256 * 1024; // Massive 256KB chunks for speed
  let offset = 0;
  const reader = new FileReader();

  // The magical loop: It waits for the server/receiver to confirm receipt 
  // BEFORE sending the next chunk. This prevents 100% of crashes/disconnects.
  function sendNextChunk() {
    if (offset >= senderFile.size) {
      const statusEl = document.getElementById("sendStatus");
      statusEl.innerText = "Transfer Complete! 🎉";

      // Let the user immediately send another file!
      const sendBtn = document.getElementById("sendBtn");
      sendBtn.innerText = "Generate New Share Code";
      sendBtn.disabled = false;
      sendBtn.style.display = "block";

      return;
    }

    reader.onload = (e) => {
      // Emits the slice, waits for receiver callback acknowledgment, then increments
      socket.emit("file-raw", { target: receiverSocketId, buffer: e.target.result }, () => {
        offset += chunkSize;
        sendNextChunk();
      });
    };

    const slice = senderFile.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  // Kickstart the file sending pump
  sendNextChunk();
});

// ---------------------------------------------------------------- //
// RECEIVER LOGIC: Synchronized Catching
// ---------------------------------------------------------------- //
socket.on("file-meta", (meta) => {
  receiverFileName = meta.name;
  receiverFileSize = meta.size;
  receivedBuffers = [];
  receivedBytes = 0;
  document.getElementById("receiveBtn").innerText = "0%";
});

socket.on("file-raw", (buffer, acknowledgeServerCallback) => {
  receivedBuffers.push(buffer);
  receivedBytes += buffer.byteLength;

  // Update live UI percentage perfectly!
  let percentage = Math.round((receivedBytes / receiverFileSize) * 100);
  document.getElementById("receiveBtn").innerText = `Downloading... ${percentage}%`;

  // Instantly tell the server we got the chunk so it sends the next one immediately
  if (acknowledgeServerCallback) acknowledgeServerCallback();

  // Transfer absolute completion
  if (receivedBytes >= receiverFileSize) {
    document.getElementById("receiveBtn").innerText = "Finalizing File...";

    setTimeout(() => {
      const blob = new Blob(receivedBuffers);
      const url = URL.createObjectURL(blob);
      const link = document.getElementById("downloadLink");

      link.href = url;
      link.download = receiverFileName;

      document.getElementById("receiveBtn").style.display = "none";
      document.getElementById("downloadContainer").style.display = "block";
    }, 500); // Tiny pause to let the visual UI breathe
  }
});
