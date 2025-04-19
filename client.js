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
    let dataChannels = []; // Array to hold all data channels
    let openDataChannels = 0; // Counter for open data channels
    let channelStates = []; // To track readiness of each channel for sending
    let receiveBuffers = {}; // To store received chunks per segment { segmentIndex: { chunkIndex: data } }
    let segmentStatus = {}; // To track received chunks per segment { segmentIndex: { received: count, total: count, buffer: [] } }
    let totalSegments = 0; // Total segments expected
    let segmentsReceived = 0; // Count of fully received segments
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
        const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM recommended IV size
        const encodedData = new TextEncoder().encode(JSON.stringify(data)); // Ensure data is ArrayBuffer
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encodedData
        );
        return { iv, ciphertext }; // Return both IV and ciphertext
    }

     async function encryptChunk(key, chunk) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        // chunk is already an ArrayBuffer from FileReader
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            chunk
        );
        // Convert ArrayBuffers to something JSON serializable (e.g., base64 or array of numbers)
         // Using Array.from to convert Uint8Array to a regular array
        return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
    }

    async function decryptData(key, iv, ciphertext) {
        try {
            // Convert iv and ciphertext back to ArrayBuffer/Uint8Array
            const ivArray = new Uint8Array(iv);
            const ciphertextArray = new Uint8Array(ciphertext);

            const decryptedData = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivArray },
                key,
                ciphertextArray
            );
            const decodedText = new TextDecoder().decode(decryptedData);
            return JSON.parse(decodedText);
        } catch (error) {
            console.error("Decryption failed:", error);
            showToast(getTranslation('decryptionError'), true);
            // Handle decryption error appropriately, e.g., close connection or request resend
            resetUI(); // Example: Reset UI on decryption failure
            return null; // Indicate failure
        }
    }
     async function decryptChunk(key, iv, ciphertext) {
        try {
            const ivArray = new Uint8Array(iv);
            const ciphertextArray = new Uint8Array(ciphertext);
            const decryptedChunk = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivArray },
                key,
                ciphertextArray
            );
            return decryptedChunk; // Return ArrayBuffer
        } catch (error) {
            console.error("Chunk decryption failed:", error);
            showToast(getTranslation('decryptionError'), true);
             // Potentially add more robust error handling for chunk decryption failure
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

        // 1. Send Encrypted Metadata (only on the first channel for simplicity)
        try {
            console.log("Encrypting and sending metadata...");
            const encryptedMeta = await encryptData(sharedKey, { type: 'fileMeta', payload: fileMetadata });
            dataChannels[0].send(JSON.stringify(encryptedMeta)); // Send metadata on channel 0
            console.log("Metadata sent.");
        } catch (error) {
            console.error('Error sending metadata:', error);
            showToast(getTranslation('metadataError'), true);
            abortTransfer();
            return;
        }

        // 2. Prepare for chunk sending
        const totalFileSize = selectedFile.size;
        // Determine segment size - aim for roughly equal segments per channel
        const segmentSize = Math.ceil(totalFileSize / NUM_CHANNELS);
        let currentSegmentIndex = 0;
        let currentOffset = 0;

        fileReader = new FileReader();

        // Keep track of progress per channel/segment
        let segmentOffsets = Array(NUM_CHANNELS).fill(0).map((_, i) => i * segmentSize);
        let segmentEndOffsets = segmentOffsets.map((offset, i) => Math.min(offset + segmentSize, totalFileSize));
        let currentChunkIndices = Array(NUM_CHANNELS).fill(0);
        let totalChunksPerSegment = segmentOffsets.map((offset, i) => Math.ceil((segmentEndOffsets[i] - offset) / CHUNK_SIZE));

        console.log(`File Size: ${totalFileSize}, Channels: ${NUM_CHANNELS}, Segment Size: ${segmentSize}`);
        console.log(`Segment Offsets: ${segmentOffsets}`);
        console.log(`Segment End Offsets: ${segmentEndOffsets}`);
        console.log(`Total Chunks per Segment: ${totalChunksPerSegment}`);

        // Function to read and send the next chunk for a specific channel/segment
        async function readAndSendSegmentChunk(channelIndex) {
            if (segmentOffsets[channelIndex] >= segmentEndOffsets[channelIndex]) {
                // Segment complete for this channel
                console.log(`Segment ${channelIndex} completed sending.`);
                // Optionally mark this channel as done for this segment
                return; 
            }

            const start = segmentOffsets[channelIndex];
            const end = Math.min(start + CHUNK_SIZE, segmentEndOffsets[channelIndex]);
            const blobSlice = selectedFile.slice(start, end);
            
            try {
                 const chunkData = await blobSlice.arrayBuffer(); // Read chunk as ArrayBuffer
                 segmentOffsets[channelIndex] = end; // Update offset for the next chunk *within this segment*

                 // Encrypt the chunk
                 const encrypted = await encryptChunk(sharedKey, chunkData);
                 if (!encrypted) throw new Error("Chunk encryption failed");

                 // Prepare header (12 bytes: segmentIndex, chunkIndex, totalChunksInSegment)
                 const header = new ArrayBuffer(12);
                 const headerView = new DataView(header);
                 headerView.setUint32(0, channelIndex, true); // Segment Index (using channel index as segment index for now)
                 headerView.setUint32(4, currentChunkIndices[channelIndex], true); // Chunk Index within segment
                 headerView.setUint32(8, totalChunksPerSegment[channelIndex], true); // Total chunks in this segment
                 currentChunkIndices[channelIndex]++; // Increment chunk index

                 // Combine header and encrypted chunk data
                 const encryptedChunkArray = new Uint8Array(encrypted.ciphertext);
                 const ivArray = new Uint8Array(encrypted.iv); // IV needed for decryption
                 const payload = new Uint8Array(header.byteLength + ivArray.length + encryptedChunkArray.length);
                 payload.set(new Uint8Array(header), 0);
                 payload.set(ivArray, header.byteLength);
                 payload.set(encryptedChunkArray, header.byteLength + ivArray.length);

                 // Send the combined data
                 const channel = dataChannels[channelIndex];

                 // Check for backpressure before sending
                 if (channel.bufferedAmount > channel.bufferedAmountLowThreshold * 2) { // More aggressive check
                      console.warn(`Channel ${channelIndex} buffer full (${channel.bufferedAmount}). Pausing slightly.`);
                      channelStates[channelIndex] = false; // Mark as busy
                      // Wait for bufferedAmountLow or use setTimeout as a fallback
                      await new Promise(resolve => {
                           const checkBuffer = () => {
                                if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
                                     channelStates[channelIndex] = true;
                                     resolve();
                                } else {
                                     setTimeout(checkBuffer, 50); // Check again shortly
                                }
                           };
                           channel.onbufferedamountlow = () => {
                                channelStates[channelIndex] = true;
                                console.log(`BufferedAmountLow triggered for channel ${channelIndex}`);
                                resolve();
                                channel.onbufferedamountlow = null; // Clean up listener
                           };
                           setTimeout(checkBuffer, 100); // Fallback timeout check
                      });
                      console.log(`Channel ${channelIndex} buffer cleared. Resuming send.`);
                 }

                 if (channel.readyState === 'open') {
                      channel.send(payload.buffer);
                      sendingProgress += chunkData.byteLength; // Update global progress

                      // Update UI (maybe less frequently for performance)
                      if (currentChunkIndices[channelIndex] % 10 === 0 || segmentOffsets[channelIndex] >= segmentEndOffsets[channelIndex]) {
                           const percent = Math.min(100, Math.floor((sendingProgress / totalFileSize) * 100));
                            // Update a general progress indicator if needed, or rely on receiver progress
                            statusSender.textContent = getTranslation('sendingProgress', { percent: percent });
                      }
                 } else {
                      console.warn(`Channel ${channelIndex} is not open. State: ${channel.readyState}. Aborting segment.`);
                      // Handle channel being closed unexpectedly during send
                      abortTransfer();
                      return; // Stop sending on this channel
                 }

                 // Continue sending chunks for this segment
                 if (segmentOffsets[channelIndex] < segmentEndOffsets[channelIndex]) {
                     // Use requestAnimationFrame or setTimeout(0) for better responsiveness
                     // requestAnimationFrame(() => readAndSendSegmentChunk(channelIndex)); 
                     setTimeout(() => readAndSendSegmentChunk(channelIndex), 0);
                 } else {
                     console.log(`Finished sending segment ${channelIndex}`);
                     // Check if all segments are done
                     if (sendingProgress >= totalFileSize) {
                         handleSendComplete();
                     }
                 }

            } catch (error) {
                 console.error(`Error reading/sending chunk for channel ${channelIndex}:`, error);
                 showToast(getTranslation('chunkReadSendError'), true);
                 abortTransfer();
            }
        }

        // Start sending chunks for all segments in parallel
        console.log("Initiating parallel chunk sending across channels...");
        for (let i = 0; i < NUM_CHANNELS; i++) {
             if (segmentOffsets[i] < segmentEndOffsets[i]) { // Only start if segment has data
                  // Use setTimeout to avoid blocking the main thread immediately
                 setTimeout(() => readAndSendSegmentChunk(i), 0);
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
    async function createPeerConnection(isInitiator) { // <-- Make async
        console.log(`Attempting to create PeerConnection. isInitiator: ${isInitiator}`); // ADDED
        resetRTCVariables(); // Reset variables before creating a new connection

        try {
            console.log("Executing: new RTCPeerConnection(RTC_CONFIGURATION)"); // ADDED
            peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
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

            console.log("Attaching oniceconnectionstatechange listener..."); // ADDED
            peerConnection.oniceconnectionstatechange = () => {
                if (peerConnection) {
                    console.log(`---> ICE Connection State Changed: ${peerConnection.iceConnectionState}`); // MODIFIED Log
                    if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
                        // Handle connection failure more gracefully
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
                peerConnection.ondatachannel = event => {
                    console.log('Data channel received:', event.channel.label);
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

         // If a channel closes unexpectedly during transfer, abort.
         // We need a reliable way to know if the closure was expected (end of transfer) or not.
         // For now, any closure during active transfer might indicate an error.
         if (receivingInProgress || (sendingProgress > 0 && sendingProgress < selectedFile?.size)) {
              if (!transferCompleteFlag) { // Add a flag to indicate normal completion
                 console.error(`Channel ${index} closed unexpectedly during transfer.`);
                 showToast(getTranslation('transferAbortedChannelClose'), true);
                 abortTransfer(); // Implement this function to clean up
             }
         }
         // If it's the receiver and all channels closed AFTER receiving all data, it's normal.
     }

     function handleDataChannelError(error, channel, index) {
         console.error(`Data channel ${index} (${channel.label}) error:`, error);
         showToast(`${getTranslation('channelError')} (${channel.label}): ${error.error?.message || error}`, true);
         channelStates[index] = false; // Mark channel as not ready
         abortTransfer(); // Abort on any channel error
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
     let transferCompleteFlag = false; // Flag to prevent abort messages on normal completion
     function abortTransfer() {
          if (transferCompleteFlag) return; // Don't abort if normally completed

          console.error("Aborting transfer...");
          if (fileReader) {
              fileReader.abort();
              fileReader = null;
          }
          closeDataChannels();
          closePeerConnection();
          resetRTCVariables();
          // Consider resetting receiver state too if applicable
          resetUI();
      }


    // --- End: Setup Data Channel ---


    // Handle incoming data channel messages (modified for multi-channel)
    async function handleDataChannelMessage(event) {
        if (!receivingInProgress) {
            // First message should be metadata (handled on channel 0)
            if (event.target.label === 'fileChannel-0') { 
                try {
                    const encryptedMetadata = JSON.parse(event.data);
                    if (!sharedKey) { /* ... error handling ... */ return; }
                    const decryptedPayload = await decryptData(sharedKey, encryptedMetadata.iv, encryptedMetadata.ciphertext);

                    if (decryptedPayload && decryptedPayload.type === 'fileMeta') {
                        fileMetadata = decryptedPayload.payload;
                        console.log('Received file metadata:', fileMetadata);
                        receivingInProgress = true;
                        receivedSize = 0;
                        segmentsReceived = 0;
                        transferCompleteFlag = false;

                        // Calculate expected segments and initialize buffers
                        const totalFileSize = fileMetadata.size;
                        const segmentSize = Math.ceil(totalFileSize / NUM_CHANNELS);
                        totalSegments = NUM_CHANNELS; // One segment per channel
                         segmentStatus = {};
                         for (let i = 0; i < totalSegments; i++) {
                             const start = i * segmentSize;
                             const end = Math.min(start + segmentSize, totalFileSize);
                             const expectedChunks = Math.ceil((end - start) / CHUNK_SIZE);
                             // Store buffer and tracking info per segment
                             segmentStatus[i] = { 
                                 received: 0, 
                                 total: expectedChunks,
                                 buffer: new Array(expectedChunks), // Pre-allocate buffer array
                                 isComplete: false,
                                 startIndex: start,
                                 endIndex: end
                             };
                         }
                        console.log(`Expecting ${totalSegments} segments. Segment status initialized:`, segmentStatus);

                        // Update UI for receiving
                        downloadIcon.textContent = '📥';
                        downloadMessage.textContent = getTranslation('receivingFile', { filename: fileMetadata.name });
                        progressContainer.classList.remove('hidden');
                        fileInfo.textContent = `${fileMetadata.name} (0 B / ${formatFileSize(fileMetadata.size)})`;
                        progressBar.style.width = '0%';
                        progressPercent.textContent = '0%';
                    } else {
                        console.warn('Received unexpected first message or decryption failed on channel 0.');
                    }
                } catch (error) {
                    console.error('Error parsing metadata:', error);
                    showToast(getTranslation('metadataError'), true);
                     abortTransfer();
                }
            } else {
                 console.warn(`Received non-metadata message on channel ${event.target.label} before metadata was processed.`);
            }
            return; // Don't process file chunks until metadata is received
        }

        // --- Process File Chunk ---
        if (!sharedKey) { 
            console.error("Shared key not available for chunk decryption!");
            showToast(getTranslation('decryptionError'), true);
            abortTransfer();
            return; 
        }

        try {
            const rawData = event.data; // Received as ArrayBuffer
            if (!(rawData instanceof ArrayBuffer) || rawData.byteLength < 12) {
                console.error('Invalid chunk data received. Expected ArrayBuffer with header.');
                 // Optional: Request resend or abort
                 return;
            }

            // Parse Header (12 bytes: segmentIndex, chunkIndex, totalChunksInSegment)
             const headerView = new DataView(rawData, 0, 12);
             const segmentIndex = headerView.getUint32(0, true);
             const chunkIndex = headerView.getUint32(4, true);
             const totalChunksInSegment = headerView.getUint32(8, true);

             // Extract IV (12 bytes) and Ciphertext
             const iv = rawData.slice(12, 24); // 12 bytes for AES-GCM IV
             const ciphertext = rawData.slice(24);

            if (segmentIndex < 0 || segmentIndex >= totalSegments) {
                 console.error(`Invalid segment index ${segmentIndex} received.`);
                 return;
            }

             // Decrypt the chunk
             const decryptedChunk = await decryptChunk(sharedKey, new Uint8Array(iv), new Uint8Array(ciphertext));
             if (!decryptedChunk) {
                 console.error(`Failed to decrypt chunk: Segment ${segmentIndex}, Chunk ${chunkIndex}`);
                 showToast(getTranslation('chunkDecryptError'), true);
                  // Decide how to handle: request resend? Abort?
                  // For now, might just drop the chunk and potentially fail later.
                 return;
             }

             // Store the decrypted chunk in the correct buffer
             const segment = segmentStatus[segmentIndex];
             if (!segment) {
                 console.error(`Segment status not found for index ${segmentIndex}`);
                 return;
             }

             // Update total chunks if this is the first chunk received for the segment
             // This relies on the header being correct. Could add checks.
             if (segment.total === -1) { 
                  segment.total = totalChunksInSegment;
                  segment.buffer = new Array(totalChunksInSegment); // Initialize buffer if not done yet
             }

              if (chunkIndex >= 0 && chunkIndex < segment.total && !segment.buffer[chunkIndex]) {
                  segment.buffer[chunkIndex] = decryptedChunk; // Store ArrayBuffer
                  segment.received++;
                  receivedSize += decryptedChunk.byteLength; // Update total received size

                 // Update progress
                 if (fileMetadata.size > 0) {
                     const percent = Math.min(100, Math.floor((receivedSize / fileMetadata.size) * 100));
                     progressBar.style.width = percent + '%';
                     progressPercent.textContent = percent + '%';
                     fileInfo.textContent = `${fileMetadata.name} (${formatFileSize(receivedSize)} / ${formatFileSize(fileMetadata.size)})`;
                 }

                 // Check if segment is complete
                 if (!segment.isComplete && segment.received === segment.total) {
                     segment.isComplete = true;
                     segmentsReceived++;
                     console.log(`Segment ${segmentIndex} received completely (${segment.received}/${segment.total} chunks). Total segments received: ${segmentsReceived}/${totalSegments}`);

                     // Check if all segments are complete
                     if (segmentsReceived === totalSegments) {
                         handleReceiveComplete();
                     }
                 }
             } else {
                  console.warn(`Duplicate or invalid chunk index received: Segment ${segmentIndex}, Chunk ${chunkIndex}. Already received: ${!!segment.buffer[chunkIndex]}`);
             }

        } catch (error) {
            console.error("Error processing received chunk:", error);
            showToast(getTranslation('receiveError'), true);
            abortTransfer(); // Abort on chunk processing error
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

             // Update UI to show download button/link
             downloadMessage.innerHTML = ''; // Clear receiving message
             const downloadButton = document.createElement('button');
             downloadButton.textContent = getTranslation('downloadButtonText', { filename: fileMetadata.name });
             downloadButton.className = 'btn btn-success w-full py-3 px-4 mt-2'; // Style as needed
             downloadButton.onclick = () => {
                 downloadLink.click();
                 // Clean up URL object after click
                 setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
                  // Optionally reset UI after download starts
                 // resetUI();
             };
             downloadMessage.appendChild(downloadButton);

             // Show success popup
             showSuccessPopup(getTranslation('transferSuccessMessage', { filename: fileMetadata.name }));

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
        selectedFile = null;
        fileReader = null;
        receivedSize = 0;
        receivedData = [];
        sendingProgress = 0;
        receivingInProgress = false;
        fileMetadata = { name: '', size: 0, type: '' };
        sharedKey = null; // Reset shared key
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
});