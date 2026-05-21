import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';

/**
 * Admin route grubu layout'u.
 * Sadece Admin rolüne sahip kullanıcılar erişebilir.
 * Admin olmayan kullanıcılar otomatik olarak ana ekrana yönlendirilir.
 */
export default function AdminLayout() {
  const { isAdmin, isAuthenticated } = useAuthStore();
  const router = useRouter();

  // ── Route Guard: Admin değilse geri gönder ─────────────────────
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      console.log('[AdminLayout] Yetkisiz erişim, yönlendiriliyor...');
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 1);
    }
  }, [isAdmin, isAuthenticated]);

  if (!isAdmin) return null; // Guard aktifken render etme

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
    </Stack>
  );
}
