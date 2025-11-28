// Firebase Config
var firebaseConfig = {
    apiKey: "AIzaSyBhMDR_0dLivEYWqbSte0OnSMlciB8aUuA",
    authDomain: "fridgemonitor-76775.firebaseapp.com",
    databaseURL: "https://fridgemonitor-76775-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fridgemonitor-76775"
};

// Bildirim değişkenleri
let notificationPermission = false;
let lastNotificationTime = {
    fridge: 0,
    freezer: 0,
    power: 0
};
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 dakika (spam önleme)

firebase.initializeApp(firebaseConfig);

// Global Variables
let lastFridgeUpdate = null;
let lastFreezerUpdate = null;
let lastOverallUpdate = null;
let isOnline = true;
let wasOffline = false;
let offlineStartTime = null;
let checkInterval = null;
let temperatureChart = null;
let deferredPrompt = null;

// PWA Install
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (!localStorage.getItem('pwa-dismissed')) {
        document.getElementById('installPrompt').classList.add('show');
    }
});

document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        console.log('PWA kuruldu!');
    }
    
    deferredPrompt = null;
    document.getElementById('installPrompt').classList.remove('show');
});

document.getElementById('closeInstallBtn').addEventListener('click', () => {
    document.getElementById('installPrompt').classList.remove('show');
    localStorage.setItem('pwa-dismissed', 'true');
});

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker kayıtlı'))
            .catch(err => console.log('Service Worker hatası:', err));
    });
}

// Dark Mode
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

// Bildirim İzni İste
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
        return notificationPermission;
    }
    
    return false;
}

// Bildirim Gönder
function sendNotification(title, body, icon = '⚠️') {
    if (!notificationPermission) return;
    
    // Service Worker varsa onunla gönder
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, {
                body: body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="70" font-size="70">' + icon + '</text></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="70" font-size="70">🧊</text></svg>',
                vibrate: [200, 100, 200],
                requireInteraction: true
            });
        });
    } else {
        // Fallback: Normal notification
        new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="70" font-size="70">' + icon + '</text></svg>'
        });
    }
}

// Sıcaklık Kontrolü ve Bildirim
function checkTemperatureAlert(temp, type) {
    const now = Date.now();
    
    // Spam önleme - 5 dakikada bir bildirim
    if (now - lastNotificationTime[type] < NOTIFICATION_COOLDOWN) {
        return;
    }
    
    if (type === 'fridge' && temp > 8) {
        sendNotification(
            '⚠️ Buzdolabı Sıcak!',
            `Normal dolap sıcaklığı ${temp.toFixed(1)}°C - Normal değerin üzerinde!`,
            '🔥'
        );
        lastNotificationTime[type] = now;
    } else if (type === 'freezer' && temp > -10) {
        sendNotification(
            '⚠️ Dondurucu Sıcak!',
            `Dondurucu sıcaklığı ${temp.toFixed(1)}°C - Normal değerin üzerinde!`,
            '🔥'
        );
        lastNotificationTime[type] = now;
    }
}

// Elektrik Kesintisi Bildirimi
function notifyPowerOutage() {
    const now = Date.now();
    
    if (now - lastNotificationTime.power < NOTIFICATION_COOLDOWN) {
        return;
    }
    
    sendNotification(
        '⚡ Elektrik Kesintisi!',
        'Buzdolabından 1 dakikadır veri gelmiyor. Elektrik kesilmiş olabilir.',
        '⚡'
    );
    lastNotificationTime.power = now;
}

// Bağlantı Kuruldu Bildirimi
function notifyReconnected(duration) {
    sendNotification(
        '✅ Bağlantı Yeniden Kuruldu',
        `Elektrik geri geldi! Kesinti süresi: ${duration}`,
        '✅'
    );
}

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
    
    if (temperatureChart) {
        updateChartTheme();
    }
}

function updateChartTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    
    temperatureChart.options.scales.x.ticks.color = isDark ? '#b0b0b0' : '#666';
    temperatureChart.options.scales.y.ticks.color = isDark ? '#b0b0b0' : '#666';
    temperatureChart.options.scales.x.grid.color = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    temperatureChart.options.scales.y.grid.color = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    temperatureChart.options.plugins.legend.labels.color = isDark ? '#e0e0e0' : '#333';
    
    temperatureChart.update();
}

