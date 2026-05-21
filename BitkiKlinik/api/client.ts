import axios from 'axios';
import { CONFIG } from '../constants/config';
import { useAuthStore } from '../store/useAuthStore';

// 1. .NET Backend Instance (Authentication, Profile, Treatment History vb.)
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

dotnetClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Error handling (Token expire olduysa logout vb)
    return Promise.reject(error);
  }
);


// 2. Python (FastAPI) ML Model Instance (Image Analysis)
export const fastApiClient = axios.create({
  baseURL: CONFIG.FAST_API_URL,
  timeout: 30000, // Yükleme ve analiz sürebilir diye daha uzun timeout
  headers: {
    'Content-Type': 'multipart/form-data', // Sadece form-data atılacak
  },
});

fastApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("FastAPI tarafında bir sorun oluştu:", error);
    return Promise.reject(error);
  }
);
