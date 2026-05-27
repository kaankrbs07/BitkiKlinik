import React, { useState, useEffect, useCallback } from 'react';
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
  TextInput,
  RefreshControl,
  FlatList,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  FadeInRight,
  Layout
} from 'react-native-reanimated';
import { dotnetClient } from '../../api/client';
import { CONFIG } from '../../constants/config';
import { useAuthStore } from '../../store/useAuthStore';

const { width } = Dimensions.get('window');

// Premium Renk Paleti
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
  border: '#e2e8f0',
  purple: '#6366f1',
  purpleLight: '#e0e7ff',
};

// Çip Kategorileri
const CATEGORIES = [
  { id: 'all', label: 'Tümü', icon: 'apps-outline' },
  { id: 'tomato', label: 'Domates', icon: 'nutrition-outline' },
  { id: 'potato', label: 'Patates', icon: 'leaf-outline' },
  { id: 'pepper', label: 'Biber', icon: 'flame-outline' },
  { id: 'healthy', label: 'Sağlıklı', icon: 'checkmark-circle-outline' },
  { id: 'diseased', label: 'Hastalıklar', icon: 'alert-circle-outline' },
];

// Tarih Formatlayıcı
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoDate;
  }
}

// Interfaces
interface Treatment {
  id: number;
  type: string;
  title: string;
  instructions: string;
}

interface Disease {
  id: number;
  name: string;
  description: string;
  modelLabel: string;
  treatments: {
    naturalTreatments: Treatment[];
    chemicalTreatments: Treatment[];
  };
}

