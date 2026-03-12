const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let sessions = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-session", () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    sessions[code] = {
      sender: socket.id,
    };

    socket.join(code);

    socket.emit("session-created", code);
  });

  socket.on("join-session", (code) => {
    if (sessions[code]) {
      sessions[code].receiver = socket.id;
      socket.join(code);
      io.to(sessions[code].sender).emit("receiver-joined");
    } else {
      socket.emit("join-failed");
    }
  });

  socket.on("file-metadata", (metadata) => {
    socket.to(metadata.code).emit("file-metadata", metadata);
  });

  socket.on("file-chunk", ({ code, chunk }) => {
    socket.to(code).emit("file-chunk", chunk);

    // Track how many chunks sent per session could be implemented, but simple timeout fallback
    clearTimeout(sessions[code].timeout);
    sessions[code].timeout = setTimeout(() => {
      socket.to(code).emit("transfer-complete");
    }, 1000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
