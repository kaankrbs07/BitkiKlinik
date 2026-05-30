import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Clipboard,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { dotnetClient } from '../../api/client';

// ─── Renk Paleti (Premium Violet / HSL Harika Uyum) ─────────────────
const C = {
  primary: '#8b5cf6',       // Violet
  primaryLight: '#f5f3ff',
  emerald: '#10b981',       // Success
  emeraldLight: '#dcfce7',
  amber: '#f59e0b',         // Warning/Scheduled
  amberLight: '#fef3c7',
  rose: '#f43f5e',           // Failed
  roseLight: '#ffe4e6',
  slate: '#0f172a',         // Dark text
  slateLight: '#64748b',    // Subtitle
  bg: '#f8fafc',            // Light gray bg
  white: '#ffffff',
  border: '#e2e8f0',
  blue: '#3b82f6',          // Processing
  blueLight: '#eff6ff',
  queued: '#64748b',        // Queued
  queuedLight: '#f1f5f9',
};

interface HangfireStats {
  failed: number;
  processing: number;
  queued: number;
  scheduled: number;
  succeeded: number;
  servers: number;
  recurring: number;
}

interface HangfireJob {
  id: string;
  jobName: string;
  className: string;
  arguments: any[];
  // Durumlara göre eklenen alanlar
  exceptionMessage?: string;
  exceptionDetails?: string;
  failedAt?: string;
  startedAt?: string;
  serverId?: string;
  totalDuration?: number;
  succeededAt?: string;
  enqueueAt?: string;
  scheduledAt?: string;
  queue?: string;
  enqueuedAt?: string;
}

type JobStatus = 'processing' | 'queued' | 'failed' | 'succeeded' | 'scheduled';

