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
    }
  });

  socket.on("file-chunk", ({ code, chunk }) => {
    socket.to(code).emit("file-chunk", chunk);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
