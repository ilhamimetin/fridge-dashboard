// GitHub'a yerel bilgisayardan commit attma
// GitHub'a yerel bilgisayardan commit attma cursor ile

// Firebase Config (Aynı) // Çalışan
var firebaseConfig = {
  apiKey: "AIzaSyBhMDR_0dLivEYWqbSte0OnSMlciB8aUuA",
  authDomain: "fridgemonitor-76775.firebaseapp.com",
  databaseURL:
    "https://fridgemonitor-76775-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fridgemonitor-76775",
};

firebase.initializeApp(firebaseConfig);

firebase.database().ref("devices/kitchen/fridge").off();
firebase.database().ref("devices/kitchen/freezer").off();

// Global Variables
let lastFridgeUpdate = null;
let lastFreezerUpdate = null;
let lastOverallUpdate = null;
let isOnline = true;
let wasOffline = false;
let offlineStartTime = null;
let coolersChart = null; // 1. Grafik: Soğutucular (Derin Dondurucu + Dondurucu + Buzdolabı)
let ambientChart = null; // 2. Grafik: Ortam Sıcaklığı
let deferredPrompt = null;

// Bildirim değişkenleri
let notificationPermission = false;
let lastNotificationTime = {
  fridge: 0,
  freezer: 0,
  power: 0,
};
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 dakika

// ============================================
// YENİ: ÇİFT GRAFİK SİSTEMİ
// ============================================

// Gerçek verilerle Soğutucular grafiğini oluştur
function createCoolersChart() {
  // Eğer grafik zaten varsa, önce yok et
  if (coolersChart) {
    coolersChart.destroy();
  }

  const ctx = document.getElementById("coolersChart").getContext("2d");
  const isDark = document.body.classList.contains("dark-mode");

  // Soğutucular grafiği oluştur
  coolersChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [], // Zaman etiketleri
      datasets: [
        {
          label: "🧊 Derin Dondurucu",
          data: [],
          borderColor: "#6f42c1", // Mor
          backgroundColor: "rgba(111, 66, 193, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        },
        {
          label: "❄️ Dondurucu",
          data: [],
          borderColor: "#007BFF", // Mavi
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        },
        {
          label: "🧊 Normal Dolap",
          data: [],
          borderColor: "#28a745", // Yeşil
          backgroundColor: "rgba(40, 167, 69, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        },
      ],
    },
    options: getChartOptions(isDark),
  });

  // Grafiği gerçek verilerle besle
  loadCoolersChartData();
}

// Gerçek verilerle Ortam Sıcaklığı grafiğini oluştur
function createAmbientChart() {
  // Eğer grafik zaten varsa, önce yok et
  if (ambientChart) {
    ambientChart.destroy();
  }

  const ctx = document.getElementById("ambientChart").getContext("2d");
  const isDark = document.body.classList.contains("dark-mode");

  // Ortam Sıcaklığı grafiği oluştur
  ambientChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [], // Zaman etiketleri
      datasets: [
        {
          label: "🌡️ Ortam Sıcaklığı",
          data: [],
          borderColor: "#fd7e14", // Turuncu
          backgroundColor: "rgba(253, 126, 20, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        },
      ],
    },
    options: getChartOptions(isDark),
  });

  // Grafiği gerçek verilerle besle
  loadAmbientChartData();
}

// Ortak chart options
function getChartOptions(isDark) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: {
          color: isDark ? "#e0e0e0" : "#333",
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)",
        titleColor: isDark ? "#e0e0e0" : "#333",
        bodyColor: isDark ? "#e0e0e0" : "#333",
        callbacks: {
          label: function (context) {
            return (
              context.dataset.label + ": " + context.parsed.y.toFixed(1) + "°C"
            );
          },
        },
      },
    },
    scales: {
      x: {
        reverse: true, // ← BU SATIRI EKLEYİN! (Saat 159)
        display: true,
        title: {
          display: true,
          text: "Zaman",
          color: isDark ? "#e0e0e0" : "#333",
        },
        ticks: {
          maxTicksLimit: 8,
          color: isDark ? "#b0b0b0" : "#666",
          callback: function (value, index, values) {
            if (index % Math.ceil(values.length / 8) === 0) {
              return this.getLabelForValue(value);
            }
            return "";
          },
        },
        grid: {
          color: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          drawBorder: false,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Sıcaklık (°C)",
          color: isDark ? "#e0e0e0" : "#333",
        },
        ticks: {
          color: isDark ? "#b0b0b0" : "#666",
        },
        grid: {
          color: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          drawBorder: false,
        },
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
    animation: {
      duration: 1000,
      easing: "easeOutQuart",
    },
    // ✅ ZOOM PLUGIN EKLE
    zoom: {
      pan: {
        enabled: true, // ✅ Kaydırma aktif
        mode: "x", // ✅ Sadece x ekseninde
        modifierKey: "ctrl", // ✅ Ctrl basılıyken kaydır
      },
      zoom: {
        wheel: {
          enabled: true, // ✅ Fare tekerleği ile zoom
        },
        pinch: {
          enabled: true, // ✅ Touch zoom (mobile)
        },
        mode: "x", // ✅ Sadece x ekseninde zoom
      },
    },
  };
}

