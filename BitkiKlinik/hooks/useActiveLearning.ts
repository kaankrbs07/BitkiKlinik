import { useState, useEffect, useCallback, useRef } from 'react';
import { dotnetClient, fastApiClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

// ─── TypeScript Arayüzleri ───────────────────────────────────────────

export interface ActiveLearningPendingItem {
  id: number;
  scanId: number | null;
  imageUrl: string;
  predictedDisease: string;
  confidence: number;
  source: 'LowConfidence' | 'UserFlagged' | string;
  createdAt: string;
}

export interface ActiveLearningStats {
  pendingCount: number;
  resolvedCount: number;
  totalCount: number;
}

export interface RetrainStatus {
  status: 'idle' | 'training' | 'success' | 'error';
  progress: number; // 0.0 to 1.0
  error: string | null;
  lastTrainedAt: string | null;
  totalSamples: number;
  currentSamples: number;
  samplesBreakdown: Record<string, number>;
}

export interface UseActiveLearningReturn {
  pendingItems: ActiveLearningPendingItem[];
  stats: ActiveLearningStats;
  retrainStatus: RetrainStatus | null;
  isLoading: boolean;
  isRetrainingLoading: boolean;
  error: string | null;
  
  refresh: () => void;
  resolveItem: (queueId: number, correctedDisease: string) => Promise<boolean>;
  ignoreItem: (queueId: number) => Promise<boolean>;
  triggerRetrain: () => Promise<boolean>;
}

// ─── Custom Hook ─────────────────────────────────────────────────────

/**
 * Aktif Öğrenme ve Arka Planda Yeniden Eğitim operasyonlarını yöneten hook.
 */
export function useActiveLearning(): UseActiveLearningReturn {
  const [pendingItems, setPendingItems] = useState<ActiveLearningPendingItem[]>([]);
  const [stats, setStats] = useState<ActiveLearningStats>({ pendingCount: 0, resolvedCount: 0, totalCount: 0 });
  const [retrainStatus, setRetrainStatus] = useState<RetrainStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrainingLoading, setIsRetrainingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const BASE_DOTNET = '/admin/active-learning';

  // 1. Bekleyen Aktif Öğrenme Kuyruğunu Çek
  const fetchPending = useCallback(async () => {
    try {
      const response = await dotnetClient.get(`${BASE_DOTNET}/pending`, {
        params: { page: 1, pageSize: 50 }
      });
      setPendingItems(response.data ?? []);
    } catch (err: any) {
      console.error('Bekleyen kuyruk çekilemedi:', err);
      setError(err.response?.data?.message ?? 'Kuyruk yüklenirken bir hata oluştu.');
    }
  }, []);

  // 2. Aktif Öğrenme İstatistiklerini Çek
  const fetchStats = useCallback(async () => {
    try {
      const response = await dotnetClient.get(`${BASE_DOTNET}/stats`);
      setStats(response.data ?? { pendingCount: 0, resolvedCount: 0, totalCount: 0 });
    } catch (err: any) {
      console.error('İstatistikler çekilemedi:', err);
    }
  }, []);

  // 3. Python FastAPI'den Yeniden Eğitim Durumunu Çek
  const fetchRetrainStatus = useCallback(async () => {
    try {
      // Doğrudan fastApiClient üzerinden FastAPI servisini sorguluyoruz
      const response = await fastApiClient.get('/active-learning/retrain-status');
      setRetrainStatus(response.data);
      return response.data as RetrainStatus;
    } catch (err: any) {
      console.error('Yeniden eğitim durumu çekilemedi:', err);
      return null;
    }
  }, []);

  // Tüm Verileri Yenile
  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([fetchPending(), fetchStats(), fetchRetrainStatus()]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchPending, fetchStats, fetchRetrainStatus]);

  // Mount anında ilk yükleme
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 4. Yeniden Eğitim Polling (Eğer eğitim devam ediyorsa periyodik sorgula)
  useEffect(() => {
    if (retrainStatus?.status === 'training') {
      // Eğer durum 'training' ise, her 2 saniyede bir polling yap
      if (!pollingTimerRef.current) {
        pollingTimerRef.current = setInterval(async () => {
          const status = await fetchRetrainStatus();
          if (status && status.status !== 'training') {
            // Eğitim bittiğinde timer'ı temizle ve genel verileri yenile
            if (pollingTimerRef.current) {
              clearInterval(pollingTimerRef.current);
              pollingTimerRef.current = null;
            }
            fetchStats();
            fetchPending();
          }
        }, 2000);
      }
    } else {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [retrainStatus?.status, fetchRetrainStatus, fetchStats, fetchPending]);

  // 5. Kuyruk Öğesini Doğrula / Sınıflandır (Resolve)
  const resolveItem = useCallback(async (queueId: number, correctedDisease: string): Promise<boolean> => {
    try {
      setError(null);
      await dotnetClient.post(`${BASE_DOTNET}/resolve`, {
        queueId,
        correctedDisease
      });
      // Arayüzü hızlıca güncelle
      setPendingItems((prev) => prev.filter((item) => item.id !== queueId));
      fetchStats();
      fetchRetrainStatus();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Öğe sınıflandırılamadı.';
      setError(msg);
      console.error('Resolve hatası:', msg);
      return false;
    }
  }, [fetchStats, fetchRetrainStatus]);

  // 6. Kuyruk Öğesini Yoksay (Ignore)
  const ignoreItem = useCallback(async (queueId: number): Promise<boolean> => {
    try {
      setError(null);
      await dotnetClient.post(`${BASE_DOTNET}/${queueId}/ignore`);
      // Arayüzü güncelle
      setPendingItems((prev) => prev.filter((item) => item.id !== queueId));
      fetchStats();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Öğe yoksayılamadı.';
      setError(msg);
      console.error('Ignore hatası:', msg);
      return false;
    }
  }, [fetchStats]);

  // 7. Yeniden Eğitimi Tetikle (Retrain)
  const triggerRetrain = useCallback(async (): Promise<boolean> => {
    setIsRetrainingLoading(true);
    try {
      setError(null);
      const response = await dotnetClient.post(`${BASE_DOTNET}/retrain`);
      if (response.data?.status === 'started' || response.data?.status === 'success') {
        // Durumu anında sorgula ve poller'ı başlat
        await fetchRetrainStatus();
        return true;
      }
      setError(response.data?.message ?? 'Yeniden eğitim başlatılamadı.');
      return false;
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Yeniden eğitim tetiklenemedi.';
      setError(msg);
      return false;
    } finally {
      setIsRetrainingLoading(false);
    }
  }, [fetchRetrainStatus]);

  return {
    pendingItems,
    stats,
    retrainStatus,
    isLoading,
    isRetrainingLoading,
    error,
    refresh,
    resolveItem,
    ignoreItem,
    triggerRetrain,
  };
}
