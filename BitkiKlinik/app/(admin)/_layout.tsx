import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../store/useAuthStore';

/**
 * Admin route grubu layout'u.
 * Sadece Admin rolüne sahip kullanıcılar erişebilir.
 * Admin olmayan kullanıcılar otomatik olarak ana ekrana yönlendirilir.
 */
export default function AdminLayout() {
  const { isAdmin, isAuthenticated } = useAuthStore(
    useShallow((state) => ({ isAdmin: state.isAdmin, isAuthenticated: state.isAuthenticated }))
  );
  const router = useRouter();

  // ── Route Guard: Giriş yapmış ama Admin değilse geri gönder ────────────────
  // Not: Giriş yapmamış kullanıcılar zaten Root Layout tarafından
  // /(auth)/login'e yönlendirilir, bu yüzden burada sadece
  // "giriş yapmış ama admin değil" durumunu kontrol ediyoruz.
  useEffect(() => {
    if (isAuthenticated && !isAdmin) {
      const timeout = setTimeout(() => {
        console.log('[AdminLayout] Yetkisiz erişim, yönlendiriliyor...');
        router.replace('/(tabs)');
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isAdmin, isAuthenticated]);

  // Stack her zaman render edilmeli — navigator mount olmadan navigate çağrısı
  // "Attempted to navigate before mounting" hatasına yol açar.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="diseases" />
      <Stack.Screen name="active-learning" />
      <Stack.Screen name="hangfire" />
    </Stack>
  );
}