// Firebase'den grafik verilerini yükle
function loadChartData() {
  const today = new Date().toISOString().split("T")[0];

  // Fridge verilerini yükle
  firebase
    .database()
    .ref(`stats/hourly/${today}/fridge`)
    .once("value")
    .then((snapshot) => {
      const fridgeData = snapshot.val() || {};

      // Freezer verilerini yükle
      return firebase
        .database()
        .ref(`stats/hourly/${today}/freezer`)
        .once("value")
        .then((freezerSnapshot) => {
          const freezerData = freezerSnapshot.val() || {};

          // Zamanları sırala
          const times = Array.from(
            new Set([...Object.keys(fridgeData), ...Object.keys(freezerData)])
          )
            .sort()
            .slice(-48);

          // Grafiğe yükle
          times.forEach((time) => {
            coolersChart.data.labels.push(time);
            coolersChart.data.datasets[0].data.push(fridgeData[time] || 0);
            coolersChart.data.datasets[1].data.push(freezerData[time] || 0);
          });

          coolersChart.update("none");

          // Mesajı gizle
          const msg = document.getElementById("chartMessage");
          if (msg && times.length > 0) {
            msg.style.display = "none";
          }
        });
    });
}
// Yeni veri geldiğinde grafiği güncelle
function updateChartWithNewData(fridgeTemp, freezerTemp) {
  if (!coolersChart) return;

  // Mesajı gizle (ilk veri geldiğinde)
  const msg = document.getElementById("chartMessage");
  if (msg && coolersChart.data.labels.length === 0) {
    msg.style.display = "none";
  }

  const now = new Date();
  const currentTime =
    now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");

  // Mevcut verileri kaydır ve yeni veriyi ekle
  coolersChart.data.labels.push(currentTime);
  coolersChart.data.datasets[0].data.push(fridgeTemp);
  coolersChart.data.datasets[1].data.push(freezerTemp);

  // 48'den fazla nokta varsa eski verileri temizle
  if (coolersChart.data.labels.length > 48) {
    coolersChart.data.labels.shift();
    coolersChart.data.datasets[0].data.shift();
    coolersChart.data.datasets[1].data.shift();
  }

  coolersChart.update("none");
}

// Firebase'den Soğutucular grafik verilerini yükle
function loadCoolersChartData() {
  const today = new Date().toISOString().split("T")[0];

  // Fridge verilerini yükle
  firebase
    .database()
    .ref(`stats/hourly/${today}/fridge`)
    .once("value")
    .then((snapshot) => {
      const fridgeData = snapshot.val() || {};

      // Freezer verilerini yükle
      return firebase
        .database()
        .ref(`stats/hourly/${today}/freezer`)
        .once("value")
        .then((freezerSnapshot) => {
          const freezerData = freezerSnapshot.val() || {};

          // DeepFreezer verilerini yükle
          return firebase
            .database()
            .ref(`stats/hourly/${today}/deepFreezer`)
            .once("value")
            .then((deepFreezerSnapshot) => {
              const deepFreezerData = deepFreezerSnapshot.val() || {};

              // ✅ Zamanları DOĞRU SIRALA (saat:dakika formatında)
              const times = Array.from(
                new Set([
                  ...Object.keys(fridgeData),
                  ...Object.keys(freezerData),
                  ...Object.keys(deepFreezerData),
                ])
              )
                .sort((a, b) => {
                  // "HH:MM" formatını karşılaştır
                  const [aHour, aMin] = a.split(":").map(Number);
                  const [bHour, bMin] = b.split(":").map(Number);

                  // Saat ve dakikayı sayıya çevirerek karşılaştır
                  const aTime = aHour * 60 + aMin;
                  const bTime = bHour * 60 + bMin;

                  return aTime - bTime;
                })
                .slice(-48); // Son 48 veri noktası

              // Grafiğe yükle - SADECE tüm sensörlerde veri olan zamanları ekle
              times.forEach((time) => {
                // Eğer ÜÇ sensörde de veri VARSA ekle
                if (
                  deepFreezerData[time] !== undefined &&
                  freezerData[time] !== undefined &&
                  fridgeData[time] !== undefined
                ) {
                  coolersChart.data.labels.push(time);
                  coolersChart.data.datasets[0].data.push(
                    deepFreezerData[time]
                  );
                  coolersChart.data.datasets[1].data.push(freezerData[time]);
                  coolersChart.data.datasets[2].data.push(fridgeData[time]);
                }
              });

              coolersChart.update("none");

              // Mesajı gizle
              const msg = document.getElementById("coolersChartMessage");
              if (msg && times.length > 0) {
                msg.style.display = "none";
              }
            });
        });
    });
}