// Fake Data Generator
function generateFakeData() {
    const now = Date.now();
    const data = [];
    
    for (let i = 48; i >= 0; i--) {
        const timestamp = now - (i * 30 * 60 * 1000);
        const hour = new Date(timestamp).getHours();
        
        const fridgeBase = hour >= 0 && hour < 6 ? 2 : 4;
        const freezerBase = hour >= 0 && hour < 6 ? -18 : -16;
        
        data.push({
            time: timestamp,
            fridge: fridgeBase + (Math.random() * 2 - 1),
            freezer: freezerBase + (Math.random() * 2 - 1)
        });
    }
    
    return data;
}

// Chart
function createChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    const fakeData = generateFakeData();
    const isDark = document.body.classList.contains('dark-mode');
    
    const labels = fakeData.map(d => {
        const date = new Date(d.time);
        return date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    });
    
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '🧊 Normal Dolap',
                    data: fakeData.map(d => d.fridge),
                    borderColor: '#007BFF',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '❄️ Dondurucu',
                    data: fakeData.map(d => d.freezer),
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111, 66, 193, 0.1)',
                    tension: 0.4,
                    fill: true
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
                    labels: { color: isDark ? '#e0e0e0' : '#333' }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
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
                    ticks: { maxTicksLimit: 12, color: isDark ? '#b0b0b0' : '#666' },
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Sıcaklık (°C)', color: isDark ? '#e0e0e0' : '#333' },
                    ticks: { color: isDark ? '#b0b0b0' : '#666' },
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// Helper Functions - GÜNCELLENDİ
function formatTime(date) {
    // Eğer tarih 1970 ise "Bekleniyor..." göster
    if (date.getFullYear() === 1970) {
        return "Bekleniyor...";
    }
    return date.toLocaleTimeString('tr-TR', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + ' - ' + date.toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return seconds + ' saniye önce';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' dakika önce';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' saat önce';
    const days = Math.floor(hours / 24);
    return days + ' gün önce';
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return minutes + ' dakika ' + seconds + ' saniye';
    return seconds + ' saniye';
}

function checkStatus(temp, type, isConnected) {
    if (!isConnected) return { class: 'offline', text: '⚠️ Bağlantı Yok' };
    if (type === 'fridge') {
        if (temp > 8) return { class: 'danger', text: '🔥 Çok Sıcak!' };
        if (temp > 6) return { class: 'warning', text: '⚡ Dikkat' };
        return { class: 'ok', text: '✓ Normal' };
    } else {
        if (temp > -10) return { class: 'danger', text: '🔥 Çok Sıcak!' };
        if (temp > -15) return { class: 'warning', text: '⚡ Dikkat' };
        return { class: 'ok', text: '✓ Normal' };
    }
}

// ============================================
// YENİ: İSTATİSTİK FONKSİYONLARI
// ============================================

// Günlük istatistikleri kaydet
function saveStats(temp, type) {
    const today = new Date().toISOString().split('T')[0]; // 2025-01-15
    const statsRef = firebase.database().ref(`stats/daily/${today}/${type}`);
    
    statsRef.transaction(current => {
        if (current === null) {
            // İlk kayıt
            return {
                min: temp,
                max: temp,
                sum: temp,
                count: 1
            };
        } else {
            // Mevcut kayıt güncelle
            return {
                min: Math.min(current.min, temp),
                max: Math.max(current.max, temp),
                sum: current.sum + temp,
                count: current.count + 1
            };
        }
    });
}

// Günlük istatistikleri göster
function loadDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    
    // Normal Dolap
    firebase.database().ref(`stats/daily/${today}/fridge`).on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('fridge-min').textContent = data.min.toFixed(1) + ' °C';
            document.getElementById('fridge-max').textContent = data.max.toFixed(1) + ' °C';
            document.getElementById('fridge-avg').textContent = (data.sum / data.count).toFixed(1) + ' °C';
            document.getElementById('fridge-count').textContent = data.count;
        }
    });
    
    // Dondurucu
    firebase.database().ref(`stats/daily/${today}/freezer`).on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('freezer-min').textContent = data.min.toFixed(1) + ' °C';
            document.getElementById('freezer-max').textContent = data.max.toFixed(1) + ' °C';
            document.getElementById('freezer-avg').textContent = (data.sum / data.count).toFixed(1) + ' °C';
            document.getElementById('freezer-count').textContent = data.count;
        }
    });
}

