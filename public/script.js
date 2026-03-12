const socket = io();

let file;
let receivedChunks = [];
let receivingFileName = "received_file";

// Handle URL parameters for instant joining
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get('join');

  if (joinCode) {
    document.getElementById('joinCode').value = joinCode;
    joinSession();
    // Fallback for smooth auto-scroll to mobile devices
    document.querySelector('.receive-panel').scrollIntoView({ behavior: 'smooth' });
  }
});

// UI interaction for file input
document.getElementById('fileInput').addEventListener('change', function (e) {
  const fileName = e.target.files[0] ? e.target.files[0].name : '';
  const label = document.querySelector('.file-label');
  const nameDisplay = document.getElementById('fileNameDisplay');

  if (fileName) {
    label.style.display = 'none';
    nameDisplay.textContent = fileName;
    nameDisplay.style.display = 'block';
  } else {
    label.style.display = 'block';
    nameDisplay.style.display = 'none';
  }
});

function createSession() {
  file = document.getElementById("fileInput").files[0];

  if (!file) {
    alert("Select a file first!");
    return;
  }

  const btn = document.getElementById("sendBtn");
  btn.innerText = "Generating Share Code...";
  btn.disabled = true;

  socket.emit("create-session");
}

socket.on("session-created", (code) => {
  const btn = document.getElementById("sendBtn");
  btn.style.display = "none";

  const codeContainer = document.getElementById("codeContainer");
  codeContainer.style.display = "block";
  document.getElementById("codeDisplay").innerText = code;

  // Generate QR code for the join link
  const joinUrl = `${window.location.origin}/?join=${code}`;

  document.getElementById("qrcode").innerHTML = "";

  new QRCode(document.getElementById("qrcode"), {
    text: joinUrl,
    width: 150,
    height: 150,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
});

function joinSession() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();

  if (!code) {
    alert("Please enter a share code!");
    return;
  }

  const btn = document.getElementById("receiveBtn");
  btn.innerText = "Connecting...";
  btn.disabled = true;

  socket.emit("join-session", code);
}

socket.on("receiver-joined", () => {
  console.log("Receiver connected via Socket.io");
  const statusMsg = document.getElementById("sendStatus");
  if (statusMsg) {
    statusMsg.innerHTML = "Receiver connected! Sending file... <span style='animation: pulse 1s infinite;'>📡</span>";
    statusMsg.style.color = "#2ea043"; // Success color
  }

  // Send metadata first to retain the file name
  socket.emit("file-metadata", { name: file.name, size: file.size, code: document.getElementById("codeDisplay").innerText });

  sendFile(document.getElementById("codeDisplay").innerText);
});

socket.on("file-metadata", (metadata) => {
  receivingFileName = metadata.name;
  document.getElementById("receiveBtn").innerText = "Receiving Data...";
  receivedChunks = [];
});

socket.on('join-failed', () => {
  alert("Connection error! The room code is invalid or the sender disconnected.");
  const btn = document.getElementById("receiveBtn");
  btn.innerText = "Connect & Receive";
  btn.disabled = false;
});

function sendFile(code) {
  const chunkSize = 16384;
  const reader = new FileReader();

  let offset = 0;

  reader.onload = (e) => {
    socket.emit("file-chunk", {
      code: code,
      chunk: e.target.result,
    });

    offset += e.target.result.byteLength;

    if (offset < file.size) {
      readSlice(offset);
    } else {
      const statusMsg = document.getElementById("sendStatus");
      if (statusMsg) {
        statusMsg.innerText = "File transfer complete! 🎉";
        statusMsg.style.color = "#2ea043";
      }
    }
  };

  function readSlice(o) {
    const slice = file.slice(offset, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  readSlice(0);
}

socket.on("file-chunk", (chunk) => {
  receivedChunks.push(chunk);

  const btn = document.getElementById("receiveBtn");
  btn.innerText = "Receiving Data...";

  // We rely on 'transfer-complete' event now to compile the file
});

socket.on("transfer-complete", () => {
  const blob = new Blob(receivedChunks);
  const url = URL.createObjectURL(blob);
  const link = document.getElementById("downloadLink");

  link.href = url;
  // Keep original file name!
  link.download = receivingFileName || "received_file";

  document.getElementById("receiveBtn").style.display = "none";
  document.getElementById("downloadContainer").style.display = "block";
});

// A tiny helper to make typing share codes nicer
document.getElementById('joinCode').addEventListener('input', function (e) {
  this.value = this.value.toUpperCase().replace(/\s/g, '');
});
