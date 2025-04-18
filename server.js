// server.js
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Simple HTTP server to serve static files
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let filePath = '.' + parsedUrl.pathname;
    
    // Default to index.html for root requests
    if (filePath === './') {
        filePath = './index.html';
    }

    // Get the file extension
    const extname = path.extname(filePath);
    
    // Define content types for common file extensions
    const contentTypeMap = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };
    
    const contentType = contentTypeMap[extname] || 'text/plain';
    
    // Read the file
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // File not found
                res.writeHead(404);
                res.end('File not found');
            } else {
                // Server error
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            // Success - return the file
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Set the port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

// WebSocket server for signaling
const wss = new WebSocket.Server({ server });

// Store active connections and their codes
const connections = new Map();
const codes = new Map();

// Set a timeout for inactive connections (30 minutes)
const CONNECTION_TIMEOUT = 30 * 60 * 1000;

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    let connectionId = generateUniqueId();
    let activeCode = null;
    
    // Set a timeout to close inactive connections
    let timeout = setTimeout(() => {
        ws.close();
    }, CONNECTION_TIMEOUT);
    
    function resetTimeout() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            ws.close();
        }, CONNECTION_TIMEOUT);
    }
    
    // Add connection to the map
    connections.set(connectionId, { ws, activeCode });
    
    ws.on('message', (message) => {
        resetTimeout();
        
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'create-code':
                    // Create a new share code
                    handleCreateCode(connectionId, data.code);
                    break;
                    
                case 'join-code':
                    // Join an existing share code
                    handleJoinCode(connectionId, data.code);
                    break;
                    
                case 'offer':
                    // Forward the offer to the receiver
                    forwardSignalingMessage(connectionId, 'offer', { offer: data.offer });
                    break;
                    
                case 'answer':
                    // Forward the answer to the sender
                    forwardSignalingMessage(connectionId, 'answer', { answer: data.answer });
                    break;
                    
                case 'ice-candidate':
                    // Forward ICE candidates
                    forwardSignalingMessage(connectionId, 'ice-candidate', { candidate: data.candidate });
                    break;
                    
                case 'download-complete':
                    // Notify sender that download is complete and release the code
                    handleDownloadComplete(connectionId);
                    break;
                    
                default:
                    console.warn('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            
            // Send error back to client
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket connection closed');
        
        // Clean up resources
        clearTimeout(timeout);
        
        // Remove from connections
        const connection = connections.get(connectionId);
        if (connection) {
            // If it had an active code, clean that up too
            if (connection.activeCode) {
                releaseCode(connection.activeCode);
            }
            
            connections.delete(connectionId);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
    
    // Handle creation of a new share code
    function handleCreateCode(connectionId, code) {
        console.log('Creating code:', code);
        
        // Check if code already exists
        if (codes.has(code)) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Kod zaten kullanımda, lütfen tekrar deneyin.'
            }));
            return;
        }
        
        // Store the code
        codes.set(code, {
            senderId: connectionId,
            receiverId: null,
            createdAt: Date.now()
        });
        
        // Update connection's active code
        const connection = connections.get(connectionId);
        if (connection) {
            connection.activeCode = code;
        }
        
        // Confirm code creation
        ws.send(JSON.stringify({
            type: 'code-created',
            code: code
        }));
    }
    
    // Handle joining an existing share code
    function handleJoinCode(connectionId, code) {
        console.log('Joining code:', code);
        
        // Check if code exists
        if (!codes.has(code)) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Geçersiz kod. Lütfen kodu kontrol edip tekrar deneyin.'
            }));
            return;
        }
        
        const codeInfo = codes.get(code);
        
        // Check if code is already in use by another receiver
        if (codeInfo.receiverId !== null) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Bu kod zaten kullanımda.'
            }));
            return;
        }
        
        // Update code with receiver ID
        codeInfo.receiverId = connectionId;
        
        // Update connection's active code
        const connection = connections.get(connectionId);
        if (connection) {
            connection.activeCode = code;
        }
        
        // Notify the sender that a receiver has connected
        const sender = connections.get(codeInfo.senderId);
        if (sender && sender.ws.readyState === WebSocket.OPEN) {
            sender.ws.send(JSON.stringify({
                type: 'receiver-connected'
            }));
        }
        
        // Confirm to the receiver
        ws.send(JSON.stringify({
            type: 'connected-to-sender'
        }));
    }
    
    // Forward signaling messages between peers
    function forwardSignalingMessage(fromConnectionId, messageType, data) {
        const connection = connections.get(fromConnectionId);
        
        if (!connection || !connection.activeCode) {
            return;
        }
        
        const codeInfo = codes.get(connection.activeCode);
        
        if (!codeInfo) {
            return;
        }
        
        // Determine the target connection ID
        const targetConnectionId = (fromConnectionId === codeInfo.senderId) 
            ? codeInfo.receiverId 
            : codeInfo.senderId;
        
        if (!targetConnectionId) {
            return;
        }
        
        // Get the target connection and send the message
        const targetConnection = connections.get(targetConnectionId);
        
        if (targetConnection && targetConnection.ws.readyState === WebSocket.OPEN) {
            targetConnection.ws.send(JSON.stringify({
                type: messageType,
                ...data
            }));
        }
    }
    
    // Handle download complete notification
    function handleDownloadComplete(connectionId) {
        const connection = connections.get(connectionId);
        
        if (!connection || !connection.activeCode) {
            return;
        }
        
        const codeInfo = codes.get(connection.activeCode);
        
        if (!codeInfo) {
            return;
        }
        
        // Notify the sender
        const sender = connections.get(codeInfo.senderId);
        if (sender && sender.ws.readyState === WebSocket.OPEN) {
            sender.ws.send(JSON.stringify({
                type: 'download-complete'
            }));
        }
        
        // Release the code
        releaseCode(connection.activeCode);
    }
    
    // Release a code
    function releaseCode(code) {
        if (codes.has(code)) {
            console.log('Releasing code:', code);
            codes.delete(code);
            
            // Update connections that were using this code
            connections.forEach((conn) => {
                if (conn.activeCode === code) {
                    conn.activeCode = null;
                }
            });
        }
    }
});

// Generate a unique ID for connections
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// Periodically clean up expired codes (older than 1 hour)
const CODE_EXPIRATION = 60 * 60 * 1000; // 1 hour
setInterval(() => {
    const now = Date.now();
    
    codes.forEach((info, code) => {
        if (now - info.createdAt > CODE_EXPIRATION) {
            console.log('Code expired:', code);
            
            // Notify the sender if still connected
            const sender = connections.get(info.senderId);
            if (sender && sender.ws.readyState === WebSocket.OPEN) {
                sender.ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Paylaşım kodunun süresi doldu.'
                }));
            }
            
            // Release the code
            codes.delete(code);
            
            // Update connections
            connections.forEach((conn) => {
                if (conn.activeCode === code) {
                    conn.activeCode = null;
                }
            });
        }
    });
}, 10 * 60 * 1000); // Check every 10 minutes

console.log(`WebSocket server started on port ${PORT}`);