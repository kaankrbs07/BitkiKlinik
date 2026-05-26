import React, { useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator, 
  Platform,
  StatusBar,
  RefreshControl,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  FadeInDown, 
  FadeInRight, 
} from 'react-native-reanimated';

import { useAuthStore } from '../../store/useAuthStore';
import { useDashboardData, RecentScan } from '../../hooks/useDashboardData';
import { useProfile } from '../../hooks/useProfile';
import { CONFIG } from '../../constants/config';
import { CARE_TIPS } from '../../constants/care-data';

const { width } = Dimensions.get('window');

// Premium Color Palette
const COLORS = {
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
  warning: '#ffb703',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
};



/**
 * Tarih formatı: ISO 8601 → "12 Eki 2026" şeklinde okunabilir Türkçe formata çevirir.
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

// ============================================================================
// 1. HEADER SECTION COMPONENT
// ============================================================================
interface HeaderSectionProps {
  username: string | null;
  profilePictureUrl: string | null;
  onAvatarPress: () => void;
  onLogoutPress: () => void;
}

function HeaderSection({ username, profilePictureUrl, onAvatarPress, onLogoutPress }: HeaderSectionProps) {
  const hasPhoto = !!profilePictureUrl;
  const avatarUri = profilePictureUrl
    ? (profilePictureUrl.startsWith('http') ? profilePictureUrl : `${CONFIG.DOTNET_BASE_URL}${profilePictureUrl}`)
    : null;

  const getInitials = () => {
    if (!username) return 'BD';
    // Sadece ilk iki harf
    return username.substring(0, 2).toUpperCase();
  };

  return (
    <Animated.View entering={FadeInDown.duration(800)} style={styles.header}>
      <View>
        <Text style={styles.greeting}>Hoş Geldin,</Text>
        <Text style={styles.username}>{username ?? 'Bitki Dostu'} 👋</Text>
      </View>
      <View style={styles.profileBadge}>
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.7}>
          {hasPhoto && avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>{getInitials()}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onLogoutPress} style={{ marginLeft: 8, padding: 4 }} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// 2. ADMIN BANNER SECTION COMPONENT
// ============================================================================
interface AdminBannerSectionProps {
  isAdmin: boolean;
  onPress: () => void;
}

function AdminBannerSection({ isAdmin, onPress }: AdminBannerSectionProps) {
  if (!isAdmin) return null;

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(600)}>
      <TouchableOpacity
        style={styles.adminBanner}
        activeOpacity={0.85}
        onPress={onPress}
      >
        <Ionicons name="shield-checkmark" size={20} color="#fff" />
        <Text style={styles.adminBannerText}>Admin Paneli</Text>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// 3. STATS SECTION COMPONENT
// ============================================================================
interface StatsSectionProps {
  stats: {
    total: number;
    healthy: number;
    risky: number;
  };
}

function StatsSection({ stats }: StatsSectionProps) {
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.statsContainer}>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{stats.total}</Text>
        <Text style={styles.statLabel}>Toplam</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: COLORS.white }]}>
        <Text style={[styles.statValue, { color: COLORS.emerald }]}>{stats.healthy}</Text>
        <Text style={styles.statLabel}>Sağlıklı</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: COLORS.white }]}>
        <Text style={[styles.statValue, { color: COLORS.warning }]}>{stats.risky}</Text>
        <Text style={styles.statLabel}>Riskli</Text>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// 4. MAIN ACTION SECTION COMPONENT
// ============================================================================
interface MainActionSectionProps {
  onPress: () => void;
}

function MainActionSection({ onPress }: MainActionSectionProps) {
  return (
    <Animated.View entering={FadeInDown.delay(400).duration(800)}>
      <TouchableOpacity 
        style={styles.mainActionCard}
        activeOpacity={0.9}
        onPress={onPress}
      >
        <View style={styles.actionContent}>
          <View style={styles.actionIconContainer}>
            <Ionicons name="scan-outline" size={32} color={COLORS.white} />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionTitle}>AI Sağlık Taraması</Text>
            <Text style={styles.actionSubtitle}>Hastalıkları anında tespit et</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.6)" />
        </View>
        <View style={styles.actionBackgroundLeaf}>
          <Ionicons name="leaf" size={120} color="rgba(255,255,255,0.08)" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// 5. TIPS SECTION COMPONENT
// ============================================================================
function TipsSection() {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Bakım İpuçları</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tipsList}
      >
        {CARE_TIPS.map((tip, index) => (
          <Animated.View
            key={tip.id}
            entering={FadeInRight.delay(500 + index * 100).duration(800)}
          >
            <TouchableOpacity style={styles.tipCard} activeOpacity={0.85}>
              <View style={[styles.tipIconBox, { backgroundColor: tip.color + '20' }]}>
                <Ionicons name={tip.icon as any} size={20} color={tip.color} />
              </View>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipText}>{tip.description}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}


// ============================================================================
// 6. HISTORY SECTION COMPONENT
// ============================================================================
interface HistorySectionProps {
  recentScans: RecentScan[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSeeAllPress: () => void;
}

function HistorySection({ recentScans, isLoading, error, onRefresh, onSeeAllPress }: HistorySectionProps) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Son Teşhisler</Text>
        <TouchableOpacity onPress={onSeeAllPress} activeOpacity={0.7}>
          <Text style={styles.seeMore}>Tümünü Gör</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.historyContainer}>
        {/* Hata durumu */}
        {error && !isLoading && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.errorState}>
            <Ionicons name="cloud-offline-outline" size={36} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh} activeOpacity={0.8}>
              <Text style={styles.retryText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Yükleniyor durumu */}
        {isLoading && recentScans.length === 0 && (
          <ActivityIndicator color={COLORS.emerald} style={{ marginTop: 20 }} />
        )}

        {/* Gerçek veriler */}
        {!isLoading && !error && recentScans.length > 0 && (
          recentScans.map((item: RecentScan, index: number) => (
            <Animated.View 
              key={item.id} 
              entering={FadeInDown.delay(700 + index * 100).duration(800)}
              style={styles.historyCard}
            >
              <View style={[
                styles.historyIcon, 
                { backgroundColor: item.isHealthy ? COLORS.emeraldLight : COLORS.dangerLight }
              ]}>
                <Ionicons 
                  name={item.isHealthy ? "checkmark-circle" : "alert-circle"} 
                  size={24} 
                  color={item.isHealthy ? COLORS.emerald : COLORS.danger} 
                />
              </View>
              <View style={styles.historyDetails}>
                <Text style={styles.historyName}>{item.diseaseName}</Text>
                <Text style={styles.historyDate}>{formatDate(item.scanDate)}</Text>
              </View>
              <View style={styles.historyStatusBadge}>
                <Text style={[
                  styles.statusText, 
                  { color: item.isHealthy ? COLORS.emerald : COLORS.danger }
                ]}>
                  {item.isHealthy ? 'Sağlıklı' : 'Riskli'}
                </Text>
              </View>
            </Animated.View>
          ))
        )}

        {/* Boş durum */}
        {!isLoading && !error && recentScans.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="leaf-outline" size={48} color={COLORS.slateLight} />
            <Text style={styles.emptyText}>Henüz bir tarama kaydınız bulunmuyor.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// MAIN HOMESCREEN COMPONENT
// ============================================================================
export default function HomeScreen() {
  const router = useRouter();
  const { logout, isAdmin, username, profilePictureUrl, isAuthenticated } = useAuthStore();
  const { stats, recentScans, isLoading, error, refresh } = useDashboardData();
  const { fetchProfile } = useProfile();

  // Profil resmini ilk açılışta çekmek ve global store ile senkronize etmek için trigger
  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated, fetchProfile]);

  const handleLogout = useCallback(() => {
    logout();
    router.replace('/(auth)/login');
  }, [logout, router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refresh}
              tintColor={COLORS.emerald}
              colors={[COLORS.emerald]}
            />
          }
        >
          {/* 1. Modüler Header */}
          <HeaderSection 
            username={username}
            profilePictureUrl={profilePictureUrl}
            onAvatarPress={() => router.push('/profile')}
            onLogoutPress={handleLogout}
          />

          {/* 2. Modüler Admin Banner */}
          <AdminBannerSection 
            isAdmin={isAdmin}
            onPress={() => router.push('/(admin)' as any)}
          />

          {/* 3. Modüler Stats */}
          <StatsSection 
            stats={stats}
          />

          {/* 4. Modüler AI Sağlık Taraması Kartı */}
          <MainActionSection 
            onPress={() => router.push('/(tabs)/scan')}
          />

          {/* 5. Modüler İpuçları Listesi */}
          <TipsSection />

          {/* 6. Modüler Son Teşhisler Geçmişi */}
          <HistorySection 
            recentScans={recentScans}
            isLoading={isLoading}
            error={error}
            onRefresh={refresh}
            onSeeAllPress={() => router.push({ pathname: '/(tabs)/explore', params: { tab: 'history' } })}
          />

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
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: COLORS.slateLight,
    fontWeight: '500',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.slate,
    marginTop: 4,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 6,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.emerald,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: (width - 64) / 3,
    backgroundColor: COLORS.slate,
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.slateLight,
    marginTop: 4,
    fontWeight: '600',
  },
  mainActionCard: {
    marginHorizontal: 24,
    backgroundColor: COLORS.emerald,
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  actionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  actionBackgroundLeaf: {
    position: 'absolute',
    right: -20,
    bottom: -30,
    zIndex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 32,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.slate,
  },
  seeMore: {
    color: COLORS.emerald,
    fontWeight: '600',
    fontSize: 14,
  },
  tipsList: {
    paddingLeft: 24,
    paddingRight: 12,
  },
  tipCard: {
    width: 160,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  tipIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.slate,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: COLORS.slateLight,
    lineHeight: 16,
  },
  historyContainer: {
    paddingHorizontal: 24,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 1,
  },
  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  historyDetails: {
    flex: 1,
  },
  historyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.slate,
  },
  historyDate: {
    fontSize: 12,
    color: COLORS.slateLight,
    marginTop: 2,
  },
  historyStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: COLORS.slateLight,
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  errorState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  errorText: {
    color: COLORS.danger,
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.emerald,
  },
  retryText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  adminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  adminBannerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
});
