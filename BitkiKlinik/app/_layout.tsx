import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '../store/useAuthStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isVerified = useAuthStore((state) => state.isVerified);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    const isVerifyScreen = segments[1] === 'verify';
    
    console.log("[RootLayout] Auth Durumu:", { isAuthenticated, isVerified, inAuthGroup, isVerifyScreen, segments });

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        console.log("[RootLayout] Giriş yapılmamış, Login'e yönlendiriliyor...");
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 1);
      }
    } else {
      // Giriş yapılmış
      if (!isVerified) {
        // Doğrulanmamış kullanıcı sadece (auth)/verify ekranında kalabilir
        if (!inAuthGroup || !isVerifyScreen) {
          console.log("[RootLayout] Giriş yapılmış ama doğrulanmamış. Doğrulama ekranına yönlendiriliyor...");
          setTimeout(() => {
            const email = useAuthStore.getState().email || '';
            router.replace({ pathname: '/(auth)/verify', params: { email } });
          }, 1);
        }
      } else {
        // Doğrulanmış kullanıcı - (auth) grubundaysa tabs'e yönlendir
        if (inAuthGroup) {
          console.log("[RootLayout] Giriş yapılmış ve doğrulanmış. Dashboard'a yönlendiriliyor...");
          setTimeout(() => {
            router.replace('/(tabs)');
          }, 1);
        }
      }
    }
  }, [isAuthenticated, isVerified, segments]);

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
