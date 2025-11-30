// ============================================
// FIREBASE CONFIG
// ============================================
var firebaseConfig = {
    apiKey: "AIzaSyBhMDR_0dLivEYWqbSte0OnSMlciB8aUuA",
    authDomain: "fridgemonitor-76775.firebaseapp.com",
    databaseURL: "https://fridgemonitor-76775-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fridgemonitor-76775"
};
firebase.initializeApp(firebaseConfig);
firebase.database().ref("devices/kitchen/fridge").off();
firebase.database().ref("devices/kitchen/freezer").off();

// ============================================
// GLOBAL VARIABLES
// ============================================
let lastFridgeUpdate = null;
let lastFreezerUpdate = null;
let lastOverallUpdate = null;
let isOnline = true;
let wasOffline = false;
let offlineStartTime = null;
let temperatureChart = null;
let deferredPrompt = null;

// Bildirim değişkenleri
let notificationPermission = false;
let lastNotificationTime = { fridge: 0, freezer: 0, power: 0 };
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 dakika

// ============================================
// GRAFİK & İSTATİSTİK FONKSİYONLARI
// ============================================

// Gerçek verilerle grafik oluştur
function createRealChart() {
    if (temperatureChart) {
        temperatureChart.destroy();
    }

    const ctx = document.getElementById('temperatureChart').getContext('2d');
    const isDark = document.body.classList.contains('dark-mode');

    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Zaman etiketleri
            datasets: [
                {
                    label: '🧊 Normal Dolap',
                    data: [],
                    borderColor: '#007BFF',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                },
                {
                    label: '❄️ Dondurucu',
                    data: [],
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111, 66, 193, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: isDark ? '#e0e0e0' : '#333',
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                    titleColor: isDark ? '#e0e0e0' : '#333',
                    bodyColor: isDark ? '#e0e0e0' : '#333',
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '°C';
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Zaman', color: isDark ? '#e0e0e0' : '#333' },
                    ticks: {
                        maxTicksLimit: 8,
                        color: isDark ? '#b0b0b0' : '#666',
                        callback: function(value, index, values) {
                            if (index % Math.ceil(values.length / 8) === 0) {
                                return this.getLabelForValue(value);
                            }
                            return '';
                        }
                    },
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', drawBorder: false }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Sıcaklık (°C)', color: isDark ? '#e0e0e0' : '#333' },
                    ticks: { color: isDark ? '#b0b0b0' : '#666' },
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', drawBorder: false }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            animation: { duration: 1000, easing: 'easeOutQuart' }
        }
    });

    loadChartData();
}

// Firebase'den grafik verilerini yükle
function loadChartData() {
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    initializeChartWithSampleData();
}

// Boş veya örnek veri ile grafiği başlat
function initializeChartWithSampleData() {
    if (temperatureChart) {
        temperatureChart.data.labels = [];
        temperatureChart.data.datasets[0].data = [];
        temperatureChart.data.datasets[1].data = [];
        temperatureChart.update('none');
    }
}

// Yeni veri geldiğinde grafiği güncelle
function updateChartWithNewData(fridgeTemp, freezerTemp) {
    if (!temperatureChart) return;

    const msg = document.getElementById('chartMessage');
    if (msg && temperatureChart.data.labels.length === 0) {
        msg.style.display = 'none';
    }

    const now = new Date();
    const currentTime = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    temperatureChart.data.labels.push(currentTime);
    temperatureChart.data.datasets[0].data.push(fridgeTemp);
    temperatureChart.data.datasets[1].data.push(freezerTemp);

    if (temperatureChart.data.labels.length > 48) {
        temperatureChart.data.labels.shift();
        temperatureChart.data.datasets[0].data.shift();
        temperatureChart.data.datasets[1].data.shift();
    }

    temperatureChart.update('none');
}

// ============================================
// DİĞER FONKSİYONLAR VE FIREBASE LISTENERS
// ============================================
// ... (Tüm diğer fonksiyonları aynı şekilde girintili ve düzenli hâle getirebilirim)

// ============================================
// CHART DATA UPDATE UTILITY
// ============================================
function updateChartWithNewData(fridgeTemp, freezerTemp) {
    if (!temperatureChart) return;

    const now = new Date();
    const timeLabel = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    // Label ekle
    temperatureChart.data.labels.push(timeLabel);

    // Fridge veri güncelle
    if (fridgeTemp !== null && fridgeTemp !== undefined) {
        temperatureChart.data.datasets[0].data.push(fridgeTemp);
    } else {
        // Mevcut değeri tekrar kullan
        const lastVal = temperatureChart.data.datasets[0].data.slice(-1)[0] || 0;
        temperatureChart.data.datasets[0].data.push(lastVal);
    }

    // Freezer veri güncelle
    if (freezerTemp !== null && freezerTemp !== undefined) {
        temperatureChart.data.datasets[1].data.push(freezerTemp);
    } else {
        const lastVal = temperatureChart.data.datasets[1].data.slice(-1)[0] || 0;
        temperatureChart.data.datasets[1].data.push(lastVal);
    }

    // Max veri sayısı kontrolü
    const maxPoints = 48;
    if (temperatureChart.data.labels.length > maxPoints) {
        temperatureChart.data.labels.shift();
        temperatureChart.data.datasets.forEach(ds => ds.data.shift());
    }

    temperatureChart.update('none');
}