// Haftalık özet hesapla
function loadWeeklySummary() {
    const today = new Date();
    const last7Days = [];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        last7Days.push(date.toISOString().split('T')[0]);
    }
    
    let fridgeTotal = 0, fridgeCount = 0;
    let freezerTotal = 0, freezerCount = 0;
    let processedDays = 0;
    
    last7Days.forEach(date => {
        firebase.database().ref(`stats/daily/${date}`).once('value').then(snapshot => {
            const data = snapshot.val();
            if (data) {
                if (data.fridge) {
                    fridgeTotal += data.fridge.sum;
                    fridgeCount += data.fridge.count;
                }
                if (data.freezer) {
                    freezerTotal += data.freezer.sum;
                    freezerCount += data.freezer.count;
                }
            }
            
            processedDays++;
            if (processedDays === 7) {
                // Tüm günler işlendi, ortalamaları göster
                if (fridgeCount > 0) {
                    document.getElementById('weekly-fridge-avg').textContent = 
                        (fridgeTotal / fridgeCount).toFixed(1) + ' °C';
                }
                if (freezerCount > 0) {
                    document.getElementById('weekly-freezer-avg').textContent = 
                        (freezerTotal / freezerCount).toFixed(1) + ' °C';
                }
            }
        });
    });
}

// Elektrik kesintisi kaydet
function saveOutage(startTime, endTime) {
    const duration = endTime - startTime;
    const timestamp = new Date(startTime).toISOString().replace(/:/g, '-');
    
    firebase.database().ref(`stats/outages/${timestamp}`).set({
        start: startTime,
        end: endTime,
        duration: duration,
        date: new Date(startTime).toISOString().split('T')[0]
    });
}

// Kesinti geçmişini göster
function loadOutageHistory() {
    const today = new Date();
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    
    firebase.database().ref('stats/outages')
        .orderByChild('start')
        .startAt(last7Days.getTime())
        .on('value', snapshot => {
            const outages = [];
            snapshot.forEach(child => {
                outages.push(child.val());
            });
            
            outages.reverse(); // En yeni önce
            
            if (outages.length === 0) {
                document.getElementById('outageHistory').innerHTML = 
                    '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Henüz kesinti kaydı yok ✅</p>';
                document.getElementById('weekly-outage-count').textContent = '0 kesinti';
                document.getElementById('weekly-outage-duration').textContent = '0 dk';
                return;
            }
            
            // Kesinti listesi HTML
            let html = '';
            let totalDuration = 0;
            
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
            document.getElementById('weekly-outage-count').textContent = outages.length + ' kesinti';
            
            const totalMinutes = Math.floor(totalDuration / 60000);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            
            if (hours > 0) {
                document.getElementById('weekly-outage-duration').textContent = 
                    `${hours} saat ${minutes} dk`;
            } else {
                document.getElementById('weekly-outage-duration').textContent = `${minutes} dk`;
            }
        });
}

// ============================================
// Connection Status (GÜNCELLENDİ)
// ============================================
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

            // Bildirim gönder
            notifyPowerOutage();
        }
        powerAlertTime.innerText = timeAgo(lastOverallUpdate);
    } else {
        if (!isOnline && wasOffline) {
            const outageDuration = new Date() - offlineStartTime;
            const durationText = formatDuration(outageDuration);
            
            // YENİ: Kesinti kaydet
            saveOutage(offlineStartTime.getTime(), Date.now());
            
            document.getElementById('outageDuration').innerText = durationText;
            reconnectAlert.classList.add('show');
            setTimeout(() => reconnectAlert.classList.remove('show'), 10000);

            // Bildirim gönder
            notifyReconnected(durationText);
        }
        isOnline = true;
        statusDot.className = 'status-dot online';
        statusText.innerText = '🟢 Bağlı';
        powerAlert.classList.remove('show');
    }
    
    lastUpdateText.innerText = 'Son güncelleme: ' + timeAgo(lastOverallUpdate);
    updateSensorStatus('fridge', lastFridgeUpdate);
    updateSensorStatus('freezer', lastFreezerUpdate);
}

