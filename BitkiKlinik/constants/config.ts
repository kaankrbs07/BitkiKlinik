// Bilgisayarınızın yerel IP adresi (cmd -> ipconfig -> IPv4 Address)
// Expo Go cihaz üzerinden çalıştırıldığında 'localhost' cihazı işaret eder, bu yüzden IP gerekir.
// 5135: HTTP bağlantı noktası, 7271: HTTPS bağlantı noktası (.NET)
const LOCAL_IP = "172.20.10.5"; // Sistemden otomatik alındı

export const CONFIG = {
  // .NET API
  DOTNET_BASE_URL: `http://${LOCAL_IP}:5135`,
  DOTNET_API_URL: `http://${LOCAL_IP}:5135/api`,
  
  // FastAPI Model Servisi
  FAST_API_URL: `http://${LOCAL_IP}:8000`,
  
  // Aktif öğrenme mekanizması için kabul edilen güven eşik değeri (0.65)
  ACTIVE_LEARNING_THRESHOLD: 0.65,
};
