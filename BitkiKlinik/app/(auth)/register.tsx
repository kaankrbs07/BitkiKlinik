import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';

export default function RegisterScreen() {
  const router = useRouter();
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !email || !password) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await dotnetClient.post('/Auth/register', { username, email, password });
      
      const token = response.data?.token || response.data?.Token;
      
      // Kayıt başarılı olduğunda otomatik giriş yapılmasını ve yönlendirmeyi sağla
      Alert.alert(
        'Kayıt Başarılı', 
        'Hesabınız başarıyla oluşturuldu ve doğrulama kodunuz e-posta adresinize gönderildi.',
        [{ 
          text: 'Tamam', 
          onPress: () => {
            if (token) {
              useAuthStore.getState().login(token);
            } else {
              router.replace({ pathname: '/(auth)/verify', params: { email } });
            }
          } 
        }]
      );
    } catch (error: any) {
      console.error(error);
      const message = error.response?.data?.message || error.response?.data?.Message || 'Kayıt olunamadı.';
      Alert.alert('Hata', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Yeni Hesap Oluştur</Text>
          <Text style={styles.subtitle}>Bitkilerinizin sağlığını takip etmeye başlayın</Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Kullanıcı Adı"
            placeholderTextColor="#999"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="E-posta Adresi"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Şifre (Min 8 karakter, Büyük ve Küçük harf zorunlu)"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.registerButton} onPress={handleRegister} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.registerButtonText}>Kayıt Ol</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Zaten hesabınız var mı? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginText}>Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    marginTop: 20,
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  titleContainer: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
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
  registerButton: {
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
  registerButtonText: {
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
  loginText: {
    color: '#4cd964',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
