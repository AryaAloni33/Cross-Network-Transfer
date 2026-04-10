const socket = io({
  transports: ["websocket", "polling"],
});

// ── State ────────────────────────────────────────────────────────────────────
let selectedFiles = []; // File[]
let senderFile; // The actual file/blob being sent
let expiryInterval = null;
let receiverFileName = "";
let receiverFileSize = 0;
let receiverFileType = "";
let receivedBuffers = [];
let receivedBytes = 0;
let sessionCode = "";
let sendLoopActive = false;
let currentMode = "direct"; // "direct" | "broadcast"

// ── URL auto-join (QR code deep link) ────────────────────────────────────────
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get("join");
  if (joinCode) {
    document.getElementById("joinCode").value = joinCode.toUpperCase();

    // Show name input so they can optionally enter a name before joining
    document.getElementById("nameWrapper").style.display = "block";

    // Scroll to the receive panel for better mobile UX
    const panel = document.querySelector(".receive-panel");
    if (panel) panel.scrollIntoView({ behavior: "smooth" });
  }
});

/* Leaving room for manual joins below */

// ── Mode Toggle ──────────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  document.getElementById("modeDirect").classList.toggle("active", mode === "direct");
  document.getElementById("modeMessage").classList.toggle("active", mode === "message");
  document.getElementById("modeBroadcast").classList.toggle("active", mode === "broadcast");

  const hint = document.getElementById("modeHint");
  const dropZone = document.getElementById("dropZone");
  const messageArea = document.getElementById("messageWrapper");

  if (mode === "message") {
    hint.textContent = "Type or paste a message to share instantly.";
    hint.style.color = "var(--accent)";
    dropZone.style.display = "none";
    messageArea.style.display = "block";
    senderFile = null; // Clear file if switched to message
  } else if (mode === "broadcast") {
    hint.textContent = "Multiple receivers join with the same code. You control when to start.";
    hint.style.color = "#a78bfa";
    dropZone.style.display = "flex";
    messageArea.style.display = "none";
  } else {
    hint.textContent = "Send to one receiver at a time.";
    hint.style.color = "";
    dropZone.style.display = "flex";
    messageArea.style.display = "none";
  }
}

// ── File input / drag-drop ───────────────────────────────────────────────────
function handleFiles(files) {
  if (!files || files.length === 0) return;
  selectedFiles = Array.from(files);

  const dropZone = document.getElementById("dropZone");
  const label = document.querySelector(".file-label");
  const display = document.getElementById("fileNameDisplay");
  const hint = document.querySelector(".drop-hint");

  label.style.display = "none";
  if (hint) hint.style.display = "none";

  if (selectedFiles.length === 1) {
    display.textContent = selectedFiles[0].name;
  } else {
    const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    display.textContent = `${selectedFiles.length} files selected (${formatBytes(totalSize)})`;
  }
  display.style.display = "block";

  dropZone.classList.remove("drag-over", "drop-rejected");
  dropZone.classList.add("drop-success");
  setTimeout(() => dropZone.classList.remove("drop-success"), 800);
}

document.getElementById("fileInput").addEventListener("change", function (e) {
  if (e.target.files.length > 0) handleFiles(e.target.files);
});

(function initDragDrop() {
  const dropZone = document.getElementById("dropZone");
  let dragCounter = 0;

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove("drag-over");

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const allFiles = [];
      const promises = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            promises.push(traverseFileTree(entry, '', allFiles));
          } else {
            const file = item.getAsFile();
            if (file) allFiles.push(file);
          }
        }
      }
      try {
        await Promise.all(promises);
        if (allFiles.length > 0) {
          handleFiles(allFiles);
        } else {
          dropRejected();
        }
      } catch (err) {
        console.error("Folder reading error:", err);
        dropRejected();
      }
    } else {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFiles(files);
      } else {
        dropRejected();
      }
    }
  });

  function dropRejected() {
    dropZone.classList.add("drop-rejected");
    setTimeout(() => dropZone.classList.remove("drop-rejected"), 800);
  }
})();

