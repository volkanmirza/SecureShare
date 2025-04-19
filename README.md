# SecureShare - FoxFile.org

SecureShare (now FoxFile.org) is a secure, end-to-end encrypted file sharing application that allows users to transfer files directly between browsers (peer-to-peer) using WebRTC. A WebSocket server is used only for signaling and establishing the connection.

## Features

- **End-to-End Encryption**: Files are encrypted in the sender's browser using the Web Crypto API (AES-GCM with a shared key derived via ECDH) and decrypted only in the receiver's browser. The server cannot access the file contents.
- **Peer-to-Peer (P2P) Transfer**: Once the connection is established via WebRTC, file data is transferred directly between the sender and receiver, bypassing the server for improved speed and privacy.
- **STUN/TURN Support**: Utilizes STUN servers (and optionally TURN servers via dynamic credentials) to facilitate P2P connections across different networks (NAT traversal).
- **No File Size Limits**: Transfer files of any size (limited only by browser capabilities and network conditions).
- **No Registration Required**: Simple share code system for connecting users.
- **Multiple Language Support**: Available in English and Turkish.
- **Dark/Light Theme**: Supports both dark and light themes based on system preference or manual toggle.
- **Responsive Design**: Works on desktop and mobile devices.
- **Dynamic TURN Credentials**: Optionally fetches temporary TURN server credentials from the backend for enhanced security.

## Technologies Used

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Encryption**: Web Crypto API (ECDH for key exchange, AES-GCM for file chunk encryption)
- **Communication**: WebSocket (for signaling via `ws`), WebRTC (for P2P data transfer)
- **Backend**: Node.js (for WebSocket signaling and TURN credential API)
- **NAT Traversal**: STUN/TURN
- **No File Storage**: Files are transferred directly P2P and are never stored on the server.

## How It Works

1.  **File Selection & Code**: The sender selects a file. The server generates a unique share code.
2.  **Code Sharing**: The sender shares this code with the receiver.
3.  **Signaling Connection**: Both users connect to the WebSocket server using the code. The server pairs them.
4.  **Secure Key Exchange**: An ECDH key exchange happens over the WebSocket connection (relayed by the server) to establish a shared secret key (used for file encryption).
5.  **WebRTC Setup**: WebRTC signaling messages (offer, answer, candidates) are exchanged via WebSocket. STUN/TURN servers are used to find a P2P connection path.
6.  **P2P Data Channel**: A secure WebRTC data channel is established directly between the peers.
7.  **Metadata Transfer**: File metadata (name, size, type) is sent unencrypted over the established data channel.
8.  **Encrypted File Transfer**: The sender encrypts file chunks (using AES-GCM and the shared key) and sends them directly to the receiver over the WebRTC data channel(s).
9.  **Decryption & Download**: The receiver decrypts the file chunks and assembles the original file for automatic download.

## Installation

### Prerequisites

- Node.js (v14.0.0 or higher recommended)
- npm (comes with Node.js)
- (Optional but Recommended) A TURN Server (like Coturn) for robust NAT traversal.

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/foxfile.git # Replace with your actual repo URL
    cd foxfile
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  **Configure TURN Server (Important!)**:
    *   Set up your TURN server (e.g., Coturn).
    *   **Securely** configure the `TURN_SECRET` environment variable before starting the Node.js server. This secret is used to generate temporary TURN credentials.
        ```bash
        # Example for Linux/macOS
        export TURN_SECRET="a9F$kL7p!zR@3wE*cHmG&jN5sBvY^dXq" 
        # Example for Windows (PowerShell)
        # $env:TURN_SECRET = "a9F$kL7p!zR@3wE*cHmG&jN5sBvY^dXq"
        ```
    *   Update the TURN server address (`turn:foxfile.org:3478`) in `config.js` if it differs from yours.

4.  **(Optional) Configure SSL:** For HTTPS, place your `foxfile.org.key` and `foxfile.org.crt` files in `/etc/ssl/foxfile.org/` or update the paths in `server.js`. If certificates are not found, the server will run on HTTP (port 3001 by default).

5.  Start the server:
    ```bash
    node server.js
    ```

6.  Access the application:
    Open your browser and navigate to `http://localhost:3001` (or `https://yourdomain.com` if using SSL/reverse proxy).

### Docker Installation

(Note: Docker setup needs to be updated to handle the `TURN_SECRET` environment variable securely.)

1.  Build and start the container:
    ```bash
    # Update docker-compose.yml to pass TURN_SECRET environment variable
    docker-compose up -d
    ```

2.  Access the application:
    Open your browser and navigate to `http://localhost:3001`

## Security

- **End-to-End Encryption**: File content is encrypted using AES-GCM with a key derived via ECDH. Only the sender and receiver possess the key.
- **Secure Key Exchange**: ECDH provides forward secrecy for the shared encryption key exchanged via the signaling server.
- **P2P Data Transfer**: Encrypted file data travels directly between peers via WebRTC, minimizing server exposure.
- **Signaling Server Role**: The WebSocket server only facilitates peer discovery, key exchange, and WebRTC setup. It does not handle the file content.
- **Dynamic TURN Credentials**: Temporary, time-limited credentials are generated server-side for TURN access, preventing static credential exposure in the client-side code.
- **Metadata Consideration**: File metadata (name, size, type) is currently sent unencrypted over the secure data channel after connection establishment. While the channel itself is secure, the metadata is not separately encrypted.
- **HTTPS Recommended**: Running the signaling server (Node.js) behind a reverse proxy with HTTPS is crucial to encrypt the WebSocket signaling traffic and the TURN credential API requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC for enabling secure peer-to-peer communication.
- WebSocket (`ws` library) for signaling.
- Web Crypto API for robust browser-based encryption.
- Tailwind CSS for the responsive design framework.