export default function HangfireDashboardScreen() {
  const router = useRouter();

  // ─── State Tanımları ────────────────────────────────────────────────
  const [stats, setStats] = useState<HangfireStats>({
    failed: 0,
    processing: 0,
    queued: 0,
    scheduled: 0,
    succeeded: 0,
    servers: 0,
    recurring: 0,
  });
  const [jobs, setJobs] = useState<HangfireJob[]>([]);
  const [activeTab, setActiveTab] = useState<JobStatus>('processing');
  
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aksiyon sırasında loading durumları
  const [actionJobId, setActionJobId] = useState<string | null>(null);

  // Modal Seçili İş
  const [selectedJob, setSelectedJob] = useState<HangfireJob | null>(null);

  // ─── API Çağrıları ──────────────────────────────────────────────────
  
  // 1. Genel İstatistikleri Çek
  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const response = await dotnetClient.get('/HangfireAdmin/stats');
      setStats(response.data);
    } catch (err: any) {
      console.error('Hangfire istatistikleri çekilemedi:', err);
      setError(err.response?.data?.message ?? 'İstatistikler yüklenirken bir bağlantı hatası oluştu.');
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // 2. Aktif Sekmedeki İşleri Çek
  const fetchJobs = useCallback(async (status: JobStatus) => {
    setIsLoadingJobs(true);
    try {
      const response = await dotnetClient.get(`/HangfireAdmin/jobs/${status}`, {
        params: { from: 0, count: 50 },
      });
      setJobs(response.data ?? []);
    } catch (err: any) {
      console.error(`${status} işleri çekilemedi:`, err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  // Tüm Verileri Yenile
  const refreshAll = useCallback(() => {
    setIsLoadingStats(true);
    fetchStats();
    fetchJobs(activeTab);
  }, [fetchStats, fetchJobs, activeTab]);

  // Sekme Değişiklik Tetikleyicisi
  useEffect(() => {
    fetchJobs(activeTab);
  }, [activeTab, fetchJobs]);

  // İlk Yükleme
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 3. İşi Yeniden Sıraya Al (Retry)
  const handleRequeue = async (jobId: string) => {
    Alert.alert(
      'İşi Yeniden Başlat',
      'Bu başarısız işi hemen arka planda yeniden çalıştırmak istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Yeniden Sıraya Al',
          onPress: async () => {
            setActionJobId(jobId);
            try {
              const response = await dotnetClient.post(`/HangfireAdmin/jobs/${jobId}/requeue`);
              if (response.data?.success) {
                Alert.alert('Başarılı', 'İş yeniden kuyruğa başarıyla eklendi.');
                if (selectedJob?.id === jobId) setSelectedJob(null);
                refreshAll();
              } else {
                Alert.alert('Hata', response.data?.message ?? 'İş sıraya alınamadı.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.response?.data?.message ?? 'API isteği başarısız oldu.');
            } finally {
              setActionJobId(null);
            }
          },
        },
      ]
    );
  };

  // 4. İşi Sil
  const handleDelete = async (jobId: string) => {
    Alert.alert(
      'İşi Sil',
      'Bu işi kuyruktan kalıcı olarak silmek ve iptal etmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kalıcı Olarak Sil',
          style: 'destructive',
          onPress: async () => {
            setActionJobId(jobId);
            try {
              const response = await dotnetClient.delete(`/HangfireAdmin/jobs/${jobId}`);
              if (response.data?.success) {
                Alert.alert('Başarılı', 'İş başarıyla silindi.');
                if (selectedJob?.id === jobId) setSelectedJob(null);
                refreshAll();
              } else {
                Alert.alert('Hata', response.data?.message ?? 'İş silinemedi.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.response?.data?.message ?? 'API isteği başarısız oldu.');
            } finally {
              setActionJobId(null);
            }
          },
        },
      ]
    );
  };

  // Logları veya hata stack trace kopyalama
  const handleCopyLogs = (logs?: string) => {
    if (!logs) return;
    Clipboard.setString(logs);
    Alert.alert('Başarılı', 'Hata detayı panoya kopyalandı.');
  };



  // Tarih Formatlayıcı Yardımcı Metot
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Duruma göre Tema Rengi ve Stillerini Seçen Metot
  const getStatusTheme = (status: JobStatus) => {
    switch (status) {
      case 'processing':
        return { color: C.blue, bg: C.blueLight, icon: 'sync-outline', label: 'Çalışıyor' };
      case 'queued':
        return { color: C.queued, bg: C.queuedLight, icon: 'hourglass-outline', label: 'Kuyrukta' };
      case 'failed':
        return { color: C.rose, bg: C.roseLight, icon: 'close-circle-outline', label: 'Hatalı' };
      case 'succeeded':
        return { color: C.emerald, bg: C.emeraldLight, icon: 'checkmark-circle-outline', label: 'Başarılı' };
      case 'scheduled':
        return { color: C.amber, bg: C.amberLight, icon: 'calendar-outline', label: 'Planlandı' };
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.slate} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Hangfire İşleri ⚙️</Text>
            <Text style={s.headerSubtitle}>
              {stats.servers > 0 ? `🟢 ${stats.servers} Aktif Sunucu` : '🔴 Sunucu Bağlantısı Yok'}
              {stats.recurring > 0 ? ` | ⏱️ ${stats.recurring} Periyodik İş` : ''}
            </Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={refreshAll} disabled={isLoadingStats || isLoadingJobs}>
            {isLoadingStats || isLoadingJobs ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={C.slate} />
            )}
          </TouchableOpacity>
        </View>

        {error && (
          <View style={s.errCard}>
            <Ionicons name="alert-circle" size={20} color={C.rose} />
            <Text style={s.errTxt}>{error}</Text>
          </View>
        )}

        {/* ── İstatistik Metrikleri Grid / Skorbord ── */}
        <View style={s.statsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsScroll}>
            {[
              { status: 'processing', label: 'Çalışıyor', count: stats.processing, color: C.blue, bg: C.blueLight },
              { status: 'queued', label: 'Kuyrukta', count: stats.queued, color: C.queued, bg: C.queuedLight },
              { status: 'failed', label: 'Hatalı', count: stats.failed, color: C.rose, bg: C.roseLight },
              { status: 'succeeded', label: 'Başarılı', count: stats.succeeded, color: C.emerald, bg: C.emeraldLight },
              { status: 'scheduled', label: 'Planlandı', count: stats.scheduled, color: C.amber, bg: C.amberLight },
            ].map((item) => (
              <TouchableOpacity
                key={item.status}
                style={[
                  s.statsCard,
                  activeTab === item.status && { borderColor: item.color, borderWidth: 2, backgroundColor: item.bg },
                ]}
                onPress={() => setActiveTab(item.status as JobStatus)}
                activeOpacity={0.8}
              >
                <Text style={[s.statsLabel, { color: item.color }]}>{item.label}</Text>
                <Text style={[s.statsValue, { color: item.color }]}>{item.count}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>



        {/* İşlerin Listesi */}
        {isLoadingJobs ? (
          <View style={s.loaderContainer}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loaderText}>Arka plan işleri sorgulanıyor...</Text>
          </View>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            refreshControl={
              <RefreshControl refreshing={isLoadingJobs} onRefresh={refreshAll} tintColor={C.primary} />
            }
            renderItem={({ item, index }) => {
              const theme = getStatusTheme(activeTab);
              return (
                <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
                  <TouchableOpacity
                    style={[s.jobCard, { borderLeftColor: theme.color, borderLeftWidth: 4 }]}
                    onPress={() => setSelectedJob(item)}
                    activeOpacity={0.9}
                  >
                    <View style={s.jobMainInfo}>
                      <View style={s.jobHeaderLine}>
                        <Text style={s.jobTitle} numberOfLines={1}>
                          {item.jobName}
                        </Text>
                        <View style={[s.statusBadge, { backgroundColor: theme.bg }]}>
                          <Ionicons name={theme.icon as any} size={11} color={theme.color} style={{ marginRight: 3 }} />
                          <Text style={[s.statusBadgeTxt, { color: theme.color }]}>{theme.label}</Text>
                        </View>
                      </View>
                      
                      <Text style={s.jobClass} numberOfLines={1}>
                        {item.className}
                      </Text>

                      {/* Bilgi etiketleri */}
                      <View style={s.jobMetaInfo}>
                        {activeTab === 'failed' && (
                          <Text style={[s.jobMetaTxt, { color: C.rose, fontWeight: '600' }]} numberOfLines={1}>
                            ⚠ {item.exceptionMessage}
                          </Text>
                        )}
                        {activeTab === 'succeeded' && item.totalDuration && (
                          <Text style={s.jobMetaTxt}>
                            ⏱️ Süre: {(item.totalDuration).toFixed(0)} ms
                          </Text>
                        )}
                        {activeTab === 'queued' && (
                          <Text style={s.jobMetaTxt}>
                            📂 Sıra: {item.queue ?? 'default'}
                          </Text>
                        )}
                        {activeTab === 'scheduled' && item.enqueueAt && (
                          <Text style={s.jobMetaTxt}>
                            ⏱️ Enqueue: {formatDate(item.enqueueAt)}
                          </Text>
                        )}
                      </View>

                      {/* Çalışma/Hata Tarih Etiketi */}
                      <Text style={s.jobDate}>
                        {activeTab === 'failed' && `Hata Tarihi: ${formatDate(item.failedAt)}`}
                        {activeTab === 'succeeded' && `Bitiş Tarihi: ${formatDate(item.succeededAt)}`}
                        {activeTab === 'processing' && `Başlangıç: ${formatDate(item.startedAt)}`}
                        {activeTab === 'scheduled' && `Planlandı: ${formatDate(item.scheduledAt)}`}
                        {activeTab === 'queued' && `Eklendi: ${formatDate(item.enqueuedAt)}`}
                      </Text>
                    </View>

                    {/* Aksiyon Butonları (Yeniden Dene / Sil) */}
                    <View style={s.jobActions}>
                      {activeTab === 'failed' && (
                        <TouchableOpacity
                          style={[s.jobActionBtn, { backgroundColor: C.emeraldLight }]}
                          onPress={() => handleRequeue(item.id)}
                          disabled={actionJobId !== null}
                        >
                          {actionJobId === item.id ? (
                            <ActivityIndicator size="small" color={C.emerald} />
                          ) : (
                            <Ionicons name="play" size={16} color={C.emerald} />
                          )}
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[s.jobActionBtn, { backgroundColor: C.roseLight }]}
                        onPress={() => handleDelete(item.id)}
                        disabled={actionJobId !== null}
                      >
                        {actionJobId === item.id ? (
                          <ActivityIndicator size="small" color={C.rose} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color={C.rose} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            }}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="checkmark-done-circle-outline" size={64} color={C.emerald} />
                <Text style={s.emptyStateTitle}>Kuyrukta İş Bulunmuyor</Text>
                <Text style={s.emptyStateSub}>Seçili sekmede listelenecek herhangi bir arka plan işi mevcut değil.</Text>
              </View>
            }
          />
        )}

        {/* ── Detaylı İş Modalı (Slide Up) ── */}
        <Modal visible={selectedJob !== null} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalDragBar} />

              <View style={s.modalHeader}>
                <View>
                  <Text style={s.modalTitle}>İş Detay Raporu</Text>
                  <Text style={s.modalSubtitle}>ID: {selectedJob?.id}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedJob(null)}>
                  <Ionicons name="close-circle" size={26} color={C.slateLight} />
                </TouchableOpacity>
              </View>

              {selectedJob && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalScrollContent}>
                  
                  {/* Bilgi Bloğu */}
                  <View style={s.detailGroup}>
                    <Text style={s.detailLabel}>Metot Adı</Text>
                    <Text style={s.detailValue}>{selectedJob.jobName}</Text>
                  </View>

                  <View style={s.detailGroup}>
                    <Text style={s.detailLabel}>Sınıf Adı</Text>
                    <Text style={s.detailValue}>{selectedJob.className}</Text>
                  </View>

                  {/* Parametreler (Arguments) */}
                  <View style={s.detailGroup}>
                    <Text style={s.detailLabel}>Giriş Parametreleri (Arguments)</Text>
                    <View style={s.argumentsBox}>
                      {selectedJob.arguments && selectedJob.arguments.length > 0 ? (
                        selectedJob.arguments.map((arg, idx) => (
                          <Text key={idx} style={s.argumentTxt}>
                            [{idx}]: {typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)}
                          </Text>
                        ))
                      ) : (
                        <Text style={s.argumentTxt}>Parametre yok.</Text>
                      )}
                    </View>
                  </View>

                  {/* Hata Logları & Exception Trace (Yalnızca Hatalı İşler) */}
                  {selectedJob.exceptionMessage && (
                    <View style={s.detailGroup}>
                      <View style={s.logHeaderRow}>
                        <Text style={[s.detailLabel, { color: C.rose }]}>Hata Detayı & Stack Trace</Text>
                        <TouchableOpacity
                          style={s.copyBtn}
                          onPress={() =>
                            handleCopyLogs(
                              `Mesaj: ${selectedJob.exceptionMessage}\n\nDetay:\n${selectedJob.exceptionDetails}`
                            )
                          }
                        >
                          <Ionicons name="copy-outline" size={14} color={C.primary} style={{ marginRight: 4 }} />
                          <Text style={s.copyBtnTxt}>Kopyala</Text>
                        </TouchableOpacity>
                      </View>
                      <ScrollView style={s.logScroll} nestedScrollEnabled>
                        <Text style={s.logMsgTxt}>Hata: {selectedJob.exceptionMessage}</Text>
                        <Text style={s.logTraceTxt}>{selectedJob.exceptionDetails}</Text>
                      </ScrollView>
                    </View>
                  )}

                  {/* Zaman Damgaları */}
                  <View style={s.detailGroup}>
                    <Text style={s.detailLabel}>Zaman Detayları</Text>
                    <View style={s.timestampsBox}>
                      {selectedJob.failedAt && (
                        <Text style={s.timeRow}>❌ Başarısızlık Zamanı: {formatDate(selectedJob.failedAt)}</Text>
                      )}
                      {selectedJob.succeededAt && (
                        <Text style={s.timeRow}>✓ Tamamlanma Zamanı: {formatDate(selectedJob.succeededAt)}</Text>
                      )}
                      {selectedJob.startedAt && (
                        <Text style={s.timeRow}>🚀 Başlama Zamanı: {formatDate(selectedJob.startedAt)}</Text>
                      )}
                      {selectedJob.scheduledAt && (
                        <Text style={s.timeRow}>⏱️ Planlanan Zamanı: {formatDate(selectedJob.scheduledAt)}</Text>
                      )}
                      {selectedJob.enqueuedAt && (
                        <Text style={s.timeRow}>📂 Sıraya Alınma Zamanı: {formatDate(selectedJob.enqueuedAt)}</Text>
                      )}
                      {selectedJob.totalDuration && (
                        <Text style={s.timeRow}>⏱️ Çalışma Süresi: {selectedJob.totalDuration.toFixed(0)} ms</Text>
                      )}
                    </View>
                  </View>

                  {/* Modal Aksiyon Butonları */}
                  <View style={s.modalActionRow}>
                    {activeTab === 'failed' && (
                      <TouchableOpacity
                        style={[s.modalBtn, { backgroundColor: C.emerald }]}
                        onPress={() => handleRequeue(selectedJob.id)}
                      >
                        <Ionicons name="play" size={18} color={C.white} style={{ marginRight: 6 }} />
                        <Text style={s.modalBtnTxt}>Yeniden Sıraya Al</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.modalBtn, { backgroundColor: C.rose }]}
                      onPress={() => handleDelete(selectedJob.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color={C.white} style={{ marginRight: 6 }} />
                      <Text style={s.modalBtnTxt}>İşi Sil</Text>
                    </TouchableOpacity>
                  </View>

                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
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
    backgroundColor: C.white,
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
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  errCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.roseLight,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  errTxt: { color: C.rose, fontSize: 13, flex: 1 },

  // Stats Dashboard Grid Scroll
  statsContainer: { marginVertical: 12 },
  statsScroll: { paddingHorizontal: 20, gap: 8 },
  statsCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: C.white,
    minWidth: 100,
    alignItems: 'center',
    borderColor: 'transparent',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  statsLabel: { fontSize: 12, fontWeight: '700' },
  statsValue: { fontSize: 22, fontWeight: 'bold', marginTop: 4 },



  // List Content
  listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  jobCard: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  jobMainInfo: { flex: 1 },
  jobHeaderLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  jobTitle: { fontSize: 15, fontWeight: 'bold', color: C.slate, flex: 1, marginRight: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeTxt: { fontSize: 9, fontWeight: '700' },
  jobClass: { fontSize: 12, color: C.slateLight, marginBottom: 8 },
  jobMetaInfo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  jobMetaTxt: { fontSize: 11, color: C.slateLight, backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  jobDate: { fontSize: 10, color: C.slateLight },

  // Job Actions
  jobActions: { flexDirection: 'row', gap: 6, marginLeft: 12 },
  jobActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loader state
  loaderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
  loaderText: { fontSize: 14, color: C.slateLight, marginTop: 12 },

  // Empty state
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyStateTitle: { fontSize: 16, fontWeight: 'bold', color: C.slate, marginTop: 14 },
  emptyStateSub: { fontSize: 13, color: C.slateLight, textAlign: 'center', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    height: '80%',
  },
  modalDragBar: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: C.slate },
  modalSubtitle: { fontSize: 11, color: C.slateLight, marginTop: 2 },
  modalScrollContent: { paddingBottom: 24 },

  detailGroup: { marginBottom: 16 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: C.slateLight, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  detailValue: { fontSize: 15, fontWeight: '600', color: C.slate, backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  
  argumentsBox: { backgroundColor: '#0f172a', padding: 12, borderRadius: 10 },
  argumentTxt: { color: '#38bdf8', fontSize: 12, fontFamily: 'monospace' },

  timestampsBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, borderStyle: 'solid', borderWidth: 1, borderColor: C.border },
  timeRow: { fontSize: 12, color: C.slate, marginVertical: 2 },

  // Loglar
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  copyBtnTxt: { fontSize: 11, fontWeight: '700', color: C.primary },
  logScroll: { backgroundColor: '#1e293b', maxHeight: 150, borderRadius: 10, padding: 12 },
  logMsgTxt: { color: '#f43f5e', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  logTraceTxt: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },

  // Modal Actions
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modalBtnTxt: { color: C.white, fontWeight: '700', fontSize: 14 },
});
