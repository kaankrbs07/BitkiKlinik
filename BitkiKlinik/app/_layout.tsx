import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { LogBox, ActivityIndicator, View } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import { useShallow } from 'zustand/react/shallow';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAuthStore } from '../store/useAuthStore';
import { NetworkBanner } from '../components/NetworkBanner';
import { dotnetClient } from '../api/client';

// Suppress expo-notifications warnings in Expo Go
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

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
  const { resolvedTheme } = useAppTheme();
  const colorScheme = resolvedTheme;
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

  // Oturum süresi dolmuşsa başlangıçta sessiz yenileme işlemini bekliyoruz
  const isExpired = isAuthenticated && token && isTokenExpired(token);
  const [isSessionChecking, setIsSessionChecking] = useState(!!isExpired);

  useEffect(() => {
    let isMounted = true;

    const checkAndRefreshSession = async () => {
      if (isAuthenticated && token && isTokenExpired(token)) {
        const { refreshToken, login, logout: storeLogout } = useAuthStore.getState();
        if (refreshToken) {
          console.log('[RootLayout] JWT süresi dolmuş, sessiz yenileme deneniyor...');
          try {
            const { data } = await dotnetClient.post('/Auth/refresh', { refreshToken });
            login(data.token, data.refreshToken);
            console.log('[RootLayout] Sessiz yenileme başarılı!');
            if (isMounted) setIsSessionChecking(false);
            return;
          } catch (e) {
            console.warn('[RootLayout] Sessiz yenileme başarısız:', e);
          }
        }
        console.log('[RootLayout] Kalıcı oturum açılamadı, çıkış yapılıyor...');
        storeLogout();
      }
      if (isMounted) setIsSessionChecking(false);
    };

    checkAndRefreshSession();

    // setTimeout ile bir sonraki event loop tick'ine ertele.
    // Bu, NavigationContainer'ın onReady callback'inin çalışmasını garanti eder.
    const timeout = setTimeout(() => {
      if (!isMounted) return;
      if (isSessionChecking) return; // Sessiz yenileme bitmeden yönlendirme yapma
      
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
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isAuthenticated, isVerified, token, segments, isSessionChecking]);

  // Sessiz yenileme sırasında şık ve premium bir yüklenme ekranı göster
  if (isSessionChecking) {
    const isDark = colorScheme === 'dark';
    return (
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <View style={{ 
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center', 
          backgroundColor: isDark ? '#121212' : '#ffffff' 
        }}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <NetworkBanner />
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="result" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
