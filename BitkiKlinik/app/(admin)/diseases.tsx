import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, Alert, TextInput, Modal,
  StatusBar, ActivityIndicator, LayoutAnimation, UIManager, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import {
  useAdminDiseases,
  AdminDisease,
  AdminDiseaseDetail,
  AdminTreatment,
  CreateDiseasePayload,
  UpdateDiseasePayload,
  CreateTreatmentPayload,
  UpdateTreatmentPayload,
} from '../../hooks/useAdminDiseases';
import { useAppTheme } from '../../hooks/useAppTheme';

// ── Android LayoutAnimation ──────────────────────────────────────────
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Renk Paleti ─────────────────────────────────────────────────────
const LIGHT_C = {
  primary: '#6366f1', primaryLight: '#eef2ff',
  emerald: '#10b981', emeraldLight: '#dcfce7',
  amber: '#f59e0b', amberLight: '#fef3c7',
  danger: '#ef4444', dangerLight: '#fee2e2',
  violet: '#7c3aed', violetLight: '#ede9fe',
  slate: '#0f172a', slateLight: '#64748b',
  bg: '#f8fafc', white: '#fff', border: '#e2e8f0', cardBg: '#fff',
  natural: '#10b981', naturalBg: '#dcfce7',
  chemical: '#6366f1', chemicalBg: '#eef2ff',
};
const DARK_C = {
  primary: '#818cf8', primaryLight: '#1e1b4b',
  emerald: '#34d399', emeraldLight: '#064e3b',
  amber: '#fbbf24', amberLight: '#451a03',
  danger: '#f87171', dangerLight: '#7f1d1d',
  violet: '#a78bfa', violetLight: '#2e1065',
  slate: '#f8fafc', slateLight: '#94a3b8',
  bg: '#0f172a', white: '#1e293b', border: '#334155', cardBg: '#1e293b',
  natural: '#34d399', naturalBg: '#064e3b',
  chemical: '#818cf8', chemicalBg: '#1e1b4b',
};

// ── Types ────────────────────────────────────────────────────────────
type ModalMode = 'none' | 'createDisease' | 'editDisease' | 'createTreatment' | 'editTreatment';

interface ModalState {
  mode: ModalMode;
  diseaseId?: number;
  treatment?: AdminTreatment;
  disease?: AdminDisease;
}

// ── Chevron Animasyonu ───────────────────────────────────────────────
function ChevronIcon({ expanded, color }: { expanded: boolean; color: string }) {
  const rotation = useSharedValue(expanded ? 1 : 0);
  React.useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 250 });
  }, [expanded]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={18} color={color} />
    </Animated.View>
  );
}

