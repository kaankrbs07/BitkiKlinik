import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { dotnetClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

export interface ProfileResponseDTO {
  id: number;
  username: string;
  email: string;
  profilePictureUrl: string | null;
  createdAt: string;
  role: string;
}

export interface UseProfileReturn {
  profile: ProfileResponseDTO | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  success: boolean;
  
  fetchProfile: () => Promise<void>;
  updateProfile: (username: string, imageUri: string | null) => Promise<boolean>;
  removeProfilePicture: () => Promise<boolean>;
  clearStatus: () => void;
}

/**
 * Kullanıcı profil bilgilerini çekme, güncelleme ve profil resmi silme
 * işlemlerini yöneten custom hook.
 */
export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<ProfileResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  
  const updateUsernameInStore = useAuthStore((state) => state.updateUsername);
  const updateProfilePictureInStore = useAuthStore((state) => state.updateProfilePicture);

  // 1. Profil bilgilerini getir
  const fetchProfile = useCallback(async () => {
    // Sadece giriş yapıldıysa istek at (401 hatasını engeller)
    if (!useAuthStore.getState().isAuthenticated) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await dotnetClient.get<ProfileResponseDTO>('/Profile');
      setProfile(response.data);
      // Yerel auth store'daki bilgileri senkronize et
      if (response.data?.username) {
        updateUsernameInStore(response.data.username);
      }
      updateProfilePictureInStore(response.data?.profilePictureUrl ?? null);
    } catch (err: any) {
      console.error('[useProfile] fetchProfile hatası:', err);
      const errMsg = err.response?.data?.message ?? err.response?.data?.Message ?? 'Profil bilgileri yüklenemedi.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [updateUsernameInStore, updateProfilePictureInStore]);

  // 2. Profil bilgilerini güncelle (sadece username ve opsiyonel fotoğraf)
  const updateProfile = useCallback(async (username: string, imageUri: string | null): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      // multipart/form-data için FormData kullanıyoruz
      const formData = new FormData();
      
      // Kullanıcı adı eklendi
      if (username && username.trim()) {
        formData.append('Username', username.trim());
      }
      
      // E-posta alanı eklenebilseydi backend UpdateProfileDTO beklediği için opsiyonel
      // Ancak kullanıcının epostayı değiştirmesini istemiyoruz, bu yüzden göndermiyoruz.
      
      // Eğer yeni bir görsel seçildiyse FormData'ya ekle
      if (imageUri) {
        const uriParts = imageUri.split('.');
        const fileType = uriParts[uriParts.length - 1];
        const fileName = imageUri.split('/').pop() || 'profile.jpg';
        
        formData.append('profileImage', {
          uri: Platform.OS === 'ios' ? imageUri.replace('file://', '') : imageUri,
          name: fileName,
          type: `image/${fileType === 'png' ? 'png' : (fileType === 'webp' ? 'webp' : 'jpeg')}`,
        } as any);
      }

      const response = await dotnetClient.put<{ message: string; profile: ProfileResponseDTO }>('/Profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const updatedData = response.data.profile;
      setProfile(updatedData);
      
      if (updatedData?.username) {
        updateUsernameInStore(updatedData.username);
      }
      updateProfilePictureInStore(updatedData?.profilePictureUrl ?? null);
      
      setSuccess(true);
      return true;
    } catch (err: any) {
      console.error('[useProfile] updateProfile hatası:', err);
      const errMsg = err.response?.data?.message ?? err.response?.data?.Message ?? 'Profil güncellenirken bir hata oluştu.';
      setError(errMsg);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [updateUsernameInStore, updateProfilePictureInStore]);

  // 3. Profil fotoğrafını kaldır
  const removeProfilePicture = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      const response = await dotnetClient.delete<{ message: string; profile: ProfileResponseDTO }>('/Profile/picture');
      setProfile(response.data.profile);
      updateProfilePictureInStore(null);
      setSuccess(true);
      return true;
    } catch (err: any) {
      console.error('[useProfile] removeProfilePicture hatası:', err);
      const errMsg = err.response?.data?.message ?? err.response?.data?.Message ?? 'Profil resmi kaldırılırken bir hata oluştu.';
      setError(errMsg);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [updateProfilePictureInStore]);

  // Durum temizleme
  const clearStatus = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return {
    profile,
    isLoading,
    isSaving,
    error,
    success,
    fetchProfile,
    updateProfile,
    removeProfilePicture,
    clearStatus,
  };
}
