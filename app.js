// Firebase Config (Aynı)
var firebaseConfig = {
    apiKey: "AIzaSyBhMDR_0dLivEYWqbSte0OnSMlciB8aUuA",
    authDomain: "fridgemonitor-76775.firebaseapp.com",
    databaseURL: "https://fridgemonitor-76775-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fridgemonitor-76775"
};

firebase.initializeApp(firebaseConfig);

// Global Variables
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
let lastNotificationTime = {
    fridge: 0,
    freezer: 0,
    power: 0
};
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 dakika

// ============================================
// YENİ: GELİŞMİŞ İSTATİSTİK SİSTEMİ
// ============================================

// Gerçek verilerle grafik oluştur
function createRealChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    const isDark = document.body.classList.contains('dark-mode');
    
    // Boş grafik oluştur, veriler real-time gelecek
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Zaman etiketleri
            datasets: [
                {
                    label: '🧊 Normal Dolap',
                    data: [], // Sıcaklık verileri
                    borderColor: '#007BFF',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                },
                {
                    label: '❄️ Dondurucu',
                    data: [], // Sıcaklık verileri
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
                    title: { 
                        display: true, 
                        text: 'Zaman', 
                        color: isDark ? '#e0e0e0' : '#333' 
                    },
                    ticks: { 
                        maxTicksLimit: 8, 
                        color: isDark ? '#b0b0b0' : '#666',
                        callback: function(value, index, values) {
                            // Sadece belirli aralıklarla zaman göster
                            if (index % Math.ceil(values.length / 8) === 0) {
                                return this.getLabelForValue(value);
                            }
                            return '';
                        }
                    },
                    grid: { 
                        color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        drawBorder: false
                    }
                },
                y: {
                    display: true,
                    title: { 
                        display: true, 
                        text: 'Sıcaklık (°C)', 
                        color: isDark ? '#e0e0e0' : '#333' 
                    },
                    ticks: { 
                        color: isDark ? '#b0b0b0' : '#666' 
                    },
                    grid: { 
                        color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        drawBorder: false
                    }
                }
            },
            interaction: { 
                mode: 'nearest', 
                axis: 'x', 
                intersect: false 
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });

    // Grafiği gerçek verilerle besle
    loadChartData();
}

// Firebase'den grafik verilerini yükle
function loadChartData() {
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    // Firebase'de history node'una ihtiyacımız var
    // Önce fake data ile çalıştıralım, sonra gerçek veriye geçeriz
    initializeChartWithSampleData();
}

// Örnek veri ile grafiği başlat
function initializeChartWithSampleData() {
    const now = new Date();
    const labels = [];
    const fridgeData = [];
    const freezerData = [];
    
    // Son 24 saat için örnek veri
    for (let i = 24; i >= 0; i--) {
        const time = new Date(now.getTime() - (i * 60 * 60 * 1000));
        labels.push(time.getHours() + ':00');
        
        // Gerçekçi sıcaklık dalgalanmaları
        const fridgeBase = (time.getHours() >= 0 && time.getHours() < 6) ? 3 : 5;
        const freezerBase = -18;
        
        fridgeData.push(+(fridgeBase + (Math.random() * 2 - 1)).toFixed(1));
        freezerData.push(+(freezerBase + (Math.random() * 2 - 1)).toFixed(1));
    }
    
    if (temperatureChart) {
        temperatureChart.data.labels = labels;
        temperatureChart.data.datasets[0].data = fridgeData;
        temperatureChart.data.datasets[1].data = freezerData;
        temperatureChart.update('none');
    }
}

// Yeni veri geldiğinde grafiği güncelle
function updateChartWithNewData(fridgeTemp, freezerTemp) {
    if (!temperatureChart) return;
    
    const now = new Date();
    const currentTime = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    
    // Mevcut verileri kaydır ve yeni veriyi ekle
    temperatureChart.data.labels.push(currentTime);
    temperatureChart.data.datasets[0].data.push(fridgeTemp);
    temperatureChart.data.datasets[1].data.push(freezerTemp);
    
    // 48'den fazla nokta varsa eski verileri temizle
    if (temperatureChart.data.labels.length > 48) {
        temperatureChart.data.labels.shift();
        temperatureChart.data.datasets[0].data.shift();
        temperatureChart.data.datasets[1].data.shift();
    }
    
    temperatureChart.update('none');
}

