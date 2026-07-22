import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { PeriodRecord } from '../types';
import { colors, radius, spacing, tagColor } from '../theme';
import { addDays, daysBetween, formatDateZh, isValidDateKey, isWithin, todayKey, uid } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { phaseNameZh } from '../services/periodPrediction';
import { recommendations } from '../services/recommendations';
import { Button, Card, Chip, SectionTitle } from '../components/ui';
import PeriodEditModal from '../components/PeriodEditModal';
import MiniCalendar from '../components/MiniCalendar';
import PeriodCustomFields, { FieldRow, buildFieldRows, toCustomFields } from '../components/PeriodCustomFields';

const PeriodScreen: React.FC = () => {
  const { data, prediction, phase, addPeriod, updatePeriod, deletePeriod } = useApp();
  const [recorder, setRecorder] = useState(data.users[0]?.id ?? 'u1');

  const today = todayKey();
  const [recordDate, setRecordDate] = useState(today);
  /** 展開「補記其他日期」的日曆;預設收合、直接記今天 */
  const [backfill, setBackfill] = useState(false);
  const [editing, setEditing] = useState<PeriodRecord | null>(null);
  // 記錄當下的自訂欄位(預設帶出記住的欄位範本)
  const [recordFields, setRecordFields] = useState<FieldRow[]>(() =>
    buildFieldRows(data.settings.periodFieldNames ?? [], [])
  );
  const sorted = useMemo(
    () => [...data.periods].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.periods]
  );
  const ongoing = sorted.find((p) => !p.endDate);

  /** 已記錄的經期日(供記錄日曆參考顯示) */
  const periodDays = useMemo(() => {
    const set = new Set<string>();
    for (const p of data.periods) {
      const end = p.endDate ?? addDays(p.startDate, 4);
      let d = p.startDate;
      while (d <= end) {
        set.add(d);
        d = addDays(d, 1);
      }
    }
    return set;
  }, [data.periods]);

  const recorderName = (id: string) => data.users.find((u) => u.id === id)?.name ?? '?';

  const validRecordDate = (): boolean => {
    if (!isValidDateKey(recordDate)) {
      notify('日期格式錯誤', '請用 YYYY-MM-DD');
      return false;
    }
    if (recordDate > today) {
      notify('日期不能在未來');
      return false;
    }
    return true;
  };

  const startPeriod = () => {
    if (ongoing) {
      return notify('已有進行中的紀錄', '請先記錄上一次經期結束。');
    }
    if (!validRecordDate()) return;
    const rec: PeriodRecord = {
      id: uid(),
      startDate: recordDate,
      recordedBy: recorder,
      customFields: toCustomFields(recordFields),
    };
    addPeriod(rec);
    notify('已記錄', `經期開始:${formatDateZh(recordDate)}(由 ${recorderName(recorder)} 記錄)`);
    // 重設為空白範本,供下次記錄使用
    setRecordFields(buildFieldRows(data.settings.periodFieldNames ?? [], []));
  };

  const endPeriod = () => {
    if (!ongoing) return;
    if (!validRecordDate()) return;
    if (recordDate < ongoing.startDate) {
      return notify('結束日期不能早於開始日期', `這次經期從 ${formatDateZh(ongoing.startDate)} 開始。`);
    }
    updatePeriod({ ...ongoing, endDate: recordDate });
    notify('已記錄', `經期結束:${formatDateZh(recordDate)}`);
  };

  const removeRecord = (p: PeriodRecord) => {
    confirmDialog(
      '刪除紀錄',
      `刪除 ${formatDateZh(p.startDate)} 開始的紀錄?`,
      () => deletePeriod(p.id),
      { confirmLabel: '刪除', destructive: true }
    );
  };

  const rec = phase ? recommendations[phase.phase] : null;
  const daysToNext = prediction ? daysBetween(today, prediction.nextStart) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
    >
      {/* 目前狀態 */}
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.periodDay }}>
        {phase ? (
          <>
            <Text style={s.statusPhase}>{phaseNameZh[phase.phase]}</Text>
            <Text style={s.statusDay}>週期第 {phase.dayOfCycle} 天</Text>
          </>
        ) : (
          <Text style={s.statusDay}>還沒有紀錄,從下方記錄第一次經期開始吧。</Text>
        )}
        {ongoing && (
          <Text style={s.ongoingTag}>
            ● 經期進行中(自 {formatDateZh(ongoing.startDate)} 起)
          </Text>
        )}
      </Card>

      {/* 預測 */}
      {prediction && (
        <Card>
          <SectionTitle>下次經期預測</SectionTitle>
          <Text style={s.predictMain}>
            {formatDateZh(prediction.windowStart)} – {formatDateZh(prediction.windowEnd)}
          </Text>
          <Text style={s.predictSub}>
            最可能:{formatDateZh(prediction.nextStart)}
            {daysToNext !== null && daysToNext >= 0 ? `(${daysToNext} 天後)` : '(可能遲到中)'}
          </Text>
          <Text style={s.predictMeta}>
            平均週期 {prediction.avgCycleLength} 天 · 平均經期 {prediction.avgPeriodLength} 天 ·
            推算排卵日 {formatDateZh(prediction.ovulationDate)}
          </Text>
          <Text style={s.predictMeta}>
            信心程度:{{ low: '低(紀錄越多越準)', medium: '中', high: '高' }[prediction.confidence]}
            (採用 {prediction.sampleCount} 個週期樣本)
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <MiniCalendar
              key={prediction.nextStart}
              initialMonth={prediction.nextStart}
              getMark={(key) => {
                // 最可能開始日:實心主色、白色粗體日期(取代原本的框線方框)
                if (key === prediction.nextStart)
                  return { bg: colors.primary, textColor: '#fff', textBold: true };
                // 歷史紀錄的經期日也顯示在這份日曆(往前翻月份可對照)
                if (periodDays.has(key)) return { bg: colors.periodDay };
                if (key === prediction.ovulationDate) return { bg: colors.ovulation };
                if (isWithin(key, prediction.windowStart, prediction.windowEnd))
                  return { bg: colors.predictedDay };
                return undefined;
              }}
              legend={[
                { color: colors.primary, label: '最可能開始日' },
                { color: colors.periodDay, label: '已記錄經期' },
                { color: colors.predictedDay, label: '可能區間' },
                { color: colors.ovulation, label: '排卵日' },
              ]}
            />
          </View>
        </Card>
      )}

      {/* 記錄操作 */}
      <Card>
        <SectionTitle>記錄經期</SectionTitle>
        <Text style={s.label}>由誰記錄?(家人/伴侶也可以協助)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs }}>
          {data.users.map((u) => (
            <Chip
              key={u.id}
              label={u.name}
              color={u.color}
              active={recorder === u.id}
              onPress={() => setRecorder(u.id)}
            />
          ))}
        </View>
        {/* 純按鈕記錄:預設記今天;要補記過去日期才展開日曆 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip
            label="📅 補記其他日期"
            active={backfill}
            onPress={() => {
              if (backfill) setRecordDate(today); // 收合時回到今天
              setBackfill(!backfill);
            }}
          />
          {backfill && recordDate !== today && (
            <Chip label="回到今天" color={colors.textMuted} onPress={() => setRecordDate(today)} />
          )}
        </View>
        {backfill && (
          <>
            <Text style={[s.label, { marginTop: spacing.xs }]}>
              點選日曆選擇記錄日期(粉色為已記錄的經期日)
            </Text>
            <MiniCalendar
              selected={recordDate}
              onSelect={setRecordDate}
              maxDate={today}
              getMark={(key) =>
                periodDays.has(key) ? { bg: colors.periodDay } : undefined
              }
            />
          </>
        )}
        {!ongoing && (
          <>
            <Text style={[s.label, { marginTop: spacing.md }]}>
              自訂紀錄(選填,例如:經前痛持續時間)
            </Text>
            <PeriodCustomFields fields={recordFields} onChange={setRecordFields} />
          </>
        )}
        {!ongoing ? (
          <Button
            label={`🩸 記錄經期開始(${recordDate === today ? '今天' : formatDateZh(recordDate)})`}
            onPress={startPeriod}
          />
        ) : (
          <Button
            label={`✅ 記錄經期結束(${recordDate === today ? '今天' : formatDateZh(recordDate)})`}
            onPress={endPeriod}
          />
        )}
      </Card>

      {/* 建議 */}
      {rec && (
        <Card>
          <SectionTitle>{rec.title}</SectionTitle>
          <Text style={s.recHeader}>🍽 飲食建議</Text>
          {rec.diet.map((t, i) => (
            <Text key={i} style={s.recItem}>
              · {t}
            </Text>
          ))}
          <Text style={s.recHeader}>🏃 行動建議</Text>
          {rec.activity.map((t, i) => (
            <Text key={i} style={s.recItem}>
              · {t}
            </Text>
          ))}
          <Text style={s.recHeader}>💡 小提醒</Text>
          {rec.tips.map((t, i) => (
            <Text key={i} style={s.recItem}>
              · {t}
            </Text>
          ))}
          <Text style={s.disclaimer}>以上為一般保健資訊,不能取代醫療診斷。</Text>
        </Card>
      )}

      {/* 歷史紀錄 */}
      <SectionTitle>歷史紀錄({sorted.length})</SectionTitle>
      {sorted.length === 0 && <Text style={s.empty}>尚無紀錄</Text>}
      {sorted.map((p) => (
        <TouchableOpacity key={p.id} onPress={() => setEditing(p)} onLongPress={() => removeRecord(p)}>
          <Card style={{ padding: spacing.md, marginBottom: spacing.sm }}>
            <Text style={s.historyMain}>
              {formatDateZh(p.startDate)}
              {p.endDate
                ? ` – ${formatDateZh(p.endDate)}(${daysBetween(p.startDate, p.endDate) + 1} 天)`
                : ' – 進行中'}
            </Text>
            {p.customFields?.map((f) => (
              <View key={f.name} style={s.historyFieldRow}>
                <View style={[s.fieldBadge, { backgroundColor: tagColor(f.name) }]}>
                  <Text style={s.fieldBadgeText}>{f.name}</Text>
                </View>
                <Text style={s.historyField}>{f.value}</Text>
              </View>
            ))}
            <Text style={s.historyMeta}>由 {recorderName(p.recordedBy)} 記錄(點一下編輯,長按刪除)</Text>
          </Card>
        </TouchableOpacity>
      ))}

      <PeriodEditModal visible={!!editing} record={editing} onClose={() => setEditing(null)} />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  statusPhase: { fontSize: 22, fontWeight: '800', color: colors.primary },
  statusDay: { fontSize: 14, color: colors.text, marginTop: 4 },
  ongoingTag: { fontSize: 13, color: colors.primary, marginTop: spacing.sm, fontWeight: '600' },
  predictMain: { fontSize: 20, fontWeight: '800', color: colors.text },
  predictSub: { fontSize: 14, color: colors.primary, fontWeight: '600', marginTop: 2 },
  predictMeta: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  recHeader: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  recItem: { fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 19 },
  disclaimer: { fontSize: 11, color: colors.textMuted, marginTop: spacing.md, fontStyle: 'italic' },
  empty: { color: colors.textMuted, fontSize: 13 },
  historyMain: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyFieldRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  fieldBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
  },
  fieldBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  historyField: { fontSize: 13, color: colors.text },
  historyMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

export default PeriodScreen;
