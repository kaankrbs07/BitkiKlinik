import axios from 'axios';
import { CONFIG } from '../constants/config';
import { useAuthStore } from '../store/useAuthStore';

// ── 1. .NET Backend Instance ─────────────────────────────────────────────────
export const dotnetClient = axios.create({
  baseURL: CONFIG.DOTNET_API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Otomatik Token Ekleme Interceptor'ı
dotnetClient.interceptors.request.use(
  async (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Refresh token mantığı için basit kilit ────────────────────────────────────
// Birden fazla eş-zamanlı 401 isteğinin refresh yarışına girmesini önler.
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const drainQueue = (error: unknown, token: string | null = null) => {
  pendingQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  pendingQueue = [];
};

dotnetClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Refresh isteğinin kendisi 401 dönerse → doğrudan logout (sonsuz döngü önleme)
    if (error.response?.status === 401 && originalRequest.url?.toLowerCase().includes('/auth/refresh')) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const { token: currentToken } = useAuthStore.getState();
      if (!currentToken) {
        // Hiç token yok → direkt logout
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Başka bir istek zaten refresh yapıyor; tamamlanınca yeniden dene
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return dotnetClient(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error('Refresh token yok.');

        // Yeni token çifti al
        const { data } = await dotnetClient.post('/Auth/refresh', { refreshToken });

        // Store'u güncelle
        useAuthStore.getState().login(data.token, data.refreshToken);

        drainQueue(null, data.token);
        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        return dotnetClient(originalRequest);
      } catch (refreshError) {
        drainQueue(refreshError);
        console.warn('[dotnetClient] Refresh başarısız, çıkış yapılıyor...');
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);


// ── 2. Python (FastAPI) ML Model Instance ────────────────────────────────────
export const fastApiClient = axios.create({
  baseURL: CONFIG.FAST_API_URL,
  timeout: 30000,
  // Content-Type multipart/form-data burada SET EDİLMEZ.
  // axios FormData gönderirken boundary'yi otomatik ekler;
  // manuel set etmek boundary'yi siler ve server-side parse başarısız olur.
});

fastApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('FastAPI tarafında bir sorun oluştu:', error);
    return Promise.reject(error);
  }
);

