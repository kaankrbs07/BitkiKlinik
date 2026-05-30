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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { useProfile } from '../hooks/useProfile';
import { dotnetClient } from '../api/client';
import { CONFIG } from '../constants/config';

// Premium Light & Dark Color Palettes
const LIGHT_COLORS = {
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

const DARK_COLORS = {
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
  warning: '#fbbf24',
  danger: '#f87171',
  dangerLight: '#7f1d1d',
  inputBg: '#334155',
  border: '#334155',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, resolvedTheme, isDark, setTheme } = useAppTheme();
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(colors);
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

  // ─── Şifre Yenileme (Profile) State ───────────────────────────────
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetLoading, setResetLoading] = useState(false);

  // ─── Fotoğraf Önizleme State ──────────────────────────────────────
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);

  // Sıfırlama Kodu İsteme (Kullanıcı zaten giriş yaptığı için email profile'dan alınır)
  const handleRequestResetCode = async () => {
    if (!profile?.email) {
      Alert.alert('Hata', 'Kullanıcı e-posta adresi bulunamadı.');
      return;
    }

    setResetLoading(true);
    try {
      const response = await dotnetClient.post('/Auth/forgot-password', { email: profile.email });
      Alert.alert('Kod Gönderildi', response.data?.message ?? '6 haneli doğrulama kodunuz e-posta adresinize gönderildi.');
      setResetStep(2);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Kod gönderilemedi. Lütfen internet bağlantınızı kontrol edin.';
      Alert.alert('Hata', msg);
    } finally {
      setResetLoading(false);
    }
  };

  // Kodu Doğrulayıp Şifreyi Güncelleme
  const handleVerifyAndResetPassword = async () => {
    if (!profile?.email) return;

    if (!resetCode || !newPassword) {
      Alert.alert('Hata', 'Lütfen 6 haneli doğrulama kodunu ve yeni şifrenizi girin.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Hata', 'Yeni şifreniz en az 8 karakter olmalıdır.');
      return;
    }

    setResetLoading(true);
    try {
      const response = await dotnetClient.post('/Auth/reset-password', {
        email: profile.email,
        code: resetCode,
        newPassword: newPassword,
      });
      Alert.alert('Başarılı', response.data?.message ?? 'Şifreniz başarıyla güncellendi.');
      
      // Modalı Kapat & State'leri Temizle
      setShowResetModal(false);
      setResetCode('');
      setNewPassword('');
      setResetStep(1);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Şifre güncellenemedi.';
      Alert.alert('Şifre Yenileme Başarısız', msg);
    } finally {
      setResetLoading(false);
    }
  };

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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.safeArea}>
        
        {/* Modern Premium Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={colors.slate} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profili Düzenle</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Loading Indicator for initial profile fetch */}
        {isLoading && !profile ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.emerald} />
            <Text style={styles.loadingText}>Profil yükleniyor...</Text>
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={false}
            >
              {/* Dynamic Notification Banners */}
              {showSuccessToast && (
                <Animated.View entering={FadeInUp} style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
                  <Text style={styles.bannerText}>Profil başarıyla güncellendi!</Text>
                </Animated.View>
              )}

              {(validationError || apiError) && (
                <Animated.View entering={FadeInUp} style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={20} color={colors.danger} />
                  <Text style={[styles.bannerText, { color: colors.danger }]}>
                    {validationError || apiError}
                  </Text>
                </Animated.View>
              )}

              {/* Avatar Section */}
              <Animated.View entering={FadeInDown.duration(600)} style={styles.avatarSection}>
                <View style={styles.avatarWrapper}>
                  <TouchableOpacity
                    onPress={() => {
                      if (hasPhoto) {
                        setShowImagePreviewModal(true);
                      } else {
                        handleSelectImage();
                      }
                    }}
                    activeOpacity={0.9}
                  >
                    {hasPhoto ? (
                      <Image source={getAvatarSource()!} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarPlaceholderText}>{getInitials()}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {hasPhoto && (
                    <TouchableOpacity
                      onPress={handleRemoveImage}
                      style={styles.deleteBadge}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={handleSelectImage}
                    style={styles.editBadge}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={18} color="#fff" />
                  </TouchableOpacity>
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
                    <Ionicons name="person-outline" size={20} color={colors.slateLight} style={styles.inputIcon} />
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
                      <Ionicons name="lock-closed" size={10} color={colors.slateLight} />
                      <Text style={styles.readOnlyBadgeText}>Değiştirilemez</Text>
                    </View>
                  </View>
                  <View style={[styles.inputWrapper, styles.inputDisabled]}>
                    <Ionicons name="mail-outline" size={20} color={colors.slateLight} style={styles.inputIcon} />
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

                {/* Şifre Güvenliği & Yenileme */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Hesap Güvenliği</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.changePasswordButton}
                    onPress={() => setShowResetModal(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="key-outline" size={20} color={colors.emerald} style={{ marginRight: 8 }} />
                    <Text style={styles.changePasswordButtonText}>Şifreyi Yenile</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.slateLight} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                  <Text style={styles.helperText}>
                    Kayıtlı e-posta adresinize doğrulama kodu gönderilecektir.
                  </Text>
                </View>

                {/* Tema / Görünüm Seçimi */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Görünüm ve Tema</Text>
                  </View>
                  <View style={styles.themeSelectorContainer}>
                    <TouchableOpacity
                      style={[
                        styles.themeOption,
                        theme === 'light' && styles.themeOptionActive,
                      ]}
                      onPress={() => setTheme('light')}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="sunny"
                        size={16}
                        color={theme === 'light' ? colors.white : colors.slateLight}
                      />
                      <Text
                        style={[
                          styles.themeOptionText,
                          theme === 'light' && styles.themeOptionTextActive,
                        ]}
                      >
                        Açık
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.themeOption,
                        theme === 'dark' && styles.themeOptionActive,
                      ]}
                      onPress={() => setTheme('dark')}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="moon"
                        size={16}
                        color={theme === 'dark' ? colors.white : colors.slateLight}
                      />
                      <Text
                        style={[
                          styles.themeOptionText,
                          theme === 'dark' && styles.themeOptionTextActive,
                        ]}
                      >
                        Koyu
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.themeOption,
                        theme === 'system' && styles.themeOptionActive,
                      ]}
                      onPress={() => setTheme('system')}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="settings-outline"
                        size={16}
                        color={theme === 'system' ? colors.white : colors.slateLight}
                      />
                      <Text
                        style={[
                          styles.themeOptionText,
                          theme === 'system' && styles.themeOptionTextActive,
                        ]}
                      >
                        Sistem
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.helperText}>
                    Uygulamanın açık veya koyu tema görünümünü değiştirebilirsiniz.
                  </Text>
                </View>

                {/* Additional Profile Info Cards (Display only) */}
                <View style={styles.infoRow}>
                  <View style={styles.infoCard}>
                    <Ionicons name="shield-outline" size={20} color={colors.emerald} />
                    <Text style={styles.infoCardLabel}>Rol</Text>
                    <Text style={styles.infoCardVal}>{profile?.role === 'Admin' ? 'Yönetici' : 'Kullanıcı'}</Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Ionicons name="calendar-outline" size={20} color={colors.emerald} />
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
                      <Text style={styles.saveButtonText}>
                        {selectedImageUri ? 'Fotoğraf Yükleniyor...' : 'Güncelleniyor...'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.saveButtonText}>Değişiklikleri Kaydet</Text>
                  )}
                </TouchableOpacity>
                {isSaving && selectedImageUri && (
                  <Text style={styles.uploadHint}>
                    Profil fotoğrafınız sunucuya yükleniyor, lütfen bekleyin...
                  </Text>
                )}
              </Animated.View>

            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ─── Şifre Yenileme Bottom Modal (Premium UI) ─── */}
        <Modal visible={showResetModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalDragBar} />
              
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Şifre Yenileme 🔑</Text>
                <TouchableOpacity onPress={() => { setShowResetModal(false); setResetStep(1); }}>
                  <Ionicons name="close-circle" size={26} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                {resetStep === 1 ? (
                  // ADIM 1: Kod Gönderimi Onayı
                  <View>
                    <Text style={styles.modalInfo}>
                      Şifrenizi güvenle yenilemek için kayıtlı e-posta adresiniz olan <Text style={{ fontWeight: 'bold', color: colors.slate }}>{profile?.email}</Text> adresine 6 haneli bir güvenlik kodu gönderilecektir. Onaylıyor musunuz?
                    </Text>

                    <TouchableOpacity 
                      style={styles.modalButton} 
                      onPress={handleRequestResetCode} 
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <>
                          <Ionicons name="mail-outline" size={20} color="white" style={{ marginRight: 8 }} />
                          <Text style={styles.modalButtonTxt}>Güvenlik Kodu Gönder</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  // ADIM 2: Kod ve Yeni Şifre Girişi
                  <View>
                    <Text style={styles.modalInfo}>
                      <Text style={{ fontWeight: 'bold', color: colors.emerald }}>{profile?.email}</Text> adresine gönderilen 6 haneli güvenlik kodunu ve yeni şifrenizi girin.
                    </Text>

                    <TextInput
                      style={styles.modalInput}
                      placeholder="6 Haneli Doğrulama Kodu"
                      placeholderTextColor="#999"
                      value={resetCode}
                      onChangeText={code => setResetCode(code.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      maxLength={6}
                    />

                    <TextInput
                      style={styles.modalInput}
                      placeholder="Yeni Şifreniz (Min 8 Karakter)"
                      placeholderTextColor="#999"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                    />

                    <TouchableOpacity 
                      style={[styles.modalButton, { backgroundColor: colors.emerald }]} 
                      onPress={handleVerifyAndResetPassword} 
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
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
                      onPress={() => setResetStep(1)}
                      disabled={resetLoading}
                    >
                      <Text style={styles.backToStep1Txt}>Geri Dön</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
        {/* ─── Orijinal Fotoğraf Önizleme Modalı (Full Screen) ─── */}
        <Modal visible={showImagePreviewModal} transparent animationType="fade">
          <View style={styles.previewOverlay}>
            <TouchableOpacity 
              style={styles.previewCloseBtn} 
              onPress={() => setShowImagePreviewModal(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            
            {hasPhoto && (
              <ScrollView
                style={{ width: '100%', height: '100%' }}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
                minimumZoomScale={1}
                maximumZoomScale={4}
                bouncesZoom={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                <Image 
                  source={getAvatarSource()!} 
                  style={styles.previewImage} 
                  resizeMode="contain" 
                />
              </ScrollView>
            )}
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.slate,
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
    color: colors.slateLight,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 16,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emeraldLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.emerald,
    marginLeft: 8,
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarWrapper: {
    position: 'relative',
    shadowColor: colors.slate,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.white,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.slate,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  avatarPlaceholderText: {
    fontSize: 38,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 1,
  },
  editBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.emerald,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  deleteBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: colors.danger,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  formContainer: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 10,
    shadowColor: colors.slate,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate,
  },
  requiredMark: {
    color: colors.danger,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  readOnlyBadgeText: {
    fontSize: 10,
    color: colors.slateLight,
    fontWeight: '500',
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 38,
  },
  inputWrapperError: {
    borderColor: colors.danger,
    backgroundColor: '#fff5f5',
  },
  inputDisabled: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.slate,
    height: '100%',
    padding: 0,
  },
  textDisabled: {
    color: '#94a3b8',
  },
  helperText: {
    fontSize: 11,
    color: colors.slateLight,
    marginTop: 4,
    lineHeight: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  infoCard: {
    flex: 0.48,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoCardLabel: {
    fontSize: 11,
    color: colors.slateLight,
    marginTop: 3,
    fontWeight: '500',
  },
  infoCardVal: {
    fontSize: 13,
    color: colors.slate,
    fontWeight: '700',
    marginTop: 0,
  },
  actionContainer: {
    marginBottom: 14,
  },
  saveButton: {
    backgroundColor: colors.emerald,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: '#a7f3d0',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadHint: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 40,
  },
  changePasswordButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.slate,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
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
    color: colors.slate,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  modalInfo: {
    fontSize: 14,
    color: colors.slateLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: colors.inputBg,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    color: colors.slate,
  },
  modalButton: {
    backgroundColor: '#6366f1',
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
    color: colors.slateLight,
    fontSize: 14,
    fontWeight: '600',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  themeSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 4,
    marginTop: 6,
    marginBottom: 6,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  themeOptionActive: {
    backgroundColor: colors.emerald,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slateLight,
  },
  themeOptionTextActive: {
    color: colors.white,
  },
});
