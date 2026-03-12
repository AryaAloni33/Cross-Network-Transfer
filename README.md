# Cross-Network File Transfer System

A lightweight web-based application that enables **real-time file transfer between devices connected to different networks**. The system allows users to seamlessly share files using a **temporary session code or QR code**, without requiring application installation, user accounts, or shared local networks.

This project demonstrates the design and implementation of a **cross-network file sharing platform** using modern web technologies and real-time communication protocols.

---

## Project Overview

Many traditional file-sharing tools require devices to be connected to the **same local network**. This limitation makes it difficult to transfer files when devices are connected through **different Wi-Fi networks, mobile data, or remote connections**.

The Cross-Network File Transfer System addresses this limitation by enabling devices to establish a **temporary real-time communication channel through a centralized server**, allowing secure and efficient file transfer regardless of network differences.

The system focuses on simplicity, accessibility, and minimal setup while maintaining efficient data transmission.

---

## Key Features

* Cross-network file transfer between devices
* Real-time communication using WebSockets
* Device pairing using a temporary session code
* QR code-based device connection
* Chunk-based file transmission for reliable transfers
* No installation or account creation required
* Browser-based interface accessible from any device
* Lightweight and minimal dependency architecture

---

## System Architecture

The application follows a **client-server architecture** where the server acts as a signaling and routing layer between devices.

                 ┌─────────────────────┐
                 │   Sender Device     │
                 │  (Browser / PC)     │
                 └─────────┬───────────┘
                           │
                           │  WebSocket Connection
                           │
                 ┌─────────▼───────────┐
                 │   Node.js Server    │
                 │   Express + Socket  │
                 │                     │
                 │  • Session Manager  │
                 │  • QR Generator     │
                 │  • Chunk Routing    │
                 └─────────┬───────────┘
                           │
                           │  WebSocket Connection
                           │
                 ┌─────────▼───────────┐
                 │   Receiver Device   │
                 │  (Browser / Phone)  │
                 └─────────────────────┘

The server manages:

* session creation
* device pairing
* real-time communication channels
* routing of file chunks between connected devices

Files are transmitted in **binary chunks** to ensure efficient and continuous streaming.

---

## Technology Stack

### Backend

* Node.js
* Express.js
* Socket.IO (WebSocket communication)

### Frontend

* HTML
* CSS
* JavaScript

### Additional Components

* QR Code generation for quick device pairing
* Chunk-based file streaming mechanism

---

## Project Structure

```id="1s3o2m"
file-transfer-app
│
├── server.js
├── package.json
│
└── public
    ├── index.html
    ├── script.js
    └── style.css
```

---

## Installation

Clone the repository:

```id="ewf66k"
git clone https://github.com/AryaAloni33/cross-network-file-transfer.git
```

Navigate to the project directory:

```id="8h15iw"
cd cross-network-file-transfer
```

Install dependencies:

```id="xfoaen"
npm install
```

Start the server:

```id="ujmcew"
node server.js
```

Open the application in your browser:

```id="ceoiyr"
http://localhost:3000
```

---

## Usage

### Sending a File

1. Open the application in a browser.
2. Select the file to be transferred.
3. A unique session code and QR code will be generated.

### Receiving a File

1. Open the application on another device.
2. Enter the session code or scan the QR code.
3. Once connected, the file transfer begins automatically.

---

## Author

Developed as part of a learning initiative to explore **real-time communication systems and cross-network file transfer mechanisms using modern web technologies**.