function traverseFileTree(item, path, filesArray) {
  return new Promise((resolve, reject) => {
    if (item.isFile) {
      item.file(file => {
        file.customPath = path + file.name;
        filesArray.push(file);
        resolve();
      }, reject);
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const entries = [];
      const readEntries = () => {
        dirReader.readEntries(async (results) => {
          if (!results.length) {
            const promises = [];
            for (let i = 0; i < entries.length; i++) {
              promises.push(traverseFileTree(entries[i], path + item.name + "/", filesArray));
            }
            try {
              await Promise.all(promises);
              resolve();
            } catch (err) {
              reject(err);
            }
          } else {
            entries.push(...results);
            readEntries();
          }
        }, reject);
      };
      readEntries();
    } else {
      resolve();
    }
  });
}

// Uppercase + no-space enforcer on code input
document.getElementById("joinCode").addEventListener("input", function () {
  this.value = this.value.toUpperCase().replace(/\s/g, "");
  // Show name field hint while typing (optional UX touch)
  const len = this.value.length;
  document.getElementById("nameWrapper").style.display = len > 0 ? "block" : "none";
});

// ── CREATE SESSION ─
async function createSession() {
  if (currentMode === "message") {
    const text = document.getElementById("messageInput").value.trim();
    if (!text) return alert("Please type a message first!");
    // Convert text to a virtual file
    const blob = new Blob([text], { type: "text/plain" });
    senderFile = new File([blob], "message.txt", { type: "text/plain" });
  } else {
    if (!selectedFiles || selectedFiles.length === 0) return alert("Please select a file to share!");

    const hasStructure = selectedFiles.some(f => f.customPath && f.customPath.includes('/'));
    if (selectedFiles.length === 1 && !hasStructure) {
      senderFile = selectedFiles[0];
    } else {
      // Zip multiple files or folder structure
      document.getElementById("sendBtn").innerText = "Compacting files...";
      document.getElementById("sendBtn").disabled = true;
      try {
        const zip = new JSZip();
        selectedFiles.forEach(f => {
          const filePath = f.customPath || f.name;
          zip.file(filePath, f);
        });
        const content = await zip.generateAsync({ type: "blob" });
        senderFile = new File([content], "SharedBundle.zip", { type: "application/zip" });
      } catch (err) {
        console.error("Zipping failed:", err);
        alert("Failed to package multiple files. Please try again or send a single file.");
        document.getElementById("sendBtn").innerText = "Generate Share Code";
        document.getElementById("sendBtn").disabled = false;
        return;
      }
    }
  }

  document.getElementById("sendBtn").innerText = "Generating Code...";
  document.getElementById("sendBtn").disabled = true;
  // Hide toggle so mode can't be switched mid-session
  document.getElementById("modeToggle").style.opacity = "0.4";
  document.getElementById("modeToggle").style.pointerEvents = "none";
  document.getElementById("modeHint").style.display = "none";

  socket.emit("create-session", { mode: currentMode });
}

