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
import { formatDateZh, isWithin, todayKey } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import MiniCalendar from './MiniCalendar';
import PeriodCustomFields, { FieldRow, buildFieldRows, toCustomFields } from './PeriodCustomFields';
import PeriodSymptomFields from './PeriodSymptomFields';

interface Props {
  visible: boolean;
  onClose: () => void;
  record: PeriodRecord | null;
}

const PeriodEditModal: React.FC<Props> = ({ visible, onClose, record }) => {
  const { data, updatePeriod, deletePeriod, addCustomSymptom } = useApp();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(''); // 空字串 = 進行中
  const [mode, setMode] = useState<'start' | 'end'>('start');
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [flow, setFlow] = useState<FlowLevel | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);

  useEffect(() => {
    if (!visible || !record) return;
    setStartDate(record.startDate);
    setEndDate(record.endDate ?? '');
    setMode('start');
    // 欄位 = 記住的範本欄位 + 這筆紀錄自己有的欄位(填回既有值)
    setFields(buildFieldRows(data.settings.periodFieldNames ?? [], record.customFields));
    setFlow(record.flow ?? null);
    setSymptoms(record.symptoms ?? []);
    // data.settings.periodFieldNames 只在開啟時當初始範本,不需放進依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, record]);

  const today = todayKey();

  const pickDate = (key: string) => {
    if (mode === 'start') {
      if (endDate && key > endDate) {
        return notify('開始日不能晚於結束日', `目前結束日為 ${formatDateZh(endDate)}。`);
      }
      setStartDate(key);
    } else {
      if (key < startDate) {
        return notify('結束日不能早於開始日', `目前開始日為 ${formatDateZh(startDate)}。`);
      }
      setEndDate(key);
    }
  };

  const save = async () => {
    if (!record) return;
    await updatePeriod({
      ...record,
      startDate,
      endDate: endDate || undefined,
      customFields: toCustomFields(fields),
      flow: flow ?? undefined,
      symptoms: symptoms.length ? symptoms : undefined,
    });
    onClose();
  };

  const remove = () => {
    if (!record) return;
    confirmDialog(
      '刪除紀錄',
      '確定刪除這筆經期紀錄?',
      () => {
        void deletePeriod(record.id).then(onClose, (e: unknown) =>
          notify('刪除失敗', e instanceof Error ? e.message : String(e))
        );
      },
      { confirmLabel: '刪除', destructive: true }
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
            <Text style={s.headerTitle}>編輯經期紀錄</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.label}>正在調整哪個日期?</Text>
            <View style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
              <Chip
                label={`開始:${startDate ? formatDateZh(startDate) : '—'}`}
                active={mode === 'start'}
                onPress={() => setMode('start')}
              />
              <Chip
                label={`結束:${endDate ? formatDateZh(endDate) : '進行中'}`}
                active={mode === 'end'}
                onPress={() => setMode('end')}
              />
            </View>

            <MiniCalendar
              key={record?.id}
              selected={mode === 'start' ? startDate : endDate || null}
              onSelect={pickDate}
              maxDate={today}
              initialMonth={startDate || undefined}
              getMark={(key) => {
                if (key === startDate) return { bg: colors.periodDay, border: colors.primary };
                if (endDate && isWithin(key, startDate, endDate))
                  return { bg: colors.periodDay };
                return undefined;
              }}
              legend={[{ color: colors.periodDay, label: '這次經期' }]}
            />

            {!!endDate && (
              <Button
                label="清除結束日(標記為進行中)"
                variant="outline"
                onPress={() => setEndDate('')}
              />
            )}

            <PeriodSymptomFields
              flow={flow}
              onChangeFlow={setFlow}
              symptoms={symptoms}
              onChangeSymptoms={setSymptoms}
              customSymptoms={data.settings.customSymptoms ?? []}
              onAddCustomSymptom={addCustomSymptom}
            />

            {/* 自訂欄位紀錄 */}
            <Text style={[s.label, { marginTop: spacing.md }]}>
              自訂紀錄(例如:經前痛持續時間、症狀程度)
            </Text>
            <PeriodCustomFields fields={fields} onChange={setFields} />

            <Button label="儲存變更" onPress={() => void save()} />
            <Button label="刪除紀錄" variant="danger" onPress={remove} />
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
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: spacing.sm },
});

export default PeriodEditModal;