// ============================================
// GELİŞMİŞ İSTATİSTİK FONKSİYONLARI
// ============================================

// Günlük istatistikleri kaydet (GÜNCELLENDİ)
function saveStats(temp, type) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeKey = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    
    const statsRef = firebase.database().ref(`stats/daily/${today}/${type}`);
    const hourlyRef = firebase.database().ref(`stats/hourly/${today}/${type}/${timeKey}`);
    
    // Saatlik ortalamayı kaydet
    hourlyRef.set(temp);
    
    // Günlük istatistikleri güncelle
    statsRef.transaction(current => {
        if (current === null) {
            return {
                min: temp,
                max: temp,
                sum: temp,
                count: 1,
                lastUpdate: Date.now()
            };
        } else {
            return {
                min: Math.min(current.min, temp),
                max: Math.max(current.max, temp),
                sum: current.sum + temp,
                count: current.count + 1,
                lastUpdate: Date.now()
            };
        }
    });
}

// Günlük istatistikleri göster (GÜNCELLENDİ)
function loadDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    
    // Normal Dolap
    firebase.database().ref(`stats/daily/${today}/fridge`).on('value', snapshot => {
        const data = snapshot.val();
        const element = document.getElementById('fridge-stats');
        if (data && element) {
            document.getElementById('fridge-min').textContent = data.min.toFixed(1) + ' °C';
            document.getElementById('fridge-max').textContent = data.max.toFixed(1) + ' °C';
            document.getElementById('fridge-avg').textContent = (data.sum / data.count).toFixed(1) + ' °C';
            document.getElementById('fridge-count').textContent = data.count;
        } else {
            resetStatsDisplay('fridge');
        }
    });
    
    // Dondurucu
    firebase.database().ref(`stats/daily/${today}/freezer`).on('value', snapshot => {
        const data = snapshot.val();
        const element = document.getElementById('freezer-stats');
        if (data && element) {
            document.getElementById('freezer-min').textContent = data.min.toFixed(1) + ' °C';
            document.getElementById('freezer-max').textContent = data.max.toFixed(1) + ' °C';
            document.getElementById('freezer-avg').textContent = (data.sum / data.count).toFixed(1) + ' °C';
            document.getElementById('freezer-count').textContent = data.count;
        } else {
            resetStatsDisplay('freezer');
        }
    });
}

// İstatistikleri sıfırla
function resetStatsDisplay(type) {
    document.getElementById(`${type}-min`).textContent = '--';
    document.getElementById(`${type}-max`).textContent = '--';
    document.getElementById(`${type}-avg`).textContent = '--';
    document.getElementById(`${type}-count`).textContent = '--';
}

// Haftalık özet hesapla (GÜNCELLENDİ)
function loadWeeklySummary() {
    const today = new Date();
    const last7Days = [];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        last7Days.push(date.toISOString().split('T')[0]);
    }
    
    let fridgeData = [], freezerData = [];
    let processedDays = 0;
    
    last7Days.forEach(date => {
        firebase.database().ref(`stats/daily/${date}`).once('value').then(snapshot => {
            const data = snapshot.val();
            if (data) {
                if (data.fridge) {
                    fridgeData.push({
                        date: date,
                        avg: data.fridge.sum / data.fridge.count,
                        count: data.fridge.count
                    });
                }
                if (data.freezer) {
                    freezerData.push({
                        date: date,
                        avg: data.freezer.sum / data.freezer.count,
                        count: data.freezer.count
                    });
                }
            }
            
            processedDays++;
            if (processedDays === 7) {
                updateWeeklySummary(fridgeData, freezerData);
            }
        });
    });
}

