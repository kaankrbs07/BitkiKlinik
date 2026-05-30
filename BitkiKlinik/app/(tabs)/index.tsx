import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import Animated, { 
  FadeInDown, 
  FadeInRight, 
} from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/useAuthStore';
import { useDashboardData, RecentScan } from '../../hooks/useDashboardData';
import { useProfile } from '../../hooks/useProfile';
import { useAppTheme } from '../../hooks/useAppTheme';
import { CONFIG } from '../../constants/config';
import { CARE_TIPS } from '../../constants/care-data';
import { API_ROUTES } from '../../constants/api-routes';
import { dotnetClient } from '../../api/client';

const { width } = Dimensions.get('window');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Domain Interfaces ────────────────────────────────────────────────
interface ChatSession {
  sessionId: string;
  scanId: number | null;
  plantName: string;
  lastMessage: string;
  lastMessageDate: string;
  isHealthy: boolean;
  imageUrl: string | null;
}

interface RiskAlert {
  diseaseName: string;
  riskPercentage: number;
  riskLevel: 'Kritik' | 'Orta' | 'Düşük';
  suggestion: string;
  calculatedAt: string;
}

// Premium Light & Dark Color Palettes
const LIGHT_COLORS = {
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
  warning: '#ffb703',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  inputBg: '#f1f5f9',
  border: '#e2e8f0',
};

const DARK_COLORS = {
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
  warning: '#fbbf24',
  danger: '#f87171',
  dangerLight: '#7f1d1d',
  inputBg: '#334155',
  border: '#334155',
};

const COLORS = LIGHT_COLORS;



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
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

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
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

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
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.statsContainer}>
      <View style={[styles.statCard, { backgroundColor: isDark ? COLORS.white : COLORS.slate }]}>
        <Text style={[styles.statValue, { color: isDark ? COLORS.slate : COLORS.white }]}>{stats.total}</Text>
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
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

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
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

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
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

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
// AI CHAT SECTION COMPONENT
// ============================================================================
interface AIChatHistorySectionProps {
  sessions: ChatSession[];
  isLoading: boolean;
  onSeeAllPress: () => void;
  onSessionPress: (scanId: number | null) => void;
}

