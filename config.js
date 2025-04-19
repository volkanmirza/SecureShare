// config.js - Configuration for language and theme settings

// Language configuration
const translations = {
    en: {
        // Header
        "appTitle": "foxfile.org",
        "appDescription": "Secure end-to-end encrypted file sharing.",
        
        // Upload section
        "shareFile": "Share File",
        "selectFilePrompt": "Click or drag to select a file",
        "selectedFile": "Selected file:",
        "shareButton": "Share File",
        "shareCode": "Share code:",
        "waitingForReceiver": "Waiting for receiver connection...",
        "receiverConnected": "Receiver connected. Exchanging signals...",
        "sendingFile": "Sending file...",
        "fileSuccessfullySent": "File successfully sent to receiver!",
        
        // Download section
        "downloadFile": "Download File",
        "enterShareCode": "Enter share code",
        "shareCodePlaceholder": "e.g. XYZ123",
        "connectAndDownload": "Connect and Download",
        "connecting": "Connecting...",
        "receivingFile": "Receiving file...",
        "transferComplete": "File transfer complete!",
        "startDownload": "Start Download",
        
        // Info section
        "howItWorks": "How It Works?",
        "step1Title": "1. File Selection",
        "step1Text": "The sender selects a file and a share code is generated.",
        "step2Title": "2. Code Sharing",
        "step2Text": "The sender shares the code with the receiver.",
        "step3Title": "3. Connection",
        "step3Text": "The receiver enters the code and a secure connection is established.",
        "step4Title": "4. Secure Transfer",
        "step4Text": "The file is transferred directly to the receiver with encryption.",
        "securityTitle": "Security",
        "securityText": "Your files are securely encrypted directly in your browser before sending. Only the intended receiver can decrypt them. Even our server cannot see the content of your files. We don't handle your files; we provide end-to-end encrypted transfer.",
        "principleTitle": "Working Principle",
        "principleText": "You connect securely to our server to find the other person using the share code. Once connected, the server helps relay the encrypted file data directly between you and the receiver.",
        "technologiesTitle": "Why Donation is Needed?",
        "technologiesText": "FoxFile is developed by an independent developer and is completely free. We need your support to cover server costs and keep the project sustainable.",
        
        // Footer
        "footerText": "foxfile.org © 2025 | End-to-end encrypted, peer-to-peer file sharing application",
        
        // Notifications
        "codeCopied": "Code copied",
        "codeCreated": "Share code created",
        "pleaseSelectFile": "Please select a file",
        "invalidCodeFormat": "Invalid code format",
        "connectionError": "Connection error occurred",
        "fileReadError": "File reading error",
        "scanQrCodePrompt": "Scan to download",
        "downloadSuccessReceiver": "File downloaded successfully!",
        // E2E Crypto & Connection Status
        "generatingCode": "Generating code...",
        "connectingToSender": "Connecting to sender...",
        "codeReceivedFromUrl": "Code received from URL, connecting...",
        "keyGenerationError": "Error generating encryption keys",
        "keyExchangeError": "Error during secure key exchange",
        "keyExchangeIncomplete": "Secure connection not ready",
        "secureConnectionEstablishedSending": "Secure connection established. Preparing to send...",
        "secureConnectionEstablishedWaiting": "Secure connection established. Waiting for file...",
        "encryptionError": "File encryption error",
        "decryptionError": "File decryption error",
        "downloadSetupError": "Error preparing file for download",
        "transferError": "File transfer error",
        "receiverConnectedInitiatingKeyExchange": "Receiver connected. Starting secure key exchange...",
        "connectedToSenderInitiatingKeyExchange": "Connected to sender. Starting secure key exchange...",
        "downloadStarting": "Download starting...",
        "fileSentWaitingConfirmation": "File sent. Waiting for receiver confirmation...",
        "transferSuccessPrompt": "File sent successfully! Select another file to share again.",
        // Popup translations
        "successTitle": "Success!",
        "okButton": "OK",
        // Donation Button
        "donateButton": "Support Us",
        "donateTooltipTitle": "If You Love This Project, You Can Support It!",
        "donateTooltipLine1": "FoxFile is developed by an independent developer and is completely free.",
        "donateTooltipLine2": "We need your support to cover server costs and keep the project sustainable."
    },
    tr: {
        // Header
        "appTitle": "foxfile.org",
        "appDescription": "Güvenli uçtan uca şifreli dosya paylaşımı.",
        
        // Upload section
        "shareFile": "Dosya Paylaş",
        "selectFilePrompt": "Dosya seçmek için tıklayın veya sürükleyin",
        "selectedFile": "Seçilen dosya:",
        "shareButton": "Dosya Paylaş",
        "shareCode": "Paylaşım kodu:",
        "waitingForReceiver": "Alıcı bağlantısı bekleniyor...",
        "receiverConnected": "Alıcı bağlandı. Sinyal alışverişi yapılıyor...",
        "sendingFile": "Dosya gönderiliyor...",
        "fileSuccessfullySent": "Dosya başarıyla alıcıya iletildi!",
        
        // Download section
        "downloadFile": "Dosya İndir",
        "enterShareCode": "Paylaşım kodunu girin",
        "shareCodePlaceholder": "Örn: XYZ123",
        "connectAndDownload": "Bağlan ve İndir",
        "connecting": "Bağlantı kuruluyor...",
        "receivingFile": "Dosya alınıyor...",
        "transferComplete": "Dosya transferi tamamlandı!",
        "startDownload": "İndirmeyi Başlat",
        
        // Info section
        "howItWorks": "Nasıl Çalışır?",
        "step1Title": "1. Dosya Seçimi",
        "step1Text": "Gönderici dosyasını seçer ve paylaşım kodu oluşturulur.",
        "step2Title": "2. Kod Paylaşımı",
        "step2Text": "Gönderici, paylaşım kodunu alıcıya iletir.",
        "step3Title": "3. Bağlantı",
        "step3Text": "Alıcı kodu girer ve güvenli bağlantı kurulur.",
        "step4Title": "4. Güvenli Transfer",
        "step4Text": "Dosya şifreli olarak doğrudan alıcıya aktarılır.",
        "securityTitle": "Güvenlik",
        "securityText": "Dosyalarınız gönderilmeden önce doğrudan tarayıcınızda güvenli bir şekilde şifrelenir. Sadece hedef alıcı şifreyi çözebilir. Sunucumuz bile dosyalarınızın içeriğini göremez. Dosyalarınızla ilgilenmiyoruz, size uçtan uca şifreli gönderim imkanı sunuyoruz.",
        "principleTitle": "Çalışma Prensibi",
        "principleText": "Paylaşım kodunu kullanarak diğer kişiyi bulmak için sunucumuza güvenli bir şekilde bağlanırsınız. Bağlantı kurulduktan sonra, sunucu şifrelenmiş dosya verisini sizinle alıcı arasında doğrudan iletmeye yardımcı olur.",
        "technologiesTitle": "Neden Bağış Gerekli?",
        "technologiesText": "FoxFile, bağımsız bir geliştirici tarafından geliştirilmiştir ve tamamen ücretsizdir. Sunucu maliyetlerini karşılamak ve projeyi sürdürülebilir kılmak için desteğinize ihtiyacımız var.",
        
        // Footer
        "footerText": "foxfile.org © 2025 | Uçtan uca şifreli, eşler arası dosya paylaşım uygulaması",
        
        // Notifications
        "codeCopied": "Kod kopyalandı",
        "codeCreated": "Paylaşım kodu oluşturuldu",
        "pleaseSelectFile": "Lütfen bir dosya seçin",
        "invalidCodeFormat": "Geçersiz kod formatı",
        "connectionError": "Bağlantı hatası oluştu",
        "fileReadError": "Dosya okuma hatası",
        "scanQrCodePrompt": "İndirmek için taratınız",
        "downloadSuccessReceiver": "Dosya başarıyla indirildi!",
        // E2E Crypto & Connection Status (Turkish)
        "generatingCode": "Kod oluşturuluyor...",
        "connectingToSender": "Göndericiye bağlanılıyor...",
        "codeReceivedFromUrl": "Kod URL'den alındı, bağlanılıyor...",
        "keyGenerationError": "Şifreleme anahtarları oluşturulurken hata",
        "keyExchangeError": "Güvenli anahtar değişimi sırasında hata",
        "keyExchangeIncomplete": "Güvenli bağlantı hazır değil",
        "secureConnectionEstablishedSending": "Güvenli bağlantı kuruldu. Gönderime hazırlanılıyor...",
        "secureConnectionEstablishedWaiting": "Güvenli bağlantı kuruldu. Dosya bekleniyor...",
        "encryptionError": "Dosya şifreleme hatası",
        "decryptionError": "Dosya şifre çözme hatası",
        "downloadSetupError": "Dosya indirmeye hazırlanırken hata",
        "transferError": "Dosya aktarım hatası",
        "receiverConnectedInitiatingKeyExchange": "Alıcı bağlandı. Güvenli anahtar değişimi başlatılıyor...",
        "connectedToSenderInitiatingKeyExchange": "Göndericiye bağlandı. Güvenli anahtar değişimi başlatılıyor...",
        "downloadStarting": "İndirme başlatılıyor...",
        "fileSentWaitingConfirmation": "Dosya gönderildi. Alıcı onayı bekleniyor...",
        "transferSuccessPrompt": "Dosya başarıyla gönderildi! Tekrar paylaşmak için başka bir dosya seçin.",
        // Popup translations (Turkish)
        "successTitle": "Başarılı!",
        "okButton": "Tamam",
        // Donation Button (Turkish)
        "donateButton": "Destek Ol",
        "donateTooltipTitle": "Bu Projeyi Sevdiysen Destek Olabilirsin!",
        "donateTooltipLine1": "FoxFile, bağımsız bir geliştirici tarafından geliştirilmiştir ve tamamen ücretsizdir.",
        "donateTooltipLine2": "Sunucu maliyetlerini karşılamak ve projeyi sürdürülebilir kılmak için desteğinize ihtiyacımız var."
    }
};

