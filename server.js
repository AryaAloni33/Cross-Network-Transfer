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

  socket.on("create-session", () => {
    // Generate simple share code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Schedule auto-expiry after 5 minutes
    const expiryTimer = setTimeout(() => {
      if (sessions[code]) {
        // Notify sender that their session has expired
        io.to(sessions[code].sender).emit("session-expired", code);
        delete sessions[code];
        console.log(`Session ${code} expired and removed.`);
      }
    }, SESSION_EXPIRY_MS);

    sessions[code] = {
      sender: socket.id,
      receivers: [],
      expiryTimer,
      createdAt: Date.now(),
      transferStarted: false,
    };

    socket.join(code);
    socket.emit("session-created", code);
  });

  socket.on("join-session", (code) => {
    if (sessions[code]) {
      if (sessions[code].transferStarted) {
        // Prevent joining mid-transfer
        return socket.emit("join-failed");
      }

      sessions[code].receivers.push(socket.id);

      // Cancel the expiry timer — connection established, transfer can proceed
      clearTimeout(sessions[code].expiryTimer);

      socket.join(code);
      socket.emit("join-success");

      // Send the total count of receivers connected to the sender
      io.to(sessions[code].sender).emit("receiver-joined", sessions[code].receivers.length);
    } else {
      socket.emit("join-failed");
    }
  });

  socket.on("start-broadcast", (code) => {
    if (sessions[code]) sessions[code].transferStarted = true;
  });

  socket.on("file-meta", (data) => {
    const session = sessions[data.code];
    if (session) {
      session.receivers.forEach(r => {
        io.to(r).emit("file-meta", data.meta);
      });
    }
  });

  socket.on("file-raw", (data, callback) => {
    const session = sessions[data.code];
    if (session && session.receivers.length > 0) {
      let acks = 0;
      const total = session.receivers.length;

      session.receivers.forEach(r => {
        io.to(r).emit("file-raw", data.buffer, () => {
          acks++;
          if (acks === total) {
            // Only acknowledge the sender when ALL receivers have downloaded the chunk
            if (callback) callback();
          }
        });
      });
    } else {
      // If everyone disconnected, stop waiting
      if (callback) callback();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server bound to port ${PORT}`);
});
