# SecureShare

SecureShare is an end-to-end encrypted peer-to-peer file sharing application that allows users to securely transfer files directly between browsers without storing them on any server.

## Features

- **End-to-End Encryption**: Files are transferred with end-to-end encryption over WebRTC's DTLS protocol
- **Direct P2P Transfer**: File contents never reach servers, they are sent directly to the receiver
- **No File Size Limits**: Transfer files of any size (limited only by browser memory)
- **No Registration Required**: Simple share code system for connecting peers
- **Multiple Language Support**: Available in English and Turkish
- **Dark/Light Theme**: Supports both dark and light themes
- **Responsive Design**: Works on desktop and mobile devices

## Technologies Used

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Communication**: WebRTC, WebSocket
- **Backend**: Node.js
- **No Database**: No file storage or user data is stored on the server

## How It Works

1. **File Selection**: The sender selects a file and a share code is generated
2. **Code Sharing**: The sender shares the code with the receiver through any communication channel (messaging, email, etc.)
3. **Connection**: The receiver enters the code and a secure WebRTC connection is established
4. **Secure Transfer**: The file is transferred directly to the receiver with encryption

## Installation

### Prerequisites

- Node.js (v14.0.0 or higher)
- npm (comes with Node.js)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/secureshare.git
   cd secureshare
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Access the application:
   Open your browser and navigate to `http://localhost:3000`

### Docker Installation

You can also run SecureShare using Docker:

1. Build and start the container:
   ```bash
   docker-compose up -d
   ```

2. Access the application:
   Open your browser and navigate to `http://localhost:3000`

## Security

- WebRTC connections are secured with DTLS-SRTP
- The signaling server only facilitates the initial connection setup
- All file data is transferred directly between peers
- No data is stored on any server
- File contents are never exposed to the server

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC for enabling secure peer-to-peer communication
- Tailwind CSS for the responsive design framework