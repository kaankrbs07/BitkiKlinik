import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, StatusBar, TextInput,
  Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { dotnetClient } from '../../api/client';
import { useAppTheme } from '../../hooks/useAppTheme';

// ─── Tipler ───────────────────────────────────────────────────────────
interface AuditLogEntry {
  id: number;
  userId: string;
  timestamp: string;
  tableName: string;
  entityId: string;
  action: 'Insert' | 'Update' | 'Delete' | 'SoftDelete';
  oldValues: string | null;
  newValues: string | null;
  changedColumns: string | null;
}

interface SummaryItem {
  tableName: string;
  action: string;
  count: number;
}

// ─── Renk Paletleri ───────────────────────────────────────────────────
const LIGHT_COLORS = {
  primary: '#6366f1',
  primaryLight: '#eef2ff',
  emerald: '#10b981',
  emeraldLight: '#dcfce7',
  amber: '#f59e0b',
  amberLight: '#fef3c7',
  rose: '#f43f5e',
  roseLight: '#ffe4e6',
  violet: '#8b5cf6',
  violetLight: '#f5f3ff',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
  border: '#e2e8f0',
  cardBg: '#ffffff',
};

const DARK_COLORS = {
  primary: '#818cf8',
  primaryLight: '#312e81',
  emerald: '#34d399',
  emeraldLight: '#064e3b',
  amber: '#fbbf24',
  amberLight: '#78350f',
  rose: '#f87171',
  roseLight: '#7f1d1d',
  violet: '#a78bfa',
  violetLight: '#4c1d95',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
  border: '#334155',
  cardBg: '#1e293b',
};

// ─── Aksiyon → Renk & İkon ────────────────────────────────────────────
const ACTION_META: Record<string, { label: string; icon: any; getColor: (c: any) => string; getBg: (c: any) => string }> = {
  Insert:     { label: 'Ekleme',    icon: 'add-circle',        getColor: c => c.emerald,  getBg: c => c.emeraldLight },
  Update:     { label: 'Güncelleme',icon: 'create',            getColor: c => c.amber,    getBg: c => c.amberLight },
  Delete:     { label: 'Silme',     icon: 'trash',             getColor: c => c.rose,     getBg: c => c.roseLight },
  SoftDelete: { label: 'Pasife Alma',icon: 'eye-off',          getColor: c => c.violet,   getBg: c => c.violetLight },
};

// ─── Tablo Adı → Türkçe ───────────────────────────────────────────────
const TABLE_LABELS: Record<string, string> = {
  Users:    'Kullanıcılar',
  Disease:  'Hastalıklar',
  Treatment:'Tedaviler',
};

const ALL_TABLES = ['Tümü', 'Users', 'Disease', 'Treatment'];
const ALL_ACTIONS = ['Tümü', 'Insert', 'Update', 'Delete', 'SoftDelete'];