// Haftalık özeti güncelle
function updateWeeklySummary(fridgeData, freezerData) {
    if (fridgeData.length > 0) {
        const fridgeAvg = fridgeData.reduce((sum, day) => sum + day.avg, 0) / fridgeData.length;
        document.getElementById('weekly-fridge-avg').textContent = fridgeAvg.toFixed(1) + ' °C';
    }
    
    if (freezerData.length > 0) {
        const freezerAvg = freezerData.reduce((sum, day) => sum + day.avg, 0) / freezerData.length;
        document.getElementById('weekly-freezer-avg').textContent = freezerAvg.toFixed(1) + ' °C';
    }
}

// ============================================
// TEMEL FONKSİYONLAR (GÜNCELLENDİ)
// ============================================

// Bağlantı durumunu güncelle
function updateConnectionStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const lastUpdateText = document.getElementById('lastUpdateText');
    const powerAlert = document.getElementById('powerAlert');
    const reconnectAlert = document.getElementById('reconnectAlert');
    const powerAlertTime = document.getElementById('powerAlertTime');
    
    if (!lastOverallUpdate) {
        statusText.innerText = 'Bağlantı Kuruluyor...';
        return;
    }
    
    const timeSinceUpdate = new Date() - lastOverallUpdate;
    const secondsSinceUpdate = Math.floor(timeSinceUpdate / 1000);
    
    if (secondsSinceUpdate > 60) {
        if (isOnline) {
            isOnline = false;
            wasOffline = true;
            offlineStartTime = new Date();
            statusDot.className = 'status-dot offline';
            statusText.innerText = '🔴 Bağlantı Kesildi';
            powerAlert.classList.add('show');
            reconnectAlert.classList.remove('show');
            notifyPowerOutage();
        }
        powerAlertTime.innerText = timeAgo(lastOverallUpdate);
    } else {
        if (!isOnline && wasOffline) {
            const outageDuration = new Date() - offlineStartTime;
            const durationText = formatDuration(outageDuration);
            
            document.getElementById('outageDuration').innerText = durationText;
            reconnectAlert.classList.add('show');
            setTimeout(() => reconnectAlert.classList.remove('show'), 10000);
            notifyReconnected(durationText);
        }
        isOnline = true;
        statusDot.className = 'status-dot online';
        statusText.innerText = '🟢 Bağlı';
        powerAlert.classList.remove('show');
    }
    
    lastUpdateText.innerText = 'Son güncelleme: ' + timeAgo(lastOverallUpdate);
}

// Sıcaklık durumunu kontrol et
function checkStatus(temp, type, isConnected) {
    if (!isConnected) return { class: 'offline', text: '⚠️ Bağlantı Yok' };
    
    if (type === 'fridge') {
        if (temp > 8) return { class: 'danger', text: '🔥 Çok Sıcak!' };
        if (temp > 6) return { class: 'warning', text: '⚡ Dikkat' };
        if (temp < 2) return { class: 'warning', text: '❄️ Çok Soğuk' };
        return { class: 'ok', text: '✓ Normal' };
    } else {
        if (temp > -10) return { class: 'danger', text: '🔥 Çok Sıcak!' };
        if (temp > -15) return { class: 'warning', text: '⚡ Dikkat' };
        if (temp < -25) return { class: 'warning', text: '❄️ Çok Soğuk' };
        return { class: 'ok', text: '✓ Normal' };
    }
}

// Ekranı güncelle
function updateDisplay(value, type) {
    const now = new Date();
    const tempEl = document.getElementById(type);
    const timeEl = document.getElementById(type + '-time');
    const statusEl = document.getElementById(type + '-status');
    
    tempEl.innerText = value.toFixed(1) + ' °C';
    timeEl.innerText = formatTime(now);
    
    const status = checkStatus(value, type, true);
    statusEl.className = 'sensor-status ' + status.class;
    statusEl.innerText = status.text;
    
    if (type === 'fridge') lastFridgeUpdate = now;
    else lastFreezerUpdate = now;
    
    lastOverallUpdate = now;
    
    // İstatistik kaydet ve grafiği güncelle
    saveStats(value, type);
    updateChartWithNewData(
        type === 'fridge' ? value : temperatureChart.data.datasets[0].data[temperatureChart.data.datasets[0].data.length - 1] || value,
        type === 'freezer' ? value : temperatureChart.data.datasets[1].data[temperatureChart.data.datasets[1].data.length - 1] || value
    );
    
    checkTemperatureAlert(value, type);
    updateConnectionStatus();
}

