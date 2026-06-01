import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, Alert, TextInput, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAdminUsers, AdminUser, CreateUserPayload } from '../../hooks/useAdminUsers';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppTheme } from '../../hooks/useAppTheme';

// ─── Renk Paletleri ──────────────────────────────────────────────────
const LIGHT_COLORS = {
  primary: '#6366f1',
  primaryLight: '#eef2ff',
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  amber: '#f59e0b',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
  border: '#e2e8f0',
  cardBg: '#ffffff',
  slateBg: '#f1f5f9',
};

const DARK_COLORS = {
  primary: '#818cf8',
  primaryLight: '#312e81',
  emerald: '#10b981',
  emeraldLight: '#064e3b',
  danger: '#f87171',
  dangerLight: '#7f1d1d',
  amber: '#fbbf24',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
  border: '#334155',
  cardBg: '#1e293b',
  slateBg: '#334155',
};

export default function AdminUsersScreen() {
  const router = useRouter();
  const { users, isLoading, error, refresh, createUser, updateUser, deactivateUser, activateUser } = useAdminUsers();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>({ username: '', email: '', password: '', role: 'User' });
  const { isDark } = useAppTheme();

  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  // ── Kullanıcı Oluştur ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.username || !form.email || !form.password) {
      Alert.alert('Hata', 'Tüm alanları doldurun.');
      return;
    }
    const success = await createUser(form);
    if (success) {
      setShowCreateModal(false);
      setForm({ username: '', email: '', password: '', role: 'User' });
      Alert.alert('Başarılı', 'Kullanıcı oluşturuldu.');
    }
  };

  // ── Kullanıcı Deaktif / Aktif ──────────────────────────────────
  const handleToggleActive = (user: AdminUser) => {
    const action = user.isActive ? 'devre dışı bırakmak' : 'aktif etmek';
    Alert.alert(
      'Onay',
      `${user.username} kullanıcısını ${action} istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet',
          style: user.isActive ? 'destructive' : 'default',
          onPress: () => user.isActive ? deactivateUser(user.id) : activateUser(user.id),
        },
      ]
    );
  };

  // ── Rol Değiştirme (Admin <-> User) ──────────────────────────────
  const handleToggleRole = (user: AdminUser) => {
    if (user.isSuperAdmin) {
      Alert.alert('Uyarı', 'Sistem bütünlüğü için yapılandırmada Super Admin hesaplarının rolü değiştirilemez.');
      return;
    }
    const currentUserId = useAuthStore.getState().userId;
    if (user.id.toString() === currentUserId) {
      Alert.alert('Uyarı', 'Kendi yöneticilik rolünüzü değiştiremezsiniz.');
      return;
    }

    const newRole = user.role === 'Admin' ? 'User' : 'Admin';
    const roleText = newRole === 'Admin' ? 'Yönetici (Admin)' : 'Standart Kullanıcı (User)';
    Alert.alert(
      'Rol Değişikliği',
      `${user.username} kullanıcısının rolünü ${roleText} olarak değiştirmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Rolü Değiştir',
          onPress: async () => {
            const success = await updateUser(user.id, { role: newRole });
            if (success) {
              Alert.alert('Başarılı', `${user.username} rolü ${newRole} olarak güncellendi.`);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.slate} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kullanıcı Yönetimi</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={22} color={LIGHT_COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Hata durumu */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Kullanıcı Listesi */}
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={COLORS.primary} />}
        >
          {users.map((user, index) => (
            <Animated.View key={user.id} entering={FadeInDown.delay(index * 80).duration(500)}>
              <View style={styles.userCard}>
                <View style={[styles.avatar, { backgroundColor: user.isActive ? COLORS.emeraldLight : COLORS.dangerLight }]}>
                  <Ionicons
                    name={user.role === 'Admin' ? 'shield' : 'person'}
                    size={20}
                    color={user.isActive ? COLORS.emerald : COLORS.danger}
                  />
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.username}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.badges}>
                    {user.isSuperAdmin ? (
                      <View style={[styles.badge, { backgroundColor: COLORS.primaryLight, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                        <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                          {user.role}
                        </Text>
                        <Ionicons name="lock-closed" size={11} color={COLORS.primary} />
                      </View>
                    ) : user.id.toString() === useAuthStore.getState().userId ? (
                      <View style={[styles.badge, { backgroundColor: user.role === 'Admin' ? COLORS.primaryLight : COLORS.slateBg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                        <Text style={[styles.badgeText, { color: user.role === 'Admin' ? COLORS.primary : COLORS.slateLight }]}>
                          {user.role}
                        </Text>
                        <Ionicons name="person" size={11} color={user.role === 'Admin' ? COLORS.primary : COLORS.slateLight} />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.badge, { backgroundColor: user.role === 'Admin' ? COLORS.primaryLight : COLORS.slateBg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                        onPress={() => handleToggleRole(user)}
                      >
                        <Text style={[styles.badgeText, { color: user.role === 'Admin' ? COLORS.primary : COLORS.slateLight }]}>
                          {user.role}
                        </Text>
                        <Ionicons name="create-outline" size={12} color={user.role === 'Admin' ? COLORS.primary : COLORS.slateLight} />
                      </TouchableOpacity>
                    )}
                    <View style={[styles.badge, { backgroundColor: user.isActive ? COLORS.emeraldLight : COLORS.dangerLight }]}>
                      <Text style={[styles.badgeText, { color: user.isActive ? COLORS.emerald : COLORS.danger }]}>
                        {user.isActive ? 'Aktif' : 'Pasif'}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: user.isActive ? COLORS.dangerLight : COLORS.emeraldLight }]}
                  onPress={() => handleToggleActive(user)}
                >
                  <Ionicons
                    name={user.isActive ? 'close-circle' : 'checkmark-circle'}
                    size={20}
                    color={user.isActive ? COLORS.danger : COLORS.emerald}
                  />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Kullanıcı Oluşturma Modal */}
        <Modal visible={showCreateModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Yeni Kullanıcı</Text>

              <TextInput style={styles.input} placeholder="Kullanıcı adı" placeholderTextColor={COLORS.slateLight} value={form.username}
                onChangeText={(v) => setForm({ ...form, username: v })} />
              <TextInput style={styles.input} placeholder="E-posta" placeholderTextColor={COLORS.slateLight} keyboardType="email-address" value={form.email}
                onChangeText={(v) => setForm({ ...form, email: v })} />
              <TextInput style={styles.input} placeholder="Şifre" placeholderTextColor={COLORS.slateLight} secureTextEntry value={form.password}
                onChangeText={(v) => setForm({ ...form, password: v })} />

              {/* Rol seçimi */}
              <View style={styles.roleRow}>
                {['User', 'Admin'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
                    onPress={() => setForm({ ...form, role: r })}
                  >
                    <Text style={[styles.roleBtnText, form.role === r && styles.roleBtnTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.cancelBtnText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handleCreate}>
                  <Text style={styles.submitBtnText}>Oluştur</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: COLORS.slate },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  errorBanner: { backgroundColor: COLORS.dangerLight, marginHorizontal: 20, borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText: { color: COLORS.danger, fontSize: 13, textAlign: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: COLORS.slate },
  userEmail: { fontSize: 12, color: COLORS.slateLight, marginTop: 1 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.slate, marginBottom: 20 },
  input: { backgroundColor: COLORS.background, color: COLORS.slate, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.background, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  roleBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.slateLight },
  roleBtnTextActive: { color: LIGHT_COLORS.white },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.background, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.slateLight },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: LIGHT_COLORS.white },
});
