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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { CourseEntry, SemesterMeta } from '../types';
import { colors, radius, spacing } from '../theme';
import { isValidDateKey } from '../utils/date';
import { notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import {
  NtutSelection,
  PreparedCourse,
  defaultSemesterRange,
  describeRuns,
  fetchSemesterCourses,
  parseCourseSelection,
  prepareCourses,
  toCourseEntries,
} from '../services/ntutCourse';

export interface ImportResult {
  semester: SemesterMeta;
  ownerId: string;
  /** 實際寫入課表的項目(供呼叫端做衝突掃描) */
  entries: CourseEntry[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 匯入到誰的課表 */
  ownerId: string;
  /** 匯入完成;呼叫端接手個人行程的衝突掃描 */
  onImported: (result: ImportResult) => void;
}

type Step = 'input' | 'loading' | 'preview';
type OverwriteMode = 'replace-imported' | 'replace-all';
type ManualPolicy = 'keep-manual' | 'prefer-import';

/** 兩個時段是否重疊(節次索引;無時段課不參與) */
const overlaps = (
  a: { weekday: number; start: number; end: number },
  c: CourseEntry
): boolean =>
  a.weekday >= 1 &&
  a.weekday === c.weekday &&
  a.start <= c.endPeriod &&
  a.end >= c.startPeriod;

/** 讀取使用者挑選的 JSON 檔內容 */
async function readPickedFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // 部分平台對 .json 的 MIME 判斷不一,放寬類型再由解析階段把關
    type: ['application/json', 'text/plain', 'text/json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const webFile = (asset as { file?: File }).file;
  if (Platform.OS === 'web' && webFile) return await webFile.text();
  return await FileSystem.readAsStringAsync(asset.uri);
}

const ImportCourseModal: React.FC<Props> = ({ visible, onClose, ownerId, onImported }) => {
  const { data, importCourses, upsertSemester } = useApp();

  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [selection, setSelection] = useState<NtutSelection | null>(null);
  const [prepared, setPrepared] = useState<PreparedCourse[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState<OverwriteMode>('replace-imported');
  const [manualPolicy, setManualPolicy] = useState<ManualPolicy>('keep-manual');

  useEffect(() => {
    if (!visible) return;
    setStep('input');
    setText('');
    setSelection(null);
    setPrepared([]);
    setMissing([]);
  }, [visible]);

  const ownerName = data.users.find((u) => u.id === ownerId)?.name ?? '?';

  /** 此成員在目標學期已有的課(判斷首次匯入/覆蓋選項用) */
  const bucket = useMemo(
    () =>
      selection
        ? data.courses.filter(
            (c) => c.ownerId === ownerId && c.semesterId === selection.semesterId
          )
        : [],
    [data.courses, ownerId, selection]
  );
  const bucketImported = useMemo(() => bucket.filter((c) => c.source === 'ntut'), [bucket]);
  const bucketManual = useMemo(() => bucket.filter((c) => c.source !== 'ntut'), [bucket]);

  /** 「只覆蓋課表」時會保留的手動課中,與新課表撞到的 */
  const manualClashes = useMemo(
    () =>
      bucketManual.filter((mc) => prepared.some((p) => p.runs.some((r) => overlaps(r, mc)))),
    [bucketManual, prepared]
  );

  const totalCredits = prepared.reduce((sum, p) => sum + (p.credit ?? 0), 0);
  const noTimeCourses = prepared.filter((p) => p.runs.length === 0 && p.skipped.length === 0);

  const parseAndFetch = async (raw: string) => {
    let sel: NtutSelection;
    try {
      sel = parseCourseSelection(raw);
    } catch (e) {
      notify('解析失敗', e instanceof Error ? e.message : String(e));
      return;
    }
    setStep('loading');
    try {
      const all = await fetchSemesterCourses(sel.year, sel.sem);
      const { prepared: prep, missing: miss } = prepareCourses(all, sel.courseIds);
      if (!prep.length) {
        notify('找不到課程', `在 ${sel.semesterId} 學期總表中找不到這些課號。`);
        setStep('input');
        return;
      }
      // 學期起訖:已有此學期就沿用設定,否則帶預設值
      const existing = data.semesters.find((s) => s.id === sel.semesterId);
      const range = existing ?? defaultSemesterRange(sel.year, sel.sem);
      setSelection(sel);
      setPrepared(prep);
      setMissing(miss);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      setMode('replace-imported');
      setManualPolicy('keep-manual');
      setStep('preview');
    } catch (e) {
      notify('下載失敗', e instanceof Error ? e.message : String(e));
      setStep('input');
    }
  };

  const pickFile = async () => {
    try {
      const content = await readPickedFile();
      if (content === null) return; // 使用者取消
      setText(content);
      await parseAndFetch(content);
    } catch (e) {
      notify('讀取檔案失敗', e instanceof Error ? e.message : String(e));
    }
  };

  const doImport = () => {
    if (!selection) return;
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      return notify('學期日期格式錯誤', '請用 YYYY-MM-DD,例如 2026-09-15。');
    }
    if (endDate <= startDate) return notify('學期迄日需晚於起日');

    let entries = toCourseEntries(prepared, ownerId, selection.semesterId);
    let removeIds: string[] = [];
    if (bucket.length) {
      if (mode === 'replace-all') {
        removeIds = bucket.map((c) => c.id);
      } else {
        removeIds = bucketImported.map((c) => c.id);
        if (manualClashes.length) {
          if (manualPolicy === 'prefer-import') {
            removeIds.push(...manualClashes.map((c) => c.id));
          } else {
            // 手動課優先:撞到保留課程的時段不匯入
            entries = entries.filter(
              (e) =>
                !manualClashes.some((mc) =>
                  overlaps({ weekday: e.weekday, start: e.startPeriod, end: e.endPeriod }, mc)
                )
            );
          }
        }
      }
    }

    const semester: SemesterMeta = {
      id: selection.semesterId,
      startDate,
      endDate,
      className: selection.className,
    };
    upsertSemester(semester);
    importCourses(removeIds, entries);
    onImported({ semester, ownerId, entries });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>匯入北科課表</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {step === 'input' && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.hint}>
                從「北科課程好朋友」(ntut-course.gnehs.net)匯出選課 JSON
                後,選擇檔案或直接貼上內容。將匯入到「{ownerName}」的課表。
              </Text>
              <Button label="📂 選擇 course.json 檔案" onPress={() => void pickFile()} />
              <Text style={s.label}>或貼上 JSON 內容</Text>
              <TextInput
                style={[s.input, s.jsonInput]}
                value={text}
                onChangeText={setText}
                placeholder='{"key":"my-couse-data-115-1","data":"[\\"362048\\",…]"}'
                placeholderTextColor={colors.textMuted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label="解析課表"
                variant="outline"
                disabled={!text.trim()}
                onPress={() => void parseAndFetch(text)}
              />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          )}

          {step === 'loading' && (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={s.loadingText}>下載課程資料中(約 0.7MB)⋯</Text>
            </View>
          )}

          {step === 'preview' && selection && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.summary}>
                {selection.semesterId} 學期
                {selection.className ? ` · ${selection.className}` : ''} · {prepared.length} 門課
                {totalCredits > 0 ? ` · ${totalCredits} 學分` : ''} · 匯入到「{ownerName}」
              </Text>

              {prepared.map((p) => (
                <View key={p.courseId} style={s.courseRow}>
                  <Text style={s.courseTitle}>
                    {p.title}
                    {p.credit ? `(${p.credit} 學分)` : ''}
                  </Text>
                  <Text style={s.courseMeta}>
                    {p.runs.length ? describeRuns(p.runs) : '無固定時間 → 放入「無時段」欄'}
                    {p.location ? ` · ${p.location}` : ''}
                    {p.teacher ? ` · ${p.teacher}` : ''}
                  </Text>
                  {p.skipped.map((w) => (
                    <Text key={w} style={s.warn}>
                      ⚠ 無法排入:{w}
                    </Text>
                  ))}
                </View>
              ))}
              {missing.length > 0 && (
                <Text style={s.warn}>⚠ 總表中找不到課號:{missing.join('、')}</Text>
              )}
              {noTimeCourses.length > 0 && (
                <Text style={s.note}>
                  ℹ 無固定時間的課程({noTimeCourses.map((p) => p.title).join('、')}
                  )會放在課表最右側的「無時段」欄,不參與行程衝突判斷。
                </Text>
              )}

              <Text style={s.label}>學期起訖(判斷行程衝突的範圍,可修改)</Text>
              <View style={s.dateRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-09-15"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
                <Text style={s.dateDash}>–</Text>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="2027-01-16"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>

              {bucket.length > 0 ? (
                <>
                  <Text style={s.label}>
                    「{ownerName}」在 {selection.semesterId} 已有 {bucket.length} 筆課程時段
                    (匯入 {bucketImported.length} 筆、手動 {bucketManual.length}
                    筆),要如何覆蓋?
                  </Text>
                  <View style={s.chips}>
                    <Chip
                      label="只覆蓋課表(保留手動課程)"
                      active={mode === 'replace-imported'}
                      onPress={() => setMode('replace-imported')}
                    />
                    <Chip
                      label="全部覆蓋"
                      color={colors.danger}
                      active={mode === 'replace-all'}
                      onPress={() => setMode('replace-all')}
                    />
                  </View>
                  {mode === 'replace-imported' && manualClashes.length > 0 && (
                    <>
                      <Text style={s.warn}>
                        ⚠ 手動課程「
                        {[...new Set(manualClashes.map((c) => c.title))].join('、')}
                        」與新課表時段重疊,要以哪邊為準?
                      </Text>
                      <View style={s.chips}>
                        <Chip
                          label="保留手動課(該時段不匯入)"
                          active={manualPolicy === 'keep-manual'}
                          onPress={() => setManualPolicy('keep-manual')}
                        />
                        <Chip
                          label="以匯入課為準(刪除手動課)"
                          color={colors.danger}
                          active={manualPolicy === 'prefer-import'}
                          onPress={() => setManualPolicy('prefer-import')}
                        />
                      </View>
                    </>
                  )}
                </>
              ) : (
                <Text style={s.note}>首次匯入此學期,將直接填入課表。</Text>
              )}

              <Button label="匯入課表" onPress={doImport} />
              <Button label="重新選擇" variant="outline" onPress={() => setStep('input')} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          )}
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
    maxHeight: '88%',
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
  jsonInput: { height: 96, textAlignVertical: 'top' },
  loadingBox: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  loadingText: { marginTop: spacing.md, color: colors.textMuted, fontSize: 13 },
  summary: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  courseRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  courseTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  courseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  warn: { fontSize: 12, color: colors.warning, marginTop: spacing.xs },
  note: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateDash: { marginHorizontal: spacing.sm, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
});

export default ImportCourseModal;
