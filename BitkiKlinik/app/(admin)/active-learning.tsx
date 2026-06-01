import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  Image,
  TextInput,
  ActivityIndicator,
  FlatList,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useActiveLearning, ActiveLearningPendingItem } from '../../hooks/useActiveLearning';
import { useAdminDiseases } from '../../hooks/useAdminDiseases';
import { CONFIG } from '../../constants/config';
import { useAppTheme } from '../../hooks/useAppTheme';

// ─── Renk Paletleri ──────────────────────────────────────────────────
const LIGHT_C = {
  primary: '#6366f1',
  primaryLight: '#eef2ff',
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  amber: '#f59e0b',
  amberLight: '#fef3c7',
  rose: '#f43f5e',
  roseLight: '#ffe4e6',
  slate: '#0f172a',
  slateLight: '#64748b',
  bg: '#f8fafc',
  white: '#ffffff',
  border: '#e2e8f0',
  cardBg: '#ffffff',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  warningText: '#92400e',
  warningTextLight: '#b45309',
  warningIconBg: '#fef3c7',
};

const DARK_C = {
  primary: '#818cf8',
  primaryLight: '#312e81',
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  amber: '#fbbf24',
  amberLight: '#78350f',
  rose: '#f87171',
  roseLight: '#7f1d1d',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  bg: '#0f172a',
  white: '#1e293b',
  border: '#334155',
  cardBg: '#1e293b',
  warningBg: '#78350f40',
  warningBorder: '#78350f80',
  warningText: '#fbbf24',
  warningTextLight: '#fbbf24cc',
  warningIconBg: '#78350f60',
};

