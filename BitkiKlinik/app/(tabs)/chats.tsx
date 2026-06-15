import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';
import { CONFIG } from '../../constants/config';
import { API_ROUTES } from '../../constants/api-routes';

const { width } = Dimensions.get('window');

const LIGHT_COLORS = {
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
  border: '#e2e8f0',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
};

const DARK_COLORS = {
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
  border: '#334155',
  danger: '#f87171',
  dangerLight: '#7f1d1d',
};

const COLORS = LIGHT_COLORS;

const generateUniqueId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

interface ChatSession {
  sessionId: string;
  scanId: number | null;
  plantName: string;
  diseaseName: string;
  lastMessage: string;
  lastMessageDate: string;
  isHealthy: boolean;
  imageUrl: string | null;
}

export default function ChatsScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const response = await dotnetClient.get(API_ROUTES.CHAT_SESSIONS);
      setSessions(response.data);
    } catch (err: any) {
      console.error('Failed to fetch chat sessions:', err);
      setError('Sohbet geçmişiniz yüklenemedi. Lütfen sunucu bağlantısını kontrol edin.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      await dotnetClient.delete(`/Chat/session/${sessionId}`);
      await fetchSessions(false);
      Alert.alert('Başarılı', 'Sohbet geçmişi başarıyla silindi.');
    } catch (err: any) {
      console.error('Failed to delete chat session:', err);
      Alert.alert('Hata', 'Sohbet silinirken bir sorun oluştu. Lütfen tekrar deneyin.');
      setIsLoading(false);
    }
  };

  const confirmDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Sohbeti Sil',
      'Bu sohbet geçmişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Evet, Sil', style: 'destructive', onPress: () => handleDeleteSession(sessionId) }
      ]
    );
  };

  // Tab her odaklandığında listeyi güncelle (Canlı güncel veri için)
  useFocusEffect(
    useCallback(() => {
      fetchSessions(sessions.length === 0);
    }, [])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSessions(false);
  };

  const formatDate = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoDate;
    }
  };

  const renderSessionItem = ({ item }: { item: ChatSession }) => {
    const hasImage = !!item.imageUrl;
    const imageUri = hasImage ? `${CONFIG.DOTNET_BASE_URL}${item.imageUrl}` : null;
    const isGeneral = item.scanId === null;

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        activeOpacity={0.7}
        onPress={() => router.push({
          pathname: '/chat',
          params: { 
            scanId: item.scanId ? String(item.scanId) : '',
            sessionId: item.sessionId
          }
        })}
      >
        {/* Sol Resim/Simge Alanı */}
        <View style={styles.imageContainer}>
          {isGeneral ? (
            <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.emerald }]}>
              <Ionicons name="chatbubbles" size={24} color={COLORS.white} />
            </View>
          ) : hasImage && imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: item.isHealthy ? COLORS.emerald : COLORS.danger }]}>
              <Ionicons name="leaf" size={24} color={COLORS.white} />
            </View>
          )}
        </View>

        {/* Orta Detay Alanı */}
        <View style={styles.detailsContainer}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.plantTitle} numberOfLines={1}>
              {item.plantName}
            </Text>
            {!isGeneral && (
              <View style={[
                styles.statusBadge,
                { backgroundColor: item.isHealthy ? COLORS.emeraldLight : COLORS.dangerLight }
              ]}>
                <Text style={[styles.statusText, { color: item.isHealthy ? COLORS.emerald : COLORS.danger }]}>
                  {item.isHealthy ? 'Sağlıklı' : 'Riskli'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.diseaseSubtitle} numberOfLines={1}>
            {item.diseaseName}
          </Text>

          <Text style={styles.lastMessageText} numberOfLines={1}>
            {item.lastMessage}
          </Text>

          <Text style={styles.dateText}>
            {formatDate(item.lastMessageDate)}
          </Text>
        </View>

        {/* Sağ İkonlar */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={() => confirmDeleteSession(item.sessionId)}
            style={{ padding: 8, marginRight: 4 }}
            activeOpacity={0.6}
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={20} color={COLORS.slateLight} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Sohbet Geçmişi</Text>
          <Text style={styles.headerSubtitle}>Yapay Zeka Hekimi Görüşmeleriniz</Text>
        </View>
        <TouchableOpacity 
          style={styles.generalChatBtn} 
          activeOpacity={0.8}
          onPress={() => router.push({
            pathname: '/chat',
            params: { 
              scanId: '',
              sessionId: generateUniqueId()
            }
          })}
        >
          <Ionicons name="add-circle" size={22} color={COLORS.emerald} style={{ marginRight: 4 }} />
          <Text style={styles.generalChatBtnText}>Yeni Sohbet</Text>
        </TouchableOpacity>
      </View>

      {/* Ana Gövde */}
      {isLoading && sessions.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.emerald} />
          <Text style={styles.loadingText}>Sohbetler yükleniyor...</Text>
        </View>
      ) : error && sessions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline" size={60} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchSessions()} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : sessions.length > 0 ? (
        <FlatList
          data={sessions}
          keyExtractor={(item, index) => item.sessionId}
          renderItem={renderSessionItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.emerald}
              colors={[COLORS.emerald]}
            />
          }
        />
      ) : (
        /* Boş Durum */
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="chatbubble-ellipses-outline" size={64} color={COLORS.slateLight} />
          </View>
          <Text style={styles.emptyTitle}>Sohbet Bulunamadı</Text>
          <Text style={styles.emptyDescription}>
            Bitki teşhisleriniz ve tedaviler hakkında henüz Yapay Zeka Hekimi ile görüşme başlatmadınız.
          </Text>
          <TouchableOpacity 
            style={styles.emptyActionBtn} 
            activeOpacity={0.85}
            onPress={() => router.push({
              pathname: '/chat',
              params: { 
                scanId: '',
                sessionId: generateUniqueId()
              }
            })}
          >
            <Ionicons name="chatbubbles-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
            <Text style={styles.emptyActionText}>Genel Yapay Zeka Hekimine Sor</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function getStyles(COLORS: typeof LIGHT_COLORS) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.slate,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.slateLight,
    marginTop: 2,
    fontWeight: '500',
  },
  generalChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  generalChatBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.slate,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  imageContainer: {
    marginRight: 16,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsContainer: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  plantTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.slate,
    maxWidth: width * 0.45,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  diseaseSubtitle: {
    fontSize: 13,
    color: COLORS.slateLight,
    fontWeight: '600',
    marginTop: 2,
  },
  lastMessageText: {
    fontSize: 13,
    color: '#475569',
    marginTop: 6,
    lineHeight: 18,
  },
  dateText: {
    fontSize: 11,
    color: COLORS.slateLight,
    marginTop: 6,
    alignSelf: 'flex-start',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: COLORS.slateLight,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.danger,
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
  },
  retryButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.slate,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: COLORS.slateLight,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyActionText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
});
}