socket.on("session-created", ({ code, isBroadcast }) => {
  sessionCode = code;
  document.getElementById("sendBtn").style.display = "none";
  document.getElementById("codeContainer").style.display = "block";
  document.getElementById("codeDisplay").innerText = code;

  const statusEl = document.getElementById("sendStatus");
  const timerEl = document.getElementById("expiryTimer");

  const SESSION_DURATION = isBroadcast ? 1 * 60 : 2 * 60; // 1 min broadcast, 5 min direct
  let remaining = SESSION_DURATION;

  clearInterval(expiryInterval);
  timerEl.style.display = "flex";
  timerEl.classList.remove("expiry-urgent");

  if (isBroadcast) {
    document.getElementById("codeModeLabel").innerHTML =
      `<span class="badge-broadcast">📡 Broadcast Room</span> Share this code:`;
    statusEl.innerText = "Waiting for members to join…";
    statusEl.style.color = "#a78bfa";
    // Show roster
    document.getElementById("rosterBox").style.display = "block";
  } else {
    // 1-to-1 mode
    document.getElementById("codeModeLabel").innerText = "Your Share Code:";
    statusEl.innerText = "Waiting for receiver…";
    statusEl.style.color = "var(--accent)";
  }

  function showExpiredUI() {
    clearInterval(expiryInterval);
    expiryInterval = null;
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
    if (remaining <= 0) { showExpiredUI(); return; }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.querySelector(".expiry-countdown").textContent =
      `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    if (remaining <= 10) timerEl.classList.add("expiry-urgent");
    remaining--;
  }

  updateTimer();
  expiryInterval = setInterval(updateTimer, 1000);

  const url = `${window.location.origin}/?join=${code}`;
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), { text: url, width: 150, height: 150 });
});

socket.on("session-expired", () => {
  clearInterval(expiryInterval);
  expiryInterval = null;
});

function refreshCode() {
  if (!senderFile) return alert("Please select a file first!");
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
  statusEl.innerText = "Waiting for receiver…";
  statusEl.style.color = "var(--accent)";

  socket.emit("create-session", { mode: currentMode });
}

// ── SENDER: receiver joined ──────────────────────────────────────────────────
socket.on("receiver-joined", ({ count, roster, isBroadcast }) => {
  // Stop 1-to-1 expiry countdown when first receiver connects
  clearInterval(expiryInterval);
  expiryInterval = null;
  document.getElementById("expiryTimer").style.display = "none";
  document.getElementById("expiryTimer").classList.remove("expiry-urgent");

  const statusEl = document.getElementById("sendStatus");

  if (isBroadcast) {
    statusEl.innerText = `${count} member${count !== 1 ? "s" : ""} in room — open broadcast when ready.`;
    statusEl.style.color = "#a78bfa";
    updateRoster(count, roster);
    document.getElementById("startBroadcastBtn").style.display = "block";
  } else {
    statusEl.innerText = `${count} Receiver(s) connected. Waiting to start…`;
    statusEl.style.color = "#2ea043";
    updateRoster(count, roster);
    document.getElementById("startBroadcastBtn").style.display = "block";
  }
});

socket.on("receiver-left", ({ count, roster }) => {
  const statusEl = document.getElementById("sendStatus");
  statusEl.innerText = `${count} member${count !== 1 ? "s" : ""} remaining in room.`;
  updateRoster(count, roster);
  if (count === 0) {
    document.getElementById("startBroadcastBtn").style.display = "none";
    statusEl.innerText = "All receivers left. Waiting for new members…";
    statusEl.style.color = "#a78bfa";
  }
});

function updateRoster(count, roster) {
  const box = document.getElementById("rosterBox");
  const list = document.getElementById("rosterList");
  const cntEl = document.getElementById("rosterCount");
  if (!box) return;
  box.style.display = "block";
  cntEl.textContent = `${count} joined`;
  list.innerHTML = roster.map(name =>
    `<li><span class="roster-dot"></span>${escapeHTML(name)}</li>`
  ).join("");
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ── SENDER: start broadcast ──────────────────────────────────────────────────
function startBroadcast() {
  if (sendLoopActive) return;
  sendLoopActive = true;
  document.getElementById("startBroadcastBtn").style.display = "none";

  socket.emit("start-broadcast", sessionCode);

  document.getElementById("sendStatus").innerText = "Broadcasting file to all receivers…";
  document.getElementById("sendStatus").style.color = "#2ea043";

  socket.emit("file-meta", {
    code: sessionCode,
    meta: { name: senderFile.name, size: senderFile.size, type: senderFile.type },
  });

  const chunkSize = 256 * 1024;
  let offset = 0;
  const reader = new FileReader();

  function sendNextChunk() {
    if (offset >= senderFile.size) {
      const statusEl = document.getElementById("sendStatus");
      statusEl.innerText = "Broadcast Complete! ✓";
      document.getElementById("sendBtn").style.display = "none";
      document.getElementById("sendAnotherBtn").style.display = "block";
      sendLoopActive = false;
      // Auto-refresh for next session
      setTimeout(() => window.location.reload(), 5000);
      return;
    }

    reader.onload = (e) => {
      socket.emit(
        "file-raw",
        { code: sessionCode, buffer: e.target.result },
        () => {
          offset += chunkSize;
          sendNextChunk();
        },
      );
    };

    const slice = senderFile.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  sendNextChunk();
}

// ── RECEIVER: join session ────────────────────────────────────────────────────
function joinSession() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  if (!code) return alert("Please enter the share code!");

  // Prevent the sender from joining their own session
  if (sessionCode && code === sessionCode) {
    return alert("You can't join your own session! Share this code with someone else.");
  }

  const name = (document.getElementById("receiverName").value || "").trim() || "Anonymous";

  document.getElementById("receiveBtn").innerText = "Connecting securely…";
  document.getElementById("receiveBtn").disabled = true;

  socket.emit("join-session", { code, name });
}

socket.on("join-failed", () => {
  alert("Connection error! The room code is invalid, the transfer already started, or the sender disconnected.");
  document.getElementById("receiveBtn").innerText = "Connect & Receive";
  document.getElementById("receiveBtn").disabled = false;
});

socket.on("join-failed-self", () => {
  alert("You can't join your own session! Share this code with someone else.");
  document.getElementById("receiveBtn").innerText = "Connect & Receive";
  document.getElementById("receiveBtn").disabled = false;
});

socket.on("join-success", ({ isBroadcast }) => {
  if (!isBroadcast) {
    document.getElementById("receiveBtn").innerText = "Linking to sender…";
  }
  // Broadcast mode → waiting-room event follows
});

// Receiver enters the waiting room (broadcast only)
socket.on("waiting-room", ({ receiverName }) => {
  document.getElementById("receiveBtn").style.display = "none";
  document.getElementById("waitingRoom").style.display = "block";
  document.getElementById("nameWrapper").style.display = "none";
  document.getElementById("joinCode").disabled = true;
});

// Sender kicked off the broadcast — kick receivers out of waiting room
socket.on("broadcast-starting", () => {
  document.getElementById("waitingRoom").style.display = "none";
  document.getElementById("receiveBtn").innerText = "Receiving broadcast…";
  document.getElementById("receiveBtn").style.display = "block";
  document.getElementById("receiveBtn").disabled = true;
});

// Sender left / room closed
socket.on("room-closed", () => {
  document.getElementById("waitingRoom").style.display = "none";
  document.getElementById("receiveBtn").innerText = "Connect & Receive";
  document.getElementById("receiveBtn").style.display = "block";
  document.getElementById("receiveBtn").disabled = false;
  alert("The sender closed the room.");
});

// ── RECEIVER: file data ───────────────────────────────────────────────────────
socket.on("file-meta", (meta) => {
  receiverFileName = meta.name;
  receiverFileSize = meta.size;
  receiverFileType = meta.type || "";
  receivedBuffers = [];
  receivedBytes = 0;

  document.getElementById("incomingFileName").innerText = receiverFileName;
  document.getElementById("incomingFileSize").innerText = formatBytes(receiverFileSize);
  document.getElementById("incomingFileInfo").style.display = "block";
  document.getElementById("receiveBtn").innerText = "Starting Transfer…";
  document.getElementById("waitingRoom").style.display = "none";

  const link = document.getElementById("downloadLink");
  link.download = receiverFileName;

  if (receiverFileSize === 0) finalizeTransfer();
});

socket.on("file-raw", (buffer, ack) => {
  receivedBuffers.push(buffer);

  const chunkLength = buffer.byteLength !== undefined ? buffer.byteLength : new Blob([buffer]).size;
  receivedBytes += chunkLength;

  let pct = receiverFileSize > 0 ? Math.round((receivedBytes / receiverFileSize) * 100) : 100;
  if (pct > 100) pct = 100;

  document.getElementById("receiveBtn").innerText = `Downloading… ${pct}%`;

  const bar = document.getElementById("progressBarInner");
  if (bar) bar.style.width = `${pct}%`;

  if (ack) ack();

  if (receivedBytes >= receiverFileSize) finalizeTransfer();
});

function finalizeTransfer() {
  document.getElementById("receiveBtn").innerText = "Finalizing File…";

  setTimeout(async () => {
    const blob = new Blob(receivedBuffers, { type: receiverFileType });
    const url = URL.createObjectURL(blob);

    const isTextMessage = receiverFileName === "message.txt" || (receiverFileType && receiverFileType.startsWith("text/"));

    if (isTextMessage) {
      // Decode the text and show it
      try {
        const text = await blob.text();
        const msgContainer = document.getElementById("textMessageContainer");
        const msgContent = document.getElementById("textMessageContent");
        msgContent.innerText = text;
        msgContainer.style.display = "block";
      } catch (err) {
        console.error("Failed to decode text:", err);
      }
    }

    const link = document.getElementById("downloadLink");
    link.href = url;
    link.download = receiverFileName;

    document.getElementById("receiveBtn").style.display = "none";
    document.getElementById("incomingFileInfo").style.display = "none";
    document.getElementById("downloadContainer").style.display = "block";
    document.getElementById("receiveAnotherBtn").style.display = "block";

    // Auto-click download only if it's NOT just a message (optional choice)
    if (!isTextMessage) {
      link.click();
    }
    // Auto-refresh for next session
    setTimeout(() => window.location.reload(), 20000); // 20s for text reading
  }, 500);
}

function copyReceivedMessage() {
  const content = document.getElementById("textMessageContent").innerText;
  navigator.clipboard.writeText(content).then(() => {
    const btn = document.querySelector(".copy-msg-btn");
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    btn.style.color = "var(--success)";
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.color = "";
    }, 2000);
  });
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// ── RESET ─────────────────────────────────────────────────────────────────────
function resetSender() {
  selectedFiles = [];
  senderFile = null;
  sendLoopActive = false;

  const label = document.querySelector(".file-label");
  const display = document.getElementById("fileNameDisplay");
  const hint = document.querySelector(".drop-hint");

  label.style.display = "block";
  if (hint) hint.style.display = "";
  display.textContent = "";
  display.style.display = "none";
  document.getElementById("fileInput").value = "";
  document.getElementById("messageInput").value = "";

  document.getElementById("codeContainer").style.display = "none";
  document.getElementById("sendAnotherBtn").style.display = "none";
  document.getElementById("startBroadcastBtn").style.display = "none";
  document.getElementById("rosterBox").style.display = "none";
  document.getElementById("rosterList").innerHTML = "";
  document.getElementById("rosterCount").textContent = "0 joined";

  // Re-enable mode toggle
  const toggle = document.getElementById("modeToggle");
  toggle.style.opacity = "";
  toggle.style.pointerEvents = "";
  document.getElementById("modeHint").style.display = "";

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.innerText = "Generate Share Code";
  sendBtn.style.display = "block";
  sendBtn.disabled = false;

  socket.emit("leave-session");
}

function resetReceiver() {
  document.getElementById("joinCode").value = "";
  document.getElementById("joinCode").disabled = false;
  document.getElementById("receiverName").value = "";
  document.getElementById("nameWrapper").style.display = "none";
  document.getElementById("downloadContainer").style.display = "none";
  document.getElementById("receiveAnotherBtn").style.display = "none";
  document.getElementById("waitingRoom").style.display = "none";
  document.getElementById("textMessageContainer").style.display = "none";

  const receiveBtn = document.getElementById("receiveBtn");
  receiveBtn.innerText = "Connect & Receive";
  receiveBtn.style.display = "block";
  receiveBtn.disabled = false;

  receiverFileName = "";
  receiverFileSize = 0;
  receiverFileType = "";
  receivedBuffers = [];
  receivedBytes = 0;

  window.history.replaceState({}, document.title, window.location.pathname);
}
