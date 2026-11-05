/**
 * 選擇入學年度與系所,下載該年度的課程標準套用到畢業計畫。
 *
 * 預設值從課表猜:最近一個有班級名稱的學期(例如 115-1 資工三)→ 入學 113 學年度、系所前綴「資工」。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { GraduationPlan } from '../types';
import { colors, radius, spacing } from '../theme';
import { notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import {
  StandardDepartmentRef,
  currentAcademicYear,
  extractDepartmentStandard,
  fetchStandardIndex,
  fetchStandardYear,
  guessDepartments,
  guessFromTimetable,
  listSystems,
} from '../services/ntutStandard';
import { CREDIT_KEYS } from '../constants/ntut';

interface Props {
  visible: boolean;
  onClose: () => void;
  ownerName: string;
  plan: GraduationPlan;
  onSave: (plan: GraduationPlan) => void;
}

/** 「資工、電資」或「資工,電資」→ ['資工', '電資'] */
export const parsePrefixes = (text: string): string[] =>
  text
    .split(/[,、,，\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

const GraduationSetupModal: React.FC<Props> = ({ visible, onClose, ownerName, plan, onSave }) => {
  const { data } = useApp();
  const [yearText, setYearText] = useState('');
  const [index, setIndex] = useState<StandardDepartmentRef[] | null>(null);
  const [indexYear, setIndexYear] = useState<number | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [system, setSystem] = useState('四技');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string | null>(null);
  const [prefixText, setPrefixText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [guessPrefix, setGuessPrefix] = useState<string | null>(null);

  const year = Number(yearText);
  const yearValid = Number.isInteger(year) && year >= 80 && year <= 150;

  const loadIndex = async (y: number) => {
    setLoadingIndex(true);
    try {
      const list = await fetchStandardIndex(y);
      setIndex(list);
      setIndexYear(y);
    } catch (e) {
      setIndex(null);
      setIndexYear(null);
      notify('無法載入系所清單', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingIndex(false);
    }
  };

  // 開啟時帶入既有設定或從課表猜
  useEffect(() => {
    if (!visible) return;
    const guess = guessFromTimetable(data.semesters, data.courses, plan.ownerId);
    const y = plan.standard?.entryYear ?? guess.entryYear ?? currentAcademicYear();
    setYearText(String(y));
    setSystem(plan.standard?.system ?? '四技');
    setDepartment(plan.standard?.department ?? null);
    setQuery('');
    setGuessPrefix(guess.prefix);
    setPrefixText(
      plan.ownClassPrefixes.length ? plan.ownClassPrefixes.join('、') : guess.prefix ?? ''
    );
    void loadIndex(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const systems = useMemo(() => (index ? listSystems(index) : ['四技']), [index]);
  const suggested = useMemo(
    () => (index ? guessDepartments(index, system, guessPrefix) : []),
    [index, system, guessPrefix]
  );
  const departments = useMemo(() => {
    if (!index) return [];
    const q = query.trim();
    const list = index.filter((d) => d.system === system && (!q || d.department.includes(q)));
    // 建議的排前面
    const sug = new Set(suggested.map((d) => d.department));
    return [...list].sort((a, b) => Number(sug.has(b.department)) - Number(sug.has(a.department)));
  }, [index, system, query, suggested]);

  // 只有一個建議且尚未選擇時直接帶入
  useEffect(() => {
    if (!department && suggested.length === 1) setDepartment(suggested[0].department);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  const apply = async () => {
    if (!yearValid) return notify('入學學年度格式錯誤', '請填民國學年度,例如 113。');
    if (!department) return notify('請選擇系所');
    if (indexYear !== year) return notify('請先載入這個學年度的系所清單', '按「載入系所清單」。');
    setDownloading(true);
    try {
      const raw = await fetchStandardYear(year);
      const standard = extractDepartmentStandard(raw, year, system, department);
      const next: GraduationPlan = {
        ...plan,
        standard,
        ownClassPrefixes: parsePrefixes(prefixText),
      };
      onSave(next);
      const total = standard.credits[CREDIT_KEYS.total];
      notify(
        '已套用課程標準',
        `${year} 學年度入學 · ${system} · ${department}` +
          (total ? `\n最低畢業學分 ${total}` : '') +
          `\n必修科目 ${standard.courses.filter((c) => '○△●▲'.includes(c.type)).length} 列,規定 ${standard.rules.length} 條。`
      );
      onClose();
    } catch (e) {
      notify('下載課程標準失敗', e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>選擇課程標準</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.hint}>
              畢業門檻依「入學學年度」的課程標準,不是修課當年的。資料來自北科課程系統公開的課程標準,
              由北科課程好朋友整理。套用到「{ownerName}」。
            </Text>

            <Text style={s.label}>入學學年度(民國)</Text>
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={yearText}
                onChangeText={setYearText}
                placeholder="例如 113"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
              <View style={{ width: spacing.sm }} />
              <Chip
                label={loadingIndex ? '載入中…' : indexYear === year ? '✓ 已載入' : '載入系所清單'}
                color={colors.accent}
                active={indexYear !== year && !loadingIndex}
                onPress={() => {
                  if (!yearValid) return notify('入學學年度格式錯誤', '請填民國學年度,例如 113。');
                  if (!loadingIndex) void loadIndex(year);
                }}
              />
            </View>

            <Text style={s.label}>學制</Text>
            <View style={s.chips}>
              {systems.map((sys) => (
                <Chip
                  key={sys}
                  label={sys}
                  active={system === sys}
                  onPress={() => {
                    setSystem(sys);
                    setDepartment(null);
                  }}
                />
              ))}
            </View>

            <Text style={s.label}>系所{suggested.length ? `(依課表班級「${guessPrefix}」建議)` : ''}</Text>
            <TextInput
              style={s.input}
              value={query}
              onChangeText={setQuery}
              placeholder="搜尋系所,例如 資工"
              placeholderTextColor={colors.textMuted}
            />
            {loadingIndex ? (
              <View style={s.loadingBox}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !index ? (
              <Text style={s.note}>尚未載入系所清單。</Text>
            ) : departments.length === 0 ? (
              <Text style={s.note}>沒有符合的系所。</Text>
            ) : (
              <View style={s.list}>
                {departments.slice(0, 80).map((d) => {
                  const active = department === d.department;
                  const sug = suggested.some((x) => x.department === d.department);
                  return (
                    <TouchableOpacity
                      key={`${d.system}-${d.department}-${d.division}`}
                      style={[s.item, active && s.itemActive]}
                      onPress={() => setDepartment(d.department)}
                    >
                      <Text style={[s.itemText, active && s.itemTextActive]}>{d.department}</Text>
                      {sug && <Text style={s.sugTag}>建議</Text>}
                    </TouchableOpacity>
                  );
                })}
                {departments.length > 80 && (
                  <Text style={s.note}>還有 {departments.length - 80} 個,請用搜尋縮小範圍。</Text>
                )}
              </View>
            )}

            <Text style={s.label}>本系的開課班級前綴(可多個,用「、」分開)</Text>
            <TextInput
              style={s.input}
              value={prefixText}
              onChangeText={setPrefixText}
              placeholder="例如 資工"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.note}>
              開課班級以這些字開頭的專業課算本系(專業必修 / 專業選修),其他系開的歸入跨域及自由選修。
              電資學士班可填「電資、資工」。
            </Text>

            <Button
              label={downloading ? '下載中(約 0.25MB)…' : '下載並套用課程標準'}
              onPress={() => void apply()}
              disabled={downloading || !department}
            />
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  loadingBox: { paddingVertical: spacing.lg, alignItems: 'center' },
  list: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    maxHeight: 260,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemActive: { backgroundColor: colors.primarySoft },
  itemText: { fontSize: 14, color: colors.text },
  itemTextActive: { color: colors.primary, fontWeight: '700' },
  sugTag: { fontSize: 11, color: colors.accent, fontWeight: '700' },
  note: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 },
});

export default GraduationSetupModal;