// Firebase'den Ortam Sıcaklığı grafik verilerini yükle
function loadAmbientChartData() {
  const today = new Date().toISOString().split("T")[0];

  // Ambient verilerini yükle
  firebase
    .database()
    .ref(`stats/hourly/${today}/ambient`)
    .once("value")
    .then((snapshot) => {
      const ambientData = snapshot.val() || {};

      // ✅ Zamanları DOĞRU SIRALA (saat:dakika formatında)
      const times = Object.keys(ambientData)
        .sort((a, b) => {
          // "HH:MM" formatını karşılaştır
          const [aHour, aMin] = a.split(":").map(Number);
          const [bHour, bMin] = b.split(":").map(Number);

          // Saat ve dakikayı sayıya çevirerek karşılaştır
          const aTime = aHour * 60 + aMin;
          const bTime = bHour * 60 + bMin;

          return aTime - bTime;
        })
        .slice(-48); // Son 48 veri noktası

      // Grafiğe yükle
      times.forEach((time) => {
        ambientChart.data.labels.push(time);
        ambientChart.data.datasets[0].data.push(ambientData[time] || 0);
      });

      ambientChart.update("none");

      // Mesajı gizle
      const msg = document.getElementById("ambientChartMessage");
      if (msg && times.length > 0) {
        msg.style.display = "none";
      }
    });
}

// Yeni veri geldiğinde Soğutucular grafiğini güncelle
function updateCoolersChartWithNewData(
  deepFreezerTemp,
  freezerTemp,
  fridgeTemp
) {
  if (!coolersChart) return;

  // Mesajı gizle (ilk veri geldiğinde)
  const msg = document.getElementById("coolersChartMessage");
  if (msg && coolersChart.data.labels.length === 0) {
    msg.style.display = "none";
  }

  const now = new Date();
  const currentTime =
    now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");

  // Mevcut veriler极 kaydır ve yeni veriyi ekle
  coolersChart.data.labels.push(currentTime);
  coolersChart.data.datasets[0].data.push(deepFreezerTemp);
  coolersChart.data.datasets[1].data.push(freezerTemp);
  coolersChart.data.datasets[2].data.push(fridgeTemp);

  // 48'den fazla nokta varsa eski verileri temizle
  if (coolersChart.data.labels.length > 48) {
    coolersChart.data.labels.shift();
    coolersChart.data.datasets[0].data.shift();
    coolersChart.data.datasets[1].data.shift();
    coolersChart.data.datasets[2].data.shift();
  }

  coolersChart.update("none");
}

// Yeni veri geldiğinde Ortam Sıcaklığı grafiğini güncelle
function updateAmbientChartWithNewData(ambientTemp) {
  if (!ambientChart) return;

  // Mesajı gizle (ilk veri geldiğinde)
  const msg = document.getElementById("ambientChartMessage");
  if (msg && ambientChart.data.labels.length === 0) {
    msg.style.display = "none";
  }

  const now = new Date();
  const currentTime =
    now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");

  // Mevcut verileri kaydır ve yeni veriyi ekle
  ambientChart.data.labels.push(currentTime);
  ambientChart.data.datasets[0].data.push(ambientTemp);

  // 48'den fazla nokta varsa eski verileri temizle
  if (ambientChart.data.labels.length > 48) {
    ambientChart.data.labels.shift();
    ambientChart.data.datasets[0].data.shift();
  }

  ambientChart.update("none");
}

// ============================================
// GELİŞMİŞ İSTATİSTİK FONKSİYONLARI
// ============================================

// Günlük istatistikleri kaydet (GÜNCELLENDİ)
function saveStats(temp, type) {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const timeKey =
    now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");

  const statsRef = firebase.database().ref(`stats/daily/${today}/${type}`);
  const hourlyRef = firebase
    .database()
    .ref(`stats/hourly/${today}/${type}/${timeKey}`);

  // Saatlik ortalamayı kaydet
  hourlyRef.set(temp);

  // Günlük istatistikleri güncelle
  statsRef.transaction((current) => {
    if (current === null) {
      return {
        min: temp,
        max: temp,
        sum: temp,
        count: 1,
        lastUpdate: Date.now(),
      };
    } else {
      return {
        min: Math.min(current.min, temp),
        max: Math.max(current.max, temp),
        sum: current.sum + temp,
        count: current.count + 1,
        lastUpdate: Date.now(),
      };
    }
  });
}