// Theme configuration
const themes = {
    light: {
        backgroundColor: "#f9fafb",
        cardBackgroundColor: "#ffffff",
        textColor: "#111827",
        secondaryTextColor: "#4b5563",
        accentColor: "#4f46e5",
        accentHoverColor: "#4338ca",
        borderColor: "#e5e7eb",
        inputBackgroundColor: "#f9fafb",
        successColor: "#10b981",
        successHoverColor: "#059669",
        errorColor: "#ef4444",
        infoBackgroundColor: "#f3f4f6"
    },
    dark: {
        backgroundColor: "#111827",
        cardBackgroundColor: "#1f2937",
        textColor: "#f9fafb",
        secondaryTextColor: "#d1d5db",
        accentColor: "#6366f1",
        accentHoverColor: "#4f46e5",
        borderColor: "#374151",
        inputBackgroundColor: "#374151",
        successColor: "#10b981",
        successHoverColor: "#059669",
        errorColor: "#ef4444",
        infoBackgroundColor: "#374151"
    }
};

// Get user's preferred language
function getPreferredLanguage() {
    // Check if language is stored in localStorage
    const storedLang = localStorage.getItem('preferredLanguage');
    if (storedLang && translations[storedLang]) {
        return storedLang;
    }
    
    // Check browser language
    const browserLang = navigator.language.split('-')[0];
    return browserLang === 'tr' ? 'tr' : 'en';
}

