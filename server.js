const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Strict CORS and buffer settings to guarantee it allows mobile connections
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8, // Allow chunks up to 100MB
});

app.use(express.static("public"));

const SESSION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

let sessions = {};

io.on("connection", (socket) => {
  console.log("Device connected securely:", socket.id);

  // ── CREATE SESSION ──────────────────────────────────────────────
  socket.on("create-session", ({ mode } = {}) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const isBroadcast = mode === "broadcast";

    const EXPIRY_MS = isBroadcast ? 1 * 60 * 1000 : 2 * 60 * 1000; // 1 min broadcast, 2 min direct

    const expiryTimer = setTimeout(() => {
      if (sessions[code]) {
        io.to(sessions[code].sender).emit("session-expired", code);
        delete sessions[code];
        console.log(`Session ${code} expired and removed.`);
      }
    }, EXPIRY_MS);

    sessions[code] = {
      sender: socket.id,
      receivers: [],       // array of { id, name }
      expiryTimer,
      createdAt: Date.now(),
      transferStarted: false,
      isBroadcast,
    };

    socket.join(code);
    socket.emit("session-created", { code, isBroadcast });
  });

  // ── JOIN SESSION ────────────────────────────────────────────────
  socket.on("join-session", ({ code, name }) => {
    if (!sessions[code]) return socket.emit("join-failed");

    // Prevent the sender from joining their own session
    if (sessions[code].sender === socket.id) {
      return socket.emit("join-failed-self");
    }

    if (sessions[code].transferStarted) {
      return socket.emit("join-failed");
    }

    const receiverName = (name || "Anonymous").substring(0, 24);
    sessions[code].receivers.push({ id: socket.id, name: receiverName });

    // Cancel expiry only in 1-to-1 mode (broadcast keeps it until first join)
    clearTimeout(sessions[code].expiryTimer);

    socket.join(code);

    const isBroadcast = sessions[code].isBroadcast;

    // Tell the receiver they joined successfully
    socket.emit("join-success", { isBroadcast });

    // In broadcast mode → receiver waits for sender to start
    if (isBroadcast) {
      socket.emit("waiting-room", { receiverName });
    }

    // Tell the sender about the updated roster
    const roster = sessions[code].receivers.map(r => r.name);
    io.to(sessions[code].sender).emit("receiver-joined", {
      count: sessions[code].receivers.length,
      roster,
      isBroadcast,
    });
  });

  // ── START BROADCAST ─────────────────────────────────────────────
  socket.on("start-broadcast", (code) => {
    if (sessions[code]) {
      sessions[code].transferStarted = true;
      // Wake up all waiting receivers
      sessions[code].receivers.forEach(r => {
        io.to(r.id).emit("broadcast-starting");
      });
    }
  });

  // ── FILE META ───────────────────────────────────────────────────
  socket.on("file-meta", (data) => {
    const session = sessions[data.code];
    if (session) {
      session.receivers.forEach(r => {
        io.to(r.id).emit("file-meta", data.meta);
      });
    }
  });

  // ── FILE CHUNK ──────────────────────────────────────────────────
  socket.on("file-raw", (data, callback) => {
    const session = sessions[data.code];
    if (session && session.receivers.length > 0) {
      let acks = 0;
      const total = session.receivers.length;

      session.receivers.forEach(r => {
        io.to(r.id).emit("file-raw", data.buffer, () => {
          acks++;
          if (acks === total && callback) callback();
        });
      });
    } else {
      if (callback) callback();
    }
  });

  // ── DISCONNECT ──────────────────────────────────────────────────
  socket.on("disconnect", () => {
    for (const code in sessions) {
      const session = sessions[code];
      if (session.sender === socket.id) {
        // Sender left — notify all receivers and clean up
        session.receivers.forEach(r => {
          io.to(r.id).emit("room-closed");
        });
        clearTimeout(session.expiryTimer);
        delete sessions[code];
        console.log(`Session ${code} removed — sender disconnected.`);
      } else {
        // A receiver left — remove from roster and notify sender
        const before = session.receivers.length;
        session.receivers = session.receivers.filter(r => r.id !== socket.id);
        if (session.receivers.length < before) {
          const roster = session.receivers.map(r => r.name);
          io.to(session.sender).emit("receiver-left", {
            count: session.receivers.length,
            roster,
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server bound to port ${PORT}`);
});
