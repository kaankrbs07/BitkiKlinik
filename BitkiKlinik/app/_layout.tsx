import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useShallow } from 'zustand/react/shallow';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '../store/useAuthStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

/** JWT'nin süresi dolmuş mu? exp saniye cinsinden döner, Date.now() ms cinsinden. */
function isTokenExpired(token: string): boolean {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    if (!exp) return false;
    return exp * 1000 < Date.now();
  } catch {
    return true; // Decode edilemezse geçersiz say
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isVerified, token, logout } = useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      isVerified: state.isVerified,
      token: state.token,
      logout: state.logout,
    }))
  );
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // 1. Token süresi kontrolü — süresi geçmişse sessizce çıkış yap
    if (isAuthenticated && token && isTokenExpired(token)) {
      console.log('[RootLayout] JWT süresi dolmuş, çıkış yapılıyor...');
      logout();
      return; // logout store'u günceller → useEffect tekrar tetiklenir
    }

    const inAuthGroup  = segments[0] === '(auth)';
    const isVerifyScreen = segments[1] === 'verify';

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      if (!isVerified) {
        if (!inAuthGroup || !isVerifyScreen) {
          const email = useAuthStore.getState().email || '';
          router.replace({ pathname: '/(auth)/verify', params: { email } });
        }
      } else {
        if (inAuthGroup) {
          router.replace('/(tabs)');
        }
      }
    }
  }, [isAuthenticated, isVerified, token, segments]);


  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="result" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
