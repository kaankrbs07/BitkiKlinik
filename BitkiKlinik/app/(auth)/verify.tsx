import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';
import { showError } from '../../utils/errorHandler';

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // 15 dakikalık geri sayım (900 saniye)
  const [expiryTime, setExpiryTime] = useState<number>(Date.now() + 900 * 1000);
  const [timeLeft, setTimeLeft] = useState(900);

  useEffect(() => {
    // İlk render'da kalan süreyi hesapla
    const remaining = Math.max(0, Math.round((expiryTime - Date.now()) / 1000));
    setTimeLeft(remaining);

    const interval = setInterval(() => {
      const rem = Math.max(0, Math.round((expiryTime - Date.now()) / 1000));
      setTimeLeft(rem);
      if (rem <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiryTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerify = async () => {
    if (!code || code.length < 6) {
      Alert.alert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin.');
      return;
    }

    if (timeLeft <= 0) {
      Alert.alert('Süre Doldu', 'Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.');
      return;
    }

    setIsLoading(true);
    try {
      await dotnetClient.post('/Auth/verify-email', { email, code });
      
      Alert.alert(
        'Tebrikler 🎉', 
        'Hesabınız başarıyla doğrulandı. Bitki Klinik\'e hoş geldiniz!',
        [{ 
          text: 'Uygulamaya Git', 
          onPress: () => {
            useAuthStore.getState().setIsVerified(true);
          } 
        }]
      );
    } catch (error: any) {
      console.error(error);
      showError(error, { title: 'Doğrulama Başarısız' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      Alert.alert('Hata', 'E-posta adresi eksik. Giriş veya kayıt ekranından tekrar deneyin.');
      return;
    }

    setIsResending(true);
    try {
      const response = await dotnetClient.post('/Auth/resend-code', { email });
      Alert.alert(
        'Başarılı',
        response.data?.message || response.data?.Message || 'Yeni doğrulama kodu başarıyla gönderildi.'
      );
      // Geri sayım sayacını sıfırla
      setExpiryTime(Date.now() + 900 * 1000);
      setTimeLeft(900);
    } catch (error: any) {
      console.error(error);
      showError(error, { title: 'Kod Gönderilemedi' });
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    // Kilit mantığının kısırdöngü yapmaması için güvenli çıkış yapılır
    useAuthStore.getState().logout();
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="mail-unread-outline" size={80} color="#ff9500" />
        </View>

        <Text style={styles.title}>E-posta Doğrulama</Text>
        <Text style={styles.subtitle}>
          {email} adresine gönderdiğimiz doğrulama kodunu aşağıya girin.
        </Text>

        {/* Premium Geri Sayım Göstergesi */}
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={20} color={timeLeft > 60 ? '#ff9500' : '#ff3b30'} />
          <Text style={[styles.timerText, timeLeft <= 60 && styles.timerAlertText]}>
            Kalan Süre: {formatTime(timeLeft)}
          </Text>
        </View>

        {timeLeft === 0 && (
          <Text style={styles.expiredText}>
            Doğrulama kodunun geçerlilik süresi doldu. Lütfen yeni bir kod isteyin.
          </Text>
        )}

        <TextInput
          style={[styles.input, timeLeft === 0 && styles.disabledInput]}
          placeholder="000000"
          placeholderTextColor="#999"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          editable={timeLeft > 0}
        />

        <TouchableOpacity 
          style={[styles.verifyButton, (isLoading || isResending || timeLeft === 0) && styles.disabledButton]} 
          onPress={handleVerify} 
          disabled={isLoading || isResending || timeLeft === 0}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.verifyButtonText}>Doğrula</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.resendButton, isResending && { opacity: 0.7 }]} 
          onPress={handleResend}
          disabled={isLoading || isResending}
        >
          {isResending ? (
            <ActivityIndicator color="#ff9500" />
          ) : (
            <Text style={styles.resendButtonText}>Kodu Yeniden Gönder</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={handleBackToLogin}>
          <Text style={styles.backButtonText}>Giriş Ekranına Dön</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7e6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ffe8cc',
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff9500',
    marginLeft: 6,
  },
  timerAlertText: {
    color: '#ff3b30',
  },
  expiredText: {
    color: '#ff3b30',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    fontSize: 32,
    letterSpacing: 10,
    fontWeight: 'bold',
    color: '#333',
  },
  disabledInput: {
    backgroundColor: '#eaeaea',
    color: '#999',
  },
  verifyButton: {
    backgroundColor: '#ff9500',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ff9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#cccccc',
    shadowColor: '#cccccc',
    elevation: 0,
  },
  verifyButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resendButton: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ff9500',
    backgroundColor: '#fff',
  },
  resendButtonText: {
    color: '#ff9500',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
    padding: 10,
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  }
});
