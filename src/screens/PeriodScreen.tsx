import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { FLOW_LABELS, PeriodRecord } from '../types';
import { colors, radius, spacing, tagColor } from '../theme';
import { addDays, daysBetween, formatDateZh, isWithin, todayKey } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { phaseNameZh } from '../services/periodPrediction';
import { recommendations } from '../services/recommendations';
import { cycleLengths, symptomCounts } from '../services/periodStats';
import { Button, Card, SectionTitle } from '../components/ui';
import PeriodEditModal from '../components/PeriodEditModal';
import PeriodRecordModal from '../components/PeriodRecordModal';
import MiniCalendar from '../components/MiniCalendar';

const PeriodScreen: React.FC = () => {
  const { data, prediction, phase, deletePeriod } = useApp();

  const today = todayKey();
  /** 「記錄經期」表單是否開啟(與日曆頁新增行程一樣,按鈕按下才彈出表單填寫) */
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<PeriodRecord | null>(null);
  const sorted = useMemo(
    () => [...data.periods].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.periods]
  );
  const ongoing = sorted.find((p) => !p.endDate);

  /** 已記錄的經期日(供預測日曆與記錄表單的日曆參考顯示) */
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

  const removeRecord = (p: PeriodRecord) => {
    confirmDialog(
      '刪除紀錄',
      `刪除 ${formatDateZh(p.startDate)} 開始的紀錄?`,
      () => {
        void deletePeriod(p.id).catch((e: unknown) =>
          notify('刪除失敗', e instanceof Error ? e.message : String(e))
        );
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  const rec = phase ? recommendations[phase.phase] : null;
  const daysToNext = prediction ? daysBetween(today, prediction.nextStart) : null;

  const topSymptoms = useMemo(() => symptomCounts(data.periods).slice(0, 6), [data.periods]);
  const cycles = useMemo(() => cycleLengths(data.periods).slice(-8), [data.periods]);
  const maxCycle = useMemo(() => Math.max(...cycles.map((c) => c.days), 1), [cycles]);

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

      {/* 記錄操作:只留一顆按鈕,日期與細節到彈出的表單裡填(與日曆頁新增行程相同的方式) */}
      <Card>
        <SectionTitle>記錄經期</SectionTitle>
        <Text style={s.label}>
          {ongoing
            ? `經期進行中(自 ${formatDateZh(ongoing.startDate)} 起),結束時按下方按鈕記錄結束日。`
            : '按下方按鈕,在表單裡選擇日期(預設今天)並填寫經血量、症狀等細節。'}
        </Text>
        <Button
          label={ongoing ? '✅ 記錄經期結束' : '🩸 記錄經期開始'}
          onPress={() => setRecording(true)}
        />
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

      {/* 統計 */}
      {(topSymptoms.length > 0 || cycles.length > 0) && (
        <Card>
          <SectionTitle>統計</SectionTitle>
          {cycles.length > 0 && (
            <>
              <Text style={s.label}>近期週期長度(最近 {cycles.length} 次)</Text>
              {cycles.map((c) => (
                <View key={c.startDate} style={s.barRow}>
                  <Text style={s.barLabel}>{formatDateZh(c.startDate)}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${(c.days / maxCycle) * 100}%` }]} />
                  </View>
                  <Text style={s.barValue}>{c.days} 天</Text>
                </View>
              ))}
            </>
          )}
          {topSymptoms.length > 0 && (
            <>
              <Text style={[s.label, { marginTop: spacing.md }]}>最常記錄的症狀</Text>
              <View style={s.badgeWrap}>
                {topSymptoms.map((sym) => (
                  <View key={sym.name} style={[s.fieldBadge, { backgroundColor: tagColor(sym.name) }]}>
                    <Text style={s.fieldBadgeText}>
                      {sym.name} ×{sym.count}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
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
            {(p.flow || p.symptoms?.length) && (
              <View style={s.badgeWrap}>
                {p.flow && (
                  <View style={[s.fieldBadge, { backgroundColor: colors.primary }]}>
                    <Text style={s.fieldBadgeText}>經血量 {FLOW_LABELS[p.flow]}</Text>
                  </View>
                )}
                {p.symptoms?.map((name) => (
                  <View key={name} style={[s.fieldBadge, { backgroundColor: tagColor(name) }]}>
                    <Text style={s.fieldBadgeText}>{name}</Text>
                  </View>
                ))}
              </View>
            )}
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

      <PeriodRecordModal
        visible={recording}
        onClose={() => setRecording(false)}
        ongoing={ongoing ?? null}
        periodDays={periodDays}
      />
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
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  barLabel: { fontSize: 11, color: colors.textMuted, width: 58 },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primarySoft,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  barValue: { fontSize: 11, color: colors.text, width: 42, textAlign: 'right' },
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