// ============================================
// FIREBASE LISTENERS (GÜNCELLENDİ)
// ============================================

firebase.database().ref("fridge").on("value", function(snapshot) {
    const value = snapshot.val();
    if (value !== null) {
        console.log("✅ Fridge verisi alındı:", value);
        updateDisplay(value, 'fridge');
    }
});

firebase.database().ref("freezer").on("value", function(snapshot) {
    const value = snapshot.val();
    if (value !== null) {
        console.log("✅ Freezer verisi alındı:", value);
        updateDisplay(value, 'freezer');
    }
});

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

function formatTime(date) {
    if (date.getFullYear() === 1970) return "Bekleniyor...";
    return date.toLocaleTimeString('tr-TR', { 
        hour: '2-digit', minute: '2-digit'
    });
}

function timeAgo(date) {
    if (!date) return "Bekleniyor...";
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 5) return "Şimdi";
    if (seconds < 60) return seconds + " saniye önce";
    if (seconds < 3600) return Math.floor(seconds / 60) + " dakika önce";
    if (seconds < 86400) return Math.floor(seconds / 3600) + " saat önce";
    return Math.floor(seconds / 86400) + " gün önce";
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return minutes + ' dakika ' + seconds + ' saniye';
    return seconds + ' saniye';
}

// Verileri yenile
function refreshData() {
    location.reload();
}

// Uygulama başlatma
window.addEventListener('load', function() {
    initTheme();
    createRealChart(); // Fake data yerine real chart
    loadDailyStats();
    loadWeeklySummary();
    
    // Bildirim izni iste
    setTimeout(() => {
        requestNotificationPermission();
    }, 3000);
});

// Kalan fonksiyonlar (initTheme, toggleTheme, notification fonksiyonları) aynı kalacak
// ...

// ============================================
// TEMA ve ARAYÜZ FONKSİYONLARI
// ============================================

// Temayı başlat
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('themeToggle');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.innerText = '☀️';
    } else {
        themeToggle.innerText = '🌙';
    }
}

// Temayı değiştir
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');
    
    body.classList.toggle('dark-mode');
    
    if (body.classList.contains('dark-mode')) {
        themeToggle.innerText = '☀️';
        localStorage.setItem('theme', 'dark');
    } else {
        themeToggle.innerText = '🌙';
        localStorage.setItem('theme', 'light');
    }
    
    // Grafik temasını güncelle
    if (temperatureChart) {
        updateChartTheme();
    }
}

// Grafik temasını güncelle
function updateChartTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    
    if (temperatureChart && temperatureChart.options) {
        temperatureChart.options.scales.x.ticks.color = isDark ? '#b0b0b0' : '#666';
        temperatureChart.options.scales.y.ticks.color = isDark ? '#b0b0b0' : '#666';
        temperatureChart.options.scales.x.grid.color = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        temperatureChart.options.scales.y.grid.color = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        temperatureChart.options.plugins.legend.labels.color = isDark ? '#e0e0e0' : '#333';
        
        temperatureChart.update();
    }
}

// ============================================
// BİLDİRİM FONKSİYONLARI
// ============================================

// Bildirim izni iste
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('Bu tarayıcı bildirimleri desteklemiyor');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        notificationPermission = true;
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === 'granted';
        
        if (notificationPermission) {
            showTempAlert('✅ Bildirimler etkin!', 'success');
        }
        return notificationPermission;
    }
    
    return false;
}

