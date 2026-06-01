import { useState, useEffect, useCallback } from 'react';
import { dotnetClient } from '../api/client';

// ─── TypeScript Arayüzleri ───────────────────────────────────────────

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  createdAt: string;
  isActive: boolean;
  isVerified: boolean;
  role: string;
  isSuperAdmin: boolean;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  role?: string;
}

export interface UpdateUserPayload {
  username?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
  isVerified?: boolean;
  role?: string;
}

// ─── Hook Dönüş Tipi ────────────────────────────────────────────────

export interface UseAdminUsersReturn {
  users: AdminUser[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  createUser: (payload: CreateUserPayload) => Promise<boolean>;
  updateUser: (id: number, payload: UpdateUserPayload) => Promise<boolean>;
  deactivateUser: (id: number) => Promise<boolean>;
  activateUser: (id: number) => Promise<boolean>;
}

// ─── Custom Hook ─────────────────────────────────────────────────────

/**
 * Admin panelindeki kullanıcı yönetim operasyonlarını yöneten hook.
 * UI bileşenleri sadece render'a odaklanır — tüm API çağrıları burada.
 *
 * Kullanım:
 *   const { users, isLoading, createUser, deactivateUser, ... } = useAdminUsers();
 */
export function useAdminUsers(): UseAdminUsersReturn {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Kullanıcı listesini çek ────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dotnetClient.get('/Users');
      setUsers(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Kullanıcılar yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Yeni kullanıcı oluştur ─────────────────────────────────────
  const createUser = useCallback(async (payload: CreateUserPayload): Promise<boolean> => {
    try {
      await dotnetClient.post('/Users', payload);
      await fetchUsers(); // Listeyi yenile
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Kullanıcı oluşturulamadı.');
      return false;
    }
  }, [fetchUsers]);

  // ── Kullanıcıyı güncelle ───────────────────────────────────────
  const updateUser = useCallback(async (id: number, payload: UpdateUserPayload): Promise<boolean> => {
    try {
      await dotnetClient.put(`/Users/${id}`, payload);
      await fetchUsers();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Kullanıcı güncellenemedi.');
      return false;
    }
  }, [fetchUsers]);

  // ── Kullanıcıyı pasif yap (soft delete) ────────────────────────
  const deactivateUser = useCallback(async (id: number): Promise<boolean> => {
    try {
      await dotnetClient.delete(`/Users/${id}`);
      await fetchUsers();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Kullanıcı devre dışı bırakılamadı.');
      return false;
    }
  }, [fetchUsers]);

  // ── Kullanıcıyı aktif yap ──────────────────────────────────────
  const activateUser = useCallback(async (id: number): Promise<boolean> => {
    try {
      await dotnetClient.patch(`/Users/${id}/activate`);
      await fetchUsers();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Kullanıcı aktif edilemedi.');
      return false;
    }
  }, [fetchUsers]);

  return {
    users,
    isLoading,
    error,
    refresh: fetchUsers,
    createUser,
    updateUser,
    deactivateUser,
    activateUser,
  };
}
