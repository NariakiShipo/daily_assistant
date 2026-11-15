/**
 * 「記錄經期開始 / 結束」的彈出表單。
 *
 * 經期頁只留一顆按鈕,按下後才在這張底部表單裡挑日期、填經血量與症狀——
 * 與日曆頁按「＋」開啟 EventModal 新增行程的方式一致。
 * 有進行中的經期時,同一顆按鈕改為記錄「結束日」。
 */
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlowLevel, PeriodRecord } from '../types';
import { colors, radius, spacing } from '../theme';
import { formatDateZh, todayKey, uid } from '../utils/date';
import { notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import MiniCalendar from './MiniCalendar';
import PeriodCustomFields, { FieldRow, buildFieldRows, toCustomFields } from './PeriodCustomFields';
import PeriodSymptomFields from './PeriodSymptomFields';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 進行中的經期;有的話這次記錄的是「結束日」,否則是新的「開始日」 */
  ongoing: PeriodRecord | null;
  /** 已記錄的經期日(日曆上以粉色標示供對照) */
  periodDays: Set<string>;
}

const PeriodRecordModal: React.FC<Props> = ({ visible, onClose, ongoing, periodDays }) => {
  const { data, addPeriod, updatePeriod, addCustomSymptom } = useApp();
  const today = todayKey();
  const isEnd = !!ongoing;

  // 記錄者沿用上次選的人(成員被移除時退回第一位)
  const [recorder, setRecorder] = useState(data.users[0]?.id ?? 'u1');
  const recorderId = data.users.some((u) => u.id === recorder)
    ? recorder
    : (data.users[0]?.id ?? 'u1');
  const [date, setDate] = useState(today);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [flow, setFlow] = useState<FlowLevel | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);

  // 每次開啟都從「今天、空白範本」開始
  useEffect(() => {
    if (!visible) return;
    setDate(todayKey());
    setFields(buildFieldRows(data.settings.periodFieldNames ?? [], []));
    setFlow(null);
    setSymptoms([]);
    // data.settings.periodFieldNames 只在開啟時當初始範本,不需放進依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const recorderName = (id: string) => data.users.find((u) => u.id === id)?.name ?? '?';
  const dateLabel = date === today ? '今天' : formatDateZh(date);

  const save = () => {
    if (ongoing) {
      if (date < ongoing.startDate) {
        return notify(
          '結束日期不能早於開始日期',
          `這次經期從 ${formatDateZh(ongoing.startDate)} 開始。`
        );
      }
      updatePeriod({ ...ongoing, endDate: date });
      onClose();
      // 等表單收起再提示,避免原生 Alert 疊在關閉中的 Modal 上
      setTimeout(() => notify('已記錄', `經期結束:${formatDateZh(date)}`), 200);
      return;
    }
    const rec: PeriodRecord = {
      id: uid(),
      startDate: date,
      recordedBy: recorderId,
      customFields: toCustomFields(fields),
      flow: flow ?? undefined,
      symptoms: symptoms.length ? symptoms : undefined,
    };
    addPeriod(rec);
    onClose();
    setTimeout(
      () =>
        notify('已記錄', `經期開始:${formatDateZh(date)}(由 ${recorderName(recorderId)} 記錄)`),
      200
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{isEnd ? '記錄經期結束' : '記錄經期開始'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {ongoing && (
              <Text style={s.hint}>● 這次經期從 {formatDateZh(ongoing.startDate)} 開始。</Text>
            )}

            {!isEnd && (
              <>
                <Text style={s.label}>由誰記錄?(家人/伴侶也可以協助)</Text>
                <View style={s.chips}>
                  {data.users.map((u) => (
                    <Chip
                      key={u.id}
                      label={u.name}
                      color={u.color}
                      active={recorderId === u.id}
                      onPress={() => setRecorder(u.id)}
                    />
                  ))}
                </View>
              </>
            )}

            <Text style={s.label}>
              {isEnd ? '結束日期' : '開始日期'}(點日曆選擇;預設今天,粉色為已記錄的經期日)
            </Text>
            <View style={s.chips}>
              <Chip label={`${isEnd ? '結束' : '開始'}:${dateLabel}`} active />
              {date !== today && (
                <Chip label="回到今天" color={colors.textMuted} onPress={() => setDate(today)} />
              )}
            </View>
            {/* 每次開啟重新掛載,讓月份回到今天所在的月 */}
            <MiniCalendar
              key={visible ? 'open' : 'closed'}
              selected={date}
              onSelect={setDate}
              maxDate={today}
              getMark={(key) => (periodDays.has(key) ? { bg: colors.periodDay } : undefined)}
              legend={[{ color: colors.periodDay, label: '已記錄經期' }]}
            />

            {!isEnd && (
              <>
                <PeriodSymptomFields
                  flow={flow}
                  onChangeFlow={setFlow}
                  symptoms={symptoms}
                  onChangeSymptoms={setSymptoms}
                  customSymptoms={data.settings.customSymptoms ?? []}
                  onAddCustomSymptom={addCustomSymptom}
                />
                <Text style={[s.label, { marginTop: spacing.md }]}>
                  自訂紀錄(選填,例如:經前痛持續時間)
                </Text>
                <PeriodCustomFields fields={fields} onChange={setFields} />
              </>
            )}

            <Button
              label={`${isEnd ? '✅ 記錄經期結束' : '🩸 記錄經期開始'}(${dateLabel})`}
              onPress={save}
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  hint: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
});

export default PeriodRecordModal;
