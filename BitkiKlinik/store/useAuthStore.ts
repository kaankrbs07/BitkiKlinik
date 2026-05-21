import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';

// ─── JWT Token Payload Tipi ──────────────────────────────────────────
interface JwtPayload {
  nameid: string;       // User ID
  unique_name: string;  // Username
  email: string;
  role: string;         // "User" veya "Admin"
  exp: number;
}

// ─── Store State & Actions ───────────────────────────────────────────
interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;

  login: (token: string) => void;
  logout: () => void;
}

/**
 * Merkezi authentication store.
 * Login sırasında JWT decode edilerek kullanıcı bilgileri ve rolü çıkarılır.
 * Admin paneli erişimi için `isAdmin` flag'i kullanılır.
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  userId: null,
  username: null,
  email: null,
  role: null,
  isAdmin: false,

  login: (token: string) => {
    try {
      // JWT'yi decode et → role claim'ini çıkar
      const decoded = jwtDecode<JwtPayload>(token);

      set({
        token,
        isAuthenticated: true,
        userId: decoded.nameid,
        username: decoded.unique_name,
        email: decoded.email,
        role: decoded.role,
        isAdmin: decoded.role === 'Admin',
      });
    } catch (error) {
      console.error('[AuthStore] JWT decode hatası:', error);
      // Decode edilemezse yine de token'ı kaydet (geriye dönük uyumluluk)
      set({ token, isAuthenticated: true });
    }
  },

  logout: () => {
    set({
      token: null,
      isAuthenticated: false,
      userId: null,
      username: null,
      email: null,
      role: null,
      isAdmin: false,
    });
  },
}));
