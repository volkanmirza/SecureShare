// server.js
const https = require('https');
const http = require('http'); // http modülünü de ekleyelim
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto'); // Crypto modülünü ekle
const dotenv = require('dotenv');

dotenv.config();

// *** TURN Sunucu Ayarları ***
const TURN_SECRET = process.env.TURN_SECRET || "YourVerySecretTURNKey"; // Ortam değişkeninden alın veya güvenli bir şekilde ayarlayın
const TURN_TTL = 3600; // 1 saat (saniye cinsinden)
// --- End TURN Sunucu Ayarları ---

// *** TURN Credentials Fonksiyonu ***
function generateTurnCredentials(secret, ttlSeconds) {
  const unixTimeStamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${unixTimeStamp}`; // Kullanıcı adı sadece timestamp olacak
  const hmac = crypto.createHmac("sha1", secret);
  hmac.update(username);
  const credential = hmac.digest("base64");

  return {
    username,
    credential,
    ttl: ttlSeconds,
  };
}
// --- End TURN Credentials Fonksiyonu ---

// --- SSL Certificate Configuration ---
const certsPath = '/etc/ssl/foxfile.org'; // Directory for certificates
const keyPath = path.join(certsPath, 'foxfile.org.key');
const certPath = path.join(certsPath, 'foxfile.org.crt');

let options = {};
try {
    options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
} catch (error) {
    console.error("\n!!! SSL Sertifika Dosyaları Okunamadı !!!");
    console.error(`Lütfen '${keyPath}' ve '${certPath}' dosyalarının mevcut ve okunabilir olduğundan emin olun.`);
    console.error("Uygulama HTTP modunda 3000 portunda başlatılacak.\n");
    // Fallback to HTTP if certs are not found/readable
    options = null;
}
// --- End SSL Configuration ---

// Create server (HTTPS if certs loaded, otherwise HTTP)
const server = options 
    ? https.createServer(options, handleRequest) 
    : http.createServer(handleRequest); // HTTP modülünü kullan

// Request handler function (extracted for clarity)
function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url);
    let filePath = '.' + parsedUrl.pathname;
    
    // *** API Endpoint Handler ***
    if (parsedUrl.pathname === '/api/turn-credentials') {
        try {
            const credentials = generateTurnCredentials(TURN_SECRET, TURN_TTL);
            console.log("Generated TURN credentials requested:", credentials.username);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(credentials));
        } catch (error) {
            console.error("Error generating TURN credentials:", error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to generate TURN credentials" }));
        }
        return; // API isteği işlendi, dosya okumaya devam etme
    }
    // --- End API Endpoint Handler ---
    
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
}

// Set the port (Use 443 for HTTPS if available, else 3000 for HTTP fallback)
const PORT = options ? (process.env.PORT || 443) : (process.env.PORT || 3001);
const protocol = options ? 'https' : 'http';

server.listen(PORT, () => {
    console.log(`Server running at ${protocol}://localhost:${PORT}/`);
    if (!options) {
        console.log("(SSL sertifikaları yüklenemediği için HTTP modunda çalışıyor)");
    }
});

// --- YARDIMCI FONKSİYONLAR (BAĞLANTI ÖNCESİNE TAŞINDI) ---

// Generate a unique ID for connections
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

function notifyLocalPeersAboutNewSharer(newSharerId, sharerIp) {
    if (!sharerIp) {
         console.warn(`[${newSharerId}] Cannot notify peers about new sharer, IP is missing.`); // Yeni Log
         return; 
    }
    console.log(`[${newSharerId}] Notifying other local peers about new sharer...`); // Yeni Log
    const message = JSON.stringify({ type: 'local_peer_added', peerId: newSharerId });
     connections.forEach((clientInfo, clientId) => {
         if (clientId !== newSharerId && clientInfo.ip === sharerIp && clientInfo.ws.readyState === WebSocket.OPEN) {
             clientInfo.ws.send(message);
             // console.log(`Notified ${clientId} about local peer ${newSharerId} joining`); // Bu log zaten vardı
         }
     });
}

function notifyLocalPeersAboutSharerLeft(leftSharerId, sharerIp) {
    if (!sharerIp) {
         console.warn(`[${leftSharerId}] Cannot notify peers about leaving, IP is missing.`); // Yeni Log
         return; 
    }
    console.log(`[${leftSharerId}] Notifying other local peers about sharer leaving...`); // Yeni Log
    const message = JSON.stringify({ type: 'local_peer_removed', peerId: leftSharerId });
     connections.forEach((clientInfo, clientId) => {
         if (clientId !== leftSharerId && clientInfo.ip === sharerIp && clientInfo.ws.readyState === WebSocket.OPEN) {
             clientInfo.ws.send(message);
             // console.log(`Notified ${clientId} about local peer ${leftSharerId} leaving`); // Bu log zaten vardı
         }
     });
}