// ── Ana Ekran ────────────────────────────────────────────────────────
export default function AdminDiseasesScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const C = isDark ? DARK_C : LIGHT_C;
  const s = getStyles(C);

  const {
    diseases, isLoading, error, refresh,
    getDiseaseDetail, createDisease, updateDisease, deleteDisease,
    addTreatment, updateTreatment, deleteTreatment,
  } = useAdminDiseases();

  // Accordion durumu
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, AdminDiseaseDetail>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);

  // Modal durumu
  const [modal, setModal] = useState<ModalState>({ mode: 'none' });

  // Formlar
  const [diseaseForm, setDiseaseForm] = useState<CreateDiseasePayload>({ name: '', description: '', modelLabel: '' });
  const [treatmentForm, setTreatmentForm] = useState<CreateTreatmentPayload>({ title: '', instructions: '', type: 'Natural' });
  const [saving, setSaving] = useState(false);

  // ── Accordion ────────────────────────────────────────────────────
  const toggleExpand = useCallback(async (d: AdminDisease) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedId === d.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(d.id);
    if (!detailCache[d.id]) {
      setDetailLoading(d.id);
      const detail = await getDiseaseDetail(d.id);
      if (detail) setDetailCache(prev => ({ ...prev, [d.id]: detail }));
      setDetailLoading(null);
    }
  }, [expandedId, detailCache, getDiseaseDetail]);

  const refreshDetail = useCallback(async (diseaseId: number) => {
    const detail = await getDiseaseDetail(diseaseId);
    if (detail) setDetailCache(prev => ({ ...prev, [diseaseId]: detail }));
  }, [getDiseaseDetail]);

  // ── Modal Açıcılar ───────────────────────────────────────────────
  const openCreateDisease = () => {
    setDiseaseForm({ name: '', description: '', modelLabel: '' });
    setModal({ mode: 'createDisease' });
  };

  const openEditDisease = (d: AdminDisease) => {
    setDiseaseForm({ name: d.name, description: d.description, modelLabel: d.modelLabel });
    setModal({ mode: 'editDisease', diseaseId: d.id, disease: d });
  };

  const openCreateTreatment = (diseaseId: number) => {
    setTreatmentForm({ title: '', instructions: '', type: 'Natural' });
    setModal({ mode: 'createTreatment', diseaseId });
  };

  const openEditTreatment = (diseaseId: number, t: AdminTreatment) => {
    setTreatmentForm({ title: t.title, instructions: t.instructions, type: t.type });
    setModal({ mode: 'editTreatment', diseaseId, treatment: t });
  };

  const closeModal = () => setModal({ mode: 'none' });

  // ── Kaydet İşlemleri ─────────────────────────────────────────────
  const handleSaveDisease = async () => {
    if (!diseaseForm.name.trim() || !diseaseForm.modelLabel.trim()) {
      Alert.alert('Hata', 'Ad ve Model Etiketi zorunludur.');
      return;
    }
    setSaving(true);
    if (modal.mode === 'createDisease') {
      const ok = await createDisease(diseaseForm);
      if (ok) closeModal();
    } else if (modal.mode === 'editDisease' && modal.diseaseId) {
      const payload: UpdateDiseasePayload = {
        name: diseaseForm.name,
        description: diseaseForm.description,
        modelLabel: diseaseForm.modelLabel,
      };
      const ok = await updateDisease(modal.diseaseId, payload);
      if (ok) {
        await refreshDetail(modal.diseaseId);
        closeModal();
      }
    }
    setSaving(false);
  };

  const handleSaveTreatment = async () => {
    if (!treatmentForm.title.trim() || !treatmentForm.instructions.trim()) {
      Alert.alert('Hata', 'Başlık ve Talimatlar zorunludur.');
      return;
    }
    setSaving(true);
    if (modal.mode === 'createTreatment' && modal.diseaseId) {
      const ok = await addTreatment(modal.diseaseId, treatmentForm);
      if (ok) {
        await refreshDetail(modal.diseaseId);
        closeModal();
      }
    } else if (modal.mode === 'editTreatment' && modal.treatment && modal.diseaseId) {
      const ok = await updateTreatment(modal.treatment.id, treatmentForm);
      if (ok) {
        await refreshDetail(modal.diseaseId);
        closeModal();
      }
    }
    setSaving(false);
  };

  const handleDeleteDisease = (d: AdminDisease) => {
    Alert.alert(
      'Hastalığı Sil',
      `"${d.name}" ve tüm tedavileri kalıcı olarak silinecek. Emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            await deleteDisease(d.id);
            if (expandedId === d.id) setExpandedId(null);
            setDetailCache(prev => { const n = { ...prev }; delete n[d.id]; return n; });
          },
        },
      ],
    );
  };

  const handleDeleteTreatment = (diseaseId: number, t: AdminTreatment) => {
    Alert.alert(
      'Tedaviyi Sil',
      `"${t.title}" tedavisini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            const ok = await deleteTreatment(t.id);
            if (ok) await refreshDetail(diseaseId);
          },
        },
      ],
    );
  };

  // ── Tedavi Tipi Seçici ───────────────────────────────────────────
  const TypeSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <View style={s.typeRow}>
      {['Natural', 'Chemical'].map(type => {
        const selected = value === type;
        const isNatural = type === 'Natural';
        const bgColor = selected ? (isNatural ? C.naturalBg : C.chemicalBg) : C.bg;
        const textColor = selected ? (isNatural ? C.natural : C.chemical) : C.slateLight;
        const borderColor = selected ? (isNatural ? C.natural : C.chemical) : C.border;
        return (
          <TouchableOpacity
            key={type}
            style={[s.typeBtn, { backgroundColor: bgColor, borderColor }]}
            onPress={() => onChange(type)}
          >
            <Ionicons
              name={isNatural ? 'leaf' : 'flask'}
              size={14}
              color={textColor}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.typeBtnTxt, { color: textColor }]}>{type === 'Natural' ? 'Doğal' : 'Kimyasal'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────
  const modalVisible = modal.mode !== 'none';
  const isTreatmentModal = modal.mode === 'createTreatment' || modal.mode === 'editTreatment';
  const isDiseaseModal = modal.mode === 'createDisease' || modal.mode === 'editDisease';

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.slate} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Hastalık Yönetimi</Text>
            <Text style={s.headerSub}>{diseases.length} hastalık kayıtlı</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={openCreateDisease}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={s.err}>
            <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
            <Text style={s.errTxt}>{error}</Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.primary} />}
        >
          {diseases.map((d, i) => {
            const isExpanded = expandedId === d.id;
            const detail = detailCache[d.id];
            const loading = detailLoading === d.id;

            return (
              <Animated.View key={d.id} entering={FadeInDown.delay(i * 60).duration(450)}>
                {/* Hastalık Kartı */}
                <View style={s.card}>
                  {/* Üst satır — dokunulabilir alan */}
                  <TouchableOpacity style={s.cardHeader} onPress={() => toggleExpand(d)} activeOpacity={0.7}>
                    <View style={s.cardIcon}>
                      <Ionicons name="leaf" size={22} color={C.emerald} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{d.name}</Text>
                      <Text style={s.cardSub} numberOfLines={1}>{d.modelLabel}</Text>
                      <View style={s.treatBadge}>
                        <Ionicons name="medkit-outline" size={11} color={C.primary} />
                        <Text style={s.treatTxt}>{d.treatmentCount} tedavi</Text>
                      </View>
                    </View>
                    <View style={s.cardActions}>
                      <TouchableOpacity
                        style={[s.iconBtn, { backgroundColor: C.primaryLight }]}
                        onPress={() => openEditDisease(d)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil-outline" size={15} color={C.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.iconBtn, { backgroundColor: C.dangerLight }]}
                        onPress={() => handleDeleteDisease(d)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={15} color={C.danger} />
                      </TouchableOpacity>
                      <ChevronIcon expanded={isExpanded} color={C.slateLight} />
                    </View>
                  </TouchableOpacity>

                  {/* Accordion İçerik */}
                  {isExpanded && (
                    <View style={s.accordion}>
                      <View style={s.accordionDivider} />

                      {loading ? (
                        <View style={s.loadingRow}>
                          <ActivityIndicator size="small" color={C.primary} />
                          <Text style={s.loadingTxt}>Tedaviler yükleniyor…</Text>
                        </View>
                      ) : detail?.treatments?.length ? (
                        detail.treatments.map((t) => (
                          <View key={t.id} style={s.treatmentRow}>
                            <View style={[
                              s.treatTypeBadge,
                              { backgroundColor: t.type === 'Natural' ? C.naturalBg : C.chemicalBg },
                            ]}>
                              <Ionicons
                                name={t.type === 'Natural' ? 'leaf' : 'flask'}
                                size={11}
                                color={t.type === 'Natural' ? C.natural : C.chemical}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.treatTitle}>{t.title}</Text>
                              <Text style={s.treatInstructions} numberOfLines={2}>{t.instructions}</Text>
                            </View>
                            <TouchableOpacity
                              style={[s.smallIconBtn, { backgroundColor: C.primaryLight }]}
                              onPress={() => openEditTreatment(d.id, t)}
                            >
                              <Ionicons name="pencil-outline" size={13} color={C.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.smallIconBtn, { backgroundColor: C.dangerLight }]}
                              onPress={() => handleDeleteTreatment(d.id, t)}
                            >
                              <Ionicons name="trash-outline" size={13} color={C.danger} />
                            </TouchableOpacity>
                          </View>
                        ))
                      ) : (
                        <View style={s.emptyTreat}>
                          <Ionicons name="medkit-outline" size={28} color={C.slateLight} />
                          <Text style={s.emptyTreatTxt}>Henüz tedavi eklenmemiş</Text>
                        </View>
                      )}

                      {/* Tedavi Ekle butonu */}
                      <TouchableOpacity style={s.addTreatBtn} onPress={() => openCreateTreatment(d.id)}>
                        <Ionicons name="add-circle-outline" size={16} color={C.emerald} />
                        <Text style={s.addTreatTxt}>Tedavi Ekle</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}

          {!isLoading && diseases.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="leaf-outline" size={56} color={C.slateLight} />
              <Text style={s.emptyTxt}>Henüz hastalık eklenmemiş.</Text>
              <TouchableOpacity style={s.emptyAddBtn} onPress={openCreateDisease}>
                <Text style={s.emptyAddTxt}>İlk hastalığı ekle</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── Hastalık Modal ──────────────────────────────────────────── */}
      <Modal visible={isDiseaseModal} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={s.mOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.mContent}>
            <View style={s.mHandle} />
            <View style={s.mTitleRow}>
              <Text style={s.mTitle}>
                {modal.mode === 'createDisease' ? 'Yeni Hastalık' : 'Hastalığı Düzenle'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={s.mCloseBtn}>
                <Ionicons name="close" size={20} color={C.slateLight} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.label}>Hastalık Adı *</Text>
              <TextInput
                style={s.input}
                placeholder="örn: Domates Yanıklığı"
                placeholderTextColor={C.slateLight}
                value={diseaseForm.name}
                onChangeText={v => setDiseaseForm(p => ({ ...p, name: v }))}
              />
              <Text style={s.label}>Açıklama</Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="Hastalık açıklaması…"
                placeholderTextColor={C.slateLight}
                multiline
                numberOfLines={3}
                value={diseaseForm.description}
                onChangeText={v => setDiseaseForm(p => ({ ...p, description: v }))}
              />
              <Text style={s.label}>Model Etiketi *</Text>
              <TextInput
                style={s.input}
                placeholder="örn: Tomato__Blight"
                placeholderTextColor={C.slateLight}
                value={diseaseForm.modelLabel}
                onChangeText={v => setDiseaseForm(p => ({ ...p, modelLabel: v }))}
              />

              <View style={s.mActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeModal} disabled={saving}>
                  <Text style={s.cancelTxt}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.submitBtn, { backgroundColor: C.emerald }]} onPress={handleSaveDisease} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.submitTxt}>{modal.mode === 'createDisease' ? 'Oluştur' : 'Kaydet'}</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Tedavi Modal ────────────────────────────────────────────── */}
      <Modal visible={isTreatmentModal} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={s.mOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.mContent}>
            <View style={s.mHandle} />
            <View style={s.mTitleRow}>
              <Text style={s.mTitle}>
                {modal.mode === 'createTreatment' ? 'Yeni Tedavi' : 'Tedaviyi Düzenle'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={s.mCloseBtn}>
                <Ionicons name="close" size={20} color={C.slateLight} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.label}>Tedavi Başlığı *</Text>
              <TextInput
                style={s.input}
                placeholder="örn: Bakır Sülfat Uygulaması"
                placeholderTextColor={C.slateLight}
                value={treatmentForm.title}
                onChangeText={v => setTreatmentForm(p => ({ ...p, title: v }))}
              />
              <Text style={s.label}>Talimatlar *</Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="Uygulama talimatları…"
                placeholderTextColor={C.slateLight}
                multiline
                numberOfLines={4}
                value={treatmentForm.instructions}
                onChangeText={v => setTreatmentForm(p => ({ ...p, instructions: v }))}
              />
              <Text style={s.label}>Tedavi Türü</Text>
              <TypeSelector value={treatmentForm.type} onChange={v => setTreatmentForm(p => ({ ...p, type: v }))} />

              <View style={s.mActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeModal} disabled={saving}>
                  <Text style={s.cancelTxt}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.submitBtn, { backgroundColor: C.primary }]} onPress={handleSaveTreatment} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.submitTxt}>{modal.mode === 'createTreatment' ? 'Ekle' : 'Kaydet'}</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Stiller ─────────────────────────────────────────────────────────
