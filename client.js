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
                    keyPair = await generateKeyPair();
                    console.log("Sender keys generated.");

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
                    keyPair = await generateKeyPair();
                    console.log("Receiver keys generated.");
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
                    try {
                         // Correctly read the key from message.data as forwarded by the server
                         const remotePublicKeyData = base64ToArrayBuffer(message.data); // <-- Change from message.key to message.data
                         const remotePublicKey = await importPublicKey(remotePublicKeyData);

                         if (keyPair && keyPair.privateKey && remotePublicKey) {
                             sharedKey = await deriveSharedKey(keyPair.privateKey, remotePublicKey);
                             console.log("Shared key derived successfully.");
                             // Key exchange complete, proceed with file transfer initiation
                              if (selectedFile) { // Sender: Start transfer if file is selected
                                  statusSender.textContent = getTranslation('secureConnectionEstablishedSending');
                                  initiateWebSocketFileTransfer();
                              } else { // Receiver: Ready to receive metadata
                                  downloadMessage.textContent = getTranslation('secureConnectionEstablishedWaiting');
                              }
                         } else {
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
             if (!downloadBtn.classList.contains('hidden')) {
                 // Don't reset if download is ready
             } else {
                 // resetUI(); // Avoid resetting if user is about to download
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
    async function sendFile() { // <-- Make async
        if (!socket || socket.readyState !== WebSocket.OPEN || !selectedFile || !sharedKey) {
            console.error("Cannot send file: WebSocket not open, file not selected, or shared key not ready.");
             if (!sharedKey) showToast(getTranslation('keyExchangeIncomplete'), true);
            return;
        }

        console.log("Starting encrypted file send...");
        // 1. Send encrypted metadata first
         const metadata = {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type || 'application/octet-stream'
        };
         try {
             const encryptedMetadata = await encryptData(sharedKey, metadata);
             console.log("Sending encrypted metadata:", encryptedMetadata);
             socket.send(JSON.stringify({
                 type: 'metadata',
                 data: {
                     iv: Array.from(encryptedMetadata.iv),
                     ciphertext: Array.from(new Uint8Array(encryptedMetadata.ciphertext))
                 }
             }));
         } catch (error) {
             console.error("Error encrypting/sending metadata:", error);
             showToast(getTranslation('encryptionError'), true);
             resetUI();
             return;
         }


        // 2. Send encrypted file chunks
        fileReader = new FileReader();
        let offset = 0;
        sendingProgress = 0; // Reset progress

        fileReader.addEventListener('error', error => {
            console.error('Error reading file:', error);
            showToast(getTranslation('fileReadError'), true);
             resetUI(); // Reset on file read error
        });

        fileReader.addEventListener('abort', () => {
            console.log('File reading aborted');
             // Consider if resetUI() is needed here
        });

        fileReader.addEventListener('load', async (event) => { // <-- Make async
            if (socket.readyState !== WebSocket.OPEN || !sharedKey) {
                 console.warn("WebSocket closed or shared key lost during file read.");
                 resetUI(); // Reset if connection lost during transfer
                 return;
             }

            const chunk = event.target.result; // ArrayBuffer

             try {
                 const encryptedChunk = await encryptChunk(sharedKey, chunk);
                 // console.log(`Sending encrypted chunk, offset: ${offset}, size: ${chunk.byteLength}`);

                 socket.send(JSON.stringify({
                     type: 'file-chunk',
                     data: encryptedChunk // Already contains { iv, ciphertext (as array) }
                 }));

                 offset += chunk.byteLength;

                 // Update progress
                 sendingProgress = Math.round((offset / selectedFile.size) * 100);
                 statusSender.textContent = `${getTranslation('sendingFile')} ${sendingProgress}%`;

                 // Check if there's more data to send
                 if (offset < selectedFile.size) {
                     readNextChunk(offset);
                 } else {
                     console.log('Finished sending file chunks.');
                     // statusSender.textContent = getTranslation('fileSentWaitingConfirmation'); // Wait for 'download-complete'
                 }
             } catch(error) {
                  console.error("Error encrypting/sending chunk:", error);
                  showToast(getTranslation('encryptionError'), true);
                  resetUI();
                  // Stop sending further chunks
             }
        });

        function readNextChunk(currentOffset) {
            const slice = selectedFile.slice(currentOffset, currentOffset + CHUNK_SIZE);
            fileReader.readAsArrayBuffer(slice);
        }

        // Start reading the first chunk
        readNextChunk(offset);
    }

    // This function is now only called *after* key exchange is complete
    function initiateWebSocketFileTransfer() {
         if (selectedFile && sharedKey) {
             console.log("Key exchange complete, initiating file transfer.");
             sendFile(); // Call the async sendFile function
         } else {
             console.log("Key exchange complete, waiting for sender to initiate transfer.");
             // Receiver side: We just wait for 'metadata' message
         }
    }
    
    // Reset UI to initial state
    function resetUI() {
        console.log("Resetting UI and state.");
        // Reset file input and related UI
        if (fileInput) fileInput.value = ''; // Clear file input
        if (filePrompt) filePrompt.classList.remove('hidden');
        if (fileName) fileName.textContent = '';
        if (fileSize) fileSize.textContent = '';
        if (fileIcon) fileIcon.className = 'fas fa-file-upload text-4xl text-gray-400';
        if (dropZone) dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        if (shareBtn) shareBtn.disabled = true;
        if (shareResult) shareResult.classList.add('hidden');
        if (shareCode) shareCode.value = '';
        if (statusSender) statusSender.textContent = '';

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
        // Reset previous share state if a new file is selected after sharing
        if (!shareResult.classList.contains('hidden')) {
            console.log('New file selected while a share was active. Resetting UI.');
            resetUI();
            // Optionally re-initialize WebSocket if resetUI doesn't handle it sufficiently
            // initWebSocket(); 
        }

        selectedFile = file;
        
        // Update UI
        filePrompt.textContent = getTranslation('selectedFile');
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileIcon.textContent = getFileIcon(file.name);
        
        fileName.classList.remove('hidden');
        fileSize.classList.remove('hidden');
        shareBtn.disabled = false;
    }
    
    // Share button click
    shareBtn.addEventListener('click', function() {
        if (!selectedFile) {
            showToast(getTranslation('pleaseSelectFile'), true);
            return;
        }
        
        initWebSocket();
        
        initiateWebSocketFileTransfer();
        
        // Generate and send share code
        const code = generateSecureCode();
        
        // Wait for socket to be ready
        const waitForSocketConnection = callback => {
            setTimeout(() => {
                if (socket.readyState === 1) {
                    if (callback !== null) {
                        callback();
                    }
                } else {
                    waitForSocketConnection(callback);
                }
            }, 100);
        };
        
        waitForSocketConnection(() => {
            socket.send(JSON.stringify({
                type: 'create-code',
                code: code
            }));
        });
    });
    
    // Copy button click
    copyBtn.addEventListener('click', function() {
        shareCode.select();
        document.execCommand('copy');
        showToast(getTranslation('codeCopied'));
    });
    
    // Receive button click
    receiveBtn.addEventListener('click', function() {
        const code = receiveCode.value.trim().toUpperCase();
        
        if (code.length !== CODE_LENGTH) {
            showToast(getTranslation('invalidCodeFormat'), true);
            return;
        }
        
        initWebSocket();
        
        // Wait for socket to be ready
        const waitForSocketConnection = callback => {
            setTimeout(() => {
                if (socket.readyState === 1) {
                    if (callback !== null) {
                        callback();
                    }
                } else {
                    waitForSocketConnection(callback);
                }
            }, 100);
        };
        
        waitForSocketConnection(() => {
            socket.send(JSON.stringify({
                type: 'join-code',
                code: code
            }));
        });
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
});