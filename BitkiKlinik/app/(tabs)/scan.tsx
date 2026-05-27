import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { CameraView, useCameraPermissions, FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';

const EMERALD = '#10b981';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');

  const cameraRef = useRef<CameraView>(null);

  // Tarama çizgisi animasyonu (kamera görünümünde yukarı aşağı)
  const scanAnim = useRef(new Animated.Value(0)).current;
  // Analiz overlay'i için nabız efekti
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Tarama çizgisi döngüsü — bileşen mount olunca başlar
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  // Analiz sırasında nabız animasyonu
  useEffect(() => {
    if (!isScanning) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isScanning, pulseAnim]);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={64} color={EMERALD} />
          <Text style={styles.permissionTitle}>Kamera İzni Gerekli</Text>
          <Text style={styles.permissionDesc}>
            Bitkilerinizi tarayabilmemiz için kameraya erişim iznine ihtiyacımız var.
          </Text>
          <TouchableOpacity style={styles.buttonMain} onPress={requestPermission}>
            <Text style={styles.buttonText}>İzin Ver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Functions --- //

  const uploadAndAnalyze = async (uri: string) => {
    setIsScanning(true);
    try {
      const formData = new FormData();
      const ext = uri.substring(uri.lastIndexOf('.') + 1);
      (formData as any).append('image', {
        uri,
        name: `plant_scan_${Date.now()}.${ext}`,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });

      const response = await dotnetClient.post('/Diseases/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        router.push({ pathname: '/result', params: { data: JSON.stringify(response.data) } });
        setTimeout(() => setPhotoUri(null), 300);
      }
    } catch (error: any) {
      console.error(error);
      const isNetwork = !error.response || error.message?.includes('Network');
      Alert.alert(
        'Analiz Başarısız',
        error.response?.data?.Message ||
          (isNetwork
            ? 'Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin.'
            : 'Fotoğraf yüklenirken veya analiz edilirken bir hata oluştu.'),
        [{ text: 'Tamam' }]
      );
    } finally {
      setIsScanning(false);
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo) {
        setPhotoUri(photo.uri);
        await uploadAndAnalyze(photo.uri);
      }
    } catch (e) {
      console.error('Fotoğraf çekme hatası', e);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      await uploadAndAnalyze(uri);
    }
  };

  const toggleFacing = () => setFacing(f => (f === 'back' ? 'front' : 'back'));
  const toggleFlash = () => {
    setFlash(f => {
      if (f === 'off') return 'on';
      if (f === 'on') return 'auto';
      return 'off';
    });
  };
  const flashIcon: string =
    flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline';

  // Analiz ekranı
  if (isScanning) {
    return (
      <View style={styles.loadingContainer}>
        {photoUri && (
          <Image source={{ uri: photoUri }} style={styles.previewImageBlur} blurRadius={10} />
        )}
        <Animated.View style={[styles.loadingOverlay, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.scanIconOuter}>
            <Ionicons name="leaf" size={36} color={EMERALD} />
          </View>
          <Text style={styles.loadingTitle}>Yapay Zeka Analiz Ediyor</Text>
          <Text style={styles.loadingSubtitle}>Bitki türü ve hastalık tespiti yapılıyor...</Text>
          {/* Animasyonlu nokta göstergesi */}
          <View style={styles.progressDots}>
            {[0, 1, 2].map(i => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    opacity: scanAnim.interpolate({
                      inputRange: [0, 0.33 * (i + 1), 1],
                      outputRange: [0.3, 1, 0.3],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    );
  }

  // Tarama çizgisinin Y koordinatı
  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 246],
  });

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing={facing} flash={flash}>
        <View style={styles.overlay}>
          {/* Üst kontroller: flaş & kamera çevir */}
          <View style={styles.topControls}>
            <TouchableOpacity style={styles.topButton} onPress={toggleFlash}>
              <Ionicons name={flashIcon as any} size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.topLabel}>
              <Text style={styles.topLabelText}>Bitki Tarayıcı</Text>
            </View>
            <TouchableOpacity style={styles.topButton} onPress={toggleFacing}>
              <Ionicons name="camera-reverse-outline" size={22} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tarama çerçevesi + animasyonlu çizgi */}
          <View style={styles.frameWrapper}>
            <View style={styles.scanFrame}>
              {/* Köşe işaretleri */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {/* Hareketli tarama çizgisi */}
              <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
            </View>
            <Text style={styles.instructionText}>Bitki yaprağını çerçevenin içine alın</Text>
          </View>

          {/* Alt kontroller */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={styles.iconButton} onPress={pickImage}>
              <Ionicons name="images" size={28} color="white" />
              <Text style={styles.iconLabel}>Galeri</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
              <View style={styles.captureRing}>
                <View style={styles.captureInner} />
              </View>
            </TouchableOpacity>

            <View style={{ width: 64, alignItems: 'center' }}>
              <View style={[styles.iconButton, { backgroundColor: 'rgba(16,185,129,0.25)' }]}>
                <Ionicons name="leaf" size={28} color={EMERALD} />
              </View>
            </View>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const FRAME_SIZE = 250;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0f172a',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  message: { textAlign: 'center', paddingBottom: 10, color: 'white' },
  camera: { flex: 1 },
  buttonMain: {
    backgroundColor: EMERALD,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 10,
    borderRadius: 24,
  },
  topLabel: {
    backgroundColor: 'rgba(16,185,129,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.5)',
  },
  topLabelText: { color: 'white', fontSize: 13, fontWeight: '600' },
  frameWrapper: { alignItems: 'center', marginTop: 20 },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
    position: 'relative',
  },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: EMERALD, borderRadius: 4 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: EMERALD,
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  instructionText: {
    color: 'white',
    marginTop: 20,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 48,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingTop: 20,
  },
  iconButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 30,
    alignItems: 'center',
  },
  iconLabel: { color: 'white', fontSize: 10, marginTop: 4, fontWeight: '600' },
  captureButton: { alignItems: 'center', justifyContent: 'center' },
  captureRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  previewImageBlur: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  loadingOverlay: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    padding: 36,
    borderRadius: 24,
    alignItems: 'center',
    width: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  scanIconOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  loadingSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  progressDots: { flexDirection: 'row', marginTop: 20, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: EMERALD },
});
