import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';
import { CONFIG } from '../../constants/config';
import { useAuthStore } from '../../store/useAuthStore';
import { showError } from '../../utils/errorHandler';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    Keyboard.dismiss(); 
    
    if (!username || !password) {
      Alert.alert('Hata', 'Lütfen kullanıcı adı veya e-posta ve şifrenizi girin.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await dotnetClient.post('/Auth/login', { username, password });
      console.log("[Login] Sunucu Yanıtı Aldındı:", response.status);
      
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
        </View>
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
  }
});