interface ScanHistoryItem {
  id: number;
  plantName: string;
  diseaseName: string;
  confidence: number;
  imageUrl: string | null;
  isHealthy: boolean;
  scanDate: string;
}

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isAuthenticated } = useAuthStore();

  // Tab State: 'encyclopedia' (Ansiklopedi) veya 'history' (Teşhis Geçmişi)
  const [activeTab, setActiveTab] = useState<'encyclopedia' | 'history'>('encyclopedia');

  useEffect(() => {
    if (params.tab === 'history') {
      setActiveTab('history');
    }
  }, [params.tab]);
  
  // Arama ve Kategori Filtresi
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Veri State'leri
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null); // Hangi geçmiş kaydının yüklendiğini tutar

  // Geçmiş sayfalama durumu
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const HISTORY_PAGE_SIZE = 20;

  // Genişleyen Ansiklopedi Kartı ID'si
  const [expandedDiseaseId, setExpandedDiseaseId] = useState<number | null>(null);
  // Kart içi tedavi sekmesi: 'natural' | 'chemical'
  const [cardTreatmentTab, setCardTreatmentTab] = useState<'natural' | 'chemical'>('natural');

  // --- Veri Çekme Fonksiyonları --- //

  const fetchEncyclopedia = async () => {
    try {
      const response = await dotnetClient.get('/Diseases');
      setDiseases(response.data || []);
    } catch (e) {
      console.error('Ansiklopedi yüklenirken hata:', e);
    }
  };

  const fetchHistory = async (page = 1, append = false) => {
    try {
      const response = await dotnetClient.get(`/Dashboard/history?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`);
      const newScans: ScanHistoryItem[] = response.data?.data || [];
      setScans(prev => (append ? [...prev, ...newScans] : newScans));
      setHistoryHasMore(newScans.length === HISTORY_PAGE_SIZE);
      setHistoryPage(page);
    } catch (e) {
      console.error('Geçmiş yükleniırken hata:', e);
    }
  };

  const loadMoreHistory = async () => {
    if (historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    await fetchHistory(historyPage + 1, true);
    setHistoryLoadingMore(false);
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setHistoryPage(1);
    setHistoryHasMore(true);
    await Promise.all([fetchEncyclopedia(), fetchHistory(1, false)]);
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  // --- Teşhis Geçmişinden Result Ekranına Gitme --- //
  const handleHistoryItemPress = async (item: ScanHistoryItem) => {
    setActionLoading(item.id);
    try {
      // Hastalık adına göre detaylı bilgiyi ve güncel tedavileri getir
      const response = await dotnetClient.get(`/Diseases/by-name/${encodeURIComponent(item.diseaseName)}`);
      
      if (response.data) {
        // Orijinal teşhisteki fotoğrafı ve güven skorunu ekleyerek Result DTO'su oluştur
        const resultData = {
          disease: response.data.disease,
          treatments: response.data.treatments,
          confidence: item.confidence,
          imageUrl: item.imageUrl,
          scanId: item.id
        };

        router.push({
          pathname: '/result',
          params: { data: JSON.stringify(resultData) }
        });
      }
    } catch (error: any) {
      console.error('Teşhis detayı yüklenemedi:', error);
      Alert.alert(
        'Hata',
        error.response?.data?.message || 'Teşhis detayları yüklenirken bir sorun oluştu.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  // --- Filtreleme Mantığı --- //

  const getFilteredDiseases = () => {
    return diseases.filter(d => {
      // Arama Filtresi
      const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            d.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Kategori Filtresi
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'tomato') return d.name.toLowerCase().includes('tomato') || d.name.toLowerCase().includes('domates');
      if (selectedCategory === 'potato') return d.name.toLowerCase().includes('potato') || d.name.toLowerCase().includes('patates');
      if (selectedCategory === 'pepper') return d.name.toLowerCase().includes('pepper') || d.name.toLowerCase().includes('biber');
      if (selectedCategory === 'healthy') return d.name.toLowerCase().includes('healthy') || d.name.toLowerCase().includes('sağlıklı');
      if (selectedCategory === 'diseased') return !d.name.toLowerCase().includes('healthy') && !d.name.toLowerCase().includes('sağlıklı');

      return true;
    });
  };

  const getFilteredScans = () => {
    return scans.filter(s => {
      // Arama Filtresi
      const matchesSearch = s.plantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.diseaseName.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Kategori Filtresi
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'tomato') return s.plantName.toLowerCase().includes('tomato') || s.plantName.toLowerCase().includes('domates') || s.diseaseName.toLowerCase().includes('domates');
      if (selectedCategory === 'potato') return s.plantName.toLowerCase().includes('potato') || s.plantName.toLowerCase().includes('patates') || s.diseaseName.toLowerCase().includes('patates');
      if (selectedCategory === 'pepper') return s.plantName.toLowerCase().includes('pepper') || s.plantName.toLowerCase().includes('biber') || s.diseaseName.toLowerCase().includes('biber');
      if (selectedCategory === 'healthy') return s.isHealthy;
      if (selectedCategory === 'diseased') return !s.isHealthy;

      return true;
    });
  };

  const filteredDiseases = getFilteredDiseases();
  const filteredScans = getFilteredScans();

  // --- Render Fonksiyonları --- //

  // Ansiklopedi Kart Elemanı (Accordion)
  const renderDiseaseCard = ({ item, index }: { item: Disease; index: number }) => {
    const isExpanded = expandedDiseaseId === item.id;
    const isHealthy = item.name.toLowerCase().includes('healthy') || item.name.toLowerCase().includes('sağlıklı');

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 80).duration(500)}
        layout={Layout.springify()}
        style={[styles.card, isExpanded && styles.expandedCard]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            setExpandedDiseaseId(isExpanded ? null : item.id);
            setCardTreatmentTab('natural'); // Reset inner tab when toggle
          }}
          style={styles.cardHeader}
        >
          <View style={[styles.cardIconBox, { backgroundColor: isHealthy ? COLORS.emeraldLight : COLORS.dangerLight }]}>
            <Ionicons
              name={isHealthy ? 'leaf' : 'bug'}
              size={24}
              color={isHealthy ? COLORS.emerald : COLORS.danger}
            />
          </View>
          <View style={styles.cardHeaderTitle}>
            <Text style={styles.diseaseNameText}>{item.name}</Text>
            <Text style={styles.diseaseLabelSub}>{isHealthy ? 'Sağlıklı Bitki' : 'Hastalık Belirtisi'}</Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={COLORS.slateLight}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.cardContent}>
            <View style={styles.divider} />
            <Text style={styles.sectionHeading}>Açıklama</Text>
            <Text style={styles.descriptionText}>{item.description}</Text>

            {!isHealthy && (
              <View style={styles.treatmentsBox}>
                <View style={styles.divider} />
                <Text style={styles.sectionHeading}>Tedavi Yöntemleri</Text>

                {/* Kart İçi Tedavi Sekmeleri */}
                <View style={styles.innerTabContainer}>
                  <TouchableOpacity
                    style={[
                      styles.innerTabButton,
                      cardTreatmentTab === 'natural' && styles.innerTabActiveNatural
                    ]}
                    onPress={() => setCardTreatmentTab('natural')}
                  >
                    <Ionicons
                      name="leaf-outline"
                      size={16}
                      color={cardTreatmentTab === 'natural' ? COLORS.white : COLORS.emerald}
                    />
                    <Text
                      style={[
                        styles.innerTabText,
                        cardTreatmentTab === 'natural' && styles.innerTabActiveText
                      ]}
                    >
                      Doğal Tedavi
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.innerTabButton,
                      cardTreatmentTab === 'chemical' && styles.innerTabActiveChemical
                    ]}
                    onPress={() => setCardTreatmentTab('chemical')}
                  >
                    <Ionicons
                      name="flask-outline"
                      size={16}
                      color={cardTreatmentTab === 'chemical' ? COLORS.white : COLORS.warning}
                    />
                    <Text
                      style={[
                        styles.innerTabText,
                        cardTreatmentTab === 'chemical' && styles.innerTabActiveText
                      ]}
                    >
                      Kimyasal Tedavi
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Tedavi Listesi Gösterimi */}
                <View style={styles.innerTreatmentList}>
                  {cardTreatmentTab === 'natural' ? (
                    item.treatments?.naturalTreatments?.length > 0 ? (
                      item.treatments.naturalTreatments.map((treat, idx) => (
                        <View key={treat.id} style={styles.treatmentItem}>
                          <Text style={[styles.treatmentBadgeIndex, { backgroundColor: COLORS.emerald }]}>
                            {idx + 1}
                          </Text>
                          <View style={styles.treatmentItemTextContainer}>
                            <Text style={styles.treatmentItemTitle}>{treat.title}</Text>
                            <Text style={styles.treatmentItemInstructions}>{treat.instructions}</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyTreatmentText}>Bu hastalık için doğal tedavi önerisi kayıtlı değil.</Text>
                    )
                  ) : (
                    item.treatments?.chemicalTreatments?.length > 0 ? (
                      item.treatments.chemicalTreatments.map((treat, idx) => (
                        <View key={treat.id} style={styles.treatmentItem}>
                          <Text style={[styles.treatmentBadgeIndex, { backgroundColor: COLORS.warning }]}>
                            {idx + 1}
                          </Text>
                          <View style={styles.treatmentItemTextContainer}>
                            <Text style={styles.treatmentItemTitle}>{treat.title}</Text>
                            <Text style={styles.treatmentItemInstructions}>{treat.instructions}</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyTreatmentText}>Bu hastalık için kimyasal tedavi önerisi kayıtlı değil.</Text>
                    )
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    );
  };

  // Teşhis Geçmişi Kart Elemanı
  const renderHistoryCard = ({ item, index }: { item: ScanHistoryItem; index: number }) => {
    const formattedDate = formatDate(item.scanDate);
    const confidencePct = Math.round(item.confidence * 100);
    const isHealthy = item.isHealthy;
    const isCurrentLoading = actionLoading === item.id;

    // Backend resim URL'ini tamamlama
    const imageUri = item.imageUrl
      ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${CONFIG.DOTNET_BASE_URL}${item.imageUrl}`)
      : null;

    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(500)}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleHistoryItemPress(item)}
          disabled={isCurrentLoading}
          style={styles.historyCard}
        >
          {/* Sol Görsel Alanı */}
          <View style={styles.historyImageContainer}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.historyImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.historyPlaceholderImage, { backgroundColor: isHealthy ? COLORS.emeraldLight : COLORS.dangerLight }]}>
                <Ionicons
                  name={isHealthy ? 'leaf-outline' : 'alert-circle-outline'}
                  size={20}
                  color={isHealthy ? COLORS.emerald : COLORS.danger}
                />
              </View>
            )}
            
            {/* Status Pill on Thumbnail */}
            <View style={[styles.miniStatusBadge, { backgroundColor: isHealthy ? COLORS.emerald : COLORS.danger }]}>
              <Ionicons
                name={isHealthy ? 'checkmark' : 'close'}
                size={10}
                color={COLORS.white}
              />
            </View>
          </View>

          {/* Orta Bilgiler */}
          <View style={styles.historyTextContainer}>
            <Text style={styles.historyPlantName} numberOfLines={1}>
              {item.plantName}
            </Text>
            <Text style={styles.historyDiseaseName} numberOfLines={1}>
              {item.diseaseName}
            </Text>
            <Text style={styles.historyDateText}>
              {formattedDate}
            </Text>
          </View>

          {/* Sağ Güven Skoru & Detay Butonu */}
          <View style={styles.historyRightContainer}>
            {isCurrentLoading ? (
              <ActivityIndicator color={COLORS.emerald} size="small" />
            ) : (
              <>
                <View style={[
                  styles.confidencePill,
                  { backgroundColor: item.confidence >= CONFIG.ACTIVE_LEARNING_THRESHOLD ? COLORS.emeraldLight : COLORS.dangerLight }
                ]}>
                  <Text style={[
                    styles.confidencePillText,
                    { color: item.confidence >= CONFIG.ACTIVE_LEARNING_THRESHOLD ? COLORS.emerald : COLORS.danger }
                  ]}>
                    %{confidencePct}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.slateLight}
                  style={{ marginTop: 8 }}
                />
              </>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        
        {/* Header Title */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Keşfet & Bilgi</Text>
          <Text style={styles.headerSubtitle}>Bitki hastalıkları kütüphanesi ve tarama geçmişi</Text>
        </View>

        {/* Segmented Tab (Segment Control) */}
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'encyclopedia' && styles.segmentActiveButton]}
            onPress={() => setActiveTab('encyclopedia')}
          >
            <Ionicons
              name="book"
              size={18}
              color={activeTab === 'encyclopedia' ? COLORS.emerald : COLORS.slateLight}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, activeTab === 'encyclopedia' && styles.segmentActiveText]}>
              Tıbbi Rehber
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'history' && styles.segmentActiveButton]}
            onPress={() => setActiveTab('history')}
          >
            <Ionicons
              name="time"
              size={18}
              color={activeTab === 'history' ? COLORS.emerald : COLORS.slateLight}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, activeTab === 'history' && styles.segmentActiveText]}>
              Teşhis Geçmişi
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.slateLight} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={activeTab === 'encyclopedia' ? "Hastalık veya bitki ara..." : "Teşhis edilen bitki veya hastalığı ara..."}
              placeholderTextColor={COLORS.slateLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.slateLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category Horizontal Filter */}
        <View style={{ marginBottom: 12 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={16}
                    color={isSelected ? COLORS.white : COLORS.slate}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelSelected]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Dynamic Lists */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.emerald} />
            <Text style={styles.loadingText}>Bitki Verileri Çekiliyor...</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {activeTab === 'encyclopedia' ? (
              // ──────── ANSİKLOPEDİ SEKMESİ RENDER ────────
              filteredDiseases.length > 0 ? (
                <FlatList
                  data={filteredDiseases}
                  keyExtractor={(item) => `dis_${item.id}`}
                  renderItem={renderDiseaseCard}
                  contentContainerStyle={styles.listPadding}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={COLORS.emerald}
                    />
                  }
                />
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="search-outline" size={64} color={COLORS.slateLight} />
                  <Text style={styles.emptyStateTitle}>Hastalık Bulunamadı</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Arama kriterlerinize veya kategori seçiminize uygun bir bitki hastalığı bulunamadı.
                  </Text>
                </View>
              )
            ) : (
              // ──────── TEŞHİS GEÇMİŞİ SEKMESİ RENDER ────────
              !isAuthenticated ? (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="lock-closed-outline" size={64} color={COLORS.slateLight} />
                  <Text style={styles.emptyStateTitle}>Giriş Gerekli</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Teşhis geçmişinizi görebilmek ve yönetebilmek için sisteme giriş yapmış olmanız gerekmektedir.
                  </Text>
                </View>
              ) : filteredScans.length > 0 ? (
                <FlatList
                  data={filteredScans}
                  keyExtractor={(item) => `scan_${item.id}`}
                  renderItem={renderHistoryCard}
                  contentContainerStyle={styles.listPadding}
                  showsVerticalScrollIndicator={false}
                  onEndReached={loadMoreHistory}
                  onEndReachedThreshold={0.3}
                  ListFooterComponent={
                    historyLoadingMore ? (
                      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                        <ActivityIndicator color={COLORS.emerald} size="small" />
                      </View>
                    ) : null
                  }
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={COLORS.emerald}
                    />
                  }
                />
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="leaf-outline" size={64} color={COLORS.slateLight} />
                  <Text style={styles.emptyStateTitle}>Tarama Kaydı Bulunmuyor</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Henüz yaptığınız bir bitki tarama kaydı bulunmuyor veya aramanızla eşleşen bir kayıt yok.
                  </Text>
                </View>
              )
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.slate,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.slateLight,
    marginTop: 4,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 4,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  segmentActiveButton: {
    backgroundColor: COLORS.white,
    shadowColor: COLORS.slate,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.slateLight,
  },
  segmentActiveText: {
    color: COLORS.slate,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.slate,
  },
  categoryScroll: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaeef2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  categoryChipSelected: {
    backgroundColor: COLORS.emerald,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.slate,
  },
  categoryLabelSelected: {
    color: COLORS.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.slateLight,
    marginTop: 12,
    fontSize: 14,
  },
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  expandedCard: {
    borderColor: '#cbd5e1',
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderTitle: {
    flex: 1,
    marginLeft: 12,
  },
  diseaseNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.slate,
  },
  diseaseLabelSub: {
    fontSize: 12,
    color: COLORS.slateLight,
    marginTop: 2,
  },
  cardContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.slate,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.slateLight,
  },
  treatmentsBox: {
    marginTop: 4,
  },
  innerTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  innerTabButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  innerTabActiveNatural: {
    backgroundColor: COLORS.emerald,
  },
  innerTabActiveChemical: {
    backgroundColor: COLORS.warning,
  },
  innerTabText: {
    fontWeight: '600',
    fontSize: 13,
    color: COLORS.slateLight,
  },
  innerTabActiveText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  innerTreatmentList: {
    backgroundColor: '#fafbfc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  treatmentItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  treatmentBadgeIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 20,
    marginRight: 10,
    marginTop: 2,
  },
  treatmentItemTextContainer: {
    flex: 1,
  },
  treatmentItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.slate,
    marginBottom: 4,
  },
  treatmentItemInstructions: {
    fontSize: 13,
    color: COLORS.slateLight,
    lineHeight: 18,
  },
  emptyTreatmentText: {
    fontSize: 13,
    color: COLORS.slateLight,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  historyImageContainer: {
    position: 'relative',
    width: 60,
    height: 60,
  },
  historyImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
  },
  historyPlaceholderImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniStatusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTextContainer: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  historyPlantName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.slate,
  },
  historyDiseaseName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.slateLight,
    marginTop: 2,
  },
  historyDateText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  historyRightContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  confidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidencePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.slate,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: COLORS.slateLight,
    textAlign: 'center',
    lineHeight: 20,
  },
});