function AIChatHistorySection({ sessions, isLoading, onSeeAllPress, onSessionPress }: AIChatHistorySectionProps) {
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  if (!isLoading && sessions.length === 0) return null; // Sohbet yoksa gösterme

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Yapay Zeka Sohbetlerim</Text>
        <TouchableOpacity onPress={onSeeAllPress} activeOpacity={0.7}>
          <Text style={styles.seeMore}>Tümünü Gör</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.historyContainer}>
        {isLoading && (
          <ActivityIndicator color={COLORS.emerald} style={{ marginTop: 10, marginBottom: 10 }} />
        )}

        {!isLoading && sessions.map((item, index) => {
          const isGeneral = item.scanId === null;
          return (
            <Animated.View 
              key={item.scanId ? `scan-${item.scanId}` : 'general'} 
              entering={FadeInDown.delay(600 + index * 100).duration(800)}
            >
              <TouchableOpacity 
                style={styles.chatHistoryCard} 
                activeOpacity={0.8}
                onPress={() => onSessionPress(item.scanId)}
              >
                <View style={[
                  styles.chatHistoryIcon, 
                  { backgroundColor: isGeneral ? COLORS.emeraldLight : (item.isHealthy ? COLORS.emeraldLight : COLORS.dangerLight) }
                ]}>
                  <Ionicons 
                    name={isGeneral ? "chatbubbles" : (item.isHealthy ? "checkmark-circle" : "alert-circle")} 
                    size={20} 
                    color={isGeneral ? COLORS.emerald : (item.isHealthy ? COLORS.emerald : COLORS.danger)} 
                  />
                </View>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyName}>{item.plantName}</Text>
                  <Text style={styles.chatLastMsg} numberOfLines={1}>{item.lastMessage}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.slateLight} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// WEATHER & DISEASE RISK FORECASTING SECTION
// ============================================================================
interface WeatherDiseaseRiskSectionProps {
  riskAlert: {
    diseaseName: string;
    riskPercentage: number;
    riskLevel: string;
    suggestion: string;
    calculatedAt: string;
  } | null;
  isLoading: boolean;
  locationGranted: boolean | null;
  onRequestLocation: () => void;
}

function WeatherDiseaseRiskSection({ riskAlert, isLoading, locationGranted, onRequestLocation }: WeatherDiseaseRiskSectionProps) {
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Kritik': return COLORS.danger;
      case 'Orta': return COLORS.warning;
      default: return COLORS.emerald;
    }
  };

  const getRiskBg = (level: string) => {
    if (isDark) {
      switch (level) {
        case 'Kritik': return '#7f1d1d40';
        case 'Orta': return '#fbbf2415';
        default: return '#064e3b40';
      }
    } else {
      switch (level) {
        case 'Kritik': return '#fef2f2';
        case 'Orta': return '#fffbeb';
        default: return '#f0fdf4';
      }
    }
  };

  const getRiskBorder = (level: string) => {
    if (isDark) {
      switch (level) {
        case 'Kritik': return '#7f1d1d80';
        case 'Orta': return '#fbbf2440';
        default: return '#064e3b80';
      }
    } else {
      switch (level) {
        case 'Kritik': return '#fee2e2';
        case 'Orta': return '#fef3c7';
        default: return '#dcfce7';
      }
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'Kritik': return 'alert-circle';
      case 'Orta': return 'warning';
      default: return 'shield-checkmark';
    }
  };

  if (locationGranted === false) {
    return (
      <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.riskCardContainer}>
        <View style={[styles.riskCard, { backgroundColor: isDark ? '#fbbf2415' : '#fffbeb', borderColor: isDark ? '#fbbf2430' : '#fef3c7', borderWidth: 1 }]}>
          <View style={styles.riskHeader}>
            <View style={[styles.riskIconBg, { backgroundColor: isDark ? '#fbbf2430' : 'rgba(217, 119, 6, 0.1)' }]}>
              <Ionicons name="location-outline" size={24} color={isDark ? COLORS.warning : "#d97706"} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.riskTitle, { color: COLORS.slate }]}>Konum Bazlı Tahmin</Text>
              <Text style={styles.riskSubtitle}>Mantar hastalık riski analizi için GPS izni gereklidir.</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.riskButton, { backgroundColor: COLORS.emerald }]} 
            onPress={onRequestLocation} 
            activeOpacity={0.85}
          >
            <Ionicons name="map-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.riskButtonText}>Konum İzni Ver</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.riskLoaderContainer}>
        <ActivityIndicator color={COLORS.emerald} size="small" />
        <Text style={styles.riskLoaderText}>Tarımsal hastalık riski hesaplanıyor...</Text>
      </View>
    );
  }

  if (!riskAlert) return null;

  const riskColor = getRiskColor(riskAlert.riskLevel);
  const cardBg = getRiskBg(riskAlert.riskLevel);
  const cardBorder = getRiskBorder(riskAlert.riskLevel);
  const riskIcon = getRiskIcon(riskAlert.riskLevel);

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.riskCardContainer}>
      <View style={[styles.riskCard, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
        <View style={styles.riskHeader}>
          <View style={[styles.riskIconBg, { backgroundColor: `${riskColor}15` }]}>
            <Ionicons name={riskIcon} size={24} color={riskColor} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.riskTitle, { color: COLORS.slate }]}>Tarımsal Sağlık Tahmini</Text>
              <Text style={[styles.riskLevelBadge, { color: riskColor, backgroundColor: `${riskColor}15` }]}>
                {riskAlert.riskLevel}
              </Text>
            </View>
            <Text style={styles.riskSubtitle}>{riskAlert.diseaseName} Riski</Text>
          </View>
        </View>

        {/* Linear Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.max(riskAlert.riskPercentage, 5)}%`, backgroundColor: riskColor }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressPercentage}>Smith Periyodu Riski: %{riskAlert.riskPercentage}</Text>
            <Text style={styles.calculatedTime}>
              {new Date(riskAlert.calculatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} güncellendi
            </Text>
          </View>
        </View>

        <View style={styles.suggestionContainer}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.slateLight} style={{ marginRight: 6, marginTop: 2 }} />
          <Text style={styles.suggestionText}>{riskAlert.suggestion}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const permission = (await Notifications.getPermissionsAsync()) as any;
    let isGranted = permission.status === 'granted' || permission.granted;
    if (!isGranted) {
      const requestPermission = (await Notifications.requestPermissionsAsync()) as any;
      isGranted = requestPermission.status === 'granted' || requestPermission.granted;
    }
    if (!isGranted) {
      console.warn('Bildirim izni alınamadı!');
      return null;
    }
  }

  // Yerel bildirim izinleri başarıyla alındı ancak uzak sunucu push token alma işlemi bypass edildi.
  return null;
}

/**
 * .NET API'den gelen son hastalık risk analizini kontrol edip, 
 * eğer risk seviyesi yüksekse kullanıcıya yerel (local) bildirim fırlatır.
 */
async function checkAndShowLocalRiskNotification(alert: any) {
  if (!alert || !alert.calculatedAt) return;
  if (alert.riskLevel !== 'Kritik' && alert.riskLevel !== 'Orta') return;

  try {
    const lastNotifiedTime = await AsyncStorage.getItem('last_notified_risk_time');
    
    // Eğer bu risk daha önce bildirilmediyse yeni lokal bildirim oluştur
    if (lastNotifiedTime !== alert.calculatedAt) {
      await AsyncStorage.setItem('last_notified_risk_time', alert.calculatedAt);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: alert.riskLevel === 'Kritik' ? "🚨 Kritik Tarımsal Sağlık Tahmini!" : "⚠️ Orta Dereceli Hastalık Riski!",
          body: `Bölgenizde ${alert.diseaseName} riski %${alert.riskPercentage} seviyesine ulaştı! Öneri: ${alert.suggestion}`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Anında göster
      });
    }
  } catch (error) {
    console.error('[checkAndShowLocalRiskNotification] Hata:', error);
  }
}

