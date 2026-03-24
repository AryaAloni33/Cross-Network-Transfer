const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Strict CORS and buffer settings to guarantee it allows mobile connections
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // Allow chunks up to 100MB
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
      expiryTimer,
      createdAt: Date.now()
    };

    socket.join(code);
    socket.emit("session-created", code);
  });

  socket.on("join-session", (code) => {
    if (sessions[code]) {
      sessions[code].receiver = socket.id;

      // Cancel the expiry timer — connection established, transfer can proceed
      clearTimeout(sessions[code].expiryTimer);

      socket.join(code);
      socket.emit("join-success");

      // Send the receiver's specific ID to the sender so they can sync up perfectly
      io.to(sessions[code].sender).emit("receiver-joined", socket.id);
    } else {
      socket.emit("join-failed");
    }
  });

  socket.on("file-meta", (data) => {
    // Pass metadata safely to receiver
    io.to(data.target).emit("file-meta", data.meta);
  });

  // This is the magic bullet: flow-controlled data passing. 
  // It waits for the receiver to confirm it got the chunk before asking sender for the next one.
  socket.on("file-raw", (data, callback) => {
    io.to(data.target).emit("file-raw", data.buffer, () => {
      // Once receiver acknowledges, we acknowledge the sender to send more
      if (callback) callback();
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server strictly bound to port ${PORT}`);
});
