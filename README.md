# <img src="public/assets/icon-192.png" width="48" height="48" valign="middle"> Cross Network Transfer

Visit the [Cross Network Transfer Website](https://cross-network-transfer.onrender.com) to try it out.

A lightweight, premium web application that enables **real-time file and message transfer** between any two devices, regardless of the network they are on. No apps, no accounts, no local network requirements—just a simple code and you're connected.

---


- **📡 Broadcast Mode**: Want to send a file to an entire room? Switch to Broadcast mode and let multiple receivers join your session simultaneously.
- **💬 Instant Messaging**: Not just for files anymore! Switch to "Message" mode to send text snippets, links, or notes instantly across devices.
- **⏳ Session Security**: All share codes now come with a built-in **5-minute expiry timer**. This keeps your transfers secure and prevents old codes from lingering.
- **📱 Mobile Optimized**: A refined, responsive UI that feels like a native app on your phone, complete with smooth animations and a "Secure Enclave" aesthetic.
- **🎨 Premium UI/UX**: Featuring a modern "Glassmorphism" design, dynamic blob backgrounds, and intuitive drag-and-drop support.

---

## ✨ Key Features

- **Universal Compatibility**: Works on any browser (Chrome, Safari, Firefox, Edge) and any OS (iOS, Android, Windows, macOS).
- **Zero Setup**: No installation, no registration, no tracking.
- **QR Connectivity**: Just scan the generated QR code to connect instantly—perfect for mobile-to-desktop transfers.
- **Chunked Streaming**: Reliable file transmission using chunked binary data over WebSockets (Socket.IO).
- **End-to-End Feel**: Data flows directly (via our signaling server) to the receiver, ensuring speed and simplicity.

---

## 🛠️ System Architecture

The application follows a **client-server architecture** where the Node.js server acts as a lightning-fast signaling and routing layer.

```text
                 ┌─────────────────────┐
                 │   Sender Device     │
                 │  (Browser / PC)     │
                 └─────────┬───────────┘
                           │
                           │  WebSocket (Socket.IO)
                           │
                 ┌─────────▼───────────┐
                 │   Node.js Server    │
                 │  Express Backend    │
                 │                     │
                 │  • Session Manager  │
                 │  • QR Generation    │
                 │  • Chunk Routing    │
                 └─────────┬───────────┘
                           │
                           │  WebSocket (Socket.IO)
                           │
                 ┌─────────▼───────────┐
                 │   Receiver Device   │
                 │  (Browser / Phone)  │
                 └─────────────────────┘
```

---

## 📦 Tech Stack

- **Backend**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
- **Real-time**: [Socket.IO](https://socket.io/)
- **Frontend**: [HTML5](https://developer.mozilla.org/en-US/docs/Web/HTML), [Vanilla CSS](https://developer.mozilla.org/en-US/docs/Web/CSS), [JavaScript (ES6+)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- **Utilities**: [QRCode.js](https://davidshimjs.github.io/qrcodejs/) & [JSZip](https://stuk.github.io/jszip/)

---

## 🚀 Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/AryaAloni33/cross-network-file-transfer.git
cd cross-network-file-transfer
```

### 2. Install & Run

```bash
npm install
npm start
```

### 3. Access

Open `http://localhost:3000` in your browser.

---

## 📖 How to Use

1.  **Select Your Mode**: Choose between **Direct** (1-to-1), **Message** (Text), or **Broadcast** (1-to-Many).
2.  **Generate Code**: Upload your file or type your message and click **Generate Share Code**.
3.  **Share**: Give the 6-digit code to your receiver or have them scan the **QR Code**.
4.  **Transfer**: Watch the real-time progress bar as your data streams across!

---

## 👤 Author

Developed as an exploration into real-time communication systems and seamless cross-network data transfer.

---

_Note: For the best experience on mobile, simply open your browser and point it to the hosted URL!_
