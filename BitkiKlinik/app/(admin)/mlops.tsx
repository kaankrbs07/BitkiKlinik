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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { dotnetClient } from '../../api/client';

const { width } = Dimensions.get('window');

// ─── Renk Paleti (MLOps Slate & Electric Blue) ──────────────────────
const C = {
  primary: '#3b82f6',         // Electric Blue
  primaryLight: '#eff6ff',
  indigo: '#6366f1',          // Train Acc Color
  indigoLight: '#eef2ff',
  emerald: '#10b981',         // Val Acc / Healthy (Success)
  emeraldLight: '#dcfce7',
  rose: '#f43f5e',            // Loss / Hatalı (Kırmızı)
  roseLight: '#ffe4e6',
  amber: '#f59e0b',           // Warning (Sarı)
  amberLight: '#fef3c7',
  slate: '#0f172a',           // Dark text
  slateLight: '#64748b',      // Subtitle
  bg: '#f8fafc',              // Background
  white: '#ffffff',
  border: '#e2e8f0',
};

interface RetrainHistoryItem {
  trainedAt: string;
  epochs: number;
  trainLoss: number;
  trainAcc: number;
  valLoss: number;
  valAcc: number;
  totalSamples: number;
  alSamples: number;
  bufferSamples: number;
}

interface ClassDistributionItem {
  classLabel: string;
  count: number;
}