// Günlük istatistikleri göster (GÜNCELLENDİ)
function loadDailyStats() {
  const today = new Date().toISOString().split("T")[0];

  // Normal Dolap
  firebase
    .database()
    .ref(`stats/daily/${today}/fridge`)
    .on("value", (snapshot) => {
      const data = snapshot.val();
      const element = document.getElementById("fridge-stats");
      if (data && element) {
        document.getElementById("fridge-min").textContent =
          data.min.toFixed(1) + " °C";
        document.getElementById("fridge-max").textContent =
          data.max.toFixed(1) + " °C";
        document.getElementById("fridge-avg").textContent =
          (data.sum / data.count).toFixed(1) + " °C";
        document.getElementById("fridge-count").textContent = data.count;
      } else {
        resetStatsDisplay("fridge");
      }
    });

  // Dondurucu
  firebase
    .database()
    .ref(`stats/daily/${today}/freezer`)
    .on("value", (snapshot) => {
      const data = snapshot.val();
      const element = document.getElementById("freezer-stats");
      if (data && element) {
        document.getElementById("freezer-min").textContent =
          data.min.toFixed(1) + " °C";
        document.getElementById("freezer-max").textContent =
          data.max.toFixed(1) + " °C";
        document.getElementById("freezer-avg").textContent =
          (data.sum / data.count).toFixed(1) + " °C";
        document.getElementById("freezer-count").textContent = data.count;
      } else {
        resetStatsDisplay("freezer");
      }
    });

  // Derin Dondurucu
  firebase
    .database()
    .ref(`stats/daily/${today}/deepFreezer`)
    .on("value", (snapshot) => {
      const data = snapshot.val();
      const element = document.getElementById("deep-freezer-stats");
      if (data && element) {
        document.getElementById("deep-freezer-min").textContent =
          data.min.toFixed(1) + " °C";
        document.getElementById("deep-freezer-max").textContent =
          data.max.toFixed(1) + " °C";
        document.getElementById("deep-freezer-avg").textContent =
          (data.sum / data.count).toFixed(1) + " °C";
        document.getElementById("deep-freezer-count").textContent = data.count;
      } else {
        resetStatsDisplay("deep-freezer");
      }
    });

  // Ortam Sıcaklığı
  firebase
    .database()
    .ref(`stats/daily/${today}/ambient`)
    .on("value", (snapshot) => {
      const data = snapshot.val();
      const element = document.getElementById("ambient-stats");
      if (data && element) {
        document.getElementById("ambient-min").textContent =
          data.min.toFixed(1) + " °C";
        document.getElementById("ambient-max").textContent =
          data.max.toFixed(1) + " °C";
        document.getElementById("ambient-avg").textContent =
          (data.sum / data.count).toFixed(1) + " °C";
        document.getElementById("ambient-count").textContent = data.count;
      } else {
        resetStatsDisplay("ambient");
      }
    });
}

// İstatistikleri sıfırla
function resetStatsDisplay(type) {
  document.getElementById(`${type}-min`).textContent = "--";
  document.getElementById(`${type}-max`).textContent = "--";
  document.getElementById(`${type}-avg`).textContent = "--";
  document.getElementById(`${type}-count`).textContent = "--";
}

// Haftalık özet hesapla (GÜNCELLENDİ)
function loadWeeklySummary() {
  const today = new Date();
  const last14Days = []; // ✅ 7 → 14

  for (let i = 0; i < 14; i++) {
    // ✅ 7 → 14
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    last14Days.push(date.toISOString().split("T")[0]);
  }

  let fridgeData = [],
    freezerData = [];
  let processedDays = 0;

  last14Days.forEach((date) => {
    // ✅ 7 → 14
    firebase
      .database()
      .ref(`stats/daily/${date}`)
      .once("value")
      .then((snapshot) => {
        const data = snapshot.val();
        if (data) {
          if (data.fridge) {
            fridgeData.push({
              date: date,
              avg: data.fridge.sum / data.fridge.count,
              count: data.fridge.count,
            });
          }
          if (data.freezer) {
            freezerData.push({
              date: date,
              avg: data.freezer.sum / data.freezer.count,
              count: data.freezer.count,
            });
          }
        }

        processedDays++;
        if (processedDays === 14) {
          // ✅ 7 → 14
          updateWeeklySummary(fridgeData, freezerData);
        }
      });
  });
}

// Haftalık özeti güncelle
function updateWeeklySummary(fridgeData, freezerData) {
  if (fridgeData.length > 0) {
    const fridgeAvg =
      fridgeData.reduce((sum, day) => sum + day.avg, 0) / fridgeData.length;
    document.getElementById("weekly-fridge-avg").textContent =
      fridgeAvg.toFixed(1) + " °C";
  }

  if (freezerData.length > 0) {
    const freezerAvg =
      freezerData.reduce((sum, day) => sum + day.avg, 0) / freezerData.length;
    document.getElementById("weekly-freezer-avg").textContent =
      freezerAvg.toFixed(1) + " °C";
  }
}

// ============================================
// TEMEL FONKSİYONLAR (GÜNCELLENDİ)
// ============================================