function updateSensorStatus(type, lastUpdate) {
    if (!lastUpdate) return;
    const timeSinceUpdate = new Date() - lastUpdate;
    const secondsSinceUpdate = Math.floor(timeSinceUpdate / 1000);
    const isConnected = secondsSinceUpdate <= 60;
    const tempEl = document.getElementById(type);
    const statusEl = document.getElementById(type + '-status');
    const currentTemp = parseFloat(tempEl.innerText);
    if (!isNaN(currentTemp)) {
        const status = checkStatus(currentTemp, type, isConnected);
        statusEl.className = 'sensor-status ' + status.class;
        statusEl.innerText = status.text;
    }
}

// updateDisplay (GÜNCELLENDİ)
function updateDisplay(value, type) {
    const now = new Date();
    const tempEl = document.getElementById(type);
    const timeEl = document.getElementById(type + '-time');
    const statusEl = document.getElementById(type + '-status');
    
    // YENİ: 1 ondalık basamak göster
    tempEl.innerText = value.toFixed(1) + ' °C';
    
    timeEl.innerText = formatTime(now);
    
    const status = checkStatus(value, type, true);
    statusEl.className = 'sensor-status ' + status.class;
    statusEl.innerText = status.text;
    
    if (type === 'fridge') lastFridgeUpdate = now;
    else lastFreezerUpdate = now;
    
    lastOverallUpdate = now;
    
    // YENİ: İstatistik kaydet
    saveStats(value, type);
    
    // Sıcaklık uyarısı kontrolü
    checkTemperatureAlert(value, type);
    updateConnectionStatus();
}

// Firebase Listeners - GÜNCELLENDİ
firebase.database().ref("fridge").on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) {
        console.log("✅ Fridge verisi alındı:", value);
        updateDisplay(value, 'fridge');
        
        // Timestamp'i al ve güncelle
        firebase.database().ref("fridgeLastUpdate").once("value").then(timeSnapshot => {
            const timestamp = timeSnapshot.val();
            if (timestamp) {
                // YENİ: Saniyeyi milisaniyeye çevir
                const updateTime = new Date(parseInt(timestamp) * 1000);
                document.getElementById('fridge-time').textContent = formatTime(updateTime);
                lastFridgeUpdate = updateTime;
                updateOverallTimestamp();
            }
        });
    }
});

firebase.database().ref("freezer").on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) {
        console.log("✅ Freezer verisi alındı:", value);
        updateDisplay(value, 'freezer');
        
        // Timestamp'i al ve güncelle
        firebase.database().ref("freezerLastUpdate").once("value").then(timeSnapshot => {
            const timestamp = timeSnapshot.val();
            if (timestamp) {
                // YENİ: Saniyeyi milisaniyeye çevir
                const updateTime = new Date(parseInt(timestamp) * 1000);
                document.getElementById('freezer-time').textContent = formatTime(updateTime);
                lastFreezerUpdate = updateTime;
                updateOverallTimestamp();
            }
        });
    }
});

// YENİ: Genel timestamp güncelleme fonksiyonu
function updateOverallTimestamp() {
    if (lastFridgeUpdate || lastFreezerUpdate) {
        lastOverallUpdate = new Date(Math.max(
            lastFridgeUpdate ? lastFridgeUpdate.getTime() : 0,
            lastFreezerUpdate ? lastFreezerUpdate.getTime() : 0
        ));
    }
}

// Initialize (GÜNCELLENDİ)
window.addEventListener('load', function() {
    initTheme();
    createChart();

    // YENİ: İstatistikleri yükle
    loadDailyStats();
    loadWeeklySummary();
    loadOutageHistory();

    // Bildirim izni iste (5 saniye sonra, kullanıcıyı rahatsız etmemek için)
    setTimeout(() => {
        requestNotificationPermission();
    }, 5000);
});
