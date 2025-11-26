// Firebase Config
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

// Helper Functions
function formatTime(date) {
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

// Connection Status
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
        }
        powerAlertTime.innerText = timeAgo(lastOverallUpdate);
    } else {
        if (!isOnline && wasOffline) {
            const outageDuration = new Date() - offlineStartTime;
            document.getElementById('outageDuration').innerText = formatDuration(outageDuration);
            reconnectAlert.classList.add('show');
            setTimeout(() => reconnectAlert.classList.remove('show'), 10000);
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

function updateDisplay(value, type) {
    const now = new Date();
    const tempEl = document.getElementById(type);
    const timeEl = document.getElementById(type + '-time');
    const statusEl = document.getElementById(type + '-status');
    
    tempEl.innerText = value + ' °C';
    timeEl.innerText = formatTime(now);
    
    const status = checkStatus(value, type, true);
    statusEl.className = 'sensor-status ' + status.class;
    statusEl.innerText = status.text;
    
    if (type === 'fridge') lastFridgeUpdate = now;
    else lastFreezerUpdate = now;
    
    lastOverallUpdate = now;
    updateConnectionStatus();
}

// Firebase Listeners
firebase.database().ref("fridge").on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) updateDisplay(value, 'fridge');
});

firebase.database().ref("freezer").on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) updateDisplay(value, 'freezer');
});

checkInterval = setInterval(updateConnectionStatus, 5000);

// Refresh Button
function refreshData() {
    const btn = document.querySelector('.refresh-btn');
    btn.innerText = '⏳ Yenileniyor...';
    btn.disabled = true;

    firebase.database().ref("fridge").once("value").then(function(snapshot) {
        const value = snapshot.val();
        if (value !== null) updateDisplay(value, 'fridge');
    });

    firebase.database().ref("freezer").once("value").then(function(snapshot) {
        const value = snapshot.val();
        if (value !== null) updateDisplay(value, 'freezer');
        setTimeout(() => {
            btn.innerText = '✓ Güncellendi!';
            setTimeout(() => {
                btn.innerText = '🔄 Verileri Yenile';
                btn.disabled = false;
            }, 1000);
        }, 500);
    });
}

// Initialize
window.addEventListener('load', function() {
    initTheme();
    createChart();
});
