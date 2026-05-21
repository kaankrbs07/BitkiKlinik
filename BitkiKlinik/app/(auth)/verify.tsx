import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../../api/client';

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    if (!code || code.length < 6) {
      Alert.alert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin.');
      return;
    }

    setIsLoading(true);
    try {
      await dotnetClient.post('/Auth/verify-email', { email, code });
      
      Alert.alert(
        'Tebrikler', 
        'Hesabınız başarıyla doğrulandı. Giriş yapabilirsiniz.',
        [{ text: 'Giriş Yap', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error: any) {
      console.error(error);
      const message = error.response?.data?.message || error.response?.data?.Message || 'E-posta doğrulanamadı.';
      Alert.alert('Üzgünüz', message);
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
        <View style={styles.iconContainer}>
          <Ionicons name="mail-unread-outline" size={80} color="#ff9500" />
        </View>

        <Text style={styles.title}>E-posta Doğrulama</Text>
        <Text style={styles.subtitle}>
          {email} adresine gönderdiğimiz doğrulama kodunu aşağıya girin.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="000000"
          placeholderTextColor="#999"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
        />

        <TouchableOpacity style={styles.verifyButton} onPress={handleVerify} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.verifyButtonText}>Doğrula</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
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
    marginBottom: 32,
    lineHeight: 24,
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
  verifyButtonText: {
    color: 'white',
    fontSize: 18,
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
