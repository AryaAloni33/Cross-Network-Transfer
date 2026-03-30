const socket = io({
  transports: ["websocket", "polling"], // Force strict connection fallback
});

let senderFile;
let expiryInterval = null; // Countdown timer for session expiry
let receiverFileName = "";
let receiverFileSize = 0;
let receiverFileType = "";
let receivedBuffers = [];
let receivedBytes = 0;

// URL Auto-join for QR codes
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get("join");
  if (joinCode) {
    document.getElementById("joinCode").value = joinCode;
    joinSession();

    const panel = document.querySelector(".receive-panel");
    if (panel) panel.scrollIntoView({ behavior: "smooth" });
  }
});

// Drag and Drop feature
function setFile(file) {
  if (!file) return;
  senderFile = file;

  const dropZone = document.getElementById("dropZone");
  const label = document.querySelector(".file-label");
  const display = document.getElementById("fileNameDisplay");
  const hint = document.querySelector(".drop-hint");

  label.style.display = "none";
  if (hint) hint.style.display = "none";
  display.textContent = file.name;
  display.style.display = "block";

  // Flash success green for 800 ms then reset
  dropZone.classList.remove("drag-over", "drop-rejected");
  dropZone.classList.add("drop-success");
  setTimeout(() => dropZone.classList.remove("drop-success"), 800);
}

// UI Inputs — click / browse
document.getElementById("fileInput").addEventListener("change", function (e) {
  if (e.target.files.length > 0) setFile(e.target.files[0]);
});

// ---------------------------------------------------------------- //
// DRAG & DROP — on the upload zone
// ---------------------------------------------------------------- //
(function initDragDrop() {
  const dropZone = document.getElementById("dropZone");
  let dragCounter = 0; // tracks nested enter/leave to avoid flickering

  // Prevent browser from opening the file on accidental drop elsewhere
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dropZone.classList.add("drag-over");
    }
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove("drag-over");
    }
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove("drag-over");

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setFile(files[0]); // always pick the first file
    } else {
      // Nothing usable was dropped — flash red briefly
      dropZone.classList.add("drop-rejected");
      setTimeout(() => dropZone.classList.remove("drop-rejected"), 800);
    }
  });
})();

