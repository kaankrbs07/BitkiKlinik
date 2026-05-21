import { create } from 'zustand';
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
  isAuthenticated: boolean;
  isVerified: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  profilePictureUrl: string | null;

  login: (token: string) => void;
  logout: () => void;
  updateUsername: (newUsername: string) => void;
  updateProfilePicture: (url: string | null) => void;
  setIsVerified: (verified: boolean) => void;
}

/**
 * Merkezi authentication store.
 * Login sırasında JWT decode edilerek kullanıcı bilgileri ve rolü çıkarılır.
 * Admin paneli erişimi için `isAdmin` flag'i kullanılır.
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  isVerified: false,
  userId: null,
  username: null,
  email: null,
  role: null,
  isAdmin: false,
  profilePictureUrl: null,

  login: (token: string) => {
    try {
      // JWT'yi decode et → role ve isVerified claim'ini çıkar
      const decoded = jwtDecode<JwtPayload>(token);
      const isVerified = decoded.isVerified === 'true';

      set({
        token,
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
      set({ token, isAuthenticated: true, isVerified: false });
    }
  },

  logout: () => {
    set({
      token: null,
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
}));