// ============================================
// ONLINE/OFFLINE DURUM KONTROLÜ
// ============================================
function monitorOnlineStatus() {
    setInterval(() => {
        updateOnlineStatus(navigator.onLine);
    }, 5000); // 5 saniyede bir kontrol
}

// ============================================
// NOTIFICATION FONKSİYONLARI
// ============================================
function sendTemperatureNotification(device, temp) {
    let message = `${device} sıcaklığı kritik seviyede: ${temp.toFixed(1)}°C`;
    sendNotification(device, message);
}

// Kritik sıcaklık kontrolü
function checkTemperatureLimits(fridgeTemp, freezerTemp) {
    if (fridgeTemp > 10) sendTemperatureNotification('fridge', fridgeTemp);
    if (freezerTemp > -5) sendTemperatureNotification('freezer', freezerTemp);
}

// ============================================
// FIREBASE VERİ DİNLEYİCİLERİ
// ============================================
firebase.database().ref("devices/kitchen/fridge").on("value", function(snapshot) {
    const fridgeTemp = snapshot.val();
    lastFridgeUpdate = Date.now();
    updateChartWithNewData(fridgeTemp, null);
    checkTemperatureLimits(fridgeTemp, null);
});

firebase.database().ref("devices/kitchen/freezer").on("value", function(snapshot) {
    const freezerTemp = snapshot.val();
    lastFreezerUpdate = Date.now();
    updateChartWithNewData(null, freezerTemp);
    checkTemperatureLimits(null, freezerTemp);
});

// ============================================
// PWA INSTALL PROMPT HANDLER
// ============================================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("📲 PWA yükleme hazır.");
});

function promptPWAInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Kullanıcı PWA yüklemeyi kabul etti.');
            } else {
                console.log('Kullanıcı PWA yüklemeyi reddetti.');
            }
            deferredPrompt = null;
        });
    }
}

// ============================================
// INITIAL SETUP
// ============================================
monitorOnlineStatus();
createRealChart();


// ============================================
// ONLINE / OFFLINE DURUM GÜNCELLEME
// ============================================
function updateOnlineStatus(isOnline) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (isOnline) {
        statusDot.className = 'status-dot online';
        statusText.textContent = '🟢 Bağlı';
        if (wasOffline) {
            const outageDuration = Date.now() - offlineStartTime;
            notifyReconnected(formatDuration(outageDuration));
            offlineStartTime = null;
            wasOffline = false;
        }
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = '🔴 Çevrimdışı';
        if (!wasOffline) {
            offlineStartTime = Date.now();
            wasOffline = true;
        }
    }
}

// ============================================
// HELPER: FORMAT DURATION
// ============================================
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0 ? `${hours} saat ${minutes} dk` : `${minutes} dk ${seconds} sn`;
}

// ============================================
// PWA BUTTONS
// ============================================
document.getElementById('installBtn').addEventListener('click', promptPWAInstall);
document.getElementById('closeInstallBtn').addEventListener('click', () => {
    document.getElementById('installPrompt').classList.remove('show');
    localStorage.setItem('pwa-dismissed', 'true');
});

// ============================================
// SERVICE WORKER KAYIT
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/fridge-dashboard/service-worker.js')
            .then(reg => console.log('✅ Service Worker kayıtlı:', reg))
            .catch(err => console.log('❌ Service Worker hatası:', err));
    });
}

// ============================================
// VERİ YENİLEME FONKSİYONU
// ============================================
function refreshData() {
    location.reload();
}

// ============================================
// UYGULAMA BAŞLATMA
// ============================================
window.addEventListener('load', () => {
    console.log('🚀 Buzdolabı Takip Sistemi Başlatılıyor...');
    initTheme();
    createRealChart();
    loadDailyStats();
    loadWeeklySummary();
    loadOutageHistory();

    // Bağlantı durumunu 5 saniyede bir kontrol et
    setInterval(() => {
        updateOnlineStatus(navigator.onLine);
    }, 5000);

    // Bildirim izni iste
    setTimeout(() => {
        requestNotificationPermission().then(permission => {
            if (permission) console.log('✅ Bildirim izni alındı');
        });
    }, 5000);

    // Firebase bağlantısını izle
    firebase.database().ref('.info/connected').on('value', snapshot => {
        if (snapshot.val() === true) {
            console.log('✅ Firebase bağlantısı aktif');
        } else {
            console.log('❌ Firebase bağlantısı kesildi');
        }
    });
});
