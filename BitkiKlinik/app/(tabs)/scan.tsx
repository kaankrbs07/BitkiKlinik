import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    // İzinler yükleniyor
    return <View />;
  }

  if (!permission.granted) {
    // Kamera izni reddedilmiş veya henüz istenmemiş
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Bitkilerinizi tarayabilmemiz için kameraya erişim iznine ihtiyacımız var.</Text>
        <TouchableOpacity style={styles.buttonMain} onPress={requestPermission}>
          <Text style={styles.buttonText}>İzin Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Functions --- //

  // Resmi analiz için .NET API'ye gönder (.NET arka planda Python'a bağlayıp veriyi döndürüyor)
  const uploadAndAnalyze = async (uri: string) => {
    setIsScanning(true);
    try {
      const formData = new FormData();
      // get file extension roughly
      const ext = uri.substring(uri.lastIndexOf('.') + 1);
      
      // React Native requires this format for file uploads via FormData
      (formData as any).append('image', {
        uri: uri,
        name: `plant_scan_${Date.now()}.${ext}`,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });

      // Çağrı .NET'e gidiyor, Python analizini yapıp Treatment ile dönüyor.
      const response = await dotnetClient.post('/Diseases/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Eğer başarılı olursa Result ekranına yönlendir
      if (response.data) {
        router.push({
          pathname: '/result',
          params: { data: JSON.stringify(response.data) }
        });
        // Navigasyon tamamlandıktan sonra temizle; erken temizlemek
        // yükleme overlay'inin flaş yapmasına neden olur.
        setTimeout(() => setPhotoUri(null), 300);
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert(
        "Hata",
        error.response?.data?.Message || "Fotoğraf yüklenirken veya analiz edilirken bir hata oluştu."
      );
      // Hata durumunda da önizlemeyi koru; kullanıcı tekrar deneyebilir.
    } finally {
      setIsScanning(false);
    }
  };

  // Fotoğraf Çek
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (photo) {
          setPhotoUri(photo.uri);
          uploadAndAnalyze(photo.uri);
        }
      } catch (e) {
        console.error("Fotoğraf çekme hatası", e);
      }
    }
  };

  // Galeriden Seç
  const pickImage = async () => {
    // İzin kontrolünü expo-image-picker default yapıyor, ama manuel de yapılabilir
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1], // Kare zorla (AI modeli 224x224 kare algılıyor genelde)
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      uploadAndAnalyze(uri);
    }
  };

  // Yükleniyor Ekranı (Analiz Sırasında)
  if (isScanning) {
    return (
      <View style={styles.loadingContainer}>
        {photoUri && (
          <Image source={{ uri: photoUri }} style={styles.previewImageBlur} blurRadius={10} />
        )}
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingTitle}>Yapay Zeka Analiz Ediyor...</Text>
          <Text style={styles.loadingSubtitle}>Bitki türü ve hastalık tespiti yapılıyor</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="back">
        {/* Güvenli alan ve frame buraya çizilebilir */}
        <View style={styles.overlay}>
          <View style={styles.frameWrapper}>
            <View style={styles.scanFrame} />
            <Text style={styles.instructionText}>Bitki yaprağını çerçevenin ortasına hizalayın</Text>
          </View>
          
          {/* Alt Butonlar */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={styles.iconButton} onPress={pickImage}>
              <Ionicons name="images" size={30} color="white" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
              <View style={styles.captureInnerRounded} />
            </TouchableOpacity>

            {/* Simetri için boşluk */}
            <View style={{ width: 50 }} />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'black'
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    color: 'white'
  },
  camera: {
    flex: 1,
  },
  buttonMain: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 40,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold'
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    paddingVertical: 40,
  },
  frameWrapper: {
    alignItems: 'center',
    marginTop: 80,
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)'
  },
  instructionText: {
    color: 'white',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  iconButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
    borderRadius: 30,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInnerRounded: {
    width: 65,
    height: 65,
    borderRadius: 35,
    backgroundColor: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  previewImageBlur: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  loadingOverlay: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loadingTitle: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingSubtitle: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  }
});
