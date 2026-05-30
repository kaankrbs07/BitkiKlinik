import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';
import { showError } from '../../utils/errorHandler';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ─── Şifremi Unuttum State ──────────────────────────────────────────
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async () => {
    Keyboard.dismiss(); 
    
    if (!username || !password) {
      Alert.alert('Hata', 'Lütfen kullanıcı adı veya e-posta ve şifrenizi girin.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await dotnetClient.post('/Auth/login', { username, password });
      console.log("[Login] Sunucu Yanıtı Alındı:", response.status);
      
      if (response.data && response.data.token) {
        console.log("[Login] Token bulundu, store güncelleniyor...");
        login(response.data.token, response.data.refreshToken ?? undefined);
        
        console.log("[Login] Navigasyon tetikleniyor: /(tabs)");
        router.replace('/(tabs)');
      } else {
        console.warn("[Login] Başarılı kod geldi ama token bulunamadı!", response.data);
      }
    } catch (error: any) {
      console.error(error);
      showError(error, { title: 'Giriş Başarısız' });
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Sıfırlama Kodu Gönder (Email girildikten sonra)
  const handleRequestReset = async () => {
    if (!forgotEmail) {
      Alert.alert('Hata', 'Lütfen e-posta adresinizi girin.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await dotnetClient.post('/Auth/forgot-password', { email: forgotEmail });
      Alert.alert('Kod Gönderildi', response.data?.message ?? '6 haneli doğrulama kodunuz e-posta adresinize gönderildi.');
      setForgotStep(2); // Sonraki adıma geç
    } catch (error: any) {
      showError(error, { title: 'Hata' });
    } finally {
      setForgotLoading(false);
    }
  };

  // 2. Yeni Şifre ile Kodu Doğrula ve Sıfırla
  const handleResetPassword = async () => {
    if (!forgotCode || !newPassword) {
      Alert.alert('Hata', 'Lütfen 6 haneli doğrulama kodunu ve yeni şifrenizi girin.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Hata', 'Yeni şifreniz en az 8 karakter olmalıdır.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await dotnetClient.post('/Auth/reset-password', {
        email: forgotEmail,
        code: forgotCode,
        newPassword: newPassword,
      });
      Alert.alert('Başarılı', response.data?.message ?? 'Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.');
      
      // Modalı Kapat & State'leri sıfırla
      setShowForgotModal(false);
      setForgotEmail('');
      setForgotCode('');
      setNewPassword('');
      setForgotStep(1);
    } catch (error: any) {
      showError(error, { title: 'Şifre Yenileme Başarısız' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Ionicons name="leaf" size={80} color="#4cd964" />
          <Text style={styles.title}>Bitki Klinik</Text>
          <Text style={styles.subtitle}>Bitkileriniz için yapay zeka destekli teşhis</Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Kullanıcı Adı veya E-posta"
            placeholderTextColor="#999"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Şifre (Min 8 krkt, Büyük/Küçük harf)"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Giriş Yap</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Hesabınız yok mu? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.registerText}>Hemen Kaydol</Text>
            </TouchableOpacity>
          </View>

          {/* Şifremi Unuttum Linki */}
          <TouchableOpacity 
            style={styles.forgotLink} 
            onPress={() => setShowForgotModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotLinkPrefix}>Şifrenizi mi unuttunuz? </Text>
            <Text style={styles.forgotLinkAction}>Hemen sıfırla</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Şifremi Unuttum Bottom Modal (Premium UI) ─── */}
      <Modal visible={showForgotModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalDragBar} />
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şifremi Kurtar 🛡️</Text>
              <TouchableOpacity onPress={() => { setShowForgotModal(false); setForgotStep(1); }}>
                <Ionicons name="close-circle" size={26} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {forgotStep === 1 ? (
                // ADIM 1: E-posta Adresi İsteme
                <View>
                  <Text style={styles.modalInfo}>
                    Lütfen hesabınıza kayıtlı olan e-posta adresinizi giriniz. Şifrenizi sıfırlamanız için 6 haneli doğrulama kodunu mail olarak göndereceğiz.
                  </Text>
                  
                  <TextInput
                    style={styles.input}
                    placeholder="E-posta Adresiniz"
                    placeholderTextColor="#999"
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <TouchableOpacity 
                    style={styles.modalButton} 
                    onPress={handleRequestReset} 
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <>
                        <Ionicons name="mail-outline" size={20} color="white" style={{ marginRight: 8 }} />
                        <Text style={styles.modalButtonTxt}>Sıfırlama Kodu Gönder</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                // ADIM 2: Kod Girme ve Yeni Şifre Tanımlama
                <View>
                  <Text style={styles.modalInfo}>
                    <Text style={{ fontWeight: 'bold', color: '#4cd964' }}>{forgotEmail}</Text> adresine gönderilen 6 haneli güvenlik kodunu ve yeni şifrenizi girin.
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder="6 Haneli Doğrulama Kodu"
                    placeholderTextColor="#999"
                    value={forgotCode}
                    onChangeText={forgotCode => setForgotCode(forgotCode.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Yeni Şifre (Min 8 Karakter)"
                    placeholderTextColor="#999"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />

                  <TouchableOpacity 
                    style={[styles.modalButton, { backgroundColor: '#4cd964' }]} 
                    onPress={handleResetPassword} 
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={20} color="white" style={{ marginRight: 8 }} />
                        <Text style={styles.modalButtonTxt}>Şifremi Sıfırla & Güncelle</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.backToStep1Btn} 
                    onPress={() => setForgotStep(1)}
                    disabled={forgotLoading}
                  >
                    <Text style={styles.backToStep1Txt}>Geri Dön (E-posta değiştir)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
  },
  forgotLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    padding: 8,
  },
  forgotLinkPrefix: {
    color: '#666',
    fontSize: 15,
  },
  forgotLinkAction: {
    color: '#6366f1',
    fontSize: 15,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  loginButton: {
    backgroundColor: '#4cd964',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#4cd964',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: '#666',
    fontSize: 16,
  },
  registerText: {
    color: '#4cd964',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ─── Modal Stilleri ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalDragBar: {
    width: 40,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 16,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalScroll: {
    paddingBottom: 24,
  },
  modalInfo: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#6366f1', // Indigo
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalButtonTxt: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backToStep1Btn: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  backToStep1Txt: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
});