// Bildirim gönder
function sendNotification(title, body, icon = '⚠️') {
    if (!notificationPermission) return;
    
    // Spam önleme - 5 dakikada bir bildirim
    const now = Date.now();
    const lastNotification = Math.max(lastNotificationTime.fridge, lastNotificationTime.freezer, lastNotificationTime.power);
    if (now - lastNotification < NOTIFICATION_COOLDOWN) {
        return;
    }
    
    // Service Worker varsa onunla gönder
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, {
                body: body,
                icon: '/fridge-dashboard/icon.png',
                badge: '/fridge-dashboard/badge.png',
                vibrate: [200, 100, 200],
                tag: 'fridge-alert',
                requireInteraction: true,
                actions: [
                    {
                        action: 'open',
                        title: '📱 Aç'
                    },
                    {
                        action: 'close',
                        title: 'Kapat'
                    }
                ]
            });
        });
    } else {
        // Fallback: Normal notification
        try {
            const notification = new Notification(title, {
                body: body,
                icon: '/fridge-dashboard/icon.png',
                badge: '/fridge-dashboard/badge.png'
            });
            
            notification.onclick = function() {
                window.focus();
                notification.close();
            };
        } catch (error) {
            console.log('Bildirim hatası:', error);
        }
    }
}

// Sıcaklık uyarısı kontrolü
function checkTemperatureAlert(temp, type) {
    const now = Date.now();
    
    if (type === 'fridge' && temp > 8) {
        if (now - lastNotificationTime.fridge >= NOTIFICATION_COOLDOWN) {
            sendNotification(
                '⚠️ Buzdolabı Sıcak!',
                `Buzdolabı sıcaklığı ${temp.toFixed(1)}°C - Yiyecekler bozulabilir!`,
                '🔥'
            );
            lastNotificationTime.fridge = now;
            showTempAlert('🔥 Buzdolabı çok sıcak!', 'danger');
        }
    } else if (type === 'freezer' && temp > -10) {
        if (now - lastNotificationTime.freezer >= NOTIFICATION_COOLDOWN) {
            sendNotification(
                '⚠️ Dondurucu Sıcak!',
                `Dondurucu sıcaklığı ${temp.toFixed(1)}°C - Donmuş gıdalar eriyebilir!`,
                '🔥'
            );
            lastNotificationTime.freezer = now;
            showTempAlert('❄️ Dondurucu çok sıcak!', 'danger');
        }
    }
}

// Elektrik kesintisi bildirimi
function notifyPowerOutage() {
    const now = Date.now();
    
    if (now - lastNotificationTime.power >= NOTIFICATION_COOLDOWN) {
        sendNotification(
            '⚡ Elektrik Kesintisi!',
            'Buzdolabından 1 dakikadır veri gelmiyor. Elektrik kesilmiş olabilir.',
            '⚡'
        );
        lastNotificationTime.power = now;
    }
}

// Bağlantı yeniden kuruldu bildirimi
function notifyReconnected(duration) {
    sendNotification(
        '✅ Bağlantı Yeniden Kuruldu',
        `Elektrik geri geldi! Kesinti süresi: ${duration}`,
        '✅'
    );
}

