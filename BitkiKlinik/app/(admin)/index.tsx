import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppTheme } from '../../hooks/useAppTheme';

// ─── Renk Paletleri ──────────────────────────────────────────────────
const LIGHT_COLORS = {
  primary: '#6366f1',     // Indigo
  primaryLight: '#eef2ff',
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  amber: '#f59e0b',
  amberLight: '#fef3c7',
  rose: '#f43f5e',
  roseLight: '#ffe4e6',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
};

const DARK_COLORS = {
  primary: '#818cf8',     // Indigo Lightened
  primaryLight: '#312e81',
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  amber: '#fbbf24',
  amberLight: '#78350f',
  rose: '#f87171',
  roseLight: '#7f1d1d',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
};

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { username, logout } = useAuthStore();
  const { isDark } = useAppTheme();
  
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  // ─── Admin Menü Kartları ─────────────────────────────────────────────
  const adminMenuItems = [
    {
      id: 'users',
      title: 'Kullanıcı Yönetimi',
      subtitle: 'Kullanıcıları listele, ekle ve yönet',
      icon: 'people',
      color: COLORS.primary,
      bgColor: COLORS.primaryLight,
      route: '/(admin)/users',
    },
    {
      id: 'diseases',
      title: 'Hastalık & Tedavi',
      subtitle: 'Hastalık ve tedavi verilerini yönet',
      icon: 'leaf',
      color: COLORS.emerald,
      bgColor: COLORS.emeraldLight,
      route: '/(admin)/diseases',
    },
    {
      id: 'active-learning',
      title: 'Aktif Öğrenme & Eğitim',
      subtitle: 'Yapay zekayı yeni verilerle eğit ve iyileştir',
      icon: 'bulb',
      color: COLORS.amber,
      bgColor: COLORS.amberLight,
      route: '/(admin)/active-learning',
    },
    {
      id: 'hangfire',
      title: 'Arka Plan İşleri (Hangfire)',
      subtitle: 'Kuyruk durumlarını, e-posta ve bildirim işlerini yönet',
      icon: 'time',
      color: isDark ? '#a78bfa' : '#8b5cf6',
      bgColor: isDark ? '#4c1d95' : '#f5f3ff',
      route: '/(admin)/hangfire',
    },
    {
      id: 'rabbitmq',
      title: 'RabbitMQ Kuyruk İzleme',
      subtitle: 'Canlı active learning kuyruk metriklerini ve worker durumunu izle',
      icon: 'logo-buffer' as any,
      color: isDark ? '#ff8533' : '#ff6600',
      bgColor: isDark ? '#803300' : '#fff0e6',
      route: '/(admin)/rabbitmq',
    },
    {
      id: 'mlops',
      title: 'MLOps & Model Performansı',
      subtitle: 'Eğitim doğruluk grafiklerini ve veri dağılımını izle',
      icon: 'bar-chart' as any,
      color: isDark ? '#60a5fa' : '#3b82f6',
      bgColor: isDark ? '#1e3a8a' : '#eff6ff',
      route: '/(admin)/mlops',
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
            <View>
              <Text style={styles.greeting}>Admin Panel</Text>
              <Text style={styles.username}>{username ?? 'Yönetici'} 🛡️</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(tabs)')}>
                <Ionicons name="home-outline" size={20} color={COLORS.slateLight} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color={COLORS.rose} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Yönetim Kartları */}
          <Text style={styles.sectionTitle}>Yönetim Paneli</Text>

          {adminMenuItems.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(200 + index * 150).duration(600)}
            >
              <TouchableOpacity
                style={styles.menuCard}
                activeOpacity={0.8}
                onPress={() => router.push(item.route as any)}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.bgColor }]}>
                  <Ionicons name={item.icon as any} size={28} color={item.color} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.slateLight} />
              </TouchableOpacity>
            </Animated.View>
          ))}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 32,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.slate,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.slate,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 24,
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  menuIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.slate,
  },
  menuSubtitle: {
    fontSize: 13,
    color: COLORS.slateLight,
    marginTop: 2,
  },
});
