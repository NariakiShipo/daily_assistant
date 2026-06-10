import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PeriodRecord } from '../types';
import { colors, radius, spacing } from '../theme';
import { formatDateZh, isWithin, todayKey } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import MiniCalendar from './MiniCalendar';

interface Props {
  visible: boolean;
  onClose: () => void;
  record: PeriodRecord | null;
}

const PeriodEditModal: React.FC<Props> = ({ visible, onClose, record }) => {
  const { updatePeriod, deletePeriod } = useApp();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(''); // 空字串 = 進行中
  const [mode, setMode] = useState<'start' | 'end'>('start');

  useEffect(() => {
    if (!visible || !record) return;
    setStartDate(record.startDate);
    setEndDate(record.endDate ?? '');
    setMode('start');
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
    await updatePeriod({ ...record, startDate, endDate: endDate || undefined });
    onClose();
  };

  const remove = () => {
    if (!record) return;
    confirmDialog(
      '刪除紀錄',
      '確定刪除這筆經期紀錄?',
      () => {
        deletePeriod(record.id);
        onClose();
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>編輯經期紀錄</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
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
            <Button label="儲存變更" onPress={() => void save()} />
            <Button label="刪除紀錄" variant="danger" onPress={remove} />
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </View>
      </View>
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