export default function ActiveLearningScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  
  const C = isDark ? DARK_C : LIGHT_C;
  const s = getStyles(C);
  
  // Custom hooks
  const {
    pendingItems,
    stats,
    retrainStatus,
    isLoading,
    isRetrainingLoading,
    error,
    refresh,
    resolveItem,
    ignoreItem,
    triggerRetrain,
  } = useActiveLearning();

  const { diseases } = useAdminDiseases();

  // State
  const [selectedItem, setSelectedItem] = useState<ActiveLearningPendingItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Minimum örnek sayısı eşiği
  const MIN_SAMPLES_REQUIRED = 30;

  // Yeniden eğitimi tetikle
  const handleRetrain = () => {
    // Önce istemci tarafında örnek sayısı kontrolü
    const totalSamples = retrainStatus?.totalSamples ?? 0;
    if (totalSamples < MIN_SAMPLES_REQUIRED) {
      Alert.alert(
        'Yetersiz Veri',
        `Yeniden eğitim için en az ${MIN_SAMPLES_REQUIRED} doğrulanmış görsel gereklidir.\n\n` +
        `Şu anda: ${totalSamples} görsel\nEksik: ${MIN_SAMPLES_REQUIRED - totalSamples} görsel\n\n` +
        `Daha fazla teşhisi inceleyip onaylayarak veri setini büyütebilirsiniz.`,
        [{ text: 'Anladım', style: 'default' }]
      );
      return;
    }

    Alert.alert(
      'Yeniden Eğitimi Başlat',
      `Aktif öğrenme veri setindeki ${totalSamples} görsellerle modeli dondurulmuş transfer öğrenme yöntemiyle eğitmeyi başlatmak istiyor musunuz? Bu işlem arka planda çalışacaktır.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Başlat',
          onPress: async () => {
            const ok = await triggerRetrain();
            if (ok) {
              Alert.alert('Başarılı', 'Yeniden eğitim arka planda başlatıldı. İlerlemeyi buradan takip edebilirsiniz.');
            }
          },
        },
      ]
    );
  };

  // Kuyruk öğesini yoksay
  const handleIgnore = (item: ActiveLearningPendingItem) => {
    Alert.alert(
      'Öğeyi Yoksay',
      'Bu görseli listeden kaldırmak ve işlem yapmamak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Yoksay',
          style: 'destructive',
          onPress: () => ignoreItem(item.id),
        },
      ]
    );
  };

  // Yapay zeka teşhisini hızlıca doğru olarak onayla
  const handleQuickCorrect = (item: ActiveLearningPendingItem) => {
    const diseaseName = diseases.find((d) => d.modelLabel === item.predictedDisease)?.name ?? item.predictedDisease;
    Alert.alert(
      'Teşhisi Doğrula',
      `Yapay zekanın "${diseaseName}" tahmini doğru olarak onaylansın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Onayla',
          onPress: async () => {
            const ok = await resolveItem(item.id, item.predictedDisease);
            if (ok) {
              Alert.alert('Başarılı', 'Teşhis başarıyla doğru olarak onaylandı.');
            }
          },
        },
      ]
    );
  };

  // Teşhisi onaylama/sınıflandırma
  const handleResolve = async (correctedDiseaseLabel: string) => {
    if (!selectedItem) return;
    setIsResolving(true);
    try {
      const ok = await resolveItem(selectedItem.id, correctedDiseaseLabel);
      if (ok) {
        setSelectedItem(null);
        setSearchQuery('');
      } else {
        Alert.alert('Hata', 'Değişiklik kaydedilemedi.');
      }
    } finally {
      setIsResolving(false);
    }
  };

  // Hastalık arama filtresi
  const filteredDiseases = diseases.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.modelLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.slate} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Aktif Öğrenme Paneli</Text>
          <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
            <Ionicons name="refresh" size={20} color={C.slate} />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={s.errCard}>
            <Ionicons name="alert-circle" size={20} color={C.rose} />
            <Text style={s.errTxt}>{error}</Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={s.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.primary} />
          }
        >
          {/* İstatistikler Bölümü */}
          <View style={s.statsContainer}>
            <View style={[s.statsCard, { borderLeftColor: C.amber, borderLeftWidth: 4 }]}>
              <Text style={s.statsLabel}>Bekleyenler</Text>
              <Text style={[s.statsValue, { color: C.amber }]}>{stats.pendingCount}</Text>
            </View>
            <View style={[s.statsCard, { borderLeftColor: C.emerald, borderLeftWidth: 4 }]}>
              <Text style={s.statsLabel}>Doğrulananlar</Text>
              <Text style={[s.statsValue, { color: C.emerald }]}>{stats.resolvedCount}</Text>
            </View>
            <View style={[s.statsCard, { borderLeftColor: C.primary, borderLeftWidth: 4 }]}>
              <Text style={s.statsLabel}>Toplam Kuyruk</Text>
              <Text style={[s.statsValue, { color: C.primary }]}>{stats.totalCount}</Text>
            </View>
          </View>

          {/* ── Yetersiz Veri Uyarı Banner'ı ─────────────────────────── */}
          {retrainStatus && retrainStatus.totalSamples < MIN_SAMPLES_REQUIRED && retrainStatus.status !== 'training' && (
            <Animated.View entering={FadeInDown.delay(100).duration(600)} style={s.insufficientDataBanner}>
              <View style={s.insufficientDataHeader}>
                <View style={s.insufficientDataIcon}>
                  <Ionicons name="warning" size={20} color="#d97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.insufficientDataTitle}>Yetersiz Eğitim Verisi</Text>
                  <Text style={s.insufficientDataSubtitle}>
                    Model eğitimi için en az {MIN_SAMPLES_REQUIRED} doğrulanmış görsel gereklidir.
                  </Text>
                </View>
              </View>

              {/* Örnek sayısı ilerleme çubuğu */}
              <View style={s.sampleProgressContainer}>
                <View style={s.sampleProgressTrack}>
                  <View
                    style={[
                      s.sampleProgressFill,
                      {
                        width: `${Math.min((retrainStatus.totalSamples / MIN_SAMPLES_REQUIRED) * 100, 100)}%`,
                        backgroundColor: retrainStatus.totalSamples >= MIN_SAMPLES_REQUIRED ? C.emerald : '#f59e0b',
                      },
                    ]}
                  />
                </View>
                <Text style={s.sampleProgressText}>
                  {retrainStatus.totalSamples} / {MIN_SAMPLES_REQUIRED}
                </Text>
              </View>

              <Text style={s.insufficientDataHint}>
                💡 Daha fazla teşhisi inceleyip onaylayarak{' '}
                <Text style={{ fontWeight: '700' }}>
                  {MIN_SAMPLES_REQUIRED - retrainStatus.totalSamples} görsel
                </Text>{' '}
                daha ekleyebilirsiniz.
              </Text>
            </Animated.View>
          )}

          {/* ── Eğitim Durum Paneli ───────────────────────────────────── */}
          {retrainStatus && (
            <Animated.View entering={FadeInDown.duration(600)} style={s.trainingPanel}>
              <View style={s.panelHeader}>
                <Ionicons
                  name={retrainStatus.status === 'training' ? 'cog' : retrainStatus.status === 'error' ? 'alert-circle' : 'bulb'}
                  size={24}
                  color={
                    retrainStatus.status === 'training' ? C.primary
                    : retrainStatus.status === 'error' ? C.rose
                    : C.amber
                  }
                  style={retrainStatus.status === 'training' ? s.spinning : undefined}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.panelTitle}>Yapay Zeka Eğitim Durumu</Text>
                  <Text style={[
                    s.panelSubtitle,
                    retrainStatus.status === 'error' ? { color: C.rose } : undefined,
                  ]}>
                    {retrainStatus.status === 'training'
                      ? `Model eğitiliyor... %${Math.round(retrainStatus.progress * 100)}`
                      : retrainStatus.status === 'success'
                      ? '✓ Eğitim başarıyla tamamlandı'
                      : retrainStatus.status === 'error'
                      ? `⚠ Hata: ${retrainStatus.error ?? 'Eğitim sırasında hata oluştu'}`
                      : 'Model güncel ve hazır'}
                  </Text>
                </View>
                {retrainStatus.status !== 'training' && (
                  <TouchableOpacity
                    style={[
                      s.retrainBtn,
                      (isRetrainingLoading || retrainStatus.totalSamples < MIN_SAMPLES_REQUIRED) ? s.btnDisabled : undefined,
                    ]}
                    onPress={handleRetrain}
                    disabled={isRetrainingLoading || retrainStatus.totalSamples < MIN_SAMPLES_REQUIRED}
                  >
                    {isRetrainingLoading ? (
                      <ActivityIndicator size="small" color={C.white} />
                    ) : (
                      <>
                        <Ionicons
                          name="play"
                          size={16}
                          color={retrainStatus.totalSamples < MIN_SAMPLES_REQUIRED ? '#94a3b8' : C.white}
                        />
                        <Text style={[
                          s.retrainBtnTxt,
                          retrainStatus.totalSamples < MIN_SAMPLES_REQUIRED ? { color: '#94a3b8' } : undefined,
                        ]}>Eğit</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Eğitim İlerleme Çubuğu */}
              {retrainStatus.status === 'training' && (
                <View style={s.progressContainer}>
                  <View style={s.progressBarBg}>
                    <View style={[s.progressBarFill, { width: `${retrainStatus.progress * 100}%` }]} />
                  </View>
                  <Text style={s.progressTxt}>%{Math.round(retrainStatus.progress * 100)}</Text>
                </View>
              )}

              {/* Model Bilgileri */}
              <View style={s.panelFooter}>
                <View style={{ flexDirection: 'column', gap: 6 }}>
                  <View style={s.footerInfo}>
                    <Ionicons name="sparkles-outline" size={15} color={C.emerald} />
                    <Text style={s.footerInfoTxt}>Yeni Görsel: {retrainStatus.currentSamples}</Text>
                  </View>
                  <View style={s.footerInfo}>
                    <Ionicons name="images-outline" size={15} color={C.slateLight} />
                    <Text style={s.footerInfoTxt}>Toplam Görsel: {retrainStatus.totalSamples}</Text>
                  </View>
                </View>
                {retrainStatus.lastTrainedAt && (
                  <View style={[s.footerInfo, { alignSelf: 'flex-end' }]}>
                    <Ionicons name="time-outline" size={15} color={C.slateLight} />
                    <Text style={s.footerInfoTxt}>
                      Son Eğitim: {new Date(retrainStatus.lastTrainedAt).toLocaleDateString('tr-TR')}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* Bekleyen Kuyruk Listesi */}
          <Text style={s.sectionTitle}>İncelenecek Teşhisler ({pendingItems.length})</Text>

          {pendingItems.map((item, index) => (
            <Animated.View key={item.id} entering={FadeInDown.delay(index * 100).duration(500)}>
              <View style={s.itemCard}>
                {/* Sol Kısım: Görsel */}
                <Image
                  source={{ uri: `${CONFIG.DOTNET_BASE_URL}${item.imageUrl}` }}
                  style={s.itemImage}
                  resizeMode="cover"
                />

                {/* Orta Kısım: Detaylar */}
                <View style={s.itemDetails}>
                  <View style={s.badgeRow}>
                    {item.source === 'LowConfidence' ? (
                      <View style={[s.badge, { backgroundColor: C.amberLight }]}>
                        <Ionicons name="alert-circle-outline" size={10} color={C.amber} />
                        <Text style={[s.badgeTxt, { color: C.amber }]}>Düşük Güven</Text>
                      </View>
                    ) : (
                      <View style={[s.badge, { backgroundColor: C.roseLight }]}>
                        <Ionicons name="flag-outline" size={10} color={C.rose} />
                        <Text style={[s.badgeTxt, { color: C.rose }]}>Kullanıcı Bildirimi</Text>
                      </View>
                    )}
                    <Text style={s.itemDate}>
                      {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                    </Text>
                  </View>

                  <Text style={s.itemTitle} numberOfLines={1}>
                    {diseases.find((d) => d.modelLabel === item.predictedDisease)?.name ?? item.predictedDisease}
                  </Text>
                  <Text style={s.itemSubtitle}>Model Skoru: %{Math.round(item.confidence * 100)}</Text>
                </View>

                {/* Sağ Kısım: Butonlar */}
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.actionResolveBtn} onPress={() => handleQuickCorrect(item)} activeOpacity={0.7}>
                    <Ionicons name="checkmark-done" size={18} color={C.emerald} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionEditBtn} onPress={() => setSelectedItem(item)} activeOpacity={0.7}>
                    <Ionicons name="create-outline" size={18} color={C.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionIgnoreBtn} onPress={() => handleIgnore(item)} activeOpacity={0.7}>
                    <Ionicons name="close" size={18} color={C.slateLight} />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          ))}

          {!isLoading && pendingItems.length === 0 && (
            <View style={s.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={64} color={C.emerald} />
              <Text style={s.emptyStateTitle}>Harika! Bekleyen Kayıt Yok</Text>
              <Text style={s.emptyStateSub}>Yapay zekanın zorlandığı veya kullanıcıların bildirdiği tüm teşhisler incelendi.</Text>
            </View>
          )}
        </ScrollView>

        {/* Detay ve Sınıflandırma Modalı */}
        <Modal visible={selectedItem !== null} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              {/* Modal Kapatma Barı */}
              <View style={s.modalDragBar} />

              {/* Modal Header */}
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Teşhisi Düzelt / Doğrula</Text>
                <TouchableOpacity onPress={() => { setSelectedItem(null); setSearchQuery(''); }}>
                  <Ionicons name="close-circle" size={26} color={C.slateLight} />
                </TouchableOpacity>
              </View>

              {selectedItem && (
                <View style={{ flex: 1 }}>
                  {/* Görsel ve Tahmin Bilgisi */}
                  <View style={s.modalDetailsRow}>
                    <Image
                      source={{ uri: `${CONFIG.DOTNET_BASE_URL}${selectedItem.imageUrl}` }}
                      style={s.modalImage}
                      resizeMode="cover"
                    />
                    <View style={s.modalPredictInfo}>
                      <Text style={s.predictLabel}>Yapay Zeka Tahmini:</Text>
                      <Text style={s.predictValue}>
                        {diseases.find((d) => d.modelLabel === selectedItem.predictedDisease)?.name ??
                          selectedItem.predictedDisease}
                      </Text>
                      <Text style={s.predictConf}>Güven Skoru: %{Math.round(selectedItem.confidence * 100)}</Text>
                    </View>
                  </View>

                  {/* Hızlı Doğrulama Kısayol Butonu */}
                  <TouchableOpacity
                    style={s.modalQuickCorrectBtn}
                    onPress={async () => {
                      const item = selectedItem;
                      setSelectedItem(null);
                      const ok = await resolveItem(item.id, item.predictedDisease);
                      if (ok) {
                        Alert.alert('Başarılı', 'Teşhis başarıyla doğru olarak onaylandı.');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-done" size={20} color={C.white} style={{ marginRight: 8 }} />
                    <Text style={s.modalQuickCorrectBtnTxt}>Bu Teşhis Doğru (Doğrula & Onayla)</Text>
                  </TouchableOpacity>

                  {/* Sınıf Arama Filtresi */}
                  <Text style={s.searchLabel}>Doğru Hastalık Sınıfını Seçin</Text>
                  <View style={s.searchBarContainer}>
                    <Ionicons name="search" size={18} color={C.slateLight} />
                    <TextInput
                      style={s.searchBarInput}
                      placeholder="Hastalık adı veya etiket ara..."
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close" size={18} color={C.slateLight} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Hastalık Listesi */}
                  {isResolving ? (
                    <View style={s.resolvingContainer}>
                      <ActivityIndicator size="large" color={C.primary} />
                      <Text style={s.resolvingTxt}>Kaydediliyor ve ML servisine aktarılıyor...</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredDiseases}
                      keyExtractor={(d) => d.id.toString()}
                      contentContainerStyle={s.diseaseList}
                      renderItem={({ item: d }) => (
                        <TouchableOpacity
                          style={[
                            s.diseaseItem,
                            selectedItem.predictedDisease === d.modelLabel ? s.diseaseItemActive : undefined,
                          ]}
                          onPress={() => handleResolve(d.modelLabel)}
                        >
                          <View style={s.diseaseItemIcon}>
                            <Ionicons
                              name="leaf"
                              size={18}
                              color={selectedItem.predictedDisease === d.modelLabel ? C.emerald : C.primary}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.diseaseItemName}>{d.name}</Text>
                            <Text style={s.diseaseItemLabel}>{d.modelLabel}</Text>
                          </View>
                          {selectedItem.predictedDisease === d.modelLabel && (
                            <View style={s.recommendedBadge}>
                              <Text style={s.recommendedBadgeTxt}>AI Önerisi</Text>
                            </View>
                          )}
                          <Ionicons name="chevron-forward" size={16} color={C.slateLight} />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>
              )}
            </View>
          </View>
        </Modal>
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
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: C.slate },
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  
  // Stats
  statsContainer: { flexDirection: 'row', gap: 10, marginVertical: 12 },
  statsCard: {
    flex: 1,
    backgroundColor: C.white,
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statsLabel: { fontSize: 11, fontWeight: '600', color: C.slateLight },
  statsValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4, color: C.slate },

  // Panel
  trainingPanel: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center' },
  panelTitle: { fontSize: 15, fontWeight: 'bold', color: C.slate },
  panelSubtitle: { fontSize: 12, color: C.slateLight, marginTop: 2 },
  retrainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retrainBtnTxt: { color: LIGHT_C.white, fontSize: 12, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },

  // Yetersiz Veri Banner Stilleri
  insufficientDataBanner: {
    backgroundColor: C.warningBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.warningBorder,
    shadowColor: C.amber,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  insufficientDataHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  insufficientDataIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.warningIconBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insufficientDataTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.warningText,
    marginBottom: 2,
  },
  insufficientDataSubtitle: {
    fontSize: 12,
    color: C.warningTextLight,
    lineHeight: 17,
  },
  sampleProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sampleProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.warningBorder,
    overflow: 'hidden',
  },
  sampleProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  sampleProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.warningTextLight,
    minWidth: 40,
    textAlign: 'right',
  },
  insufficientDataHint: {
    fontSize: 12,
    color: C.warningText,
    lineHeight: 18,
  },
  spinning: {
    // Note: React Native style spinning animation is typically done via Animated.timing,
    // but in pure style we can just keep it neat
  },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  progressBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.primaryLight, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4, backgroundColor: C.primary },
  progressTxt: { fontSize: 12, fontWeight: 'bold', color: C.primary },
  panelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 14,
    paddingTop: 12,
  },
  footerInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerInfoTxt: { fontSize: 11, color: C.slateLight, fontWeight: '500' },

  // Section title
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: C.slate, marginBottom: 12, marginTop: 8 },

  // Item list
  itemCard: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  itemImage: { width: 64, height: 64, borderRadius: 12, backgroundColor: C.primaryLight },
  itemDetails: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeTxt: { fontSize: 9, fontWeight: '700' },
  itemDate: { fontSize: 10, color: C.slateLight },
  itemTitle: { fontSize: 14, fontWeight: 'bold', color: C.slate },
  itemSubtitle: { fontSize: 11, color: C.slateLight, marginTop: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, alignSelf: 'flex-end' },
  actionResolveBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.emeraldLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIgnoreBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalQuickCorrectBtn: {
    backgroundColor: C.emerald,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: C.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  modalQuickCorrectBtnTxt: {
    color: LIGHT_C.white,
    fontSize: 14,
    fontWeight: '700',
  },

  // Empty state
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyStateTitle: { fontSize: 16, fontWeight: 'bold', color: C.slate, marginTop: 14 },
  emptyStateSub: { fontSize: 13, color: C.slateLight, textAlign: 'center', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    height: '85%',
  },
  modalDragBar: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: C.slate },
  modalDetailsRow: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  modalImage: { width: 90, height: 90, borderRadius: 14, backgroundColor: C.primaryLight },
  modalPredictInfo: { flex: 1, justifyContent: 'center' },
  predictLabel: { fontSize: 11, color: C.slateLight, fontWeight: '600' },
  predictValue: { fontSize: 15, fontWeight: 'bold', color: C.slate, marginTop: 2 },
  predictConf: { fontSize: 12, color: C.amber, fontWeight: '600', marginTop: 2 },
  
  searchLabel: { fontSize: 13, fontWeight: 'bold', color: C.slate, marginBottom: 8 },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchBarInput: { flex: 1, fontSize: 14, color: C.slate },
  
  resolvingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  resolvingTxt: { fontSize: 13, color: C.slateLight, marginTop: 12, fontWeight: '500' },

  diseaseList: { paddingBottom: 20 },
  diseaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: C.bg,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  diseaseItemActive: { borderColor: C.emerald, backgroundColor: C.emeraldLight + '1A' },
  diseaseItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  diseaseItemName: { fontSize: 14, fontWeight: '700', color: C.slate },
  diseaseItemLabel: { fontSize: 11, color: C.slateLight, marginTop: 1 },
  recommendedBadge: {
    backgroundColor: C.emeraldLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 10,
  },
  recommendedBadgeTxt: { fontSize: 8, color: C.emerald, fontWeight: 'bold' },
});