// ============================================================================
// MAIN HOMESCREEN COMPONENT
// ============================================================================
export default function HomeScreen() {
  const router = useRouter();
  const { theme, resolvedTheme, isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  const { logout, isAdmin, username, profilePictureUrl, isAuthenticated } = useAuthStore();
  const { stats, recentScans, isLoading, error, refresh } = useDashboardData();
  const { fetchProfile } = useProfile();

  const [recentChats, setRecentChats] = useState<ChatSession[]>([]);
  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const hasAskedLocationThisSession = useRef(false);

  // Tarımsal tahmin durumları
  const [riskAlert, setRiskAlert] = useState<RiskAlert | null>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(true);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const fetchRiskAndCoordinates = useCallback(async (forceRequest: boolean = false) => {
    try {
      setIsRiskLoading(true);
      
      // Önce mevcut izin durumunu kontrol et
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      let finalStatus = existingStatus;

      // Eğer izin verilmemişse ve zorlanıyorsa izin iste
      if (existingStatus !== 'granted' && forceRequest) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setLocationGranted(false);
        setIsRiskLoading(false);
        
        // İzin yoksa veritabanındaki son riski getirelim
        try {
          const response = await dotnetClient.get(API_ROUTES.LATEST_RISK_ALERT);
          setRiskAlert(response.data);

          // EĞER veritabanında henüz hesaplanmış bir risk yoksa (kullanıcı ilk kez giriş yapmışsa ve konumu yoksa)
          // ve bu oturumda henüz sormadıysak, konum açıklama modalını gösterelim!
          const isDefaultAlert = response.data?.suggestion?.includes("Konumunuz güncellendiğinde") || !response.data?.calculatedAt;
          if (isDefaultAlert && !hasAskedLocationThisSession.current) {
            hasAskedLocationThisSession.current = true;
            setShowLocationModal(true);
          }
        } catch (err) {
          console.error("Hastalık riski çekilemedi (konumsuz):", err);
          if (!hasAskedLocationThisSession.current) {
            hasAskedLocationThisSession.current = true;
            setShowLocationModal(true);
          }
        }
        return;
      }

      // EĞER izin verilmişse, ama Expo Go gibi geliştirme ortamlarında veya ilk kez alınıyorsa,
      // ve forceRequest false ise:
      // Expo Go'nun otomatik olarak uyarı çıkarmasını önlemek için, eğer kullanıcının veritabanında konumu yoksa,
      // ve biz daha önce bu oturumda sormadıysak, izni doğrudan sorgulamadan önce modalı gösterelim.
      if (finalStatus === 'granted' && !forceRequest) {
        try {
          const response = await dotnetClient.get(API_ROUTES.LATEST_RISK_ALERT);
          setRiskAlert(response.data);
          
          const isDefaultAlert = response.data?.suggestion?.includes("Konumunuz güncellendiğinde") || !response.data?.calculatedAt;
          if (isDefaultAlert) {
            setLocationGranted(false);
            setIsRiskLoading(false);
            if (!hasAskedLocationThisSession.current) {
              hasAskedLocationThisSession.current = true;
              setShowLocationModal(true);
            }
            return; // Durdur, kullanıcı modalda "İzin Ver" diyene kadar getCurrentPositionAsync() çağırma!
          }
        } catch (err) {
          console.error("Hastalık riski kontrolü başarısız:", err);
        }
      }

      setLocationGranted(true);

      // ─── 15 Dakika Kontrolü (Throttling) ───
      if (!forceRequest) {
        try {
          const lastUpdateTimeStr = await AsyncStorage.getItem('last_location_update_time');
          if (lastUpdateTimeStr) {
            const lastUpdateTime = parseInt(lastUpdateTimeStr, 10);
            if (Date.now() - lastUpdateTime < 15 * 60 * 1000) {
              // Son 15 dakika içinde konum başarıyla güncellenmiş. 
              // Yeniden UPDATE_LOCATION isteği atmıyoruz, sadece veritabanından son riski çekiyoruz.
              const response = await dotnetClient.get(API_ROUTES.LATEST_RISK_ALERT);
              setRiskAlert(response.data);
              checkAndShowLocalRiskNotification(response.data);
              setIsRiskLoading(false);
              return;
            }
          }
        } catch (storageErr) {
          console.error("Önbellek süresi okunurken hata:", storageErr);
        }
      }

      // Konum bilgisini al
      const location = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.Balanced 
      });

      const { latitude, longitude } = location.coords;

      // Bildirim token'ını al
      let pushToken = "";
      try {
        const tokenResult = await registerForPushNotificationsAsync();
        if (tokenResult) {
          pushToken = tokenResult;
        }
      } catch (tokenErr) {
        console.error("Push token alınırken hata:", tokenErr);
      }

      // Konumu sunucuya güncelle
      const response = await dotnetClient.post(API_ROUTES.UPDATE_LOCATION, {
        latitude,
        longitude,
        expoPushToken: pushToken
      });

      // Güncelleme başarılı olduğunda zaman damgasını AsyncStorage'a kaydet
      try {
        await AsyncStorage.setItem('last_location_update_time', Date.now().toString());
      } catch (storageErr) {
        console.error("Zaman damgası kaydedilemedi:", storageErr);
      }

      if (response.data?.latestRisk) {
        setRiskAlert(response.data.latestRisk);
        checkAndShowLocalRiskNotification(response.data.latestRisk);
      } else {
        const riskResponse = await dotnetClient.get(API_ROUTES.LATEST_RISK_ALERT);
        setRiskAlert(riskResponse.data);
        checkAndShowLocalRiskNotification(riskResponse.data);
      }
    } catch (err) {
      console.error("Konum ve tarımsal risk güncelleme hatası:", err);
      try {
        const response = await dotnetClient.get(API_ROUTES.LATEST_RISK_ALERT);
        setRiskAlert(response.data);
        checkAndShowLocalRiskNotification(response.data);
      } catch {}
    } finally {
      setIsRiskLoading(false);
    }
  }, []);

  const fetchRecentChats = useCallback(async () => {
    try {
      const response = await dotnetClient.get(API_ROUTES.CHAT_SESSIONS);
      setRecentChats(response.data.slice(0, 3)); // Sadece son 3 sohbeti göster
    } catch (err) {
      console.error("Ana sayfa sohbetleri yüklenemedi:", err);
    } finally {
      setIsChatsLoading(false);
    }
  }, []);

  // Profil resmini ve sohbetleri ilk açılışta ve sekme odaklandığında çek
  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
      fetchRiskAndCoordinates(false); // İlk açılışta izin istemeden kontrol et
    }
  }, [isAuthenticated, fetchProfile, fetchRiskAndCoordinates]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchRecentChats();
        fetchRiskAndCoordinates(false); // Sekme odaklandığında da arka planda güncelle
      }
    }, [isAuthenticated, fetchRecentChats, fetchRiskAndCoordinates])
  );

  const handleRefresh = useCallback(() => {
    refresh();
    fetchRecentChats();
    fetchRiskAndCoordinates(false);
  }, [refresh, fetchRecentChats, fetchRiskAndCoordinates]);

  const handleLogout = useCallback(() => {
    logout();
    router.replace('/(auth)/login');
  }, [logout, router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Premium Onboarding / Konum İzni Açıklama Modalı */}
      <Modal
        visible={showLocationModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.permissionModalContent}>
            {/* Üst Kısım / Görsel ve İkon */}
            <View style={styles.modalHeaderImageBg}>
              <View style={styles.modalIconRing}>
                <Ionicons name="location" size={40} color={COLORS.emerald} />
              </View>
              {/* Dekoratif Yapraklar */}
              <Ionicons name="leaf" size={100} color="rgba(16, 185, 129, 0.05)" style={styles.decorLeafLeft} />
              <Ionicons name="leaf" size={80} color="rgba(16, 185, 129, 0.05)" style={styles.decorLeafRight} />
            </View>

            {/* İçerik */}
            <View style={styles.modalBody}>
              <Text style={styles.modalTitle}>Tarımsal Sağlık Tahmini</Text>
              <Text style={styles.modalSubtitle}>Kritik Hastalık Risklerini Kaçırmayın</Text>
              
              <Text style={styles.modalDescription}>
                BitkiKlinik, tarlanızdaki ve bölgenizdeki mantar hastalığı (Mildiyö) riskini hava durumuna göre otomatik olarak analiz eder.
              </Text>

              <View style={styles.infoFeatureList}>
                <View style={styles.infoFeatureItem}>
                  <Ionicons name="sunny-outline" size={20} color={COLORS.emerald} />
                  <Text style={styles.infoFeatureText}>Saatlik hava tahminleri ve nem takibi</Text>
                </View>
                <View style={styles.infoFeatureItem}>
                  <Ionicons name="alert-circle-outline" size={20} color={COLORS.emerald} />
                  <Text style={styles.infoFeatureText}>Kritik mantar riski durumunda anlık uyarılar</Text>
                </View>
                <View style={styles.infoFeatureItem}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.emerald} />
                  <Text style={styles.infoFeatureText}>Tarımsal müdahale ve koruma önerileri</Text>
                </View>
              </View>
            </View>

            {/* Butonlar */}
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.modalPrimaryButton} 
                onPress={() => {
                  setShowLocationModal(false);
                  fetchRiskAndCoordinates(true);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.modalPrimaryButtonText}>Konumu Etkinleştir</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSecondaryButton} 
                onPress={() => setShowLocationModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalSecondaryButtonText}>Şimdi Değil, Daha Sonra</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
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



          {/* Tarımsal Sağlık & Hastalık Risk Tahmini Kartı */}
          <WeatherDiseaseRiskSection 
            riskAlert={riskAlert}
            isLoading={isRiskLoading}
            locationGranted={locationGranted}
            onRequestLocation={() => fetchRiskAndCoordinates(true)}
          />

          {/* 5. Modüler İpuçları Listesi */}
          <TipsSection />

          {/* 7. Modüler Son Teşhisler Geçmişi */}
          <HistorySection 
            recentScans={recentScans}
            isLoading={isLoading}
            error={error}
            onRefresh={handleRefresh}
            onSeeAllPress={() => router.push({ pathname: '/(tabs)/explore', params: { tab: 'history' } })}
          />

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function getStyles(COLORS: typeof LIGHT_COLORS) {
  return StyleSheet.create({
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
  chatHistoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 5,
    elevation: 1,
  },
  chatHistoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatLastMsg: {
    fontSize: 12,
    color: COLORS.slateLight,
    marginTop: 2,
    maxWidth: width * 0.65,
  },
  riskCardContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 8,
  },
  riskCard: {
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 1,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riskIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  riskSubtitle: {
    fontSize: 13,
    color: COLORS.slateLight,
    marginTop: 2,
  },
  riskLevelBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarContainer: {
    marginTop: 18,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.slate,
  },
  calculatedTime: {
    fontSize: 11,
    color: COLORS.slateLight,
  },
  suggestionContainer: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
  },
  suggestionText: {
    flex: 1,
    fontSize: 12.5,
    color: COLORS.slateLight,
    lineHeight: 18,
  },
  riskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  riskButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  riskLoaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 8,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  riskLoaderText: {
    fontSize: 12,
    color: COLORS.slateLight,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 32,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHeaderImageBg: {
    height: 140,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  modalIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 2,
  },
  decorLeafLeft: {
    position: 'absolute',
    left: -20,
    bottom: -10,
    transform: [{ rotate: '45deg' }],
  },
  decorLeafRight: {
    position: 'absolute',
    right: -10,
    top: -10,
    transform: [{ rotate: '-30deg' }],
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.slate,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.emerald,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 13,
    color: COLORS.slateLight,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  infoFeatureList: {
    width: '100%',
    marginTop: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  infoFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoFeatureText: {
    fontSize: 12,
    color: COLORS.slate,
    marginLeft: 10,
    flex: 1,
    fontWeight: '500',
  },
  modalFooter: {
    padding: 24,
    paddingTop: 8,
    gap: 8,
  },
  modalPrimaryButton: {
    backgroundColor: COLORS.emerald,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  modalPrimaryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSecondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    color: COLORS.slateLight,
    fontSize: 13,
    fontWeight: '600',
  },
});
}
