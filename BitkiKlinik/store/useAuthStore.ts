import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

// ─── JWT Token Payload Tipi ──────────────────────────────────────────
interface JwtPayload {
  nameid: string;       // User ID
  unique_name: string;  // Username
  email: string;
  role: string;         // "User" veya "Admin"
  isVerified?: string;  // "true" veya "false" (C# claim)
  exp: number;
}

// ─── Store State & Actions ───────────────────────────────────────────
interface AuthState {
  token: string | null;
  refreshToken: string | null;      // Kalıcı oturum için
  isAuthenticated: boolean;
  isVerified: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  profilePictureUrl: string | null;

  login: (token: string, refreshToken?: string) => void;
  logout: () => void;
  updateUsername: (newUsername: string) => void;
  updateProfilePicture: (url: string | null) => void;
  setIsVerified: (verified: boolean) => void;
}

/**
 * Merkezi authentication store.
 * Login sırasında JWT decode edilerek kullanıcı bilgileri ve rolü çıkarılır.
 * Admin paneli erişimi için `isAdmin` flag'i kullanılır.
 *
 * Persist: Yalnızca token çifti AsyncStorage'a kaydedilir.
 * Decode edilen alanlar (username, role vb.) uygulama açılışında
 * _layout.tsx'teki isTokenExpired kontrolünden geçen token ile
 * otomatik olarak yeniden hesaplanır.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isVerified: false,
      userId: null,
      username: null,
      email: null,
      role: null,
      isAdmin: false,
      profilePictureUrl: null,

      login: (token: string, refreshToken?: string) => {
        try {
          // JWT'yi decode et → role ve isVerified claim'ini çıkar
          const decoded = jwtDecode<JwtPayload>(token);
          const isVerified = decoded.isVerified === 'true';

          set({
            token,
            refreshToken: refreshToken ?? null,
            isAuthenticated: true,
            isVerified,
            userId: decoded.nameid,
            username: decoded.unique_name,
            email: decoded.email,
            role: decoded.role,
            isAdmin: decoded.role === 'Admin',
          });
        } catch (error) {
          console.error('[AuthStore] JWT decode hatası:', error);
          // Decode edilemezse yine de token'ı kaydet (geriye dönük uyumluluk)
          set({ token, refreshToken: refreshToken ?? null, isAuthenticated: true, isVerified: false });
        }
      },

      logout: () => {
        set({
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isVerified: false,
          userId: null,
          username: null,
          email: null,
          role: null,
          isAdmin: false,
          profilePictureUrl: null,
        });
      },

      updateUsername: (newUsername: string) => {
        set({ username: newUsername });
      },

      updateProfilePicture: (url: string | null) => {
        set({ profilePictureUrl: url });
      },

      setIsVerified: (verified: boolean) => {
        set({ isVerified: verified });
      },
    }),
    {
      name: 'bitkiklinik-auth',                          // AsyncStorage anahtar adı
      storage: createJSONStorage(() => AsyncStorage),
      // Sadece token çiftini kalıcı olarak sakla.
      // Decode edilen alanlar (userId, username, role vb.) her oturumda
      // JWT'den yeniden hesaplandığı için persist edilmesine gerek yok.
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
      }),
      // AsyncStorage'dan yüklenen token çiftini decode ederek
      // store'un geri kalanını (isAuthenticated, role vb.) yeniden doldur.
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          try {
            const decoded = jwtDecode<JwtPayload>(state.token);
            const isVerified = decoded.isVerified === 'true';
            state.isAuthenticated = true;
            state.isVerified = isVerified;
            state.userId = decoded.nameid;
            state.username = decoded.unique_name;
            state.email = decoded.email;
            state.role = decoded.role;
            state.isAdmin = decoded.role === 'Admin';
          } catch {
            // Bozuk token → oturumu kapat
            state.token = null;
            state.refreshToken = null;
            state.isAuthenticated = false;
          }
        }
      },
    }
  )
);