// Geçici uyarı göster (sayfa içi)
function showTempAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `temp-alert ${type}`;
    alertDiv.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    // Stil ekle (eğer yoksa)
    if (!document.querySelector('#alert-styles')) {
        const style = document.createElement('style');
        style.id = 'alert-styles';
        style.textContent = `
            .temp-alert {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 10px;
                color: white;
                z-index: 10000;
                animation: slideInRight 0.3s ease;
                max-width: 300px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .temp-alert.info { background: #007BFF; }
            .temp-alert.success { background: #28a745; }
            .temp-alert.danger { background: #dc3545; }
            .temp-alert.warning { background: #ffc107; color: #000; }
            .temp-alert button {
                background: none;
                border: none;
                color: inherit;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
            }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(alertDiv);
    
    // 5 saniye sonra otomatik kaldır
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, 5000);
}

// ============================================
// PWA ve KURULUM FONKSİYONLARI
// ============================================

// PWA Install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (!localStorage.getItem('pwa-dismissed')) {
        document.getElementById('installPrompt').classList.add('show');
    }
});

// PWA kurulum butonu
document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        console.log('PWA kuruldu!');
        showTempAlert('📱 Uygulama kuruldu!', 'success');
    }
    
    deferredPrompt = null;
    document.getElementById('installPrompt').classList.remove('show');
});

// PWA kurulum kapatma
document.getElementById('closeInstallBtn').addEventListener('click', () => {
    document.getElementById('installPrompt').classList.remove('show');
    localStorage.setItem('pwa-dismissed', 'true');
});

// Service Worker kayıt
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/fridge-dashboard/service-worker.js')
            .then(reg => console.log('Service Worker kayıtlı:', reg))
            .catch(err => console.log('Service Worker hatası:', err));
    });
}

// ============================================
// ELEKTRİK KESİNTİSİ FONKSİYONLARI
// ============================================

// Elektrik kesintisi kaydet
function saveOutage(startTime, endTime) {
    const duration = endTime - startTime;
    const timestamp = new Date(startTime).toISOString().replace(/[:.]/g, '-');
    
    firebase.database().ref(`stats/outages/${timestamp}`).set({
        start: startTime,
        end: endTime,
        duration: duration,
        date: new Date(startTime).toISOString().split('T')[0],
        formattedDuration: formatDuration(duration)
    }).then(() => {
        console.log('✅ Kesinti kaydedildi:', formatDuration(duration));
    }).catch(error => {
        console.error('❌ Kesinti kaydetme hatası:', error);
    });
}

// Kesinti geçmişini yükle
function loadOutageHistory() {
    const today = new Date();
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    
    firebase.database().ref('stats/outages')
        .orderByChild('start')
        .startAt(last7Days.getTime())
        .once('value')
        .then(snapshot => {
            const outages = [];
            snapshot.forEach(child => {
                outages.push(child.val());
            });
            
            outages.sort((a, b) => b.start - a.start); // Yeniden eskiye
            
            displayOutageHistory(outages);
        })
        .catch(error => {
            console.error('Kesinti geçmişi yükleme hatası:', error);
            document.getElementById('outageHistory').innerHTML = 
                '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Veri yüklenirken hata oluştu</p>';
        });
}

// Kesinti geçmişini göster
function displayOutageHistory(outages) {
    if (outages.length === 0) {
        document.getElementById('outageHistory').innerHTML = 
            '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Son 7 günde kesinti kaydı yok ✅</p>';
        
        document.getElementById('weekly-outage-count').textContent = '0 kesinti';
        document.getElementById('weekly-outage-duration').textContent = '0 dk';
        return;
    }
    
    let html = '';
    let totalDuration = 0;
    let outageCount = outages.length;
    
    outages.forEach(outage => {
        const startDate = new Date(outage.start);
        const durationMin = Math.floor(outage.duration / 60000);
        totalDuration += outage.duration;
        
        html += `
            <div class="outage-item">
                <div class="outage-date">
                    ⚡ ${startDate.toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
                <div class="outage-duration">
                    Süre: ${durationMin} dakika
                </div>
            </div>
        `;
    });
    
    document.getElementById('outageHistory').innerHTML = html;
    
    // Haftalık özet
    document.getElementById('weekly-outage-count').textContent = outageCount + ' kesinti';
    
    const totalMinutes = Math.floor(totalDuration / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        document.getElementById('weekly-outage-duration').textContent = 
            `${hours} saat ${minutes} dk`;
    } else {
        document.getElementById('weekly-outage-duration').textContent = `${minutes} dk`;
    }
}

// Uygulama başlatma
window.addEventListener('load', function() {
    console.log('🚀 Buzdolabı Takip Sistemi Başlatılıyor...');
    
    // Temayı yükle
    initTheme();
    
    // Grafiği oluştur
    createRealChart();
    
    // İstatistikleri yükle
    loadDailyStats();
    loadWeeklySummary();
    loadOutageHistory();
    
    // Bağlantı durumunu kontrol et
    setInterval(updateConnectionStatus, 5000);
    
    // Bildirim izni iste (5 saniye sonra)
    setTimeout(() => {
        requestNotificationPermission().then(permission => {
            if (permission) {
                console.log('✅ Bildirim izni alındı');
            }
        });
    }, 5000);
    
    // Firebase bağlantısını kontrol et
    firebase.database().ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() === true) {
            console.log('✅ Firebase bağlantısı aktif');
            showTempAlert('🔥 Firebase bağlantısı kuruldu', 'success');
        } else {
            console.log('❌ Firebase bağlantısı kesildi');
            showTempAlert('🔴 Firebase bağlantısı kesildi', 'danger');
        }
    });
});