// Bağlantı durumunu güncelle
function updateConnectionStatus() {
  if (!lastOverallUpdate) return;

  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const lastUpdateText = document.getElementById("lastUpdateText");
  const powerAlert = document.getElementById("powerAlert");

  const timeSinceUpdate = Date.now() - lastOverallUpdate.getTime();
  const minutesSinceUpdate = Math.floor(timeSinceUpdate / (1000 * 60));

  // 1 DAKİKADAN FAZLA ise elektrik kesintisi (TEST İÇİN)
  if (timeSinceUpdate > 80000) {
    statusDot.className = "status-dot offline";
    statusText.innerText = "🔴 Elektrik Kesildi";
    powerAlert.classList.add("show");
    document.getElementById("powerAlertTime").innerText =
      minutesSinceUpdate + " dakika";

    // ✅ KESİNTİ BAŞLANGICINI KAYDET
    if (!offlineStartTime) {
      offlineStartTime = lastOverallUpdate.getTime();
      wasOffline = true;
      console.log("⚡ Kesinti başladı:", new Date(offlineStartTime));
    }
  }
  // NORMAL - Elektrik geldi
  else {
    statusDot.className = "status-dot online";
    statusText.innerText = "🟢 Bağlı";
    powerAlert.classList.remove("show");

    // ✅ KESİNTİ BİTTİ - KAYDET
    if (wasOffline && offlineStartTime) {
      const outageEnd = Date.now();
      const outageDuration = outageEnd - offlineStartTime;

      console.log("✅ Kesinti bitti! Süre:", formatDuration(outageDuration));

      // Firebase'e kaydet
      saveOutage(offlineStartTime, outageEnd);

      // Kesinti geçmişini yeniden yükle
      loadOutageHistory(); // ← BU SATIRI EKLE!

      // Değişkenleri sıfırla
      offlineStartTime = null;
      wasOffline = false;
    }
  }

  lastUpdateText.innerText = "Son güncelleme: " + timeAgo(lastOverallUpdate);
}
// Sıcaklık durumunu kontrol et (Doğru sıcaklık aralıklarıyla)
function checkStatus(temp, type, isConnected) {
  if (!isConnected) return { class: "offline", text: "⚠️ Bağlantı Yok" };

  if (type === "ambient") {
    // Ortam sıcaklığı - yangın alarmı için
    if (temp > 35) return { class: "danger", text: "🔥 YANGIN TEHLİKESİ!" };
    if (temp > 30) return { class: "warning", text: "⚡ Çok Sıcak Ortam" };
    if (temp < 10) return { class: "warning", text: "❄️ Çok Soğuk Ortam" };
    return { class: "ok", text: "✓ Normal Ortam" };
  } else if (type === "fridge") {
    // Normal buzdolabı (+4°C bölgesi)
    if (temp > 8) return { class: "danger", text: "🔥 Çok Sıcak!" };
    if (temp > 6) return { class: "warning", text: "⚡ Dikkat" };
    if (temp < 2) return { class: "warning", text: "❄️ Çok Soğuk" };
    return { class: "ok", text: "✓ Normal" };
  } else if (type === "freezer") {
    // Normal buzdolabı dondurucusu (-18°C bölgesi)
    if (temp > -10) return { class: "danger", text: "🔥 ERİYOR! Tehlikeli" };
    if (temp > -15) return { class: "warning", text: "⚡ Dikkat - Erime" };
    if (temp < -25) return { class: "warning", text: "❄️ Aşırı Soğuk" };
    return { class: "ok", text: "✓ Normal Dondurucu" };
  } else if (type === "deepFreezer") {
    // Derin dondurucu (-24°C bölgesi)
    if (temp > -15) return { class: "danger", text: "🔥 ERİYOR! Tehlikeli" };
    if (temp > -18) return { class: "warning", text: "⚡ Dikkat - Erime" };
    if (temp < -30) return { class: "warning", text: "❄️ Aşırı Soğuk" };
    return { class: "ok", text: "✓ Normal Derin Dondurucu" };
  }
}

// ============================================
// FIREBASE LISTENERS (GÜNCELLENDİ)
// ============================================

// Ortam Sıcaklığı listener'ı (1. Wemos - Mutfak)
firebase
  .database()
  .ref("devices/kitchen/sensors/ambient")
  .on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) {
      console.log("🌡️ Ortam Sıcaklığı:", value);
      document.getElementById("room-temp").textContent =
        value.toFixed(1) + " °C";
      document.getElementById("room-time").textContent =
        new Date().toLocaleTimeString();

      const status = checkStatus(value, "ambient", true);
      document.getElementById("room-status").className =
        "sensor-status " + status.class;
      document.getElementById("room-status").innerText = status.text;
      // ✅ GRAFİĞİ GÜNCELLE
      updateAmbientChartWithNewData(value);
      // ✅ İSTATİSTİKLERİ KAYDET
      saveStats(value, "ambient");
    }
  });

