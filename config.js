// config.js - Configuration for language and theme settings

// Language configuration
const translations = {
    en: {
        // Header
        "appTitle": "SecureShare",
        "appDescription": "End-to-end encrypted peer-to-peer file sharing",
        
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
        "securityText": "Files are transferred with end-to-end encryption over WebRTC's DTLS protocol. File contents never reach servers, they are sent directly to the receiver.",
        "principleTitle": "Working Principle",
        "principleText": "Peer-to-peer connection is established with WebRTC. A WebSocket-based signaling server only mediates the initial connection setup between the two parties.",
        "technologiesTitle": "Technologies",
        "technologiesText": "A modern and secure file sharing application developed using HTML5, Tailwind CSS, Vanilla JavaScript, WebRTC, WebSocket, and Node.js technologies.",
        
        // Footer
        "footerText": "SecureShare © 2023 | End-to-end encrypted, peer-to-peer file sharing application",
        
        // Notifications
        "codeCopied": "Code copied",
        "codeCreated": "Share code created",
        "pleaseSelectFile": "Please select a file",
        "invalidCodeFormat": "Invalid code format",
        "connectionError": "Connection error occurred",
        "fileReadError": "File reading error"
    },
    tr: {
        // Header
        "appTitle": "SecureShare",
        "appDescription": "Uçtan uca şifreli eşler arası dosya paylaşımı",
        
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
        "securityText": "Dosyalar uçtan uca şifreli olarak, WebRTC'nin sağladığı DTLS protokolü üzerinden aktarılır. Dosya içeriği asla sunuculara ulaşmaz, doğrudan alıcıya gönderilir.",
        "principleTitle": "Çalışma Prensibi",
        "principleText": "WebRTC ile eşler arası bağlantı kurulur. WebSocket tabanlı bir sinyal sunucusu sadece iki taraf arasındaki ilk bağlantı kurulumuna aracılık eder.",
        "technologiesTitle": "Teknolojiler",
        "technologiesText": "HTML5, Tailwind CSS, Vanilla JavaScript, WebRTC, WebSocket, Node.js teknolojileri kullanılarak geliştirilmiş, modern ve güvenli bir dosya paylaşım uygulamasıdır.",
        
        // Footer
        "footerText": "SecureShare © 2023 | Uçtan uca şifreli, eşler arası dosya paylaşım uygulaması",
        
        // Notifications
        "codeCopied": "Kod kopyalandı",
        "codeCreated": "Paylaşım kodu oluşturuldu",
        "pleaseSelectFile": "Lütfen bir dosya seçin",
        "invalidCodeFormat": "Geçersiz kod formatı",
        "connectionError": "Bağlantı hatası oluştu",
        "fileReadError": "Dosya okuma hatası"
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

// Export configuration
window.appConfig = {
    translations,
    themes,
    getPreferredLanguage,
    getPreferredTheme,
    setLanguage,
    setTheme,
    toggleLanguage,
    toggleTheme,
    initializeSettings
};