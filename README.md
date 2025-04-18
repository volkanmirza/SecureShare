# SecureShare

SecureShare is a secure, end-to-end encrypted file sharing application that allows users to transfer files directly between browsers using WebSocket for signaling and data relay.

## Features

- **End-to-End Encryption**: Files are encrypted in the sender's browser using the Web Crypto API (AES-GCM) and decrypted only in the receiver's browser. The server cannot access the file contents.
- **Server-Relayed Transfer**: File data is relayed through a WebSocket server, but remains encrypted end-to-end.
- **No File Size Limits**: Transfer files of any size (limited only by browser memory and server resources).
- **No Registration Required**: Simple share code system for connecting users.
- **Multiple Language Support**: Available in English and Turkish.
- **Dark/Light Theme**: Supports both dark and light themes based on system preference or manual toggle.
- **Responsive Design**: Works on desktop and mobile devices.

## Technologies Used

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Encryption**: Web Crypto API (ECDH for key exchange, AES-GCM for encryption)
- **Communication**: WebSocket (via ws library)
- **Backend**: Node.js
- **No File Storage**: Files are relayed in chunks and not stored on the server.

## How It Works

1.  **File Selection**: The sender selects a file.
2.  **Code Generation**: A unique, random share code is generated for the sender.
3.  **Code Sharing**: The sender shares this code with the receiver through any communication channel.
4.  **Connection**: The receiver enters the code. Both sender and receiver connect to the WebSocket server.
5.  **Key Exchange**: An ECDH key exchange happens over WebSocket (relayed by the server) to establish a shared secret key between the sender and receiver.
6.  **Encrypted Transfer**: The sender encrypts the file metadata and then the file chunks using the shared key and sends them via WebSocket. The server relays the encrypted data to the receiver.
7.  **Decryption & Download**: The receiver decrypts the metadata and file chunks using the shared key and constructs the file for download.

## Installation

### Prerequisites

- Node.js (v14.0.0 or higher)
- npm (comes with Node.js)

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/secureshare.git # Replace with your actual repo URL
    cd secureshare
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the server:
    ```bash
    node server.js
    ```
    (Alternatively, if you have `nodemon` installed for development: `nodemon server.js`)

4.  Access the application:
    Open your browser and navigate to `http://localhost:3000`

### Docker Installation

You can also run SecureShare using Docker:

1.  Build and start the container:
    ```bash
    docker-compose up -d
    ```

2.  Access the application:
    Open your browser and navigate to `http://localhost:3000`

## Security

- **End-to-End Encryption**: File content is encrypted using AES-GCM with a key derived via ECDH, ensuring only the sender and receiver can decrypt it.
- **Secure Key Exchange**: ECDH provides forward secrecy for the shared encryption key.
- **Server Cannot Decrypt**: The WebSocket server only relays encrypted data and cannot decrypt the file content.
- **No Persistent Storage**: Files and encryption keys are not stored on the server.
- **HTTPS Recommended**: For production deployment, running the server behind a reverse proxy with HTTPS is strongly recommended to encrypt the WebSocket signaling traffic itself.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC for enabling secure peer-to-peer communication
- Tailwind CSS for the responsive design framework