const getStyles = (C: typeof LIGHT_C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.cardBg,
    justifyContent: 'center', alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.slate },
  headerSub: { fontSize: 12, color: C.slateLight, marginTop: 1 },
  addBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.emerald,
    justifyContent: 'center', alignItems: 'center',
    elevation: 3, shadowColor: C.emerald, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },

  // Error
  err: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.dangerLight, marginHorizontal: 20, borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  errTxt: { color: C.danger, fontSize: 13, flex: 1 },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 48 },

  // Card
  card: {
    backgroundColor: C.cardBg, borderRadius: 18, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  cardIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: C.emeraldLight,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.slate },
  cardSub: { fontSize: 12, color: C.slateLight, marginTop: 2 },
  treatBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  treatTxt: { fontSize: 11, color: C.primary, fontWeight: '600' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },

  // Accordion
  accordion: { paddingHorizontal: 16, paddingBottom: 12 },
  accordionDivider: { height: 1, backgroundColor: C.border, marginBottom: 12 },

  // Loading row
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingTxt: { color: C.slateLight, fontSize: 13 },

  // Treatment Row
  treatmentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  treatTypeBadge: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  treatTitle: { fontSize: 13, fontWeight: '700', color: C.slate },
  treatInstructions: { fontSize: 11, color: C.slateLight, marginTop: 2, lineHeight: 16 },
  smallIconBtn: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },

  // Empty treatment
  emptyTreat: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  emptyTreatTxt: { color: C.slateLight, fontSize: 12 },

  // Add treatment btn
  addTreatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: C.emerald, backgroundColor: C.emeraldLight,
    justifyContent: 'center',
  },
  addTreatTxt: { fontSize: 13, fontWeight: '700', color: C.emerald },

  // Empty screen
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTxt: { color: C.slateLight, fontSize: 15 },
  emptyAddBtn: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: C.emerald,
  },
  emptyAddTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  mOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  mContent: {
    backgroundColor: C.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  mHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 20,
  },
  mTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  mTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: C.slate },
  mCloseBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: C.bg,
    justifyContent: 'center', alignItems: 'center',
  },
  label: { fontSize: 12, fontWeight: '600', color: C.slateLight, marginBottom: 6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg, color: C.slate, borderRadius: 12, padding: 14,
    fontSize: 15, marginBottom: 14, borderWidth: 1, borderColor: C.border,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },

  // Type selector
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
  },
  typeBtnTxt: { fontSize: 13, fontWeight: '700' },

  // Modal actions
  mActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: C.bg, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  cancelTxt: { fontSize: 15, fontWeight: '600', color: C.slateLight },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
