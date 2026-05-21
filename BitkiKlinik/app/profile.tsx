import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { useProfile } from '../hooks/useProfile';
import { CONFIG } from '../constants/config';

// Premium Color Palette
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
  inputBg: '#f1f5f9',
  border: '#e2e8f0',
};

export default function ProfileScreen() {
  const router = useRouter();
  const {
    profile,
    isLoading,
    isSaving,
    error: apiError,
    success: apiSuccess,
    fetchProfile,
    updateProfile,
    removeProfilePicture,
    clearStatus,
  } = useProfile();

  // Local Form States
  const [username, setUsername] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  
  // Validation / Message States
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Fetch Profile on Mount
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Sync profile data to local state
  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
    }
  }, [profile]);

  // Handle Success Toast Timeout
  useEffect(() => {
    if (apiSuccess) {
      setShowSuccessToast(true);
      setSelectedImageUri(null); // Clear selected URI as it is now uploaded
      const timer = setTimeout(() => {
        setShowSuccessToast(false);
        clearStatus();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [apiSuccess, clearStatus]);

  // Get Avatar Source
  const getAvatarSource = () => {
    if (selectedImageUri) {
      return { uri: selectedImageUri };
    }
    if (profile?.profilePictureUrl) {
      const url = profile.profilePictureUrl.startsWith('http')
        ? profile.profilePictureUrl
        : `${CONFIG.DOTNET_BASE_URL}${profile.profilePictureUrl}`;
      return { uri: url };
    }
    return null;
  };

  // Launch Image Library Picker
  const handleSelectImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'İzin Gerekli',
          'Profil resmi seçebilmek için galeri erişim iznine ihtiyacımız var.',
          [{ text: 'Tamam' }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImageUri(result.assets[0].uri);
        clearStatus();
        setValidationError(null);
      }
    } catch (e) {
      console.error('[ProfileScreen] ImagePicker hatası:', e);
      Alert.alert('Hata', 'Fotoğraf seçilirken beklenmedik bir sorun oluştu.');
    }
  };

  // Remove Profile Picture (Server or Local selection)
  const handleRemoveImage = async () => {
    if (selectedImageUri) {
      setSelectedImageUri(null);
      return;
    }

    if (profile?.profilePictureUrl) {
      Alert.alert(
        'Fotoğrafı Kaldır',
        'Profil fotoğrafınızı tamamen kaldırmak istediğinize emin misiniz?',
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Evet, Kaldır',
            style: 'destructive',
            onPress: async () => {
              await removeProfilePicture();
            },
          },
        ]
      );
    }
  };

  // Submit profile edits
  const handleSave = async () => {
    // Clear previous statuses
    clearStatus();
    setValidationError(null);

    // Front-end Username Validations
    if (!username || username.trim().length < 3) {
      setValidationError('Kullanıcı adı en az 3 karakterden oluşmalıdır.');
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!usernameRegex.test(username.trim())) {
      setValidationError('Kullanıcı adı sadece harf, rakam, alt çizgi (_) ve nokta (.) içerebilir.');
      return;
    }

    // Call update API (omits email to make it strictly display-only)
    const success = await updateProfile(username.trim(), selectedImageUri);
    if (success) {
      // Re-fetch to ensure all components receive updated info
      await fetchProfile();
    }
  };

  // Initials for avatar placeholder
  const getInitials = () => {
    if (!username) return 'BD';
    return username.substring(0, 2).toUpperCase();
  };

  const hasPhoto = selectedImageUri || profile?.profilePictureUrl;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        
        {/* Modern Premium Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.slate} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profili Düzenle</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Loading Indicator for initial profile fetch */}
        {isLoading && !profile ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={COLORS.emerald} />
            <Text style={styles.loadingText}>Profil yükleniyor...</Text>
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Dynamic Notification Banners */}
              {showSuccessToast && (
                <Animated.View entering={FadeInUp} style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.emerald} />
                  <Text style={styles.bannerText}>Profil başarıyla güncellendi!</Text>
                </Animated.View>
              )}

              {(validationError || apiError) && (
                <Animated.View entering={FadeInUp} style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                  <Text style={[styles.bannerText, { color: COLORS.danger }]}>
                    {validationError || apiError}
                  </Text>
                </Animated.View>
              )}

              {/* Avatar Section */}
              <Animated.View entering={FadeInDown.duration(600)} style={styles.avatarSection}>
                <View style={styles.avatarWrapper}>
                  {hasPhoto ? (
                    <Image source={getAvatarSource()!} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarPlaceholderText}>{getInitials()}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={handleSelectImage}
                    style={styles.editBadge}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Photo Actions */}
                <View style={styles.photoActions}>
                  <TouchableOpacity
                    onPress={handleSelectImage}
                    style={styles.selectButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.selectButtonText}>Fotoğraf Değiştir</Text>
                  </TouchableOpacity>
                  {hasPhoto && (
                    <TouchableOpacity
                      onPress={handleRemoveImage}
                      style={styles.removeButton}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeButtonText}>Kaldır</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>

              {/* Form Fields Section */}
              <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.formContainer}>
                
                {/* Username (Editable & Unique Validation) */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Kullanıcı Adı</Text>
                    <Text style={styles.requiredMark}>*</Text>
                  </View>
                  <View style={[
                    styles.inputWrapper,
                    (validationError || apiError) ? styles.inputWrapperError : null
                  ]}>
                    <Ionicons name="person-outline" size={20} color={COLORS.slateLight} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="kullanici_adi"
                      value={username}
                      onChangeText={(val) => {
                        setUsername(val);
                        if (validationError) setValidationError(null);
                        if (apiError) clearStatus();
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={30}
                    />
                  </View>
                  <Text style={styles.helperText}>
                    Benzersiz olmalıdır. Harf, rakam, alt çizgi ve nokta içerebilir.
                  </Text>
                </View>

                {/* Email (Read-Only as requested by user) */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>E-Posta Adresi</Text>
                    <View style={styles.readOnlyBadge}>
                      <Ionicons name="lock-closed" size={10} color={COLORS.slateLight} />
                      <Text style={styles.readOnlyBadgeText}>Değiştirilemez</Text>
                    </View>
                  </View>
                  <View style={[styles.inputWrapper, styles.inputDisabled]}>
                    <Ionicons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.textDisabled]}
                      value={profile?.email}
                      editable={false}
                      selectTextOnFocus={false}
                    />
                  </View>
                  <Text style={styles.helperText}>
                    Güvenliğiniz için kayıtlı e-posta adresiniz değiştirilemez.
                  </Text>
                </View>

                {/* Additional Profile Info Cards (Display only) */}
                <View style={styles.infoRow}>
                  <View style={styles.infoCard}>
                    <Ionicons name="shield-outline" size={20} color={COLORS.emerald} />
                    <Text style={styles.infoCardLabel}>Rol</Text>
                    <Text style={styles.infoCardVal}>{profile?.role === 'Admin' ? 'Yönetici' : 'Kullanıcı'}</Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Ionicons name="calendar-outline" size={20} color={COLORS.emerald} />
                    <Text style={styles.infoCardLabel}>Üyelik Tarihi</Text>
                    <Text style={styles.infoCardVal}>
                      {profile ? new Date(profile.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short' }) : '-'}
                    </Text>
                  </View>
                </View>

              </Animated.View>

              {/* Action Save Button */}
              <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.actionContainer}>
                <TouchableOpacity
                  style={[styles.saveButton, isSaving ? styles.saveButtonDisabled : null]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.8}
                >
                  {isSaving ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.saveButtonText}>Güncelleniyor...</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveButtonText}>Değişiklikleri Kaydet</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>

            </ScrollView>
          </KeyboardAvoidingView>
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
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.slate,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  headerPlaceholder: {
    width: 40,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.slateLight,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emeraldLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.emerald,
    marginLeft: 8,
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrapper: {
    position: 'relative',
    shadowColor: COLORS.slate,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.slate,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  avatarPlaceholderText: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 1,
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: COLORS.emerald,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  photoActions: {
    flexDirection: 'row',
    marginTop: 16,
    alignItems: 'center',
  },
  selectButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.emeraldLight,
  },
  selectButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.emerald,
  },
  removeButton: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.dangerLight,
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  formContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: COLORS.slate,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.slate,
  },
  requiredMark: {
    color: COLORS.danger,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  readOnlyBadgeText: {
    fontSize: 10,
    color: COLORS.slateLight,
    fontWeight: '500',
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 48,
  },
  inputWrapperError: {
    borderColor: COLORS.danger,
    backgroundColor: '#fff5f5',
  },
  inputDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.slate,
    height: '100%',
    padding: 0,
  },
  textDisabled: {
    color: '#94a3b8',
  },
  helperText: {
    fontSize: 11,
    color: COLORS.slateLight,
    marginTop: 6,
    lineHeight: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  infoCard: {
    flex: 0.48,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoCardLabel: {
    fontSize: 11,
    color: COLORS.slateLight,
    marginTop: 6,
    fontWeight: '500',
  },
  infoCardVal: {
    fontSize: 13,
    color: COLORS.slate,
    fontWeight: '700',
    marginTop: 2,
  },
  actionContainer: {
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: COLORS.emerald,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: '#a7f3d0',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
