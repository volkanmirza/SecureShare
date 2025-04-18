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
    
    // WebSocket connection
    let socket = null;
    
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
    
    // Initialize WebSocket connection
    function initWebSocket() {
        if (socket !== null) {
            socket.close();
        }
        
        socket = new WebSocket(WS_URL);
        
        socket.onopen = function() {
            console.log('WebSocket connection established');
        };
        
        socket.onmessage = function(event) {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'code-created':
                    shareCode.value = message.code;
                    showToast(getTranslation('codeCreated'));
                    shareResult.classList.remove('hidden');
                    statusSender.textContent = getTranslation('waitingForReceiver');
                    break;
                    
                case 'receiver-connected':
                    statusSender.textContent = getTranslation('receiverConnected');
                    initiateWebRTCConnection();
                    break;
                    
                case 'offer':
                    handleOffer(message.offer);
                    break;
                    
                case 'answer':
                    handleAnswer(message.answer);
                    break;
                    
                case 'ice-candidate':
                    handleIceCandidate(message.candidate);
                    break;
                    
                case 'error':
                    showToast(message.message, true);
                    resetUI();
                    break;
                    
                case 'download-complete':
                    if (statusSender) {
                        statusSender.textContent = getTranslation('fileSuccessfullySent');
                        setTimeout(() => {
                            resetUI();
                        }, 3000);
                    }
                    break;
                    
                default:
                    console.warn('Unknown message type:', message.type);
            }
        };
        
        socket.onclose = function() {
            console.log('WebSocket connection closed');
        };
        
        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
            showToast(getTranslation('connectionError'), true);
        };
    }
    
    // Get translation based on current language
    function getTranslation(key) {
        if (!window.appConfig) return '';
        
        const currentLang = localStorage.getItem('preferredLanguage') || 
                           window.appConfig.getPreferredLanguage();
        
        return window.appConfig.translations[currentLang][key] || key;
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
    
    // Setup WebRTC connection as sender
    function initiateWebRTCConnection() {
        createPeerConnection();
        
        // Create a data channel for file transfer
        dataChannel = peerConnection.createDataChannel('fileTransfer');
        setupDataChannel(dataChannel);
        
        // Create an offer to send to the receiver
        peerConnection.createOffer()
            .then(offer => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                // Send the offer to the signaling server
                socket.send(JSON.stringify({
                    type: 'offer',
                    offer: peerConnection.localDescription
                }));
            })
            .catch(error => {
                console.error('Error creating offer:', error);
                showToast(getTranslation('connectionError'), true);
            });
    }
    
    // Create and set up a new RTCPeerConnection
    function createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        peerConnection = new RTCPeerConnection(configuration);
        
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate
                }));
            }
        };
        
        peerConnection.ondatachannel = event => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };
    }
    
    // Set up data channel event handlers
    function setupDataChannel(channel) {
        channel.binaryType = 'arraybuffer';
        
        channel.onopen = () => {
            console.log('Data channel opened');
            
            if (channel.label === 'fileTransfer') {
                if (selectedFile) {
                    // Sender mode - send file metadata first
                    statusSender.textContent = getTranslation('sendingFile') + ' 0%';
                    
                    const metadata = {
                        name: selectedFile.name,
                        size: selectedFile.size,
                        type: selectedFile.type || 'application/octet-stream'
                    };
                    
                    channel.send(JSON.stringify({
                        type: 'metadata',
                        data: metadata
                    }));
                    
                    // Start sending the file after a short delay
                    setTimeout(() => sendFile(), 100);
                }
            }
        };
        
        channel.onclose = () => {
            console.log('Data channel closed');
        };
        
        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
        
        channel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                // Handle string messages (metadata or control messages)
                try {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'metadata') {
                        // Receiver mode - prepare to receive file
                        fileMetadata = message.data;
                        receivedSize = 0;
                        receivedData = [];
                        receivingInProgress = true;
                        
                        // Update UI
                        downloadIcon.textContent = '📥';
                        downloadMessage.textContent = getTranslation('receivingFile');
                        fileInfo.textContent = `${fileMetadata.name} (${formatFileSize(fileMetadata.size)})`;
                        progressContainer.classList.remove('hidden');
                    }
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            } else {
                // Handle binary data (file chunks)
                if (receivingInProgress) {
                    receivedData.push(event.data);
                    receivedSize += event.data.byteLength;
                    
                    // Update progress
                    const percentComplete = Math.round((receivedSize / fileMetadata.size) * 100);
                    progressBar.style.width = `${percentComplete}%`;
                    progressPercent.textContent = `${percentComplete}%`;
                    
                    // Check if file transfer is complete
                    if (receivedSize === fileMetadata.size) {
                        // File transfer complete
                        receivingInProgress = false;
                        
                        // Prepare file for download
                        const receivedBlob = new Blob(receivedData, { type: fileMetadata.type });
                        const downloadUrl = URL.createObjectURL(receivedBlob);
                        
                        // Update UI
                        downloadIcon.textContent = '✅';
                        downloadMessage.textContent = getTranslation('transferComplete');
                        downloadBtn.classList.remove('hidden');
                        
                        // Set up download button
                        downloadBtn.onclick = () => {
                            const a = document.createElement('a');
                            a.href = downloadUrl;
                            a.download = fileMetadata.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            
                            // Notify sender that download is complete
                            socket.send(JSON.stringify({
                                type: 'download-complete'
                            }));
                            
                            // Reset after a short delay
                            setTimeout(() => {
                                resetUI();
                            }, 3000);
                        };
                    }
                }
            }
        };
    }
    
    // Handle an offer from the peer
    function handleOffer(offer) {
        createPeerConnection();
        
        peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => peerConnection.createAnswer())
            .then(answer => peerConnection.setLocalDescription(answer))
            .then(() => {
                socket.send(JSON.stringify({
                    type: 'answer',
                    answer: peerConnection.localDescription
                }));
            })
            .catch(error => {
                console.error('Error handling offer:', error);
                showToast(getTranslation('connectionError'), true);
            });
    }
    
    // Handle an answer from the peer
    function handleAnswer(answer) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .catch(error => {
                console.error('Error handling answer:', error);
                showToast(getTranslation('connectionError'), true);
            });
    }
    
    // Handle an ICE candidate from the peer
    function handleIceCandidate(candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => {
                console.error('Error adding ICE candidate:', error);
            });
    }
    
    // Send the selected file in chunks
    function sendFile() {
        if (!dataChannel || dataChannel.readyState !== 'open' || !selectedFile) {
            return;
        }
        
        fileReader = new FileReader();
        let offset = 0;
        
        fileReader.addEventListener('error', error => {
            console.error('Error reading file:', error);
            showToast(getTranslation('fileReadError'), true);
        });
        
        fileReader.addEventListener('abort', () => {
            console.log('File reading aborted');
        });
        
        fileReader.addEventListener('load', event => {
            if (dataChannel.readyState === 'open') {
                dataChannel.send(event.target.result);
                offset += event.target.result.byteLength;
                
                // Update progress
                sendingProgress = Math.round((offset / selectedFile.size) * 100);
                statusSender.textContent = `${getTranslation('sendingFile')} ${sendingProgress}%`;
                
                // Check if there's more data to send
                if (offset < selectedFile.size) {
                    readSlice(offset);
                }
            }
        });
        
        const readSlice = o => {
            const slice = selectedFile.slice(o, o + CHUNK_SIZE);
            fileReader.readAsArrayBuffer(slice);
        };
        
        readSlice(0);
    }
    
    // Reset UI to initial state
    function resetUI() {
        // Reset file upload UI
        fileInput.value = '';
        filePrompt.textContent = getTranslation('selectFilePrompt');
        fileName.textContent = '';
        fileSize.textContent = '';
        fileName.classList.add('hidden');
        fileSize.classList.add('hidden');
        fileIcon.textContent = '📁';
        shareBtn.disabled = true;
        shareResult.classList.add('hidden');
        statusSender.textContent = '';
        
        // Reset download UI
        receiveCode.value = '';
        downloadStatus.classList.add('hidden');
        downloadIcon.textContent = '⏳';
        downloadMessage.textContent = getTranslation('connecting');
        progressContainer.classList.add('hidden');
        downloadBtn.classList.add('hidden');
        
        // Reset variables
        selectedFile = null;
        fileReader = null;
        receivedSize = 0;
        receivedData = [];
        sendingProgress = 0;
        receivingInProgress = false;
        
        // Close connections
        if (dataChannel) {
            dataChannel.close();
            dataChannel = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
    }
    
    // Format file size in human-readable form
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Show a toast notification
    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.className = isError 
            ? 'fixed bottom-4 right-4 toast-error px-4 py-2 rounded-md shadow-lg transition-opacity duration-300 opacity-0 pointer-events-none' 
            : 'fixed bottom-4 right-4 toast-success px-4 py-2 rounded-md shadow-lg transition-opacity duration-300 opacity-0 pointer-events-none';
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
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
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    
    // Handle file select from input or drag-drop
    function handleFileSelect(file) {
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
        downloadStatus.classList.remove('hidden');
        
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
});