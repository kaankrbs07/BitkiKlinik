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

// ─── Renk Paleti ─────────────────────────────────────────────────────
const COLORS = {
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
    color: '#8b5cf6',
    bgColor: '#f5f3ff',
    route: '/(admin)/hangfire',
  },
];

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { username, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
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

const styles = StyleSheet.create({
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
