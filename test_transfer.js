const { io } = require("socket.io-client");
const fs = require("fs");

const socketSender = io("http://localhost:3000");
const socketReceiver = io("http://localhost:3000");

socketSender.on("connect", () => {
    socketReceiver.on("connect", () => {
        socketSender.emit("create-session");
    });
});

socketSender.on("session-created", (code) => {
    socketReceiver.emit("join-session", code);
});

socketSender.on("receiver-joined", (receiverSocketId) => {
    const textBuffer = Buffer.from("Hello world this is a pure text file buffer test!");
    
    socketSender.emit("file-meta", {
        target: receiverSocketId,
        meta: { name: "test.txt", size: textBuffer.length, type: "text/plain" }
    });

    // Simulate sending exactly what script.js does
    // wait, script.js sends ArrayBuffer. In node, Buffer is similar
    socketSender.emit("file-raw", { target: receiverSocketId, buffer: textBuffer }, () => {
        console.log("Sender complete");
        process.exit(0);
    });
});

socketReceiver.on("file-meta", (meta) => {
    console.log("Receiver got meta:", meta);
});

socketReceiver.on("file-raw", (buffer, cb) => {
    console.log("Receiver got buffer of type:", typeof buffer);
    console.log("Is Buffer?", Buffer.isBuffer(buffer));
    console.log("Is ArrayBuffer?", buffer instanceof ArrayBuffer);
    console.log("byteLength:", buffer.byteLength);
    console.log("length:", buffer.length);
    if (cb) cb();
});
