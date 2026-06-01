import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { dotnetClient } from '../../api/client';
import { useAppTheme } from '../../hooks/useAppTheme';

// ─── Renk Paletleri (RabbitMQ Orange & Premium Slate) ──────────────────
const LIGHT_C = {
  primary: '#ff6600',         // RabbitMQ Klasik Turuncu
  primaryLight: '#fff0e6',
  emerald: '#10b981',         // Sağlıklı / Çalışıyor (Yeşil)
  emeraldLight: '#dcfce7',
  rose: '#f43f5e',            // Sağlıksız / Durduruldu (Kırmızı)
  roseLight: '#ffe4e6',
  amber: '#f59e0b',           // Uyarı (Sarı)
  amberLight: '#fef3c7',
  slate: '#0f172a',           // Koyu Metin
  slateLight: '#64748b',      // Alt Başlık / Yardımcı Metin
  bg: '#f8fafc',              // Açık Gri Arka Plan
  white: '#ffffff',
  border: '#e2e8f0',
  blue: '#3b82f6',            // İşlem / Detay
  blueLight: '#eff6ff',
  cardBg: '#ffffff',
};

const DARK_C = {
  primary: '#ff771a',         // Lightened orange for dark theme
  primaryLight: '#592400',
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  rose: '#f87171',
  roseLight: '#7f1d1d',
  amber: '#fbbf24',
  amberLight: '#78350f',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  bg: '#0f172a',
  white: '#1e293b',
  border: '#334155',
  blue: '#60a5fa',
  blueLight: '#1e3a8a',
  cardBg: '#1e293b',
};

interface RabbitMqMetrics {
  queueName: string;
  pendingJobs: number;
  activeJobs: number;
  activeWorkers: number;
  status: string;
  publishRate: number;
  deliverRate: number;
  isHealthy: boolean;
}

