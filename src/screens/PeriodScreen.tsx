import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { PeriodRecord } from '../types';
import { colors, radius, spacing } from '../theme';
import { daysBetween, formatDateZh, todayKey, uid } from '../utils/date';
import { phaseNameZh } from '../services/periodPrediction';
import { recommendations } from '../services/recommendations';
import { Button, Card, Chip, SectionTitle } from '../components/ui';

const PeriodScreen: React.FC = () => {
  const { data, prediction, phase, addPeriod, updatePeriod, deletePeriod } = useApp();
  const [recorder, setRecorder] = useState(data.users[0]?.id ?? 'u1');

  const today = todayKey();
  const sorted = useMemo(
    () => [...data.periods].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.periods]
  );
  const ongoing = sorted.find((p) => !p.endDate);

  const recorderName = (id: string) => data.users.find((u) => u.id === id)?.name ?? '?';

  const startPeriod = () => {
    if (ongoing) {
      return Alert.alert('已有進行中的紀錄', '請先記錄上一次經期結束。');
    }
    const rec: PeriodRecord = {
      id: uid(),
      startDate: today,
      recordedBy: recorder,
    };
    addPeriod(rec);
    Alert.alert('已記錄', `經期開始:${formatDateZh(today)}(由 ${recorderName(recorder)} 記錄)`);
  };

  const endPeriod = () => {
    if (!ongoing) return;
    updatePeriod({ ...ongoing, endDate: today });
    Alert.alert('已記錄', `經期結束:${formatDateZh(today)}`);
  };

  const removeRecord = (p: PeriodRecord) => {
    Alert.alert('刪除紀錄', `刪除 ${formatDateZh(p.startDate)} 開始的紀錄?`, [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: () => deletePeriod(p.id) },
    ]);
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
        {!ongoing ? (
          <Button label={`記錄今天經期開始(${formatDateZh(today)})`} onPress={startPeriod} />
        ) : (
          <Button label={`記錄今天經期結束(${formatDateZh(today)})`} onPress={endPeriod} />
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
        <TouchableOpacity key={p.id} onLongPress={() => removeRecord(p)}>
          <Card style={{ padding: spacing.md, marginBottom: spacing.sm }}>
            <Text style={s.historyMain}>
              {formatDateZh(p.startDate)}
              {p.endDate
                ? ` – ${formatDateZh(p.endDate)}(${daysBetween(p.startDate, p.endDate) + 1} 天)`
                : ' – 進行中'}
            </Text>
            <Text style={s.historyMeta}>由 {recorderName(p.recordedBy)} 記錄(長按可刪除)</Text>
          </Card>
        </TouchableOpacity>
      ))}
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
  historyMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

export default PeriodScreen;
