import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';

/**
 * Ağ bağlantısı kesildiğinde ekranın üstünde kırmızı banner gösterir.
 * Bağlantı yeniden kurulduğunda 3 saniyelik yeşil onay banner'ı gösterilir.
 *
 * Kullanım: _layout.tsx içinde Stack'in hemen altına ekleyin:
 *   <NetworkBanner />
 */
export function NetworkBanner() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [showReconnected, setShowReconnected] = useState(false);
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;

      setIsConnected(prev => {
        // Önceden bağlantısız → şimdi bağlı: yeniden bağlantı bildirimi göster
        if (prev === false && connected) {
          setShowReconnected(true);
          const t = setTimeout(() => setShowReconnected(false), 3000);
          return connected;
        }
        return connected;
      });
    });

    return () => unsubscribe();
  }, []);

  const shouldShow = isConnected === false || showReconnected;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: shouldShow ? 0 : -60,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [shouldShow, slideAnim]);

  // Başlangıçta bağlantı durumu bilinmiyorsa gösterme
  if (isConnected === null) return null;

  const offline = isConnected === false;

  return (
    <Animated.View
      style={[
        styles.banner,
        offline ? styles.offlineBanner : styles.onlineBanner,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'checkmark-circle-outline'}
        size={16}
        color="white"
        style={{ marginRight: 6 }}
      />
      <Text style={styles.bannerText}>
        {offline ? 'İnternet bağlantısı yok' : 'Bağlantı yeniden kuruldu'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  offlineBanner: { backgroundColor: '#ef4444' },
  onlineBanner:  { backgroundColor: '#10b981' },
  bannerText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});
