// client.js - Client-side JavaScript for P2P file sharing application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize language and theme settings
    if (window.appConfig) {
        window.appConfig.initializeSettings();
        
        // Set up theme toggle button
        const themeToggleBtn = document.getElementById('theme-toggle');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', function() {
                window.appConfig.toggleTheme();
                updateThemeIcon();
            });
            
            // Update theme icon based on current theme
            updateThemeIcon();
        }
        
        // Set up language toggle button
        const languageToggleBtn = document.getElementById('language-toggle');
        if (languageToggleBtn) {
            languageToggleBtn.addEventListener('click', function() {
                window.appConfig.toggleLanguage();
            });
        }
    }
    
    // Update theme icon based on current theme
    function updateThemeIcon() {
        const themeToggleBtn = document.getElementById('theme-toggle');
        if (!themeToggleBtn) return;
        
        const currentTheme = localStorage.getItem('preferredTheme') || 
                            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        if (currentTheme === 'dark') {
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }
    
    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const filePrompt = document.getElementById('file-prompt');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const fileIcon = document.getElementById('file-icon');
    const shareBtn = document.getElementById('share-btn');
    const shareResult = document.getElementById('share-result');
    const shareCode = document.getElementById('share-code');
    const copyBtn = document.getElementById('copy-btn');
    const statusSender = document.getElementById('status-sender');
    
    const receiveCode = document.getElementById('receive-code');
    const receiveBtn = document.getElementById('receive-btn');
    const downloadStatus = document.getElementById('download-status');
    const downloadIcon = document.getElementById('download-icon');
    const downloadMessage = document.getElementById('download-message');
    const progressContainer = document.getElementById('progress-container');
    const fileInfo = document.getElementById('file-info');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const downloadBtn = document.getElementById('download-btn');
    const toast = document.getElementById('toast');
    
    const qrcodeContainer = document.getElementById('qrcode-container'); // QR Code container
    const qrcodePrompt = document.getElementById('qrcode-prompt'); // QR Code prompt text
    const qrcodeElement = document.getElementById('qrcode'); // Actual QR code element
    
    const successPopup = document.getElementById('success-popup');
    const successPopupMessage = document.getElementById('success-popup-message');
    const successPopupOkBtn = document.getElementById('success-popup-ok-btn');
    
    // WebSocket connection
    let socket = null;
    let sharedKey = null; // <-- Add variable for shared secret key
    let keyPair = null; // <-- Add variable for own key pair
    
    // WebRTC Variables
    let peerConnection = null;
    let dataChannel = null;
    let selectedFile = null;
    let fileReader = null;
    let receivedSize = 0;
    let receivedData = [];
    let sendingProgress = 0;
    let receivingInProgress = false;
    
    // --- Start: Added for multi-channel ---
    const NUM_CHANNELS = 4; // Number of data channels for parallel transfer
    let isAborting = false; // <<< MOVED Global abort flag HERE
    let transferCompleteFlag = false; // <<< MOVED Global completion flag HERE
    let dataChannels = []; // Array to hold all data channels
    let openDataChannels = 0; // Counter for open data channels
    let channelStates = []; // To track readiness of each channel for sending
    let receiveBuffers = {}; // To store received chunks per segment { segmentIndex: { chunkIndex: data } }
    let segmentStatus = {}; // To track received chunks per segment { segmentIndex: { received: count, total: count, buffer: [] } }
    let totalSegments = 0; // Total segments expected
    let segmentsReceived = 0; // Count of fully received segments
    
    // Global değişkenler - segment yönetimi için
    let segmentOffsets = []; // Kanal başına segment offset değerleri
    let segmentEndOffsets = []; // Kanal başına segment bitiş offset değerleri
    let currentChunkIndices = []; // Kanal başına chunk indeksleri
    let totalChunksPerSegment = []; // Kanal başına toplam chunk sayısı
    let totalFileSize = 0; // Toplam dosya boyutu
    let errorCounts = []; // Her kanal için hata sayacı
    // --- End: Added for multi-channel ---
    
    // File metadata
    let fileMetadata = {
        name: '',
        size: 0,
        type: ''
    };
    
    // Constants
    const CHUNK_SIZE = 16384; // 16KB chunks
    const CODE_LENGTH = 6;
    const WS_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1' 
        ? 'ws://' + location.host
        : 'wss://' + location.host;
    const RTC_CONFIGURATION = window.appConfig ? window.appConfig.getRTCConfiguration() : { iceServers: [] }; // Get from config
    
    // --- Start: Base64 Helper Functions ---
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
    // --- End: Base64 Helper Functions ---

    // --- Start: Crypto Helper Functions ---
    async function generateKeyPair() {
        return await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true, // exportable
            ["deriveKey"]
        );
    }

    async function exportPublicKey(key) {
        const exported = await crypto.subtle.exportKey("spki", key);
        return exported; // ArrayBuffer
    }

    async function importPublicKey(keyData) {
        return await crypto.subtle.importKey(
            "spki",
            keyData,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );
    }

    async function deriveSharedKey(privateKey, publicKey) {
        return await crypto.subtle.deriveKey(
            { name: "ECDH", public: publicKey },
            privateKey,
            { name: "AES-GCM", length: 256 },
            true, // extractable
            ["encrypt", "decrypt"]
        );
    }

    async function encryptData(key, data) {
        try {
        const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM recommended IV size
        const encodedData = new TextEncoder().encode(JSON.stringify(data)); // Ensure data is ArrayBuffer
            
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encodedData
        );
            
            // ArrayBuffer'ları Base64 formatına çevir (JSON-safe)
            return { 
                iv: Array.from(iv), // Uint8Array'i düz diziye çevir
                ciphertext: Array.from(new Uint8Array(ciphertext)) // ArrayBuffer'ı düz diziye çevir
            };
        } catch (error) {
            console.error("Encryption error:", error);
            throw error;
        }
    }

    async function decryptData(key, iv, ciphertext) {
        try {
            // Gelen verileri Uint8Array'e çevir
            let ivArray, ciphertextArray;
            
            // iv ve ciphertext'in tipleri farklı olabilir
            if (Array.isArray(iv)) {
                ivArray = new Uint8Array(iv);
            } else if (iv instanceof Uint8Array) {
                ivArray = iv;
            } else if (iv instanceof ArrayBuffer) {
                ivArray = new Uint8Array(iv);
            } else {
                throw new Error("IV is not in a valid format");
            }
            
            if (Array.isArray(ciphertext)) {
                ciphertextArray = new Uint8Array(ciphertext);
            } else if (ciphertext instanceof Uint8Array) {
                ciphertextArray = ciphertext;
            } else if (ciphertext instanceof ArrayBuffer) {
                ciphertextArray = new Uint8Array(ciphertext);
            } else {
                throw new Error("Ciphertext is not in a valid format");
            }

            const decryptedData = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivArray },
                key,
                ciphertextArray
            );
            
            // Şifresi çözülen verileri string'e ve sonra JSON'a çevir
            try {
            const decodedText = new TextDecoder().decode(decryptedData);
            return JSON.parse(decodedText);
            } catch (parseError) {
                console.error("Error parsing decrypted data:", parseError);
                throw new Error("Decrypted data could not be parsed as JSON");
            }
        } catch (error) {
            console.error("Decryption failed:", error);
            showToast(getTranslation('decryptionError'), true);
            return null;
        }
    }
    
    // Chunk şifreleme/çözme işlemlerini de güncelleyelim    
    async function encryptChunk(key, chunk) {
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            // chunk is already an ArrayBuffer from FileReader
            const ciphertext = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                key,
                chunk
            );
            
            // Düz dizilere çevirerek JSON-safe yap
            return { 
                iv: Array.from(iv), 
                ciphertext: Array.from(new Uint8Array(ciphertext))
            };
        } catch (error) {
            console.error("Chunk encryption error:", error);
            throw error;
        }
    }

     async function decryptChunk(key, iv, ciphertext) {
        try {
            // Gelen verileri Uint8Array'e çevir
            let ivArray, ciphertextArray;
            
            if (Array.isArray(iv)) {
                ivArray = new Uint8Array(iv);
            } else if (iv instanceof Uint8Array) {
                ivArray = iv;
            } else if (iv instanceof ArrayBuffer) {
                ivArray = new Uint8Array(iv);
            } else {
                throw new Error("IV is not in a valid format for chunk");
            }
            
            if (Array.isArray(ciphertext)) {
                ciphertextArray = new Uint8Array(ciphertext);
            } else if (ciphertext instanceof Uint8Array) {
                ciphertextArray = ciphertext;
            } else if (ciphertext instanceof ArrayBuffer) {
                ciphertextArray = new Uint8Array(ciphertext);
            } else {
                throw new Error("Ciphertext is not in a valid format for chunk");
            }

            const decryptedChunk = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivArray },
                key,
                ciphertextArray
            );
            
            return decryptedChunk; // ArrayBuffer olarak döndür
        } catch (error) {
            console.error("Chunk decryption failed:", error);
            showToast(getTranslation('decryptionError'), true);
            return null;
        }
    }
    // --- End: Crypto Helper Functions ---
    
    // --- Start: Handle Code from URL Parameter ---
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const codeFromUrl = urlParams.get('code');
        if (codeFromUrl && receiveCode && receiveBtn) {
            console.log(`Code found in URL: ${codeFromUrl}`);
            receiveCode.value = codeFromUrl.trim().toUpperCase();
            showToast(getTranslation('codeReceivedFromUrl')); // Optional: Notify user

            // Automatically attempt to connect after a short delay 
            // to ensure WebSocket is likely ready and UI updates are visible
            setTimeout(() => {
                if (receiveBtn.disabled === false) { // Only click if not already disabled
                    console.log('Auto-clicking connect button...');
                    receiveBtn.click();
                }
            }, 500); // 500ms delay
        }
    } catch (e) {
        console.error("Error processing URL parameters:", e);
    }
    // --- End: Handle Code from URL Parameter ---
    
    // Initialize WebSocket connection
    function initWebSocket() {
        if (socket !== null) {
            socket.close();
        }
        
        socket = new WebSocket(WS_URL);
        
        socket.onopen = function() {
            console.log('WebSocket connection established');
        };
        
        socket.onmessage = async function(event) { // <-- Make async
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'code-created':
                    shareCode.value = message.code;
                    showToast(getTranslation('codeCreated'));
                    shareResult.classList.remove('hidden');
                    statusSender.textContent = getTranslation('waitingForReceiver');
                    // Generate keys *after* code is confirmed created
                    try {
                    keyPair = await generateKeyPair();
                    console.log("Sender keys generated.");
                    } catch (keyGenError) {
                         console.error("Sender key generation failed:", keyGenError);
                         showToast(getTranslation('keyGenerationError'), true);
                         resetUI();
                         return; // Stop further processing
                    }

                    // --- Generate and Display QR Code ---
                    if (qrcodeContainer && qrcodeElement && qrcodePrompt && typeof QRCode !== 'undefined') {
                        try {
                            // Construct the share URL
                            const shareUrl = `${window.location.origin}${window.location.pathname}?code=${message.code}`;
                            console.log(`Generating QR code for URL: ${shareUrl}`);
                            
                            // Clear previous QR code if any
                            qrcodeElement.innerHTML = ''; 
                            
                            // Generate new QR code
                            new QRCode(qrcodeElement, {
                                text: shareUrl,
                                width: 128,
                                height: 128,
                                colorDark : "#000000",
                                colorLight : "#ffffff",
                                correctLevel : QRCode.CorrectLevel.H
                            });
                            qrcodeContainer.classList.remove('hidden'); // Ensure container is visible
                            qrcodePrompt.classList.remove('hidden'); // Ensure prompt is visible
                            // Apply translation to prompt just in case it wasn't caught initially
                            qrcodePrompt.textContent = getTranslation('scanQrCodePrompt');
                        } catch (error) {
                            console.error("Error generating QR Code:", error);
                            qrcodeElement.innerHTML = 'QR Code generation failed.'; // Show error message
                            qrcodeContainer.classList.remove('hidden'); // Still show container for error message
                            qrcodePrompt.classList.add('hidden'); // Hide prompt on error
                        }
                    } else {
                        console.warn("QR code elements or library not found.");
                    }
                    // --- End QR Code Generation ---
                    break;
                    
                case 'receiver-connected': // Received by sender
                    statusSender.textContent = getTranslation('receiverConnectedInitiatingKeyExchange');
                    // Sender exports and sends public key as Base64
                     if (keyPair && keyPair.publicKey) {
                        const exportedPublicKey = await exportPublicKey(keyPair.publicKey);
                        const exportedPublicKeyBase64 = arrayBufferToBase64(exportedPublicKey); // <-- Convert to Base64
                        console.log("Sender sending public key (Base64)");
                        socket.send(JSON.stringify({
                            type: 'public-key',
                            key: exportedPublicKeyBase64 // <-- Send Base64 string
                        }));
                        // WebRTC connection will now be initiated AFTER successful key exchange
                        // in the 'public-key' message handler.
                    } else {
                         console.error("Sender key pair not ready.");
                         showToast(getTranslation('keyGenerationError'), true);
                         resetUI();
                    }
                    break;
                    
                case 'connected-to-sender': // Received by receiver
                    downloadStatus.classList.remove('hidden');
                    downloadMessage.textContent = getTranslation('connectedToSenderInitiatingKeyExchange');
                    // Receiver generates keys and sends public key back as Base64
                    try {
                    keyPair = await generateKeyPair();
                    console.log("Receiver keys generated.");
                    } catch (keyGenError) {
                         console.error("Receiver key generation failed:", keyGenError);
                         showToast(getTranslation('keyGenerationError'), true);
                         resetUI();
                         return; // Stop further processing
                    }
                    
                     if (keyPair && keyPair.publicKey) {
                        const exportedPublicKey = await exportPublicKey(keyPair.publicKey);
                        const exportedPublicKeyBase64 = arrayBufferToBase64(exportedPublicKey); // <-- Convert to Base64
                        console.log("Receiver sending public key (Base64)");
                        socket.send(JSON.stringify({
                            type: 'public-key',
                            key: exportedPublicKeyBase64 // <-- Send Base64 string
                        }));
                    } else {
                         console.error("Receiver key pair not ready.");
                         showToast(getTranslation('keyGenerationError'), true);
                         resetUI();
                     }
                    break;

                 case 'public-key': // Received by both sender and receiver
                    console.log("Received public key (Base64) from peer.");
                    let remotePublicKey = null; // Define outside try block for logging
                    try {
                         // Read the key from message.data (as forwarded by the server)
                         if (!message.data) { // Check if message.data exists
                             console.error("Public key message received without 'data' field.", message);
                             throw new Error("Invalid public key message format from server");
                         }
                         const remotePublicKeyData = base64ToArrayBuffer(message.data); // <-- Read from message.data again
                         remotePublicKey = await importPublicKey(remotePublicKeyData); // Assign here

                         // LOGGING ADDED HERE
                         console.log("Attempting to derive shared key. Sender's keyPair:", keyPair); 
                         console.log("Imported remotePublicKey:", remotePublicKey);

                         if (keyPair && keyPair.privateKey && remotePublicKey) {
                             sharedKey = await deriveSharedKey(keyPair.privateKey, remotePublicKey);
                             console.log("Shared key derived successfully.");

                             // Key exchange complete.
                              if (selectedFile) { // Sender side: Initiate PeerConnection NOW
                                  statusSender.textContent = getTranslation('secureConnectionEstablishedSending'); // Update status
                                  
                                  // --- Start: ADDED WebRTC Connection Initiation HERE ---
                                  try {
                                      console.log("Sender: Key exchange complete, creating PeerConnection...");
                                      await createPeerConnection(true); // Create connection as initiator
                                      if (!peerConnection) throw new Error("PeerConnection creation failed after key exchange");
                                      console.log("Sender: PeerConnection created. Creating offer...");
                                      const offer = await peerConnection.createOffer();
                                      console.log("Sender: Offer created. Setting local description...");
                                      await peerConnection.setLocalDescription(offer);
                                      console.log("Sender: Local description set. Sending offer...");
                                      socket.send(JSON.stringify({ type: 'offer', payload: offer }));
                                  } catch (rtcError) {
                                      console.error("Error initiating WebRTC connection after key exchange:", rtcError);
                                      showToast(getTranslation('peerConnectionError'), true);
                                      abortTransfer(); // Use abortTransfer to clean up WebRTC attempts
                                  }
                                  // --- End: ADDED WebRTC Connection Initiation HERE ---
                                  
                              } else { // Receiver side
                                  downloadMessage.textContent = getTranslation('secureConnectionEstablishedWaiting'); // Update status
                                  // Receiver now waits for the 'offer' message.
                              }
                         } else {
                            // ERROR OCCURS HERE
                             console.error("Could not derive shared key. Own keys or remote key missing/invalid.");
                             showToast(getTranslation('keyExchangeError'), true);
                             resetUI();
                         }
                     } catch (error) {
                         console.error("Error processing received public key:", error);
                         showToast(getTranslation('keyExchangeError'), true);
                         resetUI();
                     }
                    break;
                    
                // --- Start: New WebRTC Signaling Handlers ---
                case 'offer': // Received by Receiver
                    console.log("Received offer from sender.");
                    if (!keyPair || !sharedKey || peerConnection) { // Don't proceed if keys missing or connection already exists
                        console.error("Cannot process offer: Keys missing or connection already exists.", { keyPair, sharedKey, peerConnection });
                        return;
                    }
                    try {
                        console.log("Receiver: Received offer. Creating PeerConnection...");
                        await createPeerConnection(false); // Create connection as receiver
                        if (!peerConnection) throw new Error("PeerConnection creation failed on receiver");
                        console.log("Receiver: PeerConnection created. Setting remote description (offer)...");
                        // Read offer payload from message.data (forwarded by server)
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data)); 
                        console.log("Receiver: Remote description (offer) set. Creating answer...");
                        const answer = await peerConnection.createAnswer();
                        console.log("Receiver: Answer created. Setting local description (answer)...");
                        await peerConnection.setLocalDescription(answer);
                        console.log("Receiver: Local description (answer) set. Sending answer...");
                        // Send answer with payload field
                        socket.send(JSON.stringify({ type: 'answer', payload: answer })); 

                    } catch (rtcError) {
                        console.error("Error handling offer or creating answer:", rtcError);
                        showToast(getTranslation('peerConnectionError'), true);
                        abortTransfer();
                    }
                    break;

                case 'answer': // Received by Sender
                    console.log("Received answer from receiver.");
                    if (!peerConnection || !peerConnection.localDescription) { // Ensure connection and local offer exist
                         console.error("Cannot process answer: PeerConnection or local description missing.");
                         return;
                    }
                     try {
                         console.log("Sender: Received answer. Setting remote description (answer)...");
                         // Read answer payload from message.data (forwarded by server)
                         await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data)); 
                         console.log("Sender: Remote description (answer) set. Connection should establish.");
                         // ICE candidates will continue to be exchanged.
                         // Data channels will open soon.
                     } catch (rtcError) {
                         console.error("Error setting remote description (answer):", rtcError);
                         showToast(getTranslation('peerConnectionError'), true);
                         abortTransfer();
                     }
                    break;

                case 'candidate': // Received by Both
                    // console.log("Received ICE candidate:", message.payload);
                    if (!peerConnection) {
                         console.warn("Received ICE candidate but PeerConnection does not exist.");
                         return;
                    }
                     try {
                         // Add candidate only if remote description is set (or sometimes before, check WebRTC docs)
                         if (peerConnection.remoteDescription) {
                              // Read candidate payload from message.data (forwarded by server)
                              await peerConnection.addIceCandidate(new RTCIceCandidate(message.data)); 
                              // console.log("ICE candidate added.");
                         } else {
                             // Queue candidate? For simplicity, we might ignore candidates received too early.
                             console.warn("Received ICE candidate before remote description was set. Ignoring for now.");
                         }
                     } catch (error) {
                         // Ignore benign errors like candidate failing to apply after close
                         if (!peerConnection || peerConnection.signalingState === 'closed') {
                              console.log("Ignoring ICE candidate error after connection closed.");
                         } else {
                              console.error("Error adding received ICE candidate:", error);
                              // Consider if this warrants an abortTransfer()
                         }
                     }
                    break;

                case 'error':
                    showToast(message.message, true);
                    resetUI();
                    break;

                case 'metadata': // Needs decryption
                    if (!sharedKey) {
                        console.error("Received metadata but no shared key available.");
                        showToast(getTranslation('keyExchangeError'), true);
                        resetUI(); return;
                    }
                     console.log("Received encrypted metadata", message.data);
                    const decryptedMetadata = await decryptData(sharedKey, message.data.iv, message.data.ciphertext);

                    if (decryptedMetadata) {
                        fileMetadata.name = decryptedMetadata.name;
                        fileMetadata.size = decryptedMetadata.size;
                        fileMetadata.type = decryptedMetadata.type;
                        downloadMessage.textContent = getTranslation('receivingFile') + ' 0%';
                        progressContainer.classList.remove('hidden');
                        receivingInProgress = true;
                        receivedData = []; // Reset received data
                        receivedSize = 0; // Reset received size
                         console.log("Decrypted metadata:", fileMetadata);
                     } else {
                        console.error("Failed to decrypt metadata.");
                        // Error handling already in decryptData
                    }
                    break;

                case 'file-chunk': // Needs decryption
                    if (!receivingInProgress || !sharedKey) {
                        console.warn('Received file chunk unexpectedly or without shared key.');
                        return;
                    }

                     // Data contains { iv, ciphertext }
                    const decryptedChunk = await decryptChunk(sharedKey, message.data.iv, message.data.ciphertext);

                    if (decryptedChunk) {
                        receivedData.push(new Uint8Array(decryptedChunk)); // Store decrypted chunk
                        receivedSize += decryptedChunk.byteLength;

                        const progress = Math.round((receivedSize / fileMetadata.size) * 100);
                        downloadMessage.textContent = `${getTranslation('receivingFile')} ${progress}%`;
                        progressBar.style.width = `${progress}%`;
                        progressPercent.textContent = `${progress}%`;

                        if (receivedSize >= fileMetadata.size) { // Use >= for safety
                             console.log('File received successfully (decrypted)');
                             // Ensure all data is processed if receivedSize slightly exceeds due to chunking
                             if (receivedSize > fileMetadata.size) {
                                 console.warn(`Received size (${receivedSize}) exceeds metadata size (${fileMetadata.size}).`);
                                 // If trimming is needed, it might be complex. Assuming exact size for now.
                             }
                             receivedSize = fileMetadata.size; // Correct the size if needed

                             downloadMessage.textContent = getTranslation('transferComplete'); // Update message
                             // downloadBtn.classList.remove('hidden'); // REMOVED: Don't show the button

                             try {
                                  console.log(`Creating Blob with type: ${fileMetadata.type || 'application/octet-stream'}, size: ${receivedSize}`);
                                  const blob = new Blob(receivedData, { type: fileMetadata.type || 'application/octet-stream' });
                                  const url = window.URL.createObjectURL(blob);
                                  console.log(`Blob URL created: ${url}`);
                                  
                                  // --- Auto Download --- 
                                  const tempLink = document.createElement('a');
                                  tempLink.href = url;
                                  tempLink.download = fileMetadata.name;
                                  document.body.appendChild(tempLink); // Required for Firefox
                                  console.log(`Triggering auto-download for: ${fileMetadata.name}`);
                                  tempLink.click();
                                  document.body.removeChild(tempLink);
                                  
                                  // Revoke URL after a short delay
                                  setTimeout(() => {
                                      window.URL.revokeObjectURL(url);
                                      console.log(`Blob URL revoked: ${url}`);
                                  }, 1000); // 1 second delay
                                  // --- End Auto Download ---

                                  // Show success popup to receiver
                                  showSuccessPopup(getTranslation('downloadSuccessReceiver'));

                             } catch(error) {
                                 console.error("Error creating Blob, Object URL or triggering download:", error);
                                 showToast(getTranslation('downloadSetupError'), true);
                                 resetUI();
                                 return; // Stop further processing
                             }

                            receivingInProgress = false;

                            // Notify sender that download is complete
                            socket.send(JSON.stringify({ type: 'download-complete' }));
                        }
                     } else {
                         console.error("Failed to decrypt chunk.");
                         // Handle chunk decryption error - maybe request resend? For now, stop receiving.
                         showToast(getTranslation('transferError'), true);
                         resetUI();
                    }
                    break;

                case 'download-complete': // Received by sender
                     // Clean up keys
                     sharedKey = null;
                     keyPair = null;
                     
                     // Transfer işlemini tamamlandı olarak işaretle
                     transferCompleteFlag = true;
                     
                     // Show success popup instead of toast
                     showSuccessPopup(getTranslation('transferSuccessPrompt')); 

                     break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        };
        
        socket.onclose = function() {
            console.log('WebSocket connection closed');
            // Clean up cryptographic keys on close/error
             sharedKey = null;
             keyPair = null;
             // Check if downloadBtn exists before accessing its classList
             if (downloadBtn && !downloadBtn.classList.contains('hidden')) {
                 // Don't reset if download is ready
                 console.log('WebSocket closed, but download is ready. Not resetting UI.');
             } else {
                 // If download button doesn't exist or is hidden, safe to consider resetting
                 // resetUI(); // Still might want to avoid automatic reset on close
                 console.log('WebSocket closed. Download not ready or button non-existent.');
             }
        };
        
        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
            showToast(getTranslation('connectionError'), true);
             // Clean up cryptographic keys on close/error
             sharedKey = null;
             keyPair = null;
             resetUI();
        };
    }
    
    // Get translation based on current language
    function getTranslation(key) {
        // Ensure appConfig and translations are loaded
         if (!window.appConfig || !window.appConfig.translations) {
             console.warn('Translations not available yet.');
             return key; // Return the key itself as fallback
         }
        
        const currentLang = localStorage.getItem('preferredLanguage') || 
                           window.appConfig.getPreferredLanguage(); // Use the exposed function
        
         // Access translations via window.appConfig
         return window.appConfig.translations[currentLang]?.[key] || key; // Use optional chaining and return key as fallback
    }
    
    // Create a secure random code
    function generateSecureCode() {
        const array = new Uint32Array(CODE_LENGTH / 2);
        crypto.getRandomValues(array);
        return Array.from(array, dec => dec.toString(16).padStart(4, '0'))
            .join('')
            .substring(0, CODE_LENGTH)
            .toUpperCase();
    }

    // Setup WebSocket file transfer as sender
    async function sendFile() {
        console.log("Inside sendFile. Checking prerequisites:", 
            { selectedFile: !!selectedFile, peerConnection: !!peerConnection, openDataChannels, NUM_CHANNELS, sharedKey: !!sharedKey });
            
        if (!selectedFile || !peerConnection || openDataChannels < NUM_CHANNELS || !sharedKey) {
            console.error('Cannot send file. Prerequisites not met.', 
                { selectedFile, peerConnection, openDataChannels, sharedKey });
            showToast(getTranslation('sendFileError'), true);
             if (openDataChannels < NUM_CHANNELS) {
                 showToast(getTranslation('channelsNotReady'), true);
             }
            return;
        }

        transferCompleteFlag = false; // Reset completion flag
        sendingProgress = 0;
        statusSender.textContent = getTranslation('sendingFile');
        statusSender.classList.remove('hidden');
        console.log('Starting file send process...');

        fileMetadata = {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type
        };

        // Metadata gönderimi - düz metin olarak
        try {
            console.log("Preparing to send metadata:", fileMetadata);
            
            // JSON formatına dönüştür
            const plainMetadata = {
                 type: 'metadata',
                name: selectedFile.name,
                size: selectedFile.size, 
                fileType: selectedFile.type || 'application/octet-stream'
            };
            
            // Basit ve güvenilir metin olarak gönder
            const metadataStr = JSON.stringify(plainMetadata);
            console.log("Sending plain metadata as text:", metadataStr);
            
            // Kanalı kontrol et
            const channel0 = dataChannels[0];
            if (!channel0 || channel0.readyState !== 'open') {
                throw new Error("Channel 0 not available for metadata send");
            }
            
            // Metadata'yı düz metin olarak gönder
            channel0.send(metadataStr);
            console.log("Metadata sent as plain text, length:", metadataStr.length);
            
            // Segment hesaplama ve değişkenleri hazırlama
            totalFileSize = selectedFile.size;
            const segmentSize = Math.ceil(totalFileSize / NUM_CHANNELS);
            
            // Global değişkenleri ayarla
            segmentOffsets = Array(NUM_CHANNELS).fill(0).map((_, i) => i * segmentSize);
            segmentEndOffsets = segmentOffsets.map((offset, i) => Math.min(offset + segmentSize, totalFileSize));
            currentChunkIndices = Array(NUM_CHANNELS).fill(0);
            totalChunksPerSegment = segmentOffsets.map((offset, i) => Math.ceil((segmentEndOffsets[i] - offset) / CHUNK_SIZE));
            errorCounts = Array(NUM_CHANNELS).fill(0);

            console.log(`File Size: ${totalFileSize}, Channels: ${NUM_CHANNELS}, Segment Size: ${segmentSize}`);
            console.log(`Segment Offsets: ${segmentOffsets}`);
            console.log(`Segment End Offsets: ${segmentEndOffsets}`);
            console.log(`Total Chunks per Segment: ${totalChunksPerSegment}`);
            
            // Segment gönderme işlemlerini başlat
            for (let i = 0; i < NUM_CHANNELS; i++) {
                if (segmentOffsets[i] < segmentEndOffsets[i]) {
                    setTimeout(() => readAndSendSegmentChunk(i), 100 + (i * 50)); // Gecikme ile başlat, her kanal için biraz daha fazla
                }
            }
            
         } catch (error) {
            console.error('Error sending metadata:', error);
            showToast(getTranslation('metadataError'), true);
            abortTransfer();
        }
    }
    
    // Gelen data channel mesajlarını işlemeyi tamamen yenileyelim
    async function handleDataChannelMessage(event) {
        // Önce veri tipini analiz edelim
        console.log(`Received message on channel ${event.target.label}, type: ${typeof event.data}`);
        
        if (typeof event.data === 'string') {
            // Metin mesaj olarak işle - büyük olasılıkla metadata
            try {
                const message = JSON.parse(event.data);
                console.log("Parsed message:", message);
                
                // Metadata mesajını işleme
                if (message.type === 'metadata') {
                    console.log("Received file metadata:", message);
                    
                    if (!message.name || typeof message.size !== 'number') {
                        console.error("Invalid metadata format or missing fields");
                        showToast(getTranslation('metadataError'), true);
             return;
         }

                    // Metadata'yı kaydet
                    fileMetadata = {
                        name: message.name,
                        size: message.size,
                        type: message.fileType || 'application/octet-stream'
                    };
                    
                    // Transfer durumunu başlat
                    receivingInProgress = true;
                    receivedSize = 0;
                    segmentsReceived = 0;
                    transferCompleteFlag = false;
                    
                    // Beklenen segmentleri hesapla
                    const totalFileSize = fileMetadata.size;
                    const segmentSize = Math.ceil(totalFileSize / NUM_CHANNELS);
                    totalSegments = NUM_CHANNELS;
                    segmentStatus = {};
                    
                    for (let i = 0; i < totalSegments; i++) {
                        const start = i * segmentSize;
                        const end = Math.min(start + segmentSize, totalFileSize);
                        const expectedChunks = Math.ceil((end - start) / CHUNK_SIZE);
                        
                        segmentStatus[i] = { 
                            received: 0, 
                            total: expectedChunks,
                            buffer: new Array(expectedChunks),
                            isComplete: false,
                            startIndex: start,
                            endIndex: end
                        };
                    }
                    
                    console.log(`Expecting ${totalSegments} segments:`, segmentStatus);
                    
                    // UI güncelleme
                    downloadIcon.textContent = '📥';
                    downloadMessage.textContent = getTranslation('receivingFile', { filename: fileMetadata.name });
                    progressContainer.classList.remove('hidden');
                    fileInfo.textContent = `${fileMetadata.name} (0 B / ${formatFileSize(fileMetadata.size)})`;
                    progressBar.style.width = '0%';
                    progressPercent.textContent = '0%';
                    
                    // Başarı mesajı
                    showToast(getTranslation('transferStarted'), false);
                 return;
                }
            } catch (error) {
                console.error("Error processing text message:", error);
                if (!receivingInProgress) {
                    showToast(getTranslation('metadataError'), true);
                }
                return;
            }
        } 
        
        // Binary veri olarak işleme - dosya parçası olmalı
        if (event.data instanceof ArrayBuffer) {
            if (!receivingInProgress || !sharedKey) {
                console.warn('Received file chunk unexpectedly or without shared key.', { receivingInProgress, hasSharedKey: !!sharedKey });
                return;
            }
            
            try {
                const rawData = event.data; // ArrayBuffer olarak alındı
                if (rawData.byteLength < 12) {
                    console.error('Invalid chunk data received. Too small for header.');
                    return;
                }
                
                // Header bilgilerini oku (12 byte)
                const headerView = new DataView(rawData, 0, 12);
                const segmentIndex = headerView.getUint32(0, true);
                const chunkIndex = headerView.getUint32(4, true);
                const totalChunksInSegment = headerView.getUint32(8, true);
                
                // IV ve şifreli veriyi çıkar
                const iv = rawData.slice(12, 24); // 12 bytes AES-GCM IV
                const ciphertext = rawData.slice(24);
                
                if (segmentIndex < 0 || segmentIndex >= totalSegments) {
                    console.error(`Invalid segment index ${segmentIndex}. Expected 0-${totalSegments-1}`);
                    return;
                }
                
                // Chunk'ı şifresini çöz
                const decryptedChunk = await decryptChunk(sharedKey, new Uint8Array(iv), new Uint8Array(ciphertext));
                if (!decryptedChunk) {
                    console.error(`Failed to decrypt chunk: Segment ${segmentIndex}, Chunk ${chunkIndex}`);
                    return;
                }
                
                // Segment durumunu bul ve güncelle
                const segment = segmentStatus[segmentIndex];
                if (!segment) {
                    console.error(`Segment status not found for index ${segmentIndex}`);
                    return;
                }
                
                // Chunk bilgilerini güncelle
                if (segment.total !== totalChunksInSegment) {
                    console.log(`Updating total chunks for segment ${segmentIndex}: ${segment.total} -> ${totalChunksInSegment}`);
                    segment.total = totalChunksInSegment;
                    if (segment.buffer.length < totalChunksInSegment) {
                        segment.buffer = new Array(totalChunksInSegment);
                    }
                }
                
                // Chunk'ı depola
                if (chunkIndex >= 0 && chunkIndex < segment.total && !segment.buffer[chunkIndex]) {
                    segment.buffer[chunkIndex] = decryptedChunk;
                    segment.received++;
                    receivedSize += decryptedChunk.byteLength;
                    
                    // İlerlemeyi güncelle
                    if (fileMetadata.size > 0) {
                        const percent = Math.min(100, Math.floor((receivedSize / fileMetadata.size) * 100));
                        progressBar.style.width = percent + '%';
                        progressPercent.textContent = percent + '%';
                        fileInfo.textContent = `${fileMetadata.name} (${formatFileSize(receivedSize)} / ${formatFileSize(fileMetadata.size)})`;
                    }
                    
                    // Segment tamamlandı mı kontrol et
                    if (!segment.isComplete && segment.received === segment.total) {
                        segment.isComplete = true;
                        segmentsReceived++;
                        console.log(`Segment ${segmentIndex} completed (${segment.received}/${segment.total}). Total segments: ${segmentsReceived}/${totalSegments}`);
                        
                        // Tüm segmentler tamamlandı mı?
                        if (segmentsReceived === totalSegments) {
                            handleReceiveComplete();
                        }
                    }
                 } else {
                    console.warn(`Invalid chunk: Segment ${segmentIndex}, Chunk ${chunkIndex}, Already received: ${!!segment.buffer[chunkIndex]}`);
                }
            } catch (error) {
                console.error("Error processing binary chunk:", error);
                // Birkaç hatalı chunk kabul edilebilir, abort yerine hata sayacı kullanılabilir
            }
        } else {
            console.warn("Received unsupported data type:", typeof event.data);
        }
    }
    
    // encryptChunk fonksiyonunu güncelle - şifreli veriyi binary formatta döndür
    async function encryptChunk(key, chunk) {
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                key,
                chunk
            );
            
            // ArrayBuffer olarak döndür - daha verimli 
            return { 
                iv: iv.buffer, 
                ciphertext: ciphertext 
            };
        } catch (error) {
            console.error("Chunk encryption error:", error);
            throw error;
        }
    }
    
    // readAndSendSegmentChunk fonksiyonunu kapsamlı olarak düzeltelim
    async function readAndSendSegmentChunk(channelIndex) {
        // Abort kontrolü
        if (isAborting || transferCompleteFlag) {
            console.log(`[Channel ${channelIndex}] Abort flag set or transfer complete, stopping send loop.`);
            return;
        }
        
        // Kanal kontrolü
        const channel = dataChannels[channelIndex];
        if (!channel || channel.readyState !== 'open') {
            console.warn(`[Channel ${channelIndex}] Channel not available or not open.`);
            return;
        }
        
        // Segment tamamlandı mı kontrolü
        if (segmentOffsets[channelIndex] >= segmentEndOffsets[channelIndex]) {
            console.log(`Segment ${channelIndex} completed sending.`);
            
            // Tüm segmentlerin tamamlanıp tamamlanmadığını kontrol et
            let allSegmentsComplete = true;
            for (let i = 0; i < NUM_CHANNELS; i++) {
                if (segmentOffsets[i] < segmentEndOffsets[i]) {
                    allSegmentsComplete = false;
                    break;
                }
            }
            
            if (allSegmentsComplete && !transferCompleteFlag && !isAborting) {
                console.log("All segments completed successfully!");
                handleSendComplete();
            }
            
            return;
        }
        
        // Chunk'ı oku ve gönder
        const start = segmentOffsets[channelIndex];
        const end = Math.min(start + CHUNK_SIZE, segmentEndOffsets[channelIndex]);
        const blobSlice = selectedFile.slice(start, end);
        
        try {
            const chunkData = await blobSlice.arrayBuffer();
            if (isAborting || transferCompleteFlag) return;
            if (!channel || channel.readyState !== 'open') return;
            
            segmentOffsets[channelIndex] = end;
            
            // Chunk şifreleme
            if (!sharedKey) throw new Error("Shared key missing");
            const encrypted = await encryptChunk(sharedKey, chunkData);
            
            if (isAborting || transferCompleteFlag) return;
            if (!channel || channel.readyState !== 'open') return;
            
            // Header bilgileri
            const header = new ArrayBuffer(12);
            const headerView = new DataView(header);
            headerView.setUint32(0, channelIndex, true); // Segment index
            headerView.setUint32(4, currentChunkIndices[channelIndex], true); // Chunk index 
            headerView.setUint32(8, totalChunksPerSegment[channelIndex], true); // Total chunks
            currentChunkIndices[channelIndex]++;
            
            // Tüm verileri tek bir ArrayBuffer'a birleştir
            const ivBuffer = encrypted.iv;
            const ciphertextBuffer = encrypted.ciphertext;
            
            const combinedBuffer = new ArrayBuffer(header.byteLength + ivBuffer.byteLength + ciphertextBuffer.byteLength);
            const combinedView = new Uint8Array(combinedBuffer);
            
            combinedView.set(new Uint8Array(header), 0);
            combinedView.set(new Uint8Array(ivBuffer), header.byteLength);
            combinedView.set(new Uint8Array(ciphertextBuffer), header.byteLength + ivBuffer.byteLength);
            
            // Buffer kontrolü
            if (channel.bufferedAmount > channel.bufferedAmountLowThreshold * 2) {
                console.warn(`Channel ${channelIndex} buffer full (${channel.bufferedAmount}). Pausing slightly.`);
                channelStates[channelIndex] = false;
                
                try {
                    // Timeout ile buffer bekleme
                    await new Promise((resolve, reject) => {
                        const timeoutId = setTimeout(() => {
                            channel.onbufferedamountlow = null;
                            channelStates[channelIndex] = true;
                            resolve();
                        }, 2000);
                        
                        const checkBuffer = () => {
                            if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
                                clearTimeout(timeoutId);
                                channelStates[channelIndex] = true;
                                resolve();
                            } else if (!channel || channel.readyState !== 'open') {
                                clearTimeout(timeoutId);
                                reject(new Error("Channel closed while waiting for buffer"));
                            } else {
                                setTimeout(checkBuffer, 50);
                            }
                        };
                        
                        channel.onbufferedamountlow = () => {
                            clearTimeout(timeoutId);
                            channelStates[channelIndex] = true;
                            console.log(`BufferedAmountLow triggered for channel ${channelIndex}`);
                            resolve();
                            channel.onbufferedamountlow = null;
                        };
                        
                        checkBuffer();
                    });
                } catch (error) {
                    console.warn(`Buffer wait error for channel ${channelIndex}:`, error);
                    return;
                }
                
                if (isAborting || transferCompleteFlag) return;
                if (!channel || channel.readyState !== 'open') return;
                
                console.log(`Channel ${channelIndex} buffer cleared. Resuming send.`);
            }
            
            // Son kontrol ve veri gönderimi
            if (isAborting || transferCompleteFlag || !channel || channel.readyState !== 'open') {
                console.warn(`[Channel ${channelIndex}] Condition changed before send. Stopping.`);
                return;
            }
            
            channel.send(combinedBuffer);
            sendingProgress += chunkData.byteLength;
            
            // UI güncelleme
            if (currentChunkIndices[channelIndex] % 10 === 0 || segmentOffsets[channelIndex] >= segmentEndOffsets[channelIndex]) {
                const percent = Math.min(100, Math.floor((sendingProgress / totalFileSize) * 100));
                statusSender.textContent = getTranslation('sendingProgress', { percent: percent });
            }
            
        } catch (error) {
            console.error(`Error reading/sending chunk for channel ${channelIndex}:`, error);
            
            if (!isAborting && !transferCompleteFlag) {
                if (errorCounts[channelIndex] >= 3) {
                    showToast(getTranslation('chunkReadSendError'), true);
                    abortTransfer();
         } else {
                    errorCounts[channelIndex]++;
                    console.warn(`Incremented error count for channel ${channelIndex} to ${errorCounts[channelIndex]}`);
                }
            }
        }
        
        // Sonraki chunk'a geçiş
        if (segmentOffsets[channelIndex] < segmentEndOffsets[channelIndex]) {
            if (!isAborting && !transferCompleteFlag) {
                const channel = dataChannels[channelIndex];
                if (channel && channel.readyState === 'open') {
                    setTimeout(() => readAndSendSegmentChunk(channelIndex), 0);
                } else {
                    console.warn(`[Channel ${channelIndex}] Channel closed before queueing next chunk.`);
                }
            }
        }
    }

    // Function called when sending is complete
    function handleSendComplete() {
         if (transferCompleteFlag) return; // Already handled
         transferCompleteFlag = true;

         console.log('File sending theoretically complete.');
         statusSender.textContent = getTranslation('fileSentWaiting');
         // The sender doesn't know for sure if the receiver got everything.
         // Optionally, wait for an acknowledgement message from the receiver via WebSocket or a dedicated channel.
         // For now, just update status.

         // Consider closing channels after a delay or confirmation
         // setTimeout(() => {
         //    closeDataChannels();
         //    closePeerConnection();
         // }, 5000); // Example: close after 5 seconds
    }
    
    // Reset UI to initial state
    function resetUI() {
        console.log("Resetting UI and state.");
        isAborting = false; // <<< ADDED: Reset abort flag here
        transferCompleteFlag = false; // Also reset completion flag for safety
        // Reset file input and related UI
        if (fileInput) fileInput.value = ''; // Clear file input
        if (filePrompt) filePrompt.classList.remove('hidden'); // <-- Make prompt visible again
        if (fileName) {
             fileName.textContent = '';
             fileName.classList.add('hidden'); // <-- Hide filename
        }
        if (fileSize) {
            fileSize.textContent = '';
            fileSize.classList.add('hidden'); // <-- Hide filesize
        }
        if (fileIcon) fileIcon.textContent = '📁'; // Reset icon to default folder
        if (dropZone) dropZone.classList.remove('drag-over'); // Remove drag over style
        // if (dropZone) dropZone.classList.remove('border-blue-500', 'bg-blue-50'); // These might not be standard styles
        if (shareBtn) shareBtn.disabled = true;
        if (shareResult) shareResult.classList.add('hidden');
        if (shareCode) shareCode.value = '';
        if (statusSender) {
            statusSender.textContent = '';
            statusSender.classList.add('hidden'); // Ensure sender status is hidden
        }

        // Reset receiver UI elements
        if (receiveCode) receiveCode.value = '';
        if (receiveBtn) receiveBtn.disabled = false; // Re-enable receive button
        if (downloadStatus) downloadStatus.classList.add('hidden');
        if (downloadMessage) downloadMessage.textContent = '';
        if (progressContainer) progressContainer.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (downloadBtn) {
            downloadBtn.classList.add('hidden');
            downloadBtn.href = '#'; // Clear previous download link
            const oldUrl = downloadBtn.getAttribute('href');
            if (oldUrl && oldUrl.startsWith('blob:')) {
                window.URL.revokeObjectURL(oldUrl); // Revoke old blob URL
            }
        }

        // Reset state variables
        selectedFile = null;
        fileMetadata = { name: '', size: 0, type: '' };
        if (fileReader) {
            // Check readyState before aborting. 0 = EMPTY, 1 = LOADING, 2 = DONE
            if (fileReader.readyState === 1) {
                 console.log("Aborting file reader...");
                 fileReader.abort();
            }
            fileReader = null;
        }
        receivedSize = 0;
        receivedData = [];
        sendingProgress = 0;
        receivingInProgress = false;

        // Reset cryptographic state
         sharedKey = null;
         keyPair = null;

        // Re-initialize WebSocket if necessary, or ensure it's ready
        // initWebSocket(); // Be careful not to create rapid reconnect loops
        console.log("UI and state reset complete.");

        // Clear QR Code and hide its container/prompt
        if (qrcodeContainer) { 
            qrcodeContainer.classList.add('hidden'); // Hide the whole container
        }
        if (qrcodeElement) { 
            qrcodeElement.innerHTML = ''; // Clear the QR code content
        }
        if (qrcodePrompt) { 
            qrcodePrompt.classList.add('hidden'); // Hide the prompt
        }

        // Also ensure popup is hidden on general reset
        hideSuccessPopup(); 
    }
    
    // Format file size in human-readable form
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Show a toast notification (Refined)
    let toastTimeoutId = null; // Variable to hold the timeout ID
    function showToast(message, isError = false) {
        if (!toast || !message) return; 

        toast.textContent = message;
        // Base classes
        toast.className = 'fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white transition-opacity duration-300 opacity-0 pointer-events-none'; 
        
        // Apply color based on type
        if (isError) {
            toast.classList.add('bg-red-600'); 
        } else {
            toast.classList.add('bg-green-600'); 
        }

        // Clear previous timeout if exists (prevents overlapping toasts cutting each other short)
        if (toastTimeoutId) {
            clearTimeout(toastTimeoutId);
        }

        // Force reflow to ensure transition works after reapplying class
        toast.offsetHeight; 

        // Make visible
        requestAnimationFrame(() => { // Use requestAnimationFrame for smoother transition start
            toast.classList.remove('opacity-0');
            toast.classList.add('opacity-100');
        });

        // Set timeout to hide
        toastTimeoutId = setTimeout(() => {
            toast.classList.remove('opacity-100');
            toast.classList.add('opacity-0');
            toastTimeoutId = null; // Clear the timeout ID
        }, 3000); // Hide after 3 seconds
    }
    
    // Determine file type icon
    function getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        
        const iconMap = {
            pdf: '📄',
            doc: '📝', docx: '📝',
            xls: '📊', xlsx: '📊',
            ppt: '📽️', pptx: '📽️',
            jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️',
            mp3: '🎵', wav: '🎵', ogg: '🎵',
            mp4: '🎬', avi: '🎬', mov: '🎬',
            zip: '📦', rar: '📦', '7z': '📦',
            txt: '📃',
            html: '🌐', css: '🌐', js: '🌐',
            exe: '⚙️',
            default: '📄'
        };
        
        return iconMap[extension] || iconMap.default;
    }
    
    // Event Listeners
    
    // File selection via click
    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            handleFileSelect(this.files[0]);
        }
    });
    
    // File drag and drop
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(this.dataTransfer.files[0]);
        }
    });
    
    // Handle file select from input or drag-drop
    function handleFileSelect(file) {
        console.log("handleFileSelect called with file:", file?.name); // Log function call and filename
        // Reset previous share state if a new file is selected after sharing
        if (!shareResult.classList.contains('hidden')) {
            console.log('New file selected while a share was active. Resetting UI.');
            resetUI();
            // Optionally re-initialize WebSocket if resetUI doesn't handle it sufficiently
            // initWebSocket(); 
        }

        selectedFile = file;
        
        console.log("Updating UI elements..."); // Log before UI update
        // Update UI
        filePrompt.classList.add('hidden'); // <-- Hide the prompt
        // filePrompt.textContent = getTranslation('selectedFile'); // No need to change text if hidden
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileIcon.textContent = getFileIcon(file.name);
        
        fileName.classList.remove('hidden');
        fileSize.classList.remove('hidden');
        
        console.log("Enabling share button..."); // Log before enabling button
        shareBtn.disabled = false;
        console.log("shareBtn disabled state after update:", shareBtn.disabled); // Log button state
    }
    
    // Share button click
    shareBtn.addEventListener('click', async function() { // Made async for key generation check
        if (!selectedFile) {
            showToast(getTranslation('pleaseSelectFile'), true);
            return;
        }
        
        // Ensure WebSocket is initialized (or re-initialize if needed)
        if (!socket || socket.readyState !== WebSocket.OPEN) {
             console.log("WebSocket not open, initializing...");
        initWebSocket();
             // Need to wait for socket to open before proceeding
             await new Promise(resolve => {
                  const checkSocket = () => {
                       if (socket && socket.readyState === WebSocket.OPEN) {
                           resolve();
                       } else {
                           setTimeout(checkSocket, 100);
                       }
                  };
                  checkSocket();
             });
             console.log("WebSocket connection ready.");
        }

        // Ensure keys are generated (should happen on 'code-created' now, but double check)
        if (!keyPair) {
             console.log("Keypair not found, attempting to generate...");
             try {
                  keyPair = await generateKeyPair();
                  console.log("Sender keys generated on demand.");
             } catch (keyGenError) {
                  console.error("Sender key generation failed on demand:", keyGenError);
                  showToast(getTranslation('keyGenerationError'), true);
                  resetUI();
                  return;
             }
        }
        
        // Generate and send share code
        const code = generateSecureCode();
        console.log("Generated code:", code);
        
        // Send code (WebSocket should be ready now)
            socket.send(JSON.stringify({
                type: 'create-code',
                code: code
            }));
        statusSender.textContent = getTranslation('generatingCode'); // Update status immediately
        statusSender.classList.remove('hidden');
    });
    
    // Copy button click
    copyBtn.addEventListener('click', function() {
        shareCode.select();
        document.execCommand('copy');
        showToast(getTranslation('codeCopied'));
    });
    
    // Receive button click
    receiveBtn.addEventListener('click', async function() { // Made async
        const code = receiveCode.value.trim().toUpperCase();
        
        if (code.length !== CODE_LENGTH) {
            showToast(getTranslation('invalidCodeFormat'), true);
            return;
        }
        
        // Ensure WebSocket is initialized (or re-initialize if needed)
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.log("Receiver: WebSocket not open, initializing...");
        initWebSocket();
            // Need to wait for socket to open before proceeding
            await new Promise(resolve => {
                 const checkSocket = () => {
                      if (socket && socket.readyState === WebSocket.OPEN) {
                          resolve();
                } else {
                          setTimeout(checkSocket, 100);
                      }
                 };
                 checkSocket();
            });
            console.log("Receiver: WebSocket connection ready.");
       } else {
            console.log("Receiver: WebSocket already open.");
       }
        
        // Send join code (WebSocket should be ready now)
        console.log("Receiver: Sending join-code:", code);
            socket.send(JSON.stringify({
                type: 'join-code',
                code: code
            }));
        // Update status immediately
        downloadStatus.classList.remove('hidden');
        downloadIcon.textContent = '⏳'; 
        downloadMessage.textContent = getTranslation('connectingToSender');
        progressContainer.classList.add('hidden'); // Hide progress initially
    });

    // Initialize WebSocket on load
    initWebSocket();

     // Initial UI state reset
     resetUI();

    // Initialize settings (which includes applying initial language/translations)
     if (window.appConfig && typeof window.appConfig.initializeSettings === 'function') {
         window.appConfig.initializeSettings(); // This will call setLanguage internally
         updateThemeIcon(); // Set initial theme icon
     } else {
          console.warn("appConfig or initializeSettings function not found. Skipping settings initialization.");
     }

    // --- Popup Control Functions ---
    function showSuccessPopup(message) {
        if (!successPopup || !successPopupMessage) return;
        successPopupMessage.textContent = message;
        successPopup.classList.remove('hidden');
        // Apply current translations to popup static text (title, button) if needed
        // This might be redundant if initializeSettings already handled it, but good practice
        if(window.appConfig && window.appConfig.setLanguage) {
            const currentLang = localStorage.getItem('preferredLanguage') || window.appConfig.getPreferredLanguage();
            window.appConfig.setLanguage(currentLang); // Re-apply translations to ensure popup is correct
        }
    }

    function hideSuccessPopup() {
        if (!successPopup) return;
        successPopup.classList.add('hidden');
    }

    // Remove Donate Popup functions
    /*
    function showDonatePopup() {
        ...
    }
    function hideDonatePopup() {
        ...
    }
    */
    // --- End Popup Control Functions ---

    // Event listener for Popup OK button
    if (successPopupOkBtn) {
        successPopupOkBtn.addEventListener('click', () => {
            hideSuccessPopup();
            resetUI(); // Reset the UI after clicking OK
        });
    }

    // Remove Event listeners for Donate Button and Popup Close Button
    /*
    if (donateBtn) {
        donateBtn.addEventListener('click', () => {
            showDonatePopup();
        });
    }
    if (donatePopupCloseBtn) {
        donatePopupCloseBtn.addEventListener('click', () => {
            hideDonatePopup();
        });
    }
    */

    // Create Peer Connection
    async function createPeerConnection(isInitiator) { // <-- Made async
        console.log(`Attempting to create PeerConnection. isInitiator: ${isInitiator}`); // ADDED
        resetRTCVariables(); // Reset variables before creating a new connection

        try {
            // Asenkron olarak RTC yapılandırmasını al
            const configuration = await window.appConfig.getRTCConfiguration();
            
            console.log("Executing: new RTCPeerConnection with fetched config"); // ADDED
            peerConnection = new RTCPeerConnection(configuration); // Yapılandırmayı kullan
            console.log("PeerConnection object created:", peerConnection); // ADDED

            if (!peerConnection) { // ADDED Check
                 console.error("RTCPeerConnection returned null or undefined!");
                 throw new Error("PeerConnection object is null");
            }
            
            console.log("Attaching onicecandidate listener..."); // ADDED
            peerConnection.onicecandidate = event => {
                if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
                    console.log('Sending ICE candidate...');
                    socket.send(JSON.stringify({ type: 'candidate', payload: event.candidate }));
                }
            };

            // PeerConnection durumu değişikliği izleme
            peerConnection.oniceconnectionstatechange = () => {
                if (peerConnection) {
                    console.log(`---> ICE Connection State Changed: ${peerConnection.iceConnectionState}`); // MODIFIED Log
                    
                    // Başarılı transfer sonrası kapanmalar için kontrol ekle
                    if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
                        // Transfer başarılıysa veya tamamlanmışsa, hata mesajı gösterme
                        if (transferCompleteFlag) {
                            console.log("ICE connection closed after successful transfer");
                            return; // Başarılı tamamlanma sonrası bağlantı kapanmasını yok say
                        }
                        
                        // Transfer devam ediyorsa veya tamamlanmadıysa uyarı göster
                        if (receivingInProgress || sendingProgress > 0) {
                            showToast(getTranslation('connectionInterrupted'), true);
                        }
                        
                        // Clean up resources
                        closeDataChannels();
                        closePeerConnection();
                        resetUI(); // Reset UI to allow retry
                    }
                }
            };

            // --- Start: Multi-channel handling ---
            if (isInitiator) {
                console.log(`Creating ${NUM_CHANNELS} data channels`);
                channelStates = Array(NUM_CHANNELS).fill(false); // Initialize channel states
                for (let i = 0; i < NUM_CHANNELS; i++) {
                    const label = `fileChannel-${i}`;
                    const channel = peerConnection.createDataChannel(label, { ordered: true }); // Maintain order for simplicity first
                    setupDataChannel(channel, i);
                    dataChannels.push(channel);
                }
            } else {
                console.log("Receiver: Setting up ondatachannel listener..."); // ADDED
                peerConnection.ondatachannel = event => {
                    console.log('---> ONDATACHANNEL EVENT RECEIVED:', event.channel.label); // ADDED
                    const channel = event.channel;
                    // Simple way to get index from label, assuming 'fileChannel-N' format
                    const channelIndex = parseInt(channel.label.split('-')[1], 10);
                     if (!isNaN(channelIndex) && channelIndex >= 0 && channelIndex < NUM_CHANNELS) {
                         setupDataChannel(channel, channelIndex);
                         dataChannels[channelIndex] = channel; // Store in the correct index
                     } else {
                         console.error("Received unexpected data channel label:", channel.label);
                     }
                };
            }
            // --- End: Multi-channel handling ---

        } catch (error) {
            console.error('Error creating Peer Connection:', error);
            showToast(getTranslation('peerConnectionError'), true);
            resetUI();
        }
    }

    // --- Start: Setup Data Channel ---
    function setupDataChannel(channel, index) {
        channel.onopen = () => handleDataChannelOpen(channel, index);
        channel.onclose = () => handleDataChannelClose(channel, index);
        channel.onerror = (error) => handleDataChannelError(error, channel, index);
        channel.onmessage = handleDataChannelMessage; // Single handler for all channels initially

         // Set buffer threshold low to react quickly to backpressure
         channel.bufferedAmountLowThreshold = CHUNK_SIZE * 4; // Example: 4 chunks
         channel.onbufferedamountlow = () => handleBufferedAmountLow(channel, index);

        console.log(`Data channel ${index} (${channel.label}) setup complete.`);
    }

    function handleDataChannelOpen(channel, index) {
        console.log(`Data channel ${index} (${channel.label}) opened.`);
        openDataChannels++;
         channelStates[index] = true; // Mark channel as ready
        console.log(`Open data channels count: ${openDataChannels}`);

        // Check if all channels are open 
        if (openDataChannels === NUM_CHANNELS) {
            console.log("All channels reported open.");
            // ADDED: Log state just before the check
            console.log(`Checking condition to start send/receive: selectedFile=${!!selectedFile}, receivingInProgress=${receivingInProgress}`);
            if (selectedFile && !receivingInProgress) { // Check if it's the sender
                console.log("Sender: All channels open, calling sendFile().");
                sendFile(); // Now async, will be called here
            } else if (!selectedFile && receivingInProgress) { // Check if it's the receiver
                 console.log("Receiver: All channels open. Waiting for data...");
            }
        } else if (openDataChannels > NUM_CHANNELS) {
             console.warn(`More channels opened (${openDataChannels}) than expected (${NUM_CHANNELS})`);
        }
    }

     function handleDataChannelClose(channel, index) {
         console.warn(`Data channel ${index} (${channel.label}) closed.`);
         channelStates[index] = false; // Mark channel as not ready
         openDataChannels = Math.max(0, openDataChannels - 1); // Decrement safely

         // Transfer işlemi aktif durumdaysa ve bu beklenmedik bir kapanma ise
         if ((receivingInProgress || (sendingProgress > 0 && sendingProgress < selectedFile?.size))) {
            // Eğer transfer işlemi zaten sonlandıysa veya iptal edildiyse, normal bir kapanmadır
            if (isAborting || transferCompleteFlag) {
                console.log(`Channel ${index} closed as part of normal abort/complete process.`);
                return; // Normal kapanma, işlem yapmaya gerek yok
            }
            
            // Transfer devam ederken beklenmedik kapanma - son kanala kadar bekle
            console.error(`Channel ${index} closed unexpectedly during transfer.`);
            
            // Açık kanal sayısını kontrol et
            if (openDataChannels <= 0) {
                // Hiç açık kanal kalmadıysa ve transfer tamamlanmadıysa, iptal et
                if (!transferCompleteFlag) {
                    console.error("All channels closed unexpectedly, aborting transfer.");
                    showToast(getTranslation('transferAbortedChannelClose'), true);
                    abortTransfer();
                } else {
                    // Transfer tamamlandıysa, kanalların beklendiği gibi kapandığını varsay
                    console.log("All channels closed after transfer completion, normal shutdown.");
                }
            } else {
                console.warn(`Channel ${index} closed unexpectedly, but ${openDataChannels} channels still open. Attempting to continue...`);
            }
         }
     }

     function handleDataChannelError(error, channel, index) {
         console.error(`Data channel ${index} (${channel.label}) error:`, error);
         // Eğer kapanma nedeniyle hata oluştuysa, bu normal bir durum
         if (isAborting || transferCompleteFlag || error?.error?.message?.includes('User-Initiated Abort')) {
             console.log(`Ignoring expected error for channel ${index} during abort/close.`);
             return; // Normal kapanma hatalarını yok sayalım ve abortTransfer'i çağırmayalım
         }
         
         showToast(`${getTranslation('channelError')} (${channel.label}): ${error.error?.message || error}`, true);
         channelStates[index] = false; // Mark channel as not ready
         
         // Yalnızca beklenmeyen hatalarda abort işlemini çağıralım
         if (!isAborting && !transferCompleteFlag) {
             abortTransfer(); // Abort on any unexpected channel error
         }
     }

     function handleBufferedAmountLow(channel, index) {
          console.log(`Buffered amount low on channel ${index}. Ready for more data.`);
          channelStates[index] = true; // Mark channel ready again
          // Potentially resume sending if paused due to backpressure
          // The sending loop needs to check channelStates
          if (fileReader && !fileReader.paused) {
               // If the main reader wasn't paused, maybe we don't need to do anything here,
               // but if we implement pausing, this is where we'd resume.
          }
     }

     // Function to close all data channels
     function closeDataChannels() {
         console.log("Closing data channels...");
         dataChannels.forEach((channel, index) => {
             if (channel && channel.readyState !== 'closed') {
                 try {
                     channel.close();
                      console.log(`Channel ${index} closed.`);
                 } catch (e) {
                     console.error(`Error closing channel ${index}:`, e);
                 }
             }
         });
         dataChannels = [];
         openDataChannels = 0;
         channelStates = [];
     }

     // Function to close the peer connection
     function closePeerConnection() {
         if (peerConnection) {
             console.log("Closing PeerConnection...");
             try {
                 peerConnection.close();
             } catch (e) {
                 console.error("Error closing PeerConnection:", e);
             }
             peerConnection = null;
         }
     }

     // Abort transfer function (basic version)
     function abortTransfer() {
          if (isAborting) return; // Prevent multiple concurrent aborts
          isAborting = true; // Set flag immediately
          console.error("Aborting transfer...");

          // Daha kontrollü bir kapatma sırası uygulayalım
          // Önce fileReader'ı durdurarak yeni veri okuma/gönderme işlemlerini engelleyelim
          if (fileReader) {
              // Check readyState before aborting. 0 = EMPTY, 1 = LOADING, 2 = DONE
              if (fileReader.readyState === 1) {
                  console.log("Aborting file reader...");
                  fileReader.abort();
              }
              fileReader = null;
          }
          
          // Transfer işaretini güncelleyelim
          transferCompleteFlag = true; 
          
          // Kısa bir gecikme ekleyerek işlemlerin tamamlanmasına fırsat verelim
          setTimeout(() => {
              closeDataChannels();
              closePeerConnection();
              resetRTCVariables(); // Reset RTC specific variables
              
              // Optionally, update the UI to show an aborted state without full reset
              if (statusSender) {
                  statusSender.textContent = getTranslation('transferAborted'); // Add this translation key
                  statusSender.classList.remove('hidden');
              }
              if (downloadStatus && receivingInProgress) {
                  downloadIcon.textContent = '❌';
                  downloadMessage.textContent = getTranslation('transferAborted'); // Add this translation key
                  progressContainer.classList.add('hidden');
              }
          }, 100); // 100ms gecikme ekleyerek işlemlerin düzgün kapanmasına izin verelim
      }


    // --- End: Setup Data Channel ---


    // Handle incoming data channel messages (modified for multi-channel)
    async function handleDataChannelMessage(event) {
        // Önce veri tipini analiz edelim
        console.log(`Received message on channel ${event.target.label}, type: ${typeof event.data}`);
        
        if (typeof event.data === 'string') {
            // Metin mesaj olarak işle - büyük olasılıkla metadata
            try {
                const message = JSON.parse(event.data);
                console.log("Parsed message:", message);
                
                // Metadata mesajını işleme
                if (message.type === 'metadata') {
                    console.log("Received file metadata:", message);
                    
                    if (!message.name || typeof message.size !== 'number') {
                        console.error("Invalid metadata format or missing fields");
                        showToast(getTranslation('metadataError'), true);
                        return;
                    }
                    
                    // Metadata'yı kaydet
                    fileMetadata = {
                        name: message.name,
                        size: message.size,
                        type: message.fileType || 'application/octet-stream'
                    };
                    
                    // Transfer durumunu başlat
                    receivingInProgress = true;
                    receivedSize = 0;
                    segmentsReceived = 0;
                    transferCompleteFlag = false;
                    
                    // Beklenen segmentleri hesapla
                    const totalFileSize = fileMetadata.size;
                    const segmentSize = Math.ceil(totalFileSize / NUM_CHANNELS);
                    totalSegments = NUM_CHANNELS;
                    segmentStatus = {};
                    
                    for (let i = 0; i < totalSegments; i++) {
                        const start = i * segmentSize;
                        const end = Math.min(start + segmentSize, totalFileSize);
                        const expectedChunks = Math.ceil((end - start) / CHUNK_SIZE);
                        
                        segmentStatus[i] = { 
                            received: 0, 
                            total: expectedChunks,
                            buffer: new Array(expectedChunks),
                            isComplete: false,
                            startIndex: start,
                            endIndex: end
                        };
                    }
                    
                    console.log(`Expecting ${totalSegments} segments:`, segmentStatus);
                    
                    // UI güncelleme
                    downloadIcon.textContent = '📥';
                    downloadMessage.textContent = getTranslation('receivingFile', { filename: fileMetadata.name });
                    progressContainer.classList.remove('hidden');
                    fileInfo.textContent = `${fileMetadata.name} (0 B / ${formatFileSize(fileMetadata.size)})`;
                    progressBar.style.width = '0%';
                    progressPercent.textContent = '0%';
                    
                    // Başarı mesajı
                    showToast(getTranslation('transferStarted'), false);
                    return;
                }
            } catch (error) {
                console.error("Error processing text message:", error);
                if (!receivingInProgress) {
                    showToast(getTranslation('metadataError'), true);
                }
                return;
            }
        } 
        
        // Binary veri olarak işleme - dosya parçası olmalı
        if (event.data instanceof ArrayBuffer) {
            if (!receivingInProgress || !sharedKey) {
                console.warn('Received file chunk unexpectedly or without shared key.', { receivingInProgress, hasSharedKey: !!sharedKey });
                return;
            }
            
            try {
                const rawData = event.data; // ArrayBuffer olarak alındı
                if (rawData.byteLength < 12) {
                    console.error('Invalid chunk data received. Too small for header.');
                    return;
                }
                
                // Header bilgilerini oku (12 byte)
                const headerView = new DataView(rawData, 0, 12);
                const segmentIndex = headerView.getUint32(0, true);
                const chunkIndex = headerView.getUint32(4, true);
                const totalChunksInSegment = headerView.getUint32(8, true);
                
                // IV ve şifreli veriyi çıkar
                const iv = rawData.slice(12, 24); // 12 bytes AES-GCM IV
                const ciphertext = rawData.slice(24);
                
                if (segmentIndex < 0 || segmentIndex >= totalSegments) {
                    console.error(`Invalid segment index ${segmentIndex}. Expected 0-${totalSegments-1}`);
                    return;
                }
                
                // Chunk'ı şifresini çöz
                const decryptedChunk = await decryptChunk(sharedKey, new Uint8Array(iv), new Uint8Array(ciphertext));
                if (!decryptedChunk) {
                    console.error(`Failed to decrypt chunk: Segment ${segmentIndex}, Chunk ${chunkIndex}`);
                    return;
                }
                
                // Segment durumunu bul ve güncelle
                const segment = segmentStatus[segmentIndex];
                if (!segment) {
                    console.error(`Segment status not found for index ${segmentIndex}`);
                    return;
                }
                
                // Chunk bilgilerini güncelle
                if (segment.total !== totalChunksInSegment) {
                    console.log(`Updating total chunks for segment ${segmentIndex}: ${segment.total} -> ${totalChunksInSegment}`);
                    segment.total = totalChunksInSegment;
                    if (segment.buffer.length < totalChunksInSegment) {
                        segment.buffer = new Array(totalChunksInSegment);
                    }
                }
                
                // Chunk'ı depola
                if (chunkIndex >= 0 && chunkIndex < segment.total && !segment.buffer[chunkIndex]) {
                    segment.buffer[chunkIndex] = decryptedChunk;
                    segment.received++;
                    receivedSize += decryptedChunk.byteLength;
                    
                    // İlerlemeyi güncelle
                    if (fileMetadata.size > 0) {
                        const percent = Math.min(100, Math.floor((receivedSize / fileMetadata.size) * 100));
                        progressBar.style.width = percent + '%';
                        progressPercent.textContent = percent + '%';
                        fileInfo.textContent = `${fileMetadata.name} (${formatFileSize(receivedSize)} / ${formatFileSize(fileMetadata.size)})`;
                    }
                    
                    // Segment tamamlandı mı kontrol et
                    if (!segment.isComplete && segment.received === segment.total) {
                        segment.isComplete = true;
                        segmentsReceived++;
                        console.log(`Segment ${segmentIndex} completed (${segment.received}/${segment.total}). Total segments: ${segmentsReceived}/${totalSegments}`);
                        
                        // Tüm segmentler tamamlandı mı?
                        if (segmentsReceived === totalSegments) {
                            handleReceiveComplete();
                        }
                    }
                } else {
                    console.warn(`Invalid chunk: Segment ${segmentIndex}, Chunk ${chunkIndex}, Already received: ${!!segment.buffer[chunkIndex]}`);
                }
            } catch (error) {
                console.error("Error processing binary chunk:", error);
                // Birkaç hatalı chunk kabul edilebilir, abort yerine hata sayacı kullanılabilir
            }
        } else {
            console.warn("Received unsupported data type:", typeof event.data);
        }
    }

    // Function called when receiving is complete
    function handleReceiveComplete() {
         if (transferCompleteFlag) return; // Already handled
         transferCompleteFlag = true;

        console.log('All segments received. Assembling file...');
        downloadIcon.textContent = '✅';
        downloadMessage.textContent = getTranslation('fileReceivedAssembling');
        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';

        try {
            // Assemble the final file from segment buffers
            const fileChunks = [];
            let assembledSize = 0;
            for (let i = 0; i < totalSegments; i++) {
                const segment = segmentStatus[i];
                if (!segment || !segment.isComplete) {
                    throw new Error(`Segment ${i} is not complete during final assembly.`);
                }
                // Concatenate chunks within the segment (they should be ArrayBuffers)
                for (let j = 0; j < segment.total; j++) {
                     if (!segment.buffer[j]) {
                          throw new Error(`Missing chunk ${j} in completed segment ${i}`);
                     }
                     fileChunks.push(segment.buffer[j]);
                     assembledSize += segment.buffer[j].byteLength;
                }
                 // Clear buffer after use to free memory
                 segment.buffer = []; 
            }

            if (assembledSize !== fileMetadata.size) {
                 console.warn(`Assembled size (${assembledSize}) does not match metadata size (${fileMetadata.size}).`);
                 // Proceed anyway, but log warning.
            }

            const receivedFileBlob = new Blob(fileChunks, { type: fileMetadata.type });
            console.log('File assembled successfully.');

            // Create download link
            const downloadUrl = URL.createObjectURL(receivedFileBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = downloadUrl;
            downloadLink.download = fileMetadata.name;

            // Otomatik olarak indirme işlemini başlat
            console.log('Triggering automatic download...');
            document.body.appendChild(downloadLink); // Firefox için gerekli
            downloadLink.click(); // Otomatik indirme başlat
            
            // Temizlik yap
            setTimeout(() => {
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(downloadUrl);
            }, 1000);

            // UI'ı güncelle
            downloadMessage.textContent = getTranslation('downloadStarted') || 'Download started automatically';
            
            // Başarı bildirimi göster
            showSuccessPopup(getTranslation('transferSuccessMessage', { filename: fileMetadata.name }));
            
            // Göndericiyi başarılı indirme hakkında bilgilendir
            try {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    console.log("Notifying sender about successful download...");
                    socket.send(JSON.stringify({ type: 'download-complete' }));
                } else {
                    console.warn("WebSocket not available to notify sender");
                }
            } catch (notifyError) {
                console.warn("Error notifying sender about download:", notifyError);
            }

        } catch (error) {
            console.error('Error assembling or downloading file:', error);
            showToast(getTranslation('fileAssemblyError'), true);
            downloadIcon.textContent = '❌';
            downloadMessage.textContent = getTranslation('fileAssemblyError');
             // Don't abort here as transfer is done, but indicate failure
        } finally {
             // Clean up resources regardless of assembly success/failure
             // Maybe close channels after a small delay
             setTimeout(() => {
                  closeDataChannels();
                  closePeerConnection();
                  // Don't reset RTC variables here if we want the download link to persist
                  // resetRTCVariables(); 
             }, 2000);
        }
    }

    // Reset WebRTC related variables
    function resetRTCVariables() {
        closeDataChannels(); // Use helper to close existing channels
        closePeerConnection(); // Use helper to close peer connection

        // Reset state variables
        // selectedFile = null; // <-- REMOVED: Don't reset the selected file here
        fileReader = null;
        receivedSize = 0;
        // receivedData = []; // Keep received data until assembly or resetUI
        sendingProgress = 0;
        // receivingInProgress = false; // Let metadata message control this
        // fileMetadata = { name: '', size: 0, type: '' }; // Reset only when truly starting over
        keyPair = null; // Reset own key pair

        // --- Start: Reset multi-channel variables ---
        dataChannels = [];
        openDataChannels = 0;
        channelStates = [];
        receiveBuffers = {};
        segmentStatus = {};
        totalSegments = 0;
        segmentsReceived = 0;
         transferCompleteFlag = false; // Reset completion flag
        // --- End: Reset multi-channel variables ---
    }

    // Ana değişkenleri genişletelim
    // errorCounts zaten yukarıda tanımlandı
});