export default function RabbitMqDashboardScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();

  const C = isDark ? DARK_C : LIGHT_C;
  const s = getStyles(C);

  // ─── State Tanımları ────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<RabbitMqMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── API Çağrısı ──────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dotnetClient.get('/admin/queue/rabbitmq-metrics');
      setMetrics(response.data);
    } catch (err: any) {
      console.error('RabbitMQ metrikleri çekilemedi:', err);
      setError(
          err.response?.data?.message ?? 
          'RabbitMQ Yönetim Sunucusuna erişilemedi. Lütfen Docker container\'larının çalıştığından emin olun.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // İlk Yükleme
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Son Güncelleme Zamanı
  const getFormattedTime = () => {
    return new Date().toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1 }}>
        
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.slate} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>RabbitMQ Kuyruğu 🐇</Text>
            <Text style={s.headerSubtitle}>
              {metrics?.isHealthy 
                ? `🟢 Sağlıklı | Son Güncelleme: ${getFormattedTime()}` 
                : '🔴 Bağlantı Yok / Çevrimdışı'}
            </Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={fetchMetrics} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={C.slate} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={fetchMetrics} tintColor={C.primary} />
          }
        >
          {error && (
            <Animated.View entering={FadeInDown.duration(400)} style={s.errCard}>
              <Ionicons name="alert-circle" size={24} color={C.rose} />
              <View style={{ flex: 1 }}>
                <Text style={s.errTitle}>Bağlantı Hatası</Text>
                <Text style={s.errTxt}>{error}</Text>
              </View>
            </Animated.View>
          )}

          {/* ─── Sağlık ve Sistem Genel Kartı ─── */}
          {metrics && (
            <Animated.View entering={FadeInDown.delay(100).duration(500)} style={s.statusCard}>
              <View style={s.statusHeader}>
                <Text style={s.statusTitle}>Kuyruk Sağlığı</Text>
                <View style={[
                  s.statusBadge, 
                  { backgroundColor: metrics.isHealthy ? C.emeraldLight : C.roseLight }
                ]}>
                  <View style={[
                    s.statusDot, 
                    { backgroundColor: metrics.isHealthy ? C.emerald : C.rose }
                  ]} />
                  <Text style={[
                    s.statusBadgeTxt, 
                    { color: metrics.isHealthy ? C.emerald : C.rose }
                  ]}>
                    {metrics.isHealthy ? 'ERİŞİLEBİLİR' : 'ERİŞİLEMEZ'}
                  </Text>
                </View>
              </View>

              <Text style={s.statusDescription}>
                {metrics.isHealthy 
                  ? 'Model yeniden eğitim (active learning) kuyruğu aktif ve işleri almaya hazır durumda.'
                  : 'API, Docker ağındaki RabbitMQ yönetim arayüzüne (Port 15672) erişemiyor. Bağlantı dizesini kontrol edin.'}
              </Text>
            </Animated.View>
          )}

          {/* ─── Ana KPI Metrikleri Grid ─── */}
          {metrics && (
            <View style={s.gridContainer}>
              {/* Bekleyen İşler */}
              <Animated.View entering={FadeInDown.delay(200).duration(500)} style={s.gridCard}>
                <View style={[s.iconBox, { backgroundColor: C.primaryLight }]}>
                  <Ionicons name="hourglass-outline" size={24} color={C.primary} />
                </View>
                <Text style={s.gridValue}>{metrics.pendingJobs}</Text>
                <Text style={s.gridLabel}>Bekleyen İşler</Text>
                <Text style={s.gridSubText}>Kuyrukta bekleyen analizler</Text>
              </Animated.View>

              {/* Aktif İşler */}
              <Animated.View entering={FadeInDown.delay(300).duration(500)} style={s.gridCard}>
                <View style={[s.iconBox, { backgroundColor: C.blueLight }]}>
                  <Ionicons name="sync" size={24} color={C.blue} />
                </View>
                <Text style={s.gridValue}>{metrics.activeJobs}</Text>
                <Text style={s.gridLabel}>İşlenen Görevler</Text>
                <Text style={s.gridSubText}>Şu an işlenen aktif eğitim</Text>
              </Animated.View>

              {/* Aktif Worker (Consumers) */}
              <Animated.View entering={FadeInDown.delay(400).duration(500)} style={s.gridCard}>
                <View style={[
                  s.iconBox, 
                  { backgroundColor: metrics.activeWorkers > 0 ? C.emeraldLight : C.roseLight }
                ]}>
                  <Ionicons 
                    name="construct-outline" 
                    size={24} 
                    color={metrics.activeWorkers > 0 ? C.emerald : C.rose} 
                  />
                </View>
                <Text style={s.gridValue}>{metrics.activeWorkers}</Text>
                <Text style={s.gridLabel}>Aktif Worker</Text>
                <Text style={[
                  s.gridSubText,
                  { color: metrics.activeWorkers > 0 ? C.emerald : C.rose, fontWeight: '600' }
                ]}>
                  {metrics.activeWorkers > 0 ? '🟢 Worker Aktif' : '🔴 Worker Kapalı'}
                </Text>
              </Animated.View>
            </View>
          )}

          {/* ─── Hızlar ve Performans Metrikleri ─── */}
          {metrics && metrics.isHealthy && (
            <Animated.View entering={FadeInDown.delay(500).duration(500)} style={s.sectionContainer}>
              <Text style={s.sectionTitle}>Akış Hızı Oranları</Text>
              <View style={s.ratesContainer}>
                
                {/* Yayınlanma Hızı */}
                <View style={s.rateItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.smallIconBox, { backgroundColor: C.primaryLight }]}>
                      <Ionicons name="arrow-up" size={16} color={C.primary} />
                    </View>
                    <View>
                      <Text style={s.rateLabel}>Giriş Hızı (Publish)</Text>
                      <Text style={s.rateSub}>Kuyruğa saniyede eklenen</Text>
                    </View>
                  </View>
                  <Text style={s.rateValue}>{metrics.publishRate.toFixed(2)} /sn</Text>
                </View>

                <View style={s.divider} />

                {/* Tüketim/İşlenme Hızı */}
                <View style={s.rateItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.smallIconBox, { backgroundColor: C.emeraldLight }]}>
                      <Ionicons name="arrow-down" size={16} color={C.emerald} />
                    </View>
                    <View>
                      <Text style={s.rateLabel}>Çıkış Hızı (Deliver)</Text>
                      <Text style={s.rateSub}>Worker'ın saniyede işlediği</Text>
                    </View>
                  </View>
                  <Text style={s.rateValue}>{metrics.deliverRate.toFixed(2)} /sn</Text>
                </View>

              </View>
            </Animated.View>
          )}

          {/* ─── Teknik Detaylar Tablosu ─── */}
          {metrics && (
            <Animated.View entering={FadeInDown.delay(600).duration(500)} style={s.detailsCard}>
              <Text style={s.detailsCardTitle}>Kuyruk Detayları</Text>
              
              <View style={s.detailRow}>
                <Text style={s.detailName}>Kuyruk Adı</Text>
                <Text style={s.detailVal}>{metrics.queueName}</Text>
              </View>

              <View style={s.detailRow}>
                <Text style={s.detailName}>Sanal Dizin (VHost)</Text>
                <Text style={s.detailVal}>/</Text>
              </View>

              <View style={s.detailRow}>
                <Text style={s.detailName}>Tetikleyici</Text>
                <Text style={s.detailVal}>RabbitMQ (AMQP)</Text>
              </View>

              <View style={s.detailRow}>
                <Text style={s.detailName}>Kuyruk Modu</Text>
                <Text style={s.detailVal}>Durable (Kalıcı)</Text>
              </View>
            </Animated.View>
          )}

          {/* Hızlı Erişim / Aktif Öğrenmeye Geçiş Butonu */}
          <Animated.View entering={FadeInDown.delay(700).duration(500)} style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <TouchableOpacity 
              style={s.actionBtn}
              onPress={() => router.push('/(admin)/active-learning')}
              activeOpacity={0.8}
            >
              <Ionicons name="bulb" size={20} color={LIGHT_C.white} style={{ marginRight: 8 }} />
              <Text style={s.actionBtnTxt}>Aktif Öğrenme Paneline Git</Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const getStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: C.slate },
  headerSubtitle: { fontSize: 12, color: C.slateLight, marginTop: 2 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  scrollContent: { paddingBottom: 40 },
  
  // Hata Kartı
  errCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.roseLight,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.rose,
  },
  errTitle: { color: C.rose, fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  errTxt: { color: C.slate, fontSize: 13, lineHeight: 18 },

  // Sağlık Durum Kartı
  statusCard: {
    backgroundColor: C.cardBg,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusTitle: { fontSize: 16, fontWeight: 'bold', color: C.slate },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusBadgeTxt: { fontSize: 10, fontWeight: '800' },
  statusDescription: { fontSize: 13, color: C.slateLight, lineHeight: 20 },

  // KPI Grid
  gridContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  gridCard: {
    flex: 1,
    backgroundColor: C.cardBg,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  gridValue: { fontSize: 24, fontWeight: 'bold', color: C.slate, marginBottom: 4 },
  gridLabel: { fontSize: 13, fontWeight: 'bold', color: C.slate, marginBottom: 2, textAlign: 'center' },
  gridSubText: { fontSize: 10, color: C.slateLight, textAlign: 'center' },

  // Performans Akış Hızı
  sectionContainer: {
    backgroundColor: C.cardBg,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: C.slate, marginBottom: 16 },
  ratesContainer: { gap: 12 },
  rateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallIconBox: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rateLabel: { fontSize: 13, fontWeight: 'bold', color: C.slate },
  rateSub: { fontSize: 11, color: C.slateLight, marginTop: 1 },
  rateValue: { fontSize: 15, fontWeight: 'bold', color: C.slate },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 4 },

  // Teknik Detaylar
  detailsCard: {
    backgroundColor: C.cardBg,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  detailsCardTitle: { fontSize: 16, fontWeight: 'bold', color: C.slate, marginBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  detailName: { fontSize: 13, color: C.slateLight },
  detailVal: { fontSize: 13, fontWeight: '600', color: C.slate },

  // Action Button
  actionBtn: {
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnTxt: { color: LIGHT_C.white, fontWeight: '700', fontSize: 15 },
});
