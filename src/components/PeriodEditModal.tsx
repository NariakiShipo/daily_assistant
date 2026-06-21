import React, { useEffect, useState } from 'react';
import {
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

interface FieldRow {
  name: string;
  value: string;
}

const PeriodEditModal: React.FC<Props> = ({ visible, onClose, record }) => {
  const { data, updatePeriod, deletePeriod, addPeriodFieldName, removePeriodFieldName } = useApp();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(''); // 空字串 = 進行中
  const [mode, setMode] = useState<'start' | 'end'>('start');
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [newFieldName, setNewFieldName] = useState('');

  useEffect(() => {
    if (!visible || !record) return;
    setStartDate(record.startDate);
    setEndDate(record.endDate ?? '');
    setMode('start');
    setNewFieldName('');
    // 欄位 = 記住的範本欄位 + 這筆紀錄自己有的欄位(填回既有值)
    const names = data.settings.periodFieldNames ?? [];
    const existing = record.customFields ?? [];
    const valueOf = new Map(existing.map((f) => [f.name, f.value]));
    const merged: FieldRow[] = [
      ...names.map((n) => ({ name: n, value: valueOf.get(n) ?? '' })),
      ...existing.filter((f) => !names.includes(f.name)),
    ];
    setFields(merged);
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

  const setFieldValue = (name: string, value: string) =>
    setFields((cur) => cur.map((f) => (f.name === name ? { ...f, value } : f)));

  const addField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    if (fields.some((f) => f.name === name)) {
      setNewFieldName('');
      return notify('已有同名欄位');
    }
    setFields((cur) => [...cur, { name, value: '' }]);
    addPeriodFieldName(name); // 記住,之後新紀錄自動帶出
    setNewFieldName('');
  };

  const removeField = (name: string) => {
    setFields((cur) => cur.filter((f) => f.name !== name));
    removePeriodFieldName(name); // 從範本移除(其他紀錄已填的值會保留)
  };

  const save = async () => {
    if (!record) return;
    const customFields = fields
      .map((f) => ({ name: f.name.trim(), value: f.value.trim() }))
      .filter((f) => f.name && f.value);
    await updatePeriod({
      ...record,
      startDate,
      endDate: endDate || undefined,
      customFields: customFields.length ? customFields : undefined,
    });
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

            {/* 自訂欄位紀錄 */}
            <Text style={[s.label, { marginTop: spacing.md }]}>
              自訂紀錄(例如:經前痛持續時間、症狀程度)
            </Text>
            {fields.map((f) => (
              <View key={f.name} style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldName}>{f.name}</Text>
                  <TextInput
                    style={s.input}
                    value={f.value}
                    onChangeText={(v) => setFieldValue(f.name, v)}
                    placeholder="例如:2 小時 / 輕微"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <TouchableOpacity
                  style={s.fieldRemove}
                  onPress={() => removeField(f.name)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.fieldRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {fields.length === 0 && (
              <Text style={s.fieldEmpty}>尚無自訂欄位,在下方新增一個吧。</Text>
            )}
            <View style={s.addRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={newFieldName}
                onChangeText={setNewFieldName}
                placeholder="新增欄位名稱,例如:經前痛持續時間"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={addField}
              />
              <TouchableOpacity style={s.addBtn} onPress={addField}>
                <Text style={s.addBtnText}>＋ 新增</Text>
              </TouchableOpacity>
            </View>

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
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.sm },
  fieldName: { fontSize: 12, color: colors.text, fontWeight: '600', marginBottom: 4 },
  fieldRemove: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  fieldRemoveText: { fontSize: 16, color: colors.textMuted },
  fieldEmpty: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  addBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  addBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});

export default PeriodEditModal;