export default function AuditLogsScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(COLORS);

  // ── State ────────────────────────────────────────────────────────────
  const [logs, setLogs]               = useState<AuditLogEntry[]>([]);
  const [summary, setSummary]         = useState<SummaryItem[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // ── Filtreler ────────────────────────────────────────────────────────
  const [selectedTable, setSelectedTable]   = useState('Tümü');
  const [selectedAction, setSelectedAction] = useState('Tümü');
  const [showFilters, setShowFilters]       = useState(false);

  // ── Detay Modal ──────────────────────────────────────────────────────
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // ── Veri Çekme ───────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (pageNum = 1, append = false) => {
    try {
      const params: Record<string, any> = { page: pageNum, pageSize: 20 };
      if (selectedTable !== 'Tümü')  params.tableName = selectedTable;
      if (selectedAction !== 'Tümü') params.action    = selectedAction;

      const res = await dotnetClient.get('/admin/audit-logs', { params });
      const data: AuditLogEntry[] = res.data;
      const tp = parseInt(res.headers['x-total-pages'] ?? '1', 10);

      setLogs(prev => append ? [...prev, ...data] : data);
      setTotalPages(tp);
      setError(null);
    } catch {
      setError('Sistem günlükleri yüklenemedi.');
    }
  }, [selectedTable, selectedAction]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await dotnetClient.get('/admin/audit-logs/summary');
      setSummary(res.data.data ?? []);
    } catch {
      /* özet yüklenemezse sessiz geç */
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setPage(1);
    await Promise.all([fetchLogs(1, false), fetchSummary()]);
    setIsLoading(false);
  }, [fetchLogs, fetchSummary]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPage(1);
    await Promise.all([fetchLogs(1, false), fetchSummary()]);
    setIsRefreshing(false);
  }, [fetchLogs, fetchSummary]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || page >= totalPages) return;
    const next = page + 1;
    setIsLoadingMore(true);
    setPage(next);
    await fetchLogs(next, true);
    setIsLoadingMore(false);
  }, [isLoadingMore, page, totalPages, fetchLogs]);

  useEffect(() => { loadInitial(); }, [selectedTable, selectedAction]);

  // ── Tarih Formatlama ─────────────────────────────────────────────────
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // ── Özet: toplam işlem sayısı ─────────────────────────────────────────
  const totalOps = summary.reduce((s, i) => s + i.count, 0);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.slate} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Sistem Günlükleri</Text>
            <Text style={styles.headerSub}>Son 30 gün · {totalOps} işlem</Text>
          </View>
          <TouchableOpacity
            style={[styles.filterBtn, showFilters && { backgroundColor: COLORS.primary }]}
            onPress={() => setShowFilters(v => !v)}
          >
            <Ionicons name="filter" size={18} color={showFilters ? '#fff' : COLORS.slateLight} />
          </TouchableOpacity>
        </View>

        {/* ── Özet Kartlar ────────────────────────────────────────────── */}
        {summary.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {(['Insert','Update','Delete','SoftDelete'] as const).map(action => {
              const count = summary.filter(s => s.action === action).reduce((a, b) => a + b.count, 0);
              if (!count) return null;
              const meta = ACTION_META[action];
              return (
                <View key={action} style={[styles.summaryCard, { backgroundColor: meta.getBg(COLORS) }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.getColor(COLORS)} />
                  <Text style={[styles.summaryCount, { color: meta.getColor(COLORS) }]}>{count}</Text>
                  <Text style={[styles.summaryLabel, { color: meta.getColor(COLORS) }]}>{meta.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* ── Filtre Paneli ────────────────────────────────────────────── */}
        {showFilters && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.filterPanel}>
            <Text style={styles.filterLabel}>Tablo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {ALL_TABLES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, selectedTable === t && { backgroundColor: COLORS.primary }]}
                  onPress={() => setSelectedTable(t)}
                >
                  <Text style={[styles.chipText, selectedTable === t && { color: '#fff' }]}>
                    {TABLE_LABELS[t] ?? t}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterLabel, { marginTop: 12 }]}>İşlem Türü</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {ALL_ACTIONS.map(a => {
                const meta = ACTION_META[a];
                return (
                  <TouchableOpacity
                    key={a}
                    style={[styles.chip, selectedAction === a && { backgroundColor: meta ? meta.getColor(COLORS) : COLORS.primary }]}
                    onPress={() => setSelectedAction(a)}
                  >
                    <Text style={[styles.chipText, selectedAction === a && { color: '#fff' }]}>
                      {meta ? meta.label : 'Tümü'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── Hata ─────────────────────────────────────────────────────── */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={COLORS.rose} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Log Listesi ─────────────────────────────────────────────── */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Günlükler yükleniyor…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 60) {
                handleLoadMore();
              }
            }}
            scrollEventThrottle={400}
          >
            {logs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={COLORS.slateLight} />
                <Text style={styles.emptyText}>Henüz kayıt bulunmuyor</Text>
                <Text style={styles.emptySubText}>Seçilen filtrelere uygun işlem yok</Text>
              </View>
            ) : (
              logs.map((log, index) => {
                const meta = ACTION_META[log.action] ?? ACTION_META['Update'];
                const changedCols: string[] = log.changedColumns ? JSON.parse(log.changedColumns) : [];
                return (
                  <Animated.View key={log.id} entering={FadeInDown.delay(index * 40).duration(400)}>
                    <TouchableOpacity style={styles.logCard} onPress={() => setSelectedLog(log)} activeOpacity={0.85}>
                      {/* İkon */}
                      <View style={[styles.actionIcon, { backgroundColor: meta.getBg(COLORS) }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.getColor(COLORS)} />
                      </View>

                      {/* İçerik */}
                      <View style={{ flex: 1 }}>
                        <View style={styles.logTopRow}>
                          <View style={[styles.actionBadge, { backgroundColor: meta.getBg(COLORS) }]}>
                            <Text style={[styles.actionBadgeText, { color: meta.getColor(COLORS) }]}>
                              {meta.label}
                            </Text>
                          </View>
                          <View style={styles.tableBadge}>
                            <Text style={styles.tableBadgeText}>
                              {TABLE_LABELS[log.tableName] ?? log.tableName}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.logEntityId} numberOfLines={1}>
                          Kayıt #{log.entityId}
                        </Text>

                        {changedCols.length > 0 && (
                          <Text style={styles.changedCols} numberOfLines={1}>
                            Değişen: {changedCols.join(', ')}
                          </Text>
                        )}

                        <View style={styles.logMeta}>
                          <Ionicons name="person-outline" size={11} color={COLORS.slateLight} />
                          <Text style={styles.logMetaText}>ID: {log.userId}</Text>
                          <Ionicons name="time-outline" size={11} color={COLORS.slateLight} style={{ marginLeft: 8 }} />
                          <Text style={styles.logMetaText}>{formatDate(log.timestamp)}</Text>
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color={COLORS.slateLight} />
                    </TouchableOpacity>
                  </Animated.View>
                );
              })
            )}

            {isLoadingMore && (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Detay Modal ──────────────────────────────────────────────── */}
        <Modal visible={!!selectedLog} animationType="slide" transparent onRequestClose={() => setSelectedLog(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Günlük Detayı</Text>
                <TouchableOpacity onPress={() => setSelectedLog(null)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={COLORS.slateLight} />
                </TouchableOpacity>
              </View>

              {selectedLog && (() => {
                const meta = ACTION_META[selectedLog.action] ?? ACTION_META['Update'];
                const changedCols: string[] = selectedLog.changedColumns ? JSON.parse(selectedLog.changedColumns) : [];
                let oldObj: Record<string, any> = {};
                let newObj: Record<string, any> = {};
                try { oldObj = selectedLog.oldValues ? JSON.parse(selectedLog.oldValues) : {}; } catch {}
                try { newObj = selectedLog.newValues ? JSON.parse(selectedLog.newValues) : {}; } catch {}

                return (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Başlık Satırı */}
                    <View style={styles.detailBadgeRow}>
                      <View style={[styles.detailActionBadge, { backgroundColor: meta.getBg(COLORS) }]}>
                        <Ionicons name={meta.icon} size={14} color={meta.getColor(COLORS)} />
                        <Text style={[styles.detailActionText, { color: meta.getColor(COLORS) }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.detailTable}>{TABLE_LABELS[selectedLog.tableName] ?? selectedLog.tableName}</Text>
                    </View>

                    {/* Meta Bilgiler */}
                    <View style={styles.detailMeta}>
                      <DetailRow icon="person-outline" label="Kullanıcı ID" value={selectedLog.userId} COLORS={COLORS} />
                      <DetailRow icon="time-outline"   label="Zaman"        value={formatDate(selectedLog.timestamp)} COLORS={COLORS} />
                      <DetailRow icon="key-outline"    label="Kayıt ID"     value={selectedLog.entityId} COLORS={COLORS} />
                    </View>

                    {/* Değişen Kolonlar */}
                    {changedCols.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Değişen Alanlar</Text>
                        <View style={styles.changedColsWrap}>
                          {changedCols.map(col => (
                            <View key={col} style={[styles.colChip, { backgroundColor: COLORS.amberLight }]}>
                              <Text style={[styles.colChipText, { color: COLORS.amber }]}>{col}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Eski / Yeni Değerler */}
                    {(selectedLog.action === 'Update' || selectedLog.action === 'SoftDelete') && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Değişim Detayı</Text>
                        {changedCols.map(col => (
                          <View key={col} style={styles.diffRow}>
                            <Text style={styles.diffColName}>{col}</Text>
                            <View style={styles.diffValues}>
                              <View style={[styles.diffBox, { backgroundColor: COLORS.roseLight }]}>
                                <Text style={[styles.diffLabel, { color: COLORS.rose }]}>Önceki</Text>
                                <Text style={[styles.diffValue, { color: COLORS.rose }]} numberOfLines={3}>
                                  {String(oldObj[col] ?? '—')}
                                </Text>
                              </View>
                              <Ionicons name="arrow-forward" size={14} color={COLORS.slateLight} style={{ alignSelf: 'center' }} />
                              <View style={[styles.diffBox, { backgroundColor: COLORS.emeraldLight }]}>
                                <Text style={[styles.diffLabel, { color: COLORS.emerald }]}>Sonraki</Text>
                                <Text style={[styles.diffValue, { color: COLORS.emerald }]} numberOfLines={3}>
                                  {String(newObj[col] ?? '—')}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Insert / Delete için tek blok */}
                    {selectedLog.action === 'Insert' && selectedLog.newValues && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Eklenen Veri</Text>
                        <View style={[styles.jsonBlock, { backgroundColor: COLORS.emeraldLight }]}>
                          {Object.entries(newObj).map(([k, v]) => (
                            <Text key={k} style={[styles.jsonLine, { color: COLORS.emerald }]}>
                              <Text style={{ fontWeight: '700' }}>{k}:</Text> {String(v)}
                            </Text>
                          ))}
                        </View>
                      </View>
                    )}

                    {selectedLog.action === 'Delete' && selectedLog.oldValues && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Silinen Veri</Text>
                        <View style={[styles.jsonBlock, { backgroundColor: COLORS.roseLight }]}>
                          {Object.entries(oldObj).map(([k, v]) => (
                            <Text key={k} style={[styles.jsonLine, { color: COLORS.rose }]}>
                              <Text style={{ fontWeight: '700' }}>{k}:</Text> {String(v)}
                            </Text>
                          ))}
                        </View>
                      </View>
                    )}
                  </ScrollView>
                );
              })()}
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

// ─── Yardımcı Bileşen ─────────────────────────────────────────────────
function DetailRow({ icon, label, value, COLORS }: { icon: any; label: string; value: string; COLORS: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <Ionicons name={icon} size={14} color={COLORS.slateLight} style={{ width: 18 }} />
      <Text style={{ fontSize: 12, color: COLORS.slateLight, width: 90 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: COLORS.slate, flex: 1, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────
const getStyles = (COLORS: any) => StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
  backBtn:         { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  headerTitle:     { fontSize: 18, fontWeight: 'bold', color: COLORS.slate },
  headerSub:       { fontSize: 12, color: COLORS.slateLight, marginTop: 1 },
  filterBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  summaryScroll:   { maxHeight: 90, marginBottom: 4 },
  summaryCard:     { alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 16, minWidth: 80, gap: 4 },
  summaryCount:    { fontSize: 22, fontWeight: 'bold' },
  summaryLabel:    { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  filterPanel:     { marginHorizontal: 20, marginBottom: 12, backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  filterLabel:     { fontSize: 12, fontWeight: '700', color: COLORS.slateLight, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chip:            { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipText:        { fontSize: 13, fontWeight: '600', color: COLORS.slateLight },
  errorBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.roseLight, marginHorizontal: 20, borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText:       { color: COLORS.rose, fontSize: 13, flex: 1 },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:     { color: COLORS.slateLight, fontSize: 14 },
  listContent:     { paddingHorizontal: 20, paddingBottom: 40 },
  emptyState:      { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:       { fontSize: 17, fontWeight: '700', color: COLORS.slate },
  emptySubText:    { fontSize: 13, color: COLORS.slateLight, textAlign: 'center' },
  logCard:         { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBg, padding: 14, borderRadius: 16, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  actionIcon:      { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  logTopRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  actionBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionBadgeText: { fontSize: 11, fontWeight: '700' },
  tableBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  tableBadgeText:  { fontSize: 11, color: COLORS.slateLight, fontWeight: '600' },
  logEntityId:     { fontSize: 13, fontWeight: '600', color: COLORS.slate },
  changedCols:     { fontSize: 11, color: COLORS.slateLight, marginTop: 2 },
  logMeta:         { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  logMetaText:     { fontSize: 11, color: COLORS.slateLight },
  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent:    { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalTitle:      { flex: 1, fontSize: 20, fontWeight: 'bold', color: COLORS.slate },
  modalCloseBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  detailBadgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  detailActionBadge:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  detailActionText:{ fontSize: 13, fontWeight: '700' },
  detailTable:     { fontSize: 14, fontWeight: '600', color: COLORS.slateLight },
  detailMeta:      { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, marginBottom: 16 },
  detailSection:   { marginBottom: 16 },
  detailSectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  changedColsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colChip:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  colChipText:     { fontSize: 12, fontWeight: '700' },
  diffRow:         { marginBottom: 12 },
  diffColName:     { fontSize: 12, fontWeight: '700', color: COLORS.slateLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  diffValues:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  diffBox:         { flex: 1, borderRadius: 10, padding: 10 },
  diffLabel:       { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  diffValue:       { fontSize: 12, fontWeight: '500' },
  jsonBlock:       { borderRadius: 12, padding: 14, gap: 4 },
  jsonLine:        { fontSize: 12, lineHeight: 20 },
});