// Derin Dondurucu listener'ı (2. Wemos - Bodrum)
firebase
  .database()
  .ref("devices/basement/sensors/fridge")
  .on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) {
      console.log("❄️ Derin Dondurucu:", value);
      document.getElementById("deep-freezer-temp").textContent =
        value.toFixed(1) + " °C";
      document.getElementById("deep-freezer-time").textContent =
        new Date().toLocaleTimeString();

      const status = checkStatus(value, "deepFreezer", true);
      document.getElementById("deep-freezer-status").className =
        "sensor-status " + status.class;
      document.getElementById("deep-freezer-status").innerText = status.text;
      // ✅ İSTATİSTİKLERİ KAYDET
      saveStats(value, "deepFreezer");

      // ✅ GRAFİĞİ GÜNCELLE
      const fridgeTemp =
        coolersChart?.data?.datasets[2]?.data?.slice(-1)[0] || 0;
      const freezerTemp =
        coolersChart?.data?.datasets[1]?.data?.slice(-1)[0] || 0;
      updateCoolersChartWithNewData(value, freezerTemp, fridgeTemp);
    }
  });

// Normal Dolap listener'ı (1. Wemos - Mutfak)
firebase
  .database()
  .ref("devices/kitchen/sensors/fridge")
  .on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) {
      console.log("🧊 Fridge:", value);
      document.getElementById("fridge-temp").textContent =
        value.toFixed(1) + " °C";
      document.getElementById("fridge-time").textContent =
        new Date().toLocaleTimeString();

      const status = checkStatus(value, "fridge", true);
      document.getElementById("fridge-status").className =
        "sensor-status " + status.class;
      document.getElementById("fridge-status").innerText = status.text;

      saveStats(value, "fridge");

      // ✅ GRAFİĞİ GÜNCELLE
      const freezerTemp =
        coolersChart?.data?.datasets[1]?.data?.slice(-1)[0] || 0;
      const deepFreezerTemp =
        coolersChart?.data?.datasets[0]?.data?.slice(-1)[0] || 0;
      updateCoolersChartWithNewData(deepFreezerTemp, freezerTemp, value);
    }
  });

// Dondurucu listener'ı (1. Wemos - Mutfak)
firebase
  .database()
  .ref("devices/kitchen/sensors/freezer")
  .on("value", function (snapshot) {
    const value = snapshot.val();
    if (value !== null) {
      console.log("❄️ Freezer:", value);
      document.getElementById("freezer-temp").textContent =
        value.toFixed(1) + " °C";
      document.getElementById("freezer-time").textContent =
        new Date().toLocaleTimeString();

      const status = checkStatus(value, "freezer", true);
      document.getElementById("freezer-status").className =
        "sensor-status " + status.class;
      document.getElementById("freezer-status").innerText = status.text;

      saveStats(value, "freezer");

      // ✅ GRAFİĞİ GÜNCELLE
      const fridgeTemp =
        coolersChart?.data?.datasets[2]?.data?.slice(-1)[0] || 0;
      const deepFreezerTemp =
        coolersChart?.data?.datasets[0]?.data?.slice(-1)[0] || 0;
      updateCoolersChartWithNewData(deepFreezerTemp, value, fridgeTemp);
    }
  });

// lastUpdate timestamp'ini dinle
firebase
  .database()
  .ref("devices/kitchen/meta/lastUpdate")
  .on("value", function (snapshot) {
    const timestamp = snapshot.val();

    if (timestamp !== null) {
      lastOverallUpdate = new Date(timestamp);
      console.log("⏰ Firebase lastUpdate:", lastOverallUpdate);
      updateConnectionStatus();
    }
  });
// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

function formatTime(date) {
  if (date.getFullYear() === 1970) return "Bekleniyor...";
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
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
  if (minutes > 0) return minutes + " dakika " + seconds + " saniye";
  return seconds + " saniye";
}

// Verileri yenile
function refreshData() {
  location.reload();
}

// ============================================
// TEMA ve ARAYÜZ FONKSİYONLARI
// ============================================

// Temayı başlat
function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  const themeToggle = document.getElementById("themeToggle");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggle.innerText = "☀️";
  } else {
    themeToggle.innerText = "🌙";
  }
}

// Temayı değiştir
function toggleTheme() {
  const body = document.body;
  const themeToggle = document.getElementById("themeToggle");

  body.classList.toggle("dark-mode");

  if (body.classList.contains("dark-mode")) {
    themeToggle.innerText = "☀️";
    localStorage.setItem("theme", "dark");
  } else {
    themeToggle.innerText = "🌙";
    localStorage.setItem("theme", "light");
  }

  // Grafik temasını güncelle
  if (coolersChart) {
    updateChartTheme();
  }
}

