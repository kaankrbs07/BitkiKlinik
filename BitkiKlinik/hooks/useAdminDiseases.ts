import { useState, useEffect, useCallback } from 'react';
import { dotnetClient } from '../api/client';

// ─── TypeScript Arayüzleri ───────────────────────────────────────────

export interface AdminDisease {
  id: number;
  name: string;
  description: string;
  modelLabel: string;
  treatmentCount: number;
}

export interface AdminTreatment {
  id: number;
  title: string;
  instructions: string;
  type: string; // "Natural" | "Chemical"
}

export interface AdminDiseaseDetail {
  id: number;
  name: string;
  description: string;
  modelLabel: string;
  treatments: AdminTreatment[];
}

export interface CreateDiseasePayload {
  name: string;
  description: string;
  modelLabel: string;
  treatments?: { title: string; instructions: string; type: string }[];
}

export interface UpdateDiseasePayload {
  name?: string;
  description?: string;
  modelLabel?: string;
}

export interface CreateTreatmentPayload {
  title: string;
  instructions: string;
  type: string;
}

export interface UpdateTreatmentPayload {
  title?: string;
  instructions?: string;
  type?: string;
}

// ─── Hook Dönüş Tipi ────────────────────────────────────────────────

export interface UseAdminDiseasesReturn {
  diseases: AdminDisease[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;

  // Disease CRUD
  getDiseaseDetail: (id: number) => Promise<AdminDiseaseDetail | null>;
  createDisease: (payload: CreateDiseasePayload) => Promise<boolean>;
  updateDisease: (id: number, payload: UpdateDiseasePayload) => Promise<boolean>;
  deleteDisease: (id: number) => Promise<boolean>;

  // Treatment CRUD
  addTreatment: (diseaseId: number, payload: CreateTreatmentPayload) => Promise<boolean>;
  updateTreatment: (treatmentId: number, payload: UpdateTreatmentPayload) => Promise<boolean>;
  deleteTreatment: (treatmentId: number) => Promise<boolean>;
}

// ─── Custom Hook ─────────────────────────────────────────────────────

/**
 * Admin panelindeki hastalık ve tedavi yönetim operasyonlarını yöneten hook.
 * Tüm admin/diseases API çağrılarını soyutlar — UI sadece render'a odaklanır.
 *
 * Kullanım:
 *   const { diseases, createDisease, addTreatment, ... } = useAdminDiseases();
 */
export function useAdminDiseases(): UseAdminDiseasesReturn {
  const [diseases, setDiseases] = useState<AdminDisease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const BASE = '/admin/diseases';

  // ── Hastalık listesini çek ─────────────────────────────────────
  const fetchDiseases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dotnetClient.get(BASE);
      setDiseases(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Hastalıklar yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchDiseases(); }, [fetchDiseases]);

  // ── Disease CRUD ───────────────────────────────────────────────

  const getDiseaseDetail = useCallback(async (id: number): Promise<AdminDiseaseDetail | null> => {
    try {
      const response = await dotnetClient.get(`${BASE}/${id}`);
      return response.data;
    } catch {
      return null;
    }
  }, []);

  const createDisease = useCallback(async (payload: CreateDiseasePayload): Promise<boolean> => {
    try {
      await dotnetClient.post(BASE, payload);
      await fetchDiseases();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Hastalık oluşturulamadı.');
      return false;
    }
  }, [fetchDiseases]);

  const updateDisease = useCallback(async (id: number, payload: UpdateDiseasePayload): Promise<boolean> => {
    try {
      await dotnetClient.put(`${BASE}/${id}`, payload);
      await fetchDiseases();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Hastalık güncellenemedi.');
      return false;
    }
  }, [fetchDiseases]);

  const deleteDisease = useCallback(async (id: number): Promise<boolean> => {
    try {
      await dotnetClient.delete(`${BASE}/${id}`);
      await fetchDiseases();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Hastalık silinemedi.');
      return false;
    }
  }, [fetchDiseases]);

  // ── Treatment CRUD ─────────────────────────────────────────────

  const addTreatment = useCallback(async (diseaseId: number, payload: CreateTreatmentPayload): Promise<boolean> => {
    try {
      await dotnetClient.post(`${BASE}/${diseaseId}/treatments`, payload);
      await fetchDiseases();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Tedavi eklenemedi.');
      return false;
    }
  }, [fetchDiseases]);

  const updateTreatment = useCallback(async (treatmentId: number, payload: UpdateTreatmentPayload): Promise<boolean> => {
    try {
      await dotnetClient.put(`${BASE}/treatments/${treatmentId}`, payload);
      await fetchDiseases();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Tedavi güncellenemedi.');
      return false;
    }
  }, [fetchDiseases]);

  const deleteTreatment = useCallback(async (treatmentId: number): Promise<boolean> => {
    try {
      await dotnetClient.delete(`${BASE}/treatments/${treatmentId}`);
      await fetchDiseases();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Tedavi silinemedi.');
      return false;
    }
  }, [fetchDiseases]);

  return {
    diseases,
    isLoading,
    error,
    refresh: fetchDiseases,
    getDiseaseDetail,
    createDisease,
    updateDisease,
    deleteDisease,
    addTreatment,
    updateTreatment,
    deleteTreatment,
  };
}