// Clean up input fields
document.getElementById("joinCode").addEventListener("input", function (e) {
  this.value = this.value.toUpperCase().replace(/\s/g, "");
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

  const statusEl = document.getElementById("sendStatus");
  const timerEl = document.getElementById("expiryTimer");

  statusEl.innerText = "Waiting for receiver...";
  statusEl.style.color = "var(--accent)";

  // Start 5-minute countdown
  const SESSION_DURATION = 2 * 60; // seconds
  let remaining = SESSION_DURATION;

  clearInterval(expiryInterval);
  timerEl.style.display = "flex";
  timerEl.classList.remove("expiry-urgent");

  function showExpiredUI() {
    clearInterval(expiryInterval);
    expiryInterval = null;
    // Swap timer content in-place — no hiding/showing needed
    timerEl.classList.remove("expiry-urgent");
    timerEl.innerHTML =
      '<button class="refresh-code-btn" onclick="refreshCode()">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="23 4 23 10 17 10"></polyline>' +
      '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>' +
      "</svg>Refresh Code</button>";
    timerEl.style.background = "transparent";
    timerEl.style.border = "none";
    timerEl.style.padding = "12px 0 0";
    statusEl.innerText = "Code expired. Generate a new one.";
    statusEl.style.color = "#ff4d4f";
  }

  function updateTimer() {
    if (remaining <= 0) {
      showExpiredUI();
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.querySelector(".expiry-countdown").textContent =
      `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    if (remaining <= 10) {
      timerEl.classList.add("expiry-urgent");
    }
    remaining--;
  }

  updateTimer();
  expiryInterval = setInterval(updateTimer, 1000);

  const url = `${window.location.origin}/?join=${code}`;
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), {
    text: url,
    width: 150,
    height: 150,
  });
});

// Server tells us the session has expired (no one joined in time)
socket.on("session-expired", () => {
  clearInterval(expiryInterval);
  expiryInterval = null;
  // Frontend already handles UI via showExpiredUI(); this is just a safety net
});

function refreshCode() {
  if (!senderFile) return alert("Please select a file first!");

  // Restore the timer element to its original structure for the next session
  const timerEl = document.getElementById("expiryTimer");
  timerEl.style.background = "";
  timerEl.style.border = "";
  timerEl.style.padding = "";
  timerEl.style.display = "none";
  timerEl.className = "expiry-timer";
  timerEl.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<polyline points="12 6 12 12 16 14"></polyline>' +
    '</svg>Code expires in <span class="expiry-countdown">02:00</span>';

  const statusEl = document.getElementById("sendStatus");
  statusEl.innerText = "Waiting for receiver...";
  statusEl.style.color = "var(--accent)";

  // Request a fresh session code from the server
  socket.emit("create-session");
}

function joinSession() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  if (!code) return alert("Please enter the 6-character code!");

  document.getElementById("receiveBtn").innerText = "Connecting securely...";
  document.getElementById("receiveBtn").disabled = true;

  socket.emit("join-session", code);
}

socket.on("join-failed", () => {
  alert(
    "Connection error! The room code is invalid or the sender disconnected.",
  );
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
  // Receiver joined — stop the expiry countdown
  clearInterval(expiryInterval);
  expiryInterval = null;
  const timerEl = document.getElementById("expiryTimer");
  timerEl.style.display = "none";
  timerEl.classList.remove("expiry-urgent");

  document.getElementById("sendStatus").innerText =
    "Receiver linked! Sending data...";
  document.getElementById("sendStatus").style.color = "#2ea043"; // Green

  // First, pass the file structure over
  socket.emit("file-meta", {
    target: receiverSocketId,
    meta: {
      name: senderFile.name,
      size: senderFile.size,
      type: senderFile.type,
    },
  });

  const chunkSize = 256 * 1024; // Massive 256KB chunks for speed
  let offset = 0;
  const reader = new FileReader();

  // The magical loop: It waits for the server/receiver to confirm receipt
  // BEFORE sending the next chunk. This prevents 100% of crashes/disconnects.
  function sendNextChunk() {
    if (offset >= senderFile.size) {
      const statusEl = document.getElementById("sendStatus");
      statusEl.innerText = "Transfer Complete! ";

      // Keep generic send block hidden and show the specific 'Send Another' button
      const sendBtn = document.getElementById("sendBtn");
      sendBtn.style.display = "none";
      document.getElementById("sendAnotherBtn").style.display = "block";

      return;
    }

    reader.onload = (e) => {
      // Emits the slice, waits for receiver callback acknowledgment, then increments
      socket.emit(
        "file-raw",
        { target: receiverSocketId, buffer: e.target.result },
        () => {
          offset += chunkSize;
          sendNextChunk();
        },
      );
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
  receiverFileType = meta.type || "";
  receivedBuffers = [];
  receivedBytes = 0;

  // Update UI to show what's coming
  document.getElementById("incomingFileName").innerText = receiverFileName;
  document.getElementById("incomingFileSize").innerText =
    formatBytes(receiverFileSize);
  document.getElementById("incomingFileInfo").style.display = "block";
  document.getElementById("receiveBtn").innerText = "Starting Transfer...";

  // Pre-set the download link filename
  const link = document.getElementById("downloadLink");
  link.download = receiverFileName;

  // If the file is 0 bytes (often happens with newly created text files), finalize instantly
  if (receiverFileSize === 0) {
    finalizeTransfer();
  }
});

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function finalizeTransfer() {
  document.getElementById("receiveBtn").innerText = "Finalizing File...";

  setTimeout(() => {
    const blob = new Blob(receivedBuffers, { type: receiverFileType });
    const url = URL.createObjectURL(blob);
    const link = document.getElementById("downloadLink");

    link.href = url;
    link.download = receiverFileName;

    document.getElementById("receiveBtn").style.display = "none";
    document.getElementById("incomingFileInfo").style.display = "none";
    document.getElementById("downloadContainer").style.display = "block";
    document.getElementById("receiveAnotherBtn").style.display = "block";

    // Auto-trigger the download for better UX and bypassing some mobile browser quirkiness
    link.click();
  }, 500); // Tiny pause to let the visual UI breathe
}

socket.on("file-raw", (buffer, acknowledgeServerCallback) => {
  receivedBuffers.push(buffer);

  // Safely get the BYTE length of the chunk. If the environment parsed text as a String,
  // String.length gives characters (not bytes), causing transfers to hang closely to the end.
  const chunkLength = buffer.byteLength !== undefined ? buffer.byteLength : new Blob([buffer]).size;
  receivedBytes += chunkLength;

  // Update live UI percentage perfectly!
  // To avoid division by zero for 0-byte files, handle cautiously
  let percentage = receiverFileSize > 0 ? Math.round((receivedBytes / receiverFileSize) * 100) : 100;

  // Cap at 100 in case chunks overshoot slightly
  if (percentage > 100) percentage = 100;

  document.getElementById("receiveBtn").innerText =
    `Downloading... ${percentage}%`;

  const progressBar = document.getElementById("progressBarInner");
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }

  // Instantly tell the server we got the chunk so it sends the next one immediately
  if (acknowledgeServerCallback) acknowledgeServerCallback();

  // Transfer absolute completion
  if (receivedBytes >= receiverFileSize) {
    finalizeTransfer();
  }
});

function resetSender() {
  senderFile = null;
  const label = document.querySelector(".file-label");
  const display = document.getElementById("fileNameDisplay");
  const hint = document.querySelector(".drop-hint");

  // Clear file UI
  label.style.display = "block";
  if (hint) hint.style.display = ""; // Let CSS handle when it shows up
  display.textContent = "";
  display.style.display = "none";
  document.getElementById("fileInput").value = "";

  // Reset panels
  document.getElementById("codeContainer").style.display = "none";
  document.getElementById("sendAnotherBtn").style.display = "none";

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.innerText = "Generate Share Code";
  sendBtn.style.display = "block";
  sendBtn.disabled = false;

  // Inform the server just to be tidy (though not strictly required)
  socket.emit("leave-session");
}

function resetReceiver() {
  document.getElementById("joinCode").value = "";
  document.getElementById("downloadContainer").style.display = "none";
  document.getElementById("receiveAnotherBtn").style.display = "none";

  const receiveBtn = document.getElementById("receiveBtn");
  receiveBtn.innerText = "Connect & Receive";
  receiveBtn.style.display = "block";
  receiveBtn.disabled = false;

  // Clear receiver state
  receiverFileName = "";
  receiverFileSize = 0;
  receiverFileType = "";
  receivedBuffers = [];
  receivedBytes = 0;

  // Clear the search query parameter if it was a deep link
  window.history.replaceState({}, document.title, window.location.pathname);
}