// Grafik temasını güncelle
function updateChartTheme() {
  const isDark = document.body.classList.contains("dark-mode");

  if (coolersChart && coolersChart.options) {
    coolersChart.options.scales.x.ticks.color = isDark ? "#b0b0b0" : "#666";
    coolersChart.options.scales.y.ticks.color = isDark ? "#b0b0b0" : "#666";
    coolersChart.options.scales.x.grid.color = isDark
      ? "rgba(255,255,255,0.1)"
      : "rgba(0,0,0,0.1)";
    coolersChart.options.scales.y.grid.color = isDark
      ? "rgba(255,255,255,0.1)"
      : "rgba(0,0,0,0.1)";
    coolersChart.options.plugins.legend.labels.color = isDark
      ? "#e0e0e0"
      : "#333";

    coolersChart.update();
  }
}

// ============================================
// BİLDİRİM FONKSİYONLARI
// ============================================

// Bildirim izni iste
async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("Bu tarayıcı bildirimleri desteklemiyor");
    return false;
  }

  if (Notification.permission === "granted") {
    notificationPermission = true;
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    notificationPermission = permission === "granted";

    if (notificationPermission) {
      showTempAlert("✅ Bildirimler etkin!", "success");
    }
    return notificationPermission;
  }

  return false;
}

// Bildirim gönder
function sendNotification(title, body, icon = "⚠️") {
  if (!notificationPermission) return;

  // Spam önleme - 5 dakikada bir bildirim
  const now = Date.now();
  const lastNotification = Math.max(
    lastNotificationTime.fridge,
    lastNotificationTime.freezer,
    lastNotificationTime.power
  );
  if (now - lastNotification < NOTIFICATION_COOLDOWN) {
    return;
  }

  // Service Worker varsa onunla gönder
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body: body,
        icon: "/fridge-dashboard/icon.png",
        badge: "/fridge-dashboard/badge.png",
        vibrate: [200, 100, 200],
        tag: "fridge-alert",
        requireInteraction: true,
        actions: [
          {
            action: "open",
            title: "📱 Aç",
          },
          {
            action: "close",
            title: "Kapat",
          },
        ],
      });
    });
  } else {
    // Fallback: Normal notification
    try {
      const notification = new Notification(title, {
        body: body,
        icon: "/fridge-dashboard/icon.png",
        badge: "/fridge-dashboard/badge.png",
      });

      notification.onclick = function () {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.log("Bildirim hatası:", error);
    }
  }
}

// Sıcaklık uyarısı kontrolü
function checkTemperatureAlert(temp, type) {
  const now = Date.now();

  if (type === "fridge" && temp > 8) {
    if (now - lastNotificationTime.fridge >= NOTIFICATION_COOLDOWN) {
      sendNotification(
        "⚠️ Buzdolabı Sıcak!",
        `Buzdolabı sıcaklığı ${temp.toFixed(1)}°C - Yiyecekler bozulabilir!`,
        "🔥"
      );
      lastNotificationTime.fridge = now;
      showTempAlert("🔥 Buzdolabı çok sıcak!", "danger");
    }
  } else if (type === "freezer" && temp > -10) {
    if (now - lastNotificationTime.freezer >= NOTIFICATION_COOLDOWN) {
      sendNotification(
        "⚠️ Dondurucu Sıcak!",
        `Dondurucu sıcaklığı ${temp.toFixed(1)}°C - Donmuş gıdalar eriyebilir!`,
        "🔥"
      );
      lastNotificationTime.freezer = now;
      showTempAlert("❄️ Dondurucu çok sıcak!", "danger");
    }
  }
}

// Elektrik kesintisi bildirimi
function notifyPowerOutage() {
  const now = Date.now();

  if (now - lastNotificationTime.power >= NOTIFICATION_COOLDOWN) {
    sendNotification(
      "⚡ Elektrik Kesintisi!",
      "Buzdolabından 1 dakikadır veri gelmiyor. Elektrik kesilmiş olabilir.",
      "⚡"
    );
    lastNotificationTime.power = now;
  }
}

// Bağlantı yeniden kuruldu bildirimi
function notifyReconnected(duration) {
  sendNotification(
    "✅ Bağlantı Yeniden Kuruldu",
    `Elektrik geri geldi! Kesinti süresi: ${duration}`,
    "✅"
  );
}

// Geçici uyarı göster (sayfa içi)
function showTempAlert(message, type = "info") {
  const alertDiv = document.createElement("div");
  alertDiv.className = `temp-alert ${type}`;
  alertDiv.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;

  // Stil ekle (eğer yoksa)
  if (!document.querySelector("#alert-styles")) {
    const style = document.createElement("style");
    style.id = "alert-styles";
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
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (!localStorage.getItem("pwa-dismissed")) {
    document.getElementById("installPrompt").classList.add("show");
  }
});

// PWA kurulum butonu
document.getElementById("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    console.log("PWA kuruldu!");
    showTempAlert("📱 Uygulama kuruldu!", "success");
  }

  deferredPrompt = null;
  document.getElementById("installPrompt").classList.remove("show");
});

// PWA kurulum kapatma
document.getElementById("closeInstallBtn").addEventListener("click", () => {
  document.getElementById("installPrompt").classList.remove("show");
  localStorage.setItem("pwa-dismissed", "true");
});