// Get user's preferred theme
function getPreferredTheme() {
    // Check if theme is stored in localStorage
    const storedTheme = localStorage.getItem('preferredTheme');
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
        return storedTheme;
    }
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    
    return 'light';
}

// Set language
function setLanguage(lang) {
    if (!translations[lang]) {
        lang = 'en';
    }
    
    localStorage.setItem('preferredLanguage', lang);
    document.documentElement.setAttribute('lang', lang);
    
    // Update all text elements with translations
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
    
    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            element.setAttribute('placeholder', translations[lang][key]);
        }
    });
}

// Set theme
function setTheme(theme) {
    if (!themes[theme]) {
        theme = 'light';
    }
    
    localStorage.setItem('preferredTheme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    
    // Apply theme colors to CSS variables
    const root = document.documentElement;
    Object.entries(themes[theme]).forEach(([property, value]) => {
        root.style.setProperty(`--${property}`, value);
    });
}

// Toggle language
function toggleLanguage() {
    const currentLang = localStorage.getItem('preferredLanguage') || getPreferredLanguage();
    const newLang = currentLang === 'tr' ? 'en' : 'tr';
    setLanguage(newLang);
}

// Toggle theme
function toggleTheme() {
    const currentTheme = localStorage.getItem('preferredTheme') || getPreferredTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// Initialize language and theme
function initializeSettings() {
    const preferredLanguage = getPreferredLanguage();
    const preferredTheme = getPreferredTheme();
    
    setLanguage(preferredLanguage);
    setTheme(preferredTheme);
    
    // Listen for system theme changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            // Only change theme if user hasn't manually set a preference
            if (!localStorage.getItem('preferredTheme')) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
}

// --- Start: Added RTC Configuration Function ---
function getRTCConfiguration() {
    // You can add more STUN/TURN servers here if needed
    // Example using Google's public STUN servers
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Add TURN server configurations here if you have them
            // {
            //   urls: 'turn:your-turn-server.com:3478',
            //   username: 'your-username',
            //   credential: 'your-password'
            // }
        ]
    };
    console.log("Using RTC Configuration:", configuration);
    return configuration;
}
// --- End: Added RTC Configuration Function ---

// Expose functions and data to the global scope via window.appConfig
window.appConfig = {
    translations,
    themes,
    getPreferredLanguage,
    getPreferredTheme,
    setLanguage,
    setTheme,
    toggleLanguage,
    toggleTheme,
    initializeSettings,
    getRTCConfiguration
};