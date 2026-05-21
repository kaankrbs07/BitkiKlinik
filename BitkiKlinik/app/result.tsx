import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CONFIG } from '../constants/config';

// Tip tanımlamaları
interface Treatment {
  id: number;
  type: string;
  title: string;
  instructions: string;
}

interface DiseaseData {
  disease: {
    id: number;
    name: string;
    description: string;
  };
  treatments: {
    naturalTreatments: Treatment[];
    chemicalTreatments: Treatment[];
  };
  confidence: number;
  imageUrl: string;
}

const { width } = Dimensions.get('window');

export default function ResultScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'natural' | 'chemical'>('natural');

  let data: DiseaseData | null = null;
  
  try {
    if (params.data) {
      data = JSON.parse(params.data as string) as DiseaseData;
    }
  } catch (e) {
    console.error("Data parse error", e);
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={60} color="#ff3b30" />
        <Text style={styles.errorText}>Hastalık bilgileri yüklenemedi.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Geri Dön</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Güven skoru gösterimi
  const confidencePercent = Math.round(data.confidence * 100);
  const isHealthy = data.disease.name.toLowerCase().includes('healthy');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backIcon} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analiz Sonucu</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Görsel ve Etiket */}
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: `${CONFIG.DOTNET_BASE_URL}${data.imageUrl}` }} 
            style={styles.image}
            resizeMode="cover"
          />
          <View style={[styles.confidenceBadge, { backgroundColor: confidencePercent > 85 ? '#4cd964' : '#ff9500' }]}>
            <Ionicons name="checkmark-circle" size={16} color="white" style={{marginRight: 4}} />
            <Text style={styles.confidenceText}>%{confidencePercent} Güven</Text>
          </View>
        </View>

        {/* Hastalık Bilgieri */}
        <View style={styles.diseaseInfoCard}>
          <View style={styles.diseaseHeader}>
            <Ionicons name={isHealthy ? "leaf" : "warning"} size={28} color={isHealthy ? "#4cd964" : "#ff3b30"} />
            <Text style={styles.diseaseName}>{data.disease.name}</Text>
          </View>
          <Text style={styles.diseaseDescription}>{data.disease.description}</Text>
        </View>

        {/* Tedaviler */}
        {!isHealthy && (
          <View style={styles.treatmentSection}>
            <Text style={styles.sectionTitle}>Tedavi Önerileri</Text>
            
            {/* Tab Butonları */}
            <View style={styles.tabContainer}>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'natural' && styles.tabButtonActiveNatural]} 
                onPress={() => setActiveTab('natural')}
              >
                <Ionicons name="leaf-outline" size={18} color={activeTab === 'natural' ? 'white' : '#4cd964'} />
                <Text style={[styles.tabText, activeTab === 'natural' && styles.tabTextActive]}> Doğal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'chemical' && styles.tabButtonActiveChemical]} 
                onPress={() => setActiveTab('chemical')}
              >
                <Ionicons name="flask-outline" size={18} color={activeTab === 'chemical' ? 'white' : '#ff9500'} />
                <Text style={[styles.tabText, activeTab === 'chemical' && styles.tabTextActive]}> Kimyasal</Text>
              </TouchableOpacity>
            </View>

            {/* Tedavi Listesi */}
            <View style={styles.treatmentList}>
              {activeTab === 'natural' ? (
                data.treatments.naturalTreatments.length > 0 ? (
                  data.treatments.naturalTreatments.map((item, index) => (
                    <TreatmentCard key={item.id} index={index + 1} item={item} color="#4cd964" />
                  ))
                ) : (
                  <Text style={styles.emptyText}>Bu hastalık için kayıtlı doğal tedavi bulunmamaktadır.</Text>
                )
              ) : (
                data.treatments.chemicalTreatments.length > 0 ? (
                  data.treatments.chemicalTreatments.map((item, index) => (
                    <TreatmentCard key={item.id} index={index + 1} item={item} color="#ff9500" />
                  ))
                ) : (
                  <Text style={styles.emptyText}>Bu hastalık için kayıtlı kimyasal tedavi bulunmamaktadır.</Text>
                )
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Tedavi Kartı Bileşeni
function TreatmentCard({ item, index, color }: { item: Treatment, index: number, color: string }) {
  return (
    <View style={styles.treatmentCard}>
      <View style={[styles.treatmentIndexBadge, { backgroundColor: color }]}>
        <Text style={styles.treatmentIndexText}>{index}</Text>
      </View>
      <View style={styles.treatmentCardContent}>
        <Text style={styles.treatmentTitle}>{item.title}</Text>
        <Text style={styles.treatmentInstructions}>{item.instructions}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    // Elevation for Android
    elevation: 3,
    zIndex: 10,
  },
  backIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  imageContainer: {
    width: '100%',
    height: width * 0.75, // 4:3 Aspect Ratio
    position: 'relative',
    backgroundColor: '#eaeaea',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  confidenceBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  confidenceText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  diseaseInfoCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    transform: [{ translateY: -20 }],
  },
  diseaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  diseaseName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginLeft: 10,
    flex: 1,
    flexWrap: 'wrap',
  },
  diseaseDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
  },
  treatmentSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#eef0f2',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabButtonActiveNatural: {
    backgroundColor: '#4cd964',
    shadowColor: '#4cd964',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonActiveChemical: {
    backgroundColor: '#ff9500',
    shadowColor: '#ff9500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontWeight: '600',
    fontSize: 15,
    color: '#888',
  },
  tabTextActive: {
    color: 'white',
  },
  treatmentList: {
    paddingBottom: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    marginTop: 20,
  },
  treatmentCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  treatmentIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  treatmentIndexText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  treatmentCardContent: {
    flex: 1,
  },
  treatmentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  treatmentInstructions: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorText: {
    fontSize: 16,
    color: '#333',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontWeight: 'bold',
  }
});