// Service Worker kayıt
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/fridge-dashboard/service-worker.js")
      .then((reg) => console.log("Service Worker kayıtlı:", reg))
      .catch((err) => console.log("Service Worker hatası:", err));
  });
}

// ============================================
// ELEKTRİK KESİNTİSİ FONKSİYONLARI
// ============================================

// Elektrik kesintisi kaydet - GÜNCELLENMİŞ
function saveOutage(startTime, endTime) {
  const duration = endTime - startTime;

  // SADECE 2 DAKİKADAN UZUN KESİNTİLERİ KAYDET
  if (duration < 120000) {
    console.log("⏱️ Kısa kesinti, kaydedilmiyor:", duration + " ms");
    return;
  }

  const timestamp = new Date(startTime).toISOString().replace(/[:.]/g, "-");

  firebase
    .database()
    .ref(`devices/kitchen/outages/${timestamp}`)
    .set({
      start: startTime,
      end: endTime,
      duration: duration,
      date: new Date(startTime).toISOString().split("T")[0],
      formattedDuration: formatDuration(duration),
    })
    .then(() => {
      console.log("✅ Kesinti kaydedildi:", formatDuration(duration));
    })
    .catch((error) => {
      console.error("❌ Kesinti kaydetme hatası:", error);
    });
}

// Kesinti geçmişini yükle
function loadOutageHistory() {
  const today = new Date();
  const last14Days = new Date(today); // ✅ 7 → 14
  last14Days.setDate(last14Days.getDate() - 14); // ✅ 7 → 14

  firebase
    .database()
    .ref("devices/kitchen/outages")
    .orderByChild("start")
    .startAt(last14Days.getTime()) // ✅ 14 gün öncesinden başla
    .once("value")
    .then((snapshot) => {
      const outages = [];
      snapshot.forEach((child) => {
        outages.push(child.val());
      });

      outages.sort((a, b) => b.start - a.start); // Yeniden eskiye

      displayOutageHistory(outages);
    })
    .catch((error) => {
      console.error("Kesinti geçmişi yükleme hatası:", error);
      document.getElementById("outageHistory").innerHTML =
        '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Veri yüklenirken hata oluştu</p>';
    });
}

// Kesinti geçmişini göster
function displayOutageHistory(outages) {
  if (outages.length === 0) {
    document.getElementById("outageHistory").innerHTML =
      '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Son 7 günde kesinti kaydı yok ✅</p>';

    document.getElementById("weekly-outage-count").textContent = "0 kesinti";
    document.getElementById("weekly-outage-duration").textContent = "0 dk";
    return;
  }

  let html = "";
  let totalDuration = 0;
  let outageCount = outages.length;

  outages.forEach((outage) => {
    const startDate = new Date(outage.start);
    const durationMin = outage.duration
      ? Math.floor(outage.duration / 60000)
      : 0;
    if (outage.duration) totalDuration += outage.duration;

    html += `
            <div class="outage-item">
                <div class="outage-date">
                    ⚡ ${startDate.toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </div>
                <div class="outage-duration">
                    Süre: ${durationMin} dakika
                </div>
            </div>
        `;
  });

  document.getElementById("outageHistory").innerHTML = html;

  // Haftalık özet
  document.getElementById("weekly-outage-count").textContent =
    outageCount + " kesinti";

  const totalMinutes = Math.floor(totalDuration / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    document.getElementById(
      "weekly-outage-duration"
    ).textContent = `${hours} saat ${minutes} dk`;
  } else {
    document.getElementById(
      "weekly-outage-duration"
    ).textContent = `${minutes} dk`;
  }
}

// Uygulama başlatma
window.addEventListener("load", function () {
  console.log("🚀 Buzdolabı Takip Sistemi Başlatılıyor...");

  // Temayı yükle
  initTheme();

  // Grafikleri oluştur
  createCoolersChart();
  createAmbientChart();

  // ✅ GEÇMİŞ VERİLERİ YÜKLE - BU SATIRLARI EKLE
  loadCoolersChartData();
  loadAmbientChartData();

  // İstatistikleri yükle
  loadDailyStats();
  loadWeeklySummary();
  loadOutageHistory();

  // Bağlantı durumunu kontrol et
  setInterval(updateConnectionStatus, 5000);

  // Bildirim izni iste (5 saniye sonra)
  setTimeout(() => {
    requestNotificationPermission().then((permission) => {
      if (permission) {
        console.log("✅ Bildirim izni alındı");
      }
    });
  }, 5000);

  // Firebase bağlantısını kontrol et
  firebase
    .database()
    .ref(".info/connected")
    .on("value", (snapshot) => {
      if (snapshot.val() === true) {
        console.log("✅ Firebase bağlantısı aktif");
      } else {
        console.log("❌ Firebase bağlantısı kesildi");
      }
    });
});
