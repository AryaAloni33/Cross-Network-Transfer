let peer;
let conn;
let file;
let receivedChunks = [];
let receivingFileName = "received_file";
let receivingFileSize = 0;
let receivedSize = 0;

// Handle URL parameters for instant joining
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get('join');

  if (joinCode) {
    document.getElementById('joinCode').value = joinCode;
    joinSession();
    // Fallback for smooth auto-scroll to the receive panel on mobile devices
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

  // Generate a random 6-character code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Initialize PeerJS with the generated code as ID and explicit STUN servers for better connectivity
  peer = new Peer(code, {
    config: {
      'iceServers': [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', (id) => {
    btn.style.display = "none";

    const codeContainer = document.getElementById("codeContainer");
    codeContainer.style.display = "block";
    document.getElementById("codeDisplay").innerText = code;

    // Generate QR code for the join link
    const joinUrl = `${window.location.origin}/?join=${code}`;

    // Clear any existing QR code before generating a new one
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

  peer.on('connection', (connection) => {
    conn = connection;
    console.log("Receiver connected via PeerJS based WebRTC");

    const statusMsg = document.getElementById("sendStatus");
    if (statusMsg) {
      statusMsg.innerHTML = "Receiver connected! Sending file... <span style='animation: pulse 1s infinite;'>📡</span>";
      statusMsg.style.color = "#2ea043"; // Success color
    }

    const startTransfer = () => {
      // Tell the receiver the file name and size before sending chunks
      conn.send({
        type: 'metadata',
        name: file.name,
        size: file.size
      });

      sendFile();
    };

    if (conn.open) {
      startTransfer();
    } else {
      conn.on('open', startTransfer);
    }
  });

  peer.on('error', (err) => {
    alert("Error: " + err.message);
    btn.innerText = "Generate Share Code";
    btn.disabled = false;
  });
}

function joinSession() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();

  if (!code) {
    alert("Please enter a share code!");
    return;
  }

  const btn = document.getElementById("receiveBtn");
  btn.innerText = "Connecting...";
  btn.disabled = true;

  // Initialize receiving peer with STUN servers
  peer = new Peer({
    config: {
      'iceServers': [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', () => {
    // Connect to the sender's Peer ID (the share code)
    conn = peer.connect(code);

    conn.on('open', () => {
      btn.innerText = "Receiving Data...";
      console.log("Connected to sender");
    });

    conn.on('data', (data) => {
      if (data.type === 'metadata') {
        // Prepare for file chunks
        receivingFileName = data.name;
        receivingFileSize = data.size;
        receivedChunks = [];
        receivedSize = 0;
      } else if (data.type === 'chunk') {
        // Receive chunk of file
        receivedChunks.push(data.data);
        receivedSize += data.data.byteLength;

        if (receivedSize >= receivingFileSize) {
          finishDownload();
        }
      }
    });

    conn.on('error', (err) => {
      alert("Connection error: " + err);
      btn.innerText = "Connect & Receive";
      btn.disabled = false;
    });
  });

  peer.on('error', (err) => {
    alert("Error joining: Code might be invalid or disconnected.");
    btn.innerText = "Connect & Receive";
    btn.disabled = false;
  });
}

async function sendFile() {
  const chunkSize = 65536; // 64KB for optimal WebRTC throughput
  let offset = 0;

  while (offset < file.size) {
    // If WebRTC internal buffer is too full, wait a bit so we don't crash the browser
    if (conn.dataChannel && conn.dataChannel.bufferedAmount > 1024 * 1024) {
      await new Promise(r => setTimeout(r, 50));
      continue;
    }

    const slice = file.slice(offset, offset + chunkSize);
    const chunkData = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsArrayBuffer(slice);
    });

    conn.send({
      type: 'chunk',
      data: chunkData
    });

    offset += chunkData.byteLength;
  }

  const statusMsg = document.getElementById("sendStatus");
  if (statusMsg) {
    statusMsg.innerText = "File transfer complete! 🎉";
    statusMsg.style.color = "#2ea043";
  }
}

function finishDownload() {
  const blob = new Blob(receivedChunks);
  const url = URL.createObjectURL(blob);
  const link = document.getElementById("downloadLink");

  link.href = url;

  // Set accurate download name from metadata
  link.download = receivingFileName || "received_file";

  document.getElementById("receiveBtn").style.display = "none";
  document.getElementById("downloadContainer").style.display = "block";
}

// A tiny helper to make typing share codes nicer
document.getElementById('joinCode').addEventListener('input', function (e) {
  this.value = this.value.toUpperCase().replace(/\s/g, '');
});
