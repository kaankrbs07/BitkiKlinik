import { useState, useEffect, useCallback } from 'react';
import { dotnetClient } from '../api/client';

import { useAuthStore } from '../store/useAuthStore';

// ─── TypeScript Arayüzleri ───────────────────────────────────────────

/** Tek bir tarama kaydının özeti */
export interface RecentScan {
  id: number;
  plantName: string;
  diseaseName: string;
  confidence: number;
  imageUrl: string | null;
  isHealthy: boolean;
  scanDate: string; // ISO 8601
}

/** Dashboard istatistikleri */
export interface DashboardStats {
  total: number;
  healthy: number;
  risky: number;
}

/** Hook'un döndürdüğü veri yapısı */
export interface DashboardData {
  stats: DashboardStats;
  recentScans: RecentScan[];
  isLoading: boolean;
  error: string | null;
  /** Manuel yenileme (pull-to-refresh vb.) */
  refresh: () => void;
}

// ─── Custom Hook ─────────────────────────────────────────────────────

/**
 * Dashboard verilerini .NET API'den çeken reusable hook.
 *
 * Kullanım:
 *   const { stats, recentScans, isLoading, error, refresh } = useDashboardData();
 *
 * İş akışı:
 *   1. Mount olduğunda GET /api/dashboard çağrılır
 *   2. JWT token otomatik olarak dotnetClient interceptor'ı tarafından eklenir
 *   3. Loading, error ve data state'leri yönetilir
 *   4. refresh() ile manuel yenileme yapılabilir (pull-to-refresh için)
 */
export function useDashboardData(): DashboardData {
  const [stats, setStats] = useState<DashboardStats>({ total: 0, healthy: 0, risky: 0 });
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    // Sadece giriş yapıldıysa istek at (401 hatasını engeller)
    if (!useAuthStore.getState().isAuthenticated) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // GET /api/dashboard → DashboardSummaryDTO
      const response = await dotnetClient.get('/Dashboard');

      const data = response.data;

      setStats({
        total:   data.totalScans,
        healthy: data.healthyCount,
        risky:   data.riskyCount,
      });

      setRecentScans(data.recentScans ?? []);
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'Dashboard verileri yüklenirken bir hata oluştu.';

      setError(message);
      console.error('[useDashboardData] Hata:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Component mount olduğunda verileri çek
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    stats,
    recentScans,
    isLoading,
    error,
    refresh: fetchDashboard,
  };
}
