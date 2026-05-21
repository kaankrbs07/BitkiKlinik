import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAdminDiseases, AdminDisease, CreateDiseasePayload } from '../../hooks/useAdminDiseases';

const C = {
  primary: '#6366f1', emerald: '#10b981', emeraldLight: '#dcfce7',
  danger: '#ef4444', dangerLight: '#fee2e2', slate: '#0f172a',
  slateLight: '#64748b', bg: '#f8fafc', white: '#fff',
};

export default function AdminDiseasesScreen() {
  const router = useRouter();
  const { diseases, isLoading, error, refresh, createDisease, deleteDisease } = useAdminDiseases();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateDiseasePayload>({ name: '', description: '', modelLabel: '' });

  const handleCreate = async () => {
    if (!form.name || !form.modelLabel) { Alert.alert('Hata', 'Ad ve Model Etiketi zorunludur.'); return; }
    const ok = await createDisease(form);
    if (ok) { setShowModal(false); setForm({ name: '', description: '', modelLabel: '' }); }
  };

  const handleDelete = (d: AdminDisease) => {
    Alert.alert('Sil', `"${d.name}" hastalığını silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteDisease(d.id) },
    ]);
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.slate} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Hastalık Yönetimi</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add" size={22} color={C.white} />
          </TouchableOpacity>
        </View>

        {error && <View style={s.err}><Text style={s.errTxt}>{error}</Text></View>}

        <ScrollView contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.primary} />}>
          {diseases.map((d, i) => (
            <Animated.View key={d.id} entering={FadeInDown.delay(i * 80).duration(500)}>
              <View style={s.card}>
                <View style={s.cardIcon}><Ionicons name="leaf" size={22} color={C.emerald} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{d.name}</Text>
                  <Text style={s.cardSub}>{d.modelLabel}</Text>
                  <View style={s.treatBadge}>
                    <Ionicons name="medkit-outline" size={12} color={C.primary} />
                    <Text style={s.treatTxt}>{d.treatmentCount} tedavi</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(d)}>
                  <Ionicons name="trash-outline" size={18} color={C.danger} />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
          {!isLoading && diseases.length === 0 && (
            <View style={s.empty}><Ionicons name="leaf-outline" size={48} color={C.slateLight} />
              <Text style={s.emptyTxt}>Henüz hastalık eklenmemiş.</Text></View>
          )}
        </ScrollView>

        <Modal visible={showModal} animationType="slide" transparent>
          <View style={s.mOverlay}>
            <View style={s.mContent}>
              <Text style={s.mTitle}>Yeni Hastalık</Text>
              <TextInput style={s.input} placeholder="Hastalık adı" value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })} />
              <TextInput style={s.input} placeholder="Açıklama" multiline value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })} />
              <TextInput style={s.input} placeholder="Model etiketi (ör: Tomato__Blight)" value={form.modelLabel}
                onChangeText={(v) => setForm({ ...form, modelLabel: v })} />
              <View style={s.mActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                  <Text style={s.cancelTxt}>İptal</Text></TouchableOpacity>
                <TouchableOpacity style={s.submitBtn} onPress={handleCreate}>
                  <Text style={s.submitTxt}>Oluştur</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.white, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: C.slate },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.emerald, justifyContent: 'center', alignItems: 'center' },
  err: { backgroundColor: C.dangerLight, marginHorizontal: 20, borderRadius: 12, padding: 12, marginBottom: 8 },
  errTxt: { color: C.danger, fontSize: 13, textAlign: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, padding: 16, borderRadius: 16, marginBottom: 10, elevation: 1 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.emeraldLight, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.slate },
  cardSub: { fontSize: 12, color: C.slateLight, marginTop: 1 },
  treatBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  treatTxt: { fontSize: 11, color: C.primary, fontWeight: '600' },
  delBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.dangerLight, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { color: C.slateLight, marginTop: 12, fontSize: 14 },
  mOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  mContent: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  mTitle: { fontSize: 20, fontWeight: 'bold', color: C.slate, marginBottom: 20 },
  input: { backgroundColor: C.bg, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  mActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '600', color: C.slateLight },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.emerald, alignItems: 'center' },
  submitTxt: { fontSize: 15, fontWeight: '700', color: C.white },
});