export default function MLOpsDashboardScreen() {
  const router = useRouter();

  // ─── State Tanımları ────────────────────────────────────────────────
  const [history, setHistory] = useState<RetrainHistoryItem[]>([]);
  const [distribution, setDistribution] = useState<ClassDistributionItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<RetrainHistoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── API Veri Çekme ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [historyRes, distRes] = await Promise.all([
        dotnetClient.get('/admin/active-learning/retrain-history'),
        dotnetClient.get('/admin/active-learning/class-distribution')
      ]);
      
      const historyData = historyRes.data ?? [];
      setHistory(historyData);
      setDistribution(distRes.data ?? []);
      
      // Varsayılan olarak en son koşuyu seç
      if (historyData.length > 0) {
        setSelectedRun(historyData[historyData.length - 1]);
      }
    } catch (err: any) {
      console.error('MLOps verileri çekilemedi:', err);
      setError(
        err.response?.data?.message ?? 
        'FastAPI ML Sunucusuna veya veritabanına erişilemedi.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Yardımcı Tarih Formatlayıcı
  const formatDate = (dateStr: string, isShort = false) => {
    const d = new Date(dateStr);
    if (isShort) {
      // Sayı şeklinde gösterim (Gün.Ay, örn: 18.05)
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}.${month}`;
    }
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Toplam Onaylanmış Veri Sayısı
  const totalApprovedSamples = distribution.reduce((sum, item) => sum + item.count, 0);

  // Sınıf etiketini insan dostu temiz isme dönüştürür
  const cleanLabel = (label: string) => {
    return label
      .replace(/__/g, ' - ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
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
            <Text style={s.headerTitle}>MLOps & Performans 📊</Text>
            <Text style={s.headerSubtitle}>Model Kalibrasyonu, Karar Sınırları ve Doğruluk İzleme</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={fetchData} disabled={isLoading}>
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
            <RefreshControl refreshing={isLoading} onRefresh={fetchData} tintColor={C.primary} />
          }
        >
          {error && (
            <Animated.View entering={FadeInDown.duration(400)} style={s.errCard}>
              <Ionicons name="alert-circle" size={24} color={C.rose} />
              <View style={{ flex: 1 }}>
                <Text style={s.errTitle}>Veri Hatası</Text>
                <Text style={s.errTxt}>{error}</Text>
              </View>
            </Animated.View>
          )}

          {isLoading && history.length === 0 ? (
            <View style={s.loaderContainer}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={s.loaderText}>MLOps verileri yükleniyor...</Text>
            </View>
          ) : (
            <>
              {/* ─── 1. BÖLÜM: Model Doğruluk Oranı Çizelgesi (Bar Chart) ─── */}
              {history.length > 0 && (
                <Animated.View entering={FadeInDown.delay(100).duration(500)} style={s.chartCard}>
                  <Text style={s.chartCardTitle}>Yeniden Eğitim Karşılaştırması (Accuracy %)</Text>
                  
                  <View style={s.chartContainer}>
                    {/* Y Ekseni Kılavuz Değerleri (Sola Sabitlenmiş) */}
                    <View style={s.yAxis}>
                      <Text style={s.yAxisText}>100%</Text>
                      <Text style={s.yAxisText}>90%</Text>
                      <Text style={s.yAxisText}>80%</Text>
                      <Text style={s.yAxisText}>70%</Text>
                    </View>

                    {/* Yatay Kaydırılabilir Çizelge Alanı */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.scrollableChartContent}
                      style={s.chartScrollView}
                    >
                      <View style={s.barsWrapper}>
                        {/* Referans Arka Plan Kılavuz Çizgileri - Tam Genişlik */}
                        <View style={[s.gridLineRow, { top: '0%' }]}><View style={s.gridLine} /></View>
                        <View style={[s.gridLineRow, { top: '33.33%' }]}><View style={s.gridLine} /></View>
                        <View style={[s.gridLineRow, { top: '66.66%' }]}><View style={s.gridLine} /></View>
                        <View style={[s.gridLineRow, { top: '100%' }]}><View style={s.gridLine} /></View>

                        {history.map((run, idx) => {
                          // Acc skorunu %70 ile %100 arasına sığdıracak şekilde yükseklik katsayısı hesaplar
                          const getBarHeight = (acc: number) => {
                            const minAcc = 0.70;
                            if (acc < minAcc) return '5%';
                            return `${((acc - minAcc) / (1.0 - minAcc)) * 100}%`;
                          };

                          const isSelected = selectedRun?.trainedAt === run.trainedAt;

                          return (
                            <TouchableOpacity
                              key={idx}
                              style={[s.barColumn, isSelected && s.barColumnSelected]}
                              onPress={() => setSelectedRun(run)}
                              activeOpacity={0.8}
                            >
                              <View style={s.barPair}>
                                {/* Train Acc */}
                                <View style={[s.barSub, { height: getBarHeight(run.trainAcc), backgroundColor: C.indigo }]} />
                                {/* Val Acc */}
                                <View style={[s.barSub, { height: getBarHeight(run.valAcc), backgroundColor: C.emerald }]} />
                              </View>
                              <Text style={[s.xAxisText, isSelected && s.xAxisTextSelected]}>
                                {formatDate(run.trainedAt, true)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>

                    {/* Sağ Tarafta Sabit Tarih Etiketi */}
                    <View style={s.xAxisRightLabel}>
                      <Text style={s.xAxisRightLabelText}>Tarih</Text>
                    </View>
                  </View>

                  {/* Çizelge Açıklama/Legend */}
                  <View style={s.legend}>
                    <View style={s.legendItem}>
                      <View style={[s.legendColor, { backgroundColor: C.indigo }]} />
                      <Text style={s.legendText}>Eğitim Doğruluğu</Text>
                    </View>
                    <View style={s.legendItem}>
                      <View style={[s.legendColor, { backgroundColor: C.emerald }]} />
                      <Text style={s.legendText}>Validasyon Doğruluğu</Text>
                    </View>
                  </View>
                </Animated.View>
              )}

              {/* ─── 2. BÖLÜM: Seçili Eğitim Raporu Detayları ─── */}
              {selectedRun && (
                <Animated.View layout={LinearTransition} entering={FadeInDown.delay(200).duration(500)} style={s.runDetailsCard}>
                  <View style={s.runDetailsHeader}>
                    <Text style={s.runDetailsTitle}>Seçili Eğitim Analiz Raporu 📜</Text>
                    <Text style={s.runDetailsDate}>{formatDate(selectedRun.trainedAt)}</Text>
                  </View>

                  <View style={s.metricsRow}>
                    <View style={[s.metricItem, { borderLeftColor: C.indigo }]}>
                      <Text style={s.metricVal}>%{(selectedRun.trainAcc * 100).toFixed(1)}</Text>
                      <Text style={s.metricLabel}>Train Acc</Text>
                      <Text style={s.metricSub}>Kayıp: {selectedRun.trainLoss.toFixed(4)}</Text>
                    </View>

                    <View style={[s.metricItem, { borderLeftColor: C.emerald }]}>
                      <Text style={s.metricVal}>%{(selectedRun.valAcc * 100).toFixed(1)}</Text>
                      <Text style={s.metricLabel}>Validation Acc</Text>
                      <Text style={s.metricSub}>Kayıp: {selectedRun.valLoss.toFixed(4)}</Text>
                    </View>
                  </View>

                  <View style={s.runSamplesBox}>
                    <View style={s.sampleBoxItem}>
                      <Text style={s.sampleBoxNum}>{selectedRun.alSamples}</Text>
                      <Text style={s.sampleBoxLabel}>Aktif Öğrenme</Text>
                    </View>
                    <View style={s.sampleBoxDivider} />
                    <View style={s.sampleBoxItem}>
                      <Text style={s.sampleBoxNum}>{selectedRun.bufferSamples}</Text>
                      <Text style={s.sampleBoxLabel}>Bellek Tamponu</Text>
                    </View>
                    <View style={s.sampleBoxDivider} />
                    <View style={s.sampleBoxItem}>
                      <Text style={s.sampleBoxNum}>{selectedRun.totalSamples}</Text>
                      <Text style={s.sampleBoxLabel}>Toplam Örnek</Text>
                    </View>
                  </View>
                </Animated.View>
              )}

              {/* ─── 3. BÖLÜM: Sınıf Dağılımı ve Uzmanlık (Drift / Progress Bars) ─── */}
              <Animated.View entering={FadeInDown.delay(300).duration(500)} style={s.distributionCard}>
                <View style={s.distributionHeader}>
                  <Text style={s.distributionTitle}>Sınıf Uzmanlık Dağılımı</Text>
                  <Text style={s.distributionSubtitle}>Modelin en çok beslendiği ve uzmanlaştığı hastalık sınıfları</Text>
                </View>

                {distribution.length === 0 ? (
                  <View style={s.emptyDist}>
                    <Ionicons name="albums-outline" size={40} color={C.slateLight} />
                    <Text style={s.emptyDistTxt}>Henüz admin tarafından çözülüp veri setine eklenen onaylı aktif öğrenme görseli bulunmuyor.</Text>
                  </View>
                ) : (
                  <View style={s.distList}>
                    {distribution
                      .sort((a, b) => b.count - a.count)
                      .map((item, idx) => {
                        const percent = totalApprovedSamples > 0 ? (item.count / totalApprovedSamples) * 100 : 0;
                        
                        // Sıralamaya göre renk ataması
                        const getBarColor = (index: number) => {
                          if (index === 0) return '#6366f1'; // Indigo (En Çok)
                          if (index === 1) return '#3b82f6'; // Blue
                          if (index === 2) return '#10b981'; // Emerald
                          return C.slateLight;
                        };

                        return (
                          <View key={idx} style={s.distItem}>
                            <View style={s.distRow}>
                              <Text style={s.distClassLabel} numberOfLines={1}>
                                {cleanLabel(item.classLabel)}
                              </Text>
                              <Text style={s.distClassCount}>
                                {item.count} örnek ({percent.toFixed(0)}%)
                              </Text>
                            </View>
                            
                            {/* Yatay Segmented Progress Bar */}
                            <View style={s.progressBarBg}>
                              <View 
                                style={[
                                  s.progressBarFill, 
                                  { width: `${percent}%`, backgroundColor: getBarColor(idx) }
                                ]} 
                              />
                            </View>
                          </View>
                        );
                      })}
                  </View>
                )}
              </Animated.View>
            </>
          )}
        </ScrollView>
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
  headerSubtitle: { fontSize: 11, color: C.slateLight, marginTop: 2 },
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
    borderColor: '#fca5a5',
  },
  errTitle: { color: C.rose, fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  errTxt: { color: '#be123c', fontSize: 13, lineHeight: 18 },

  loaderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 120 },
  loaderText: { fontSize: 14, color: C.slateLight, marginTop: 12 },

  // Doğruluk Çizelge Kartı
  chartCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  chartCardTitle: { fontSize: 15, fontWeight: 'bold', color: C.slate, marginBottom: 16 },
  chartContainer: {
    height: 240,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  yAxis: {
    height: 200,
    justifyContent: 'space-between',
    marginRight: 12,
    alignItems: 'flex-end',
    width: 32,
  },
  yAxisText: { fontSize: 10, color: C.slateLight, fontWeight: '600' },
  chartScrollView: {
    flex: 1,
    height: 240,
  },
  scrollableChartContent: {
    paddingRight: 16,
  },
  barsWrapper: {
    height: 200,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    position: 'relative',
    gap: 12,
    paddingHorizontal: 8,
  },
  gridLineRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    zIndex: 0,
  },
  // Kılavuz çizgilerinin dikey yerleşimi
  gridLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  barColumn: {
    alignItems: 'center',
    width: 64,
    height: 200,
    justifyContent: 'flex-end',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  barColumnSelected: {
    borderColor: C.primary,
    backgroundColor: C.primaryLight,
  },
  barPair: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    justifyContent: 'center',
    width: '100%',
  },
  barSub: {
    width: 8,
    borderRadius: 4,
  },
  xAxisText: {
    fontSize: 9,
    color: C.slateLight,
    fontWeight: '700',
    position: 'absolute',
    bottom: -22,
  },
  xAxisTextSelected: { color: C.primary, fontWeight: '800' },
  xAxisRightLabel: {
    width: 40,
    height: 200,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingLeft: 8,
    position: 'relative',
  },
  xAxisRightLabelText: {
    fontSize: 10,
    color: C.slateLight,
    fontWeight: 'bold',
    position: 'absolute',
    bottom: -22,
  },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendColor: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: C.slateLight, fontWeight: '600' },

  // Koşu Detay Kartı
  runDetailsCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  runDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 12,
    marginBottom: 16,
  },
  runDetailsTitle: { fontSize: 15, fontWeight: 'bold', color: C.slate },
  runDetailsDate: { fontSize: 12, color: C.slateLight, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metricItem: {
    flex: 1,
    borderLeftWidth: 4,
    paddingLeft: 12,
    paddingVertical: 4,
  },
  metricVal: { fontSize: 22, fontWeight: 'black', color: C.slate },
  metricLabel: { fontSize: 12, fontWeight: 'bold', color: C.slate, marginTop: 2 },
  metricSub: { fontSize: 11, color: C.slateLight, marginTop: 1 },

  runSamplesBox: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: C.border,
  },
  sampleBoxItem: { alignItems: 'center' },
  sampleBoxNum: { fontSize: 16, fontWeight: 'bold', color: C.slate },
  sampleBoxLabel: { fontSize: 10, color: C.slateLight, fontWeight: '700', marginTop: 2 },
  sampleBoxDivider: { width: 1, height: 24, backgroundColor: C.border },

  // Dağılım Kartı
  distributionCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  distributionHeader: { marginBottom: 16 },
  distributionTitle: { fontSize: 15, fontWeight: 'bold', color: C.slate },
  distributionSubtitle: { fontSize: 12, color: C.slateLight, marginTop: 4, lineHeight: 18 },
  emptyDist: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyDistTxt: { fontSize: 13, color: C.slateLight, textAlign: 'center', lineHeight: 20 },
  
  distList: { gap: 16 },
  distItem: { gap: 6 },
  distRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  distClassLabel: { fontSize: 13, fontWeight: 'bold', color: C.slate, flex: 1, marginRight: 12 },
  distClassCount: { fontSize: 12, color: C.slateLight, fontWeight: '600' },
  
  progressBarBg: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
});