function handleLocalCodeRequest(requestingWs, targetPeerId) {
    // ... (fonksiyon içeriği aynı) ...
}

// --- BİTİŞ YARDIMCI FONKSİYONLAR ---

// WebSocket server for signaling
const wss = new WebSocket.Server({ server });

// Store active connections and their codes
const connections = new Map();
const codes = new Map();

// Set a timeout for inactive connections (30 minutes)
const CONNECTION_TIMEOUT = 30 * 60 * 1000;

console.log('WebSocket server attached to HTTP/HTTPS server...');

wss.on('connection', (ws, req) => {
    const connectionId = generateUniqueId(); // Veya uuidv4()
    ws.connectionId = connectionId; 

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    
    console.log(`Client connected: ${connectionId} from IP: ${ip}`);

    // Bağlantı bilgilerini sakla (IP ve varsayılan paylaşım durumu ile)
    const connectionInfo = { ws, activeCode: null, ip, isSharing: false, shareCode: null };
    connections.set(connectionId, connectionInfo);

    // --- YENİ: Aynı DIŞ IP'deki aktif paylaşımcıları ve KODLARINI bul ---
    const localPeersWithCodes = [];
    connections.forEach((peerInfo, peerId) => {
        // Kendisi değil, aynı dış IP, paylaşım yapıyor ve kodu var
        if (peerId !== connectionId && peerInfo.ip === ip && peerInfo.isSharing && peerInfo.shareCode) {
            localPeersWithCodes.push({ 
                id: peerId, 
                code: peerInfo.shareCode // Kodu listeye ekle
            }); 
        }
    });

    // Yeni istemciye listeyi (ID'ler ve Kodlar ile) gönder
    if (ws.readyState === WebSocket.OPEN) {
        // Farklı bir mesaj tipi kullanalım
        ws.send(JSON.stringify({ 
            type: 'local_peers_list_with_codes', // Yeni mesaj tipi
            peers: localPeersWithCodes 
        }));
        console.log(`Sent local peers list (with codes) to ${connectionId}:`, localPeersWithCodes);
    }
    // --- BİTİŞ: Yeni kod ---

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
    
    ws.on('message', (message) => {
        resetTimeout();
        const connectionId = ws.connectionId; // ID'yi dışarı alalım
        let connectionInfo = null; // connectionInfo'yu try dışında tanımla
        
        try {
            const messageString = message.toString();
            const data = JSON.parse(messageString);
            
            // connectionInfo'yu burada al ve hemen kontrol et
            connectionInfo = connections.get(connectionId);
            if (!connectionInfo) {
                console.error(`[${connectionId}] Received message but connection info not found!`);
                return; 
            }
            console.log(`[${connectionId}] Message received: ${messageString}`);
            console.log(`    Connection Info: IP=${connectionInfo.ip}, Sharing=${connectionInfo.isSharing}, Code=${connectionInfo.shareCode}`); // connectionInfo'yu logla
            
            switch (data.type) {
                case 'create-code':
                    // connectionInfo artık burada erişilebilir olmalı
                    handleCreateCode(connectionId, data.code);
                    break;
                    
                case 'join-code':
                    // connectionInfo artık burada erişilebilir olmalı
                    handleJoinCode(connectionId, data.code);
                    break;

                case 'get_local_peers':
                    console.log(`[${connectionId}] Received 'get_local_peers' request.`);
                    // connectionInfo artık burada erişilebilir olmalı
                    const currentIp = connectionInfo.ip; 
                    const updatedLocalPeers = [];
                    console.log(`[${connectionId}] Checking connections map (size: ${connections.size}) for peers with IP ${currentIp}...`); 
                    connections.forEach((peerInfo, peerId) => {
                        console.log(`    Checking Peer: ${peerId}, IP: ${peerInfo.ip}, isSharing: ${peerInfo.isSharing}, shareCode: ${peerInfo.shareCode}`); 
                        if (peerId !== connectionId && peerInfo.ip === currentIp && peerInfo.isSharing && peerInfo.shareCode) {
                            console.log(`        --> Adding peer ${peerId} to the list.`);
                            updatedLocalPeers.push({ 
                                id: peerId, 
                                code: peerInfo.shareCode 
                            }); 
                        }
                    });
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: 'local_peers_list_with_codes',
                            peers: updatedLocalPeers 
                        }));
                        console.log(`[${connectionId}] Sent updated local peers list:`, updatedLocalPeers);
                    }
                    break;

                case 'public-key':
                    console.log(`Forwarding public key from ${connectionId}`);
                    forwardMessage(connectionId, 'public-key', data.key);
                    break;

                case 'offer':
                case 'answer':
                case 'candidate':
                    console.log(`Forwarding WebRTC signal '${data.type}' from ${connectionId}`);
                    forwardMessage(connectionId, data.type, data.payload);
                    break;

                case 'metadata':
                    console.log('Encrypted metadata received, forwarding...');
                    forwardMessage(connectionId, 'metadata', data.data);
                    break;

                case 'file-chunk':
                    console.log('Encrypted file chunk received, forwarding...');
                    forwardMessage(connectionId, 'file-chunk', data.data);
                    break;
                    
                case 'download-complete':
                    // Notify sender that download is complete and release the code
                    handleDownloadComplete(connectionId);
                    break;
                    
                case 'request_local_code':
                     if (data.targetId) {
                          handleLocalCodeRequest(ws, data.targetId); // Dışarıdaki fonksiyonu çağır
                     }
                     break;
                    
                case 'cancel_share':
                    console.log(`[${connectionId}] Received 'cancel_share' request.`);
                    // connectionInfo burada zaten tanımlı ve kontrol edilmiş olmalı
                    if (connectionInfo.isSharing && connectionInfo.activeCode) { 
                        const codeToCancel = connectionInfo.activeCode; // Kodu bir değişkende tut
                        console.log(`[${connectionId}] Cancelling share for code ${codeToCancel}. Current state: isSharing=${connectionInfo.isSharing}, shareCode=${connectionInfo.shareCode}, activeCode=${connectionInfo.activeCode}`);
                        // releaseCode fonksiyonu durumu sıfırlamalı
                        releaseCode(codeToCancel, null); // Mantıksal iptal olduğu için ID null

                        // Kontrol amaçlı: releaseCode çağrıldıktan sonra durumu tekrar logla
                        const updatedInfo = connections.get(connectionId);
                        if (updatedInfo) {
                             console.log(`[${connectionId}] State AFTER releaseCode call: isSharing=${updatedInfo.isSharing}, shareCode=${updatedInfo.shareCode}, activeCode=${updatedInfo.activeCode}`);
                        } else {
                             console.log(`[${connectionId}] Connection info removed after releaseCode call? This shouldn't happen here.`);
                        }

                    } else {
                         console.warn(`[${connectionId}] Received 'cancel_share' but user is not sharing or has no active code.`);
                    }
                    break;
                    
                default:
                    console.warn(`[${connectionId}] Unknown message type:`, data.type);
            }
        } catch (error) {
            // ... (hata işleme - connectionInfo null olabilir) ...
            console.error(`[${connectionId || 'unknown'}] Error parsing message or processing:`, error);
            // Gelen ham mesajı da loglayalım (eğer string değilse bile)
            console.error(`    Raw message that caused error:`, message);
            
            // Send error back to client
            if (ws.readyState === WebSocket.OPEN) { // Hata göndermeden önce bağlantıyı kontrol et
                 ws.send(JSON.stringify({
                     type: 'error',
                     message: 'Invalid message format'
                 }));
            }
        }
    });
    
    ws.on('close', () => {
        const connectionId = ws.connectionId; // ID'yi al
        console.log(`[${connectionId}] WebSocket connection closed.`); // Log güncellendi

        clearTimeout(timeout);

        const closedConnectionInfo = connections.get(connectionId);
        if (closedConnectionInfo) {
            const wasSharing = closedConnectionInfo.isSharing;
            const clientIp = closedConnectionInfo.ip;
            const activeCode = closedConnectionInfo.activeCode;

            console.log(`[${connectionId}] Removing connection info. Was sharing: ${wasSharing}, Code: ${activeCode}, IP: ${clientIp}`);

            // Bağlantıyı Map'ten sil
            connections.delete(connectionId);

            // Eğer aktif bir kodu varsa, onu ve ilgili durumu temizle
            if (activeCode) {
                console.log(`[${connectionId}] Connection had active code ${activeCode}. Calling releaseCode.`);
                // releaseCode fonksiyonu isSharing durumunu sıfırlayacak
                releaseCode(activeCode, connectionId); // Kapandığı için ID'yi gönder
            }

            // Eğer paylaşım yapıyorduysa (ve belki kodu release edilemediyse bile), diğerlerini bilgilendir
            if (wasSharing) {
                 console.log(`[${connectionId}] Sharer disconnected. Notifying local peers on IP ${clientIp}.`);
                 notifyLocalPeersAboutSharerLeft(connectionId, clientIp);
            }
        } else {
             console.warn(`[${connectionId}] Connection info not found during close event.`);
        }
    });
    
    ws.on('error', (error) => {
        const connectionId = ws.connectionId;
        console.error(`[${connectionId || 'unknown'}] WebSocket error:`, error);
        // Hata durumunda da temizle
        const errorConnectionInfo = connections.get(connectionId);
        if (errorConnectionInfo) {
             const wasSharingOnError = errorConnectionInfo.isSharing;
             const clientIpOnError = errorConnectionInfo.ip;
             const activeCodeOnError = errorConnectionInfo.activeCode;
             console.log(`[${connectionId}] Removing connection info due to error. Was sharing: ${wasSharingOnError}, Code: ${activeCodeOnError}, IP: ${clientIpOnError}`); // Detaylı log
             connections.delete(connectionId);
             if (activeCodeOnError) {
                  releaseCode(activeCodeOnError, connectionId);
             }
             if (wasSharingOnError) {
                  notifyLocalPeersAboutSharerLeft(connectionId, clientIpOnError);
             }
        }
         if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
             ws.terminate();
         }
    });
    
    // Handle creation of a new share code
    function handleCreateCode(connId, code) {
        console.log(`[${connId}] Handling create-code for code: ${code}`);
        const connectionInfo = connections.get(connId);

        if (!connectionInfo) {
             console.error(`[${connId}] Cannot create code: Connection info not found!`);
             return;
        }
        
        // Check if code already exists
        if (codes.has(code)) {
            console.warn(`[${connId}] Code ${code} already exists.`);
            connectionInfo.ws.send(JSON.stringify({
                type: 'error',
                message: 'Kod zaten kullanımda, lütfen tekrar deneyin.'
            }));
            return;
        }
        
        // Store the code mapping
        codes.set(code, {
            senderId: connId,
            receiverId: null,
            createdAt: Date.now()
        });
        
        // --- ÖNEMLİ GÜNCELLEME --- 
        // Update the connection's info in the connections Map
        connectionInfo.activeCode = code;
        connectionInfo.isSharing = true; // Paylaşım durumunu true yap
        connectionInfo.shareCode = code;  // Paylaşım kodunu sakla
        console.log(`[${connId}] Updated connection info: isSharing=${connectionInfo.isSharing}, shareCode=${connectionInfo.shareCode}, activeCode=${connectionInfo.activeCode}`);
        // --- BİTİŞ ÖNEMLİ GÜNCELLEME --- 
        
        // Confirm code creation to the client
        connectionInfo.ws.send(JSON.stringify({
            type: 'code-created',
            code: code
        }));

        // Notify other local peers
        console.log(`[${connId}] Notifying other local peers about new sharer...`);
        notifyLocalPeersAboutNewSharer(connId, connectionInfo.ip);
    }
    
    // Handle joining an existing share code
    function handleJoinCode(connId, code) {
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
        codeInfo.receiverId = connId;
        
        // Update connection's active code
        const connection = connections.get(connId);
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
    
    // Forward messages between peers
    function forwardMessage(fromConnId, messageType, data) {
        const connection = connections.get(fromConnId);
        
        if (!connection || !connection.activeCode) {
            console.log(`Cannot forward: Connection ${fromConnId} not found or has no active code.`);
            return;
        }
        
        const codeInfo = codes.get(connection.activeCode);
        
        if (!codeInfo) {
            console.log(`Cannot forward: Code info for ${connection.activeCode} not found.`);
            return;
        }
        
        // Determine the target connection ID
        let targetId = null;
        if (codeInfo.senderId === fromConnId && codeInfo.receiverId) {
            targetId = codeInfo.receiverId;
        } else if (codeInfo.receiverId === fromConnId && codeInfo.senderId) {
            targetId = codeInfo.senderId;
        }

        if (!targetId) {
            console.log(`Cannot forward: Target ID not found for code ${connection.activeCode}.`);
            return; // No target to forward to yet
        }
        
        const targetConnection = connections.get(targetId);
        if (targetConnection && targetConnection.ws.readyState === WebSocket.OPEN) {
            console.log(`Forwarding message type '${messageType}' from ${fromConnId} to ${targetId}`);
            targetConnection.ws.send(JSON.stringify({
                type: messageType,
                data: data
            }));
        } else {
            console.log(`Cannot forward: Target connection ${targetId} not found or not open.`);
            // Optionally notify the sender that the recipient is disconnected?
            // Or handle this via ws.on('close') cleanup.
        }
    }
    
    // Handle download complete notification
    function handleDownloadComplete(connId) {
        const connection = connections.get(connId);
        
        if (!connection || !connection.activeCode) {
            console.log(`Download complete signal from unknown/inactive connection ${connId}`);
            return;
        }
        
        const codeInfo = codes.get(connection.activeCode);
        
        if (!codeInfo) {
            console.log(`Download complete signal for unknown code ${connection.activeCode}`);
            return;
        }

        // Ensure message is from the receiver
        if (codeInfo.receiverId !== connId) {
            console.warn(`Download complete signal received from sender (${connId}) instead of receiver for code ${connection.activeCode}. Ignoring.`);
            return;
        }

        console.log(`Download complete for code ${connection.activeCode}, notifying sender ${codeInfo.senderId}`);

        // Notify the sender
        const sender = connections.get(codeInfo.senderId);
        if (sender && sender.ws.readyState === WebSocket.OPEN) {
            sender.ws.send(JSON.stringify({
                type: 'download-complete'
            }));
        }

        // Clean up the code immediately after completion notification
        releaseCode(connection.activeCode);
    }
    
    // Release a code
    function releaseCode(code, closedConnectionId = null) { // closedConnectionId: hangi bağlantının kapandığını belirtir
        if (codes.has(code)) {
            const codeInfo = codes.get(code);
            console.log(`[${closedConnectionId || 'Logic'}] Releasing code ${code}. Current codes map size: ${codes.size}`);

            const senderId = codeInfo.senderId;
            const receiverId = codeInfo.receiverId;
            codes.delete(code); // Kodu sil
            console.log(`[${closedConnectionId || 'Logic'}] Code ${code} deleted from codes map. New size: ${codes.size}`);

            // Göndericinin durumunu sıfırla (eğer hala bağlıysa)
            const sender = connections.get(senderId);
            // Sadece kodla eşleşiyorsa sıfırla (başka bir kod almış olabilir)
            if (sender && sender.activeCode === code) {
                console.log(`[${closedConnectionId || 'Logic'}] Found sender ${senderId} for code ${code}. Resetting its status...`); // Log eklendi
                console.log(`    BEFORE Reset: isSharing=${sender.isSharing}, shareCode=${sender.shareCode}, activeCode=${sender.activeCode}`); // Log eklendi
                sender.activeCode = null;
                sender.isSharing = false; // Paylaşımı DURDUR
                sender.shareCode = null;
                console.log(`    AFTER Reset: isSharing=${sender.isSharing}, shareCode=${sender.shareCode}, activeCode=${sender.activeCode}`); // Log eklendi

                if (closedConnectionId === null) {
                     console.log(`[Logic] Code released logically. Notifying peers about sender ${senderId} stopping share.`);
                     notifyLocalPeersAboutSharerLeft(senderId, sender.ip);
                }
            } else if (sender && sender.activeCode !== code) {
                 console.log(`[${closedConnectionId || 'Logic'}] Sender ${senderId} found but has different active code (${sender.activeCode}). Not resetting status for code ${code}.`);
            } else if (!sender) {
                console.log(`[${closedConnectionId || 'Logic'}] Sender ${senderId} not found in connections map.`);
            }

            // Alıcının durumunu sıfırla (eğer hala bağlıysa)
            const receiver = connections.get(receiverId);
            if (receiver && receiver.activeCode === code) {
                console.log(`[${closedConnectionId || 'Logic'}] Resetting activeCode for receiver ${receiverId}`);
                receiver.activeCode = null;
            } else if (receiver && receiver.activeCode !== code) {
                 console.log(`[${closedConnectionId || 'Logic'}] Receiver ${receiverId} found but has different active code (${receiver.activeCode}). Not resetting activeCode for code ${code}.`);
            } else if (receiverId && !receiver) { // receiverId null değilse ama bağlantı yoksa
                console.log(`[${closedConnectionId || 'Logic'}] Receiver ${receiverId} not found in connections map.`);
            }

        } else {
             console.warn(`[${closedConnectionId || 'Logic'}] Attempted to release non-existent code: ${code}`);
        }
    }
});

// Periodically clean up expired codes (older than 1 hour)
const CODE_EXPIRATION = 60 * 60 * 1000; // 1 hour
setInterval(() => {
    const now = Date.now();
    
    codes.forEach((info, code) => {
        if (now - info.createdAt > CODE_EXPIRATION) {
            console.log('[Expired Code Cleanup] Code expired:', code);
            
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