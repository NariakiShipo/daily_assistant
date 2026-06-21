import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PeriodCustomField } from '../types';
import { colors, radius, spacing } from '../theme';
import { notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';

export interface FieldRow {
  name: string;
  value: string;
}

/** 由「記住的範本欄位」+「這筆紀錄既有欄位」組出顯示用的欄位列 */
export function buildFieldRows(
  templateNames: string[],
  existing: PeriodCustomField[] = []
): FieldRow[] {
  const valueOf = new Map(existing.map((f) => [f.name, f.value]));
  return [
    ...templateNames.map((n) => ({ name: n, value: valueOf.get(n) ?? '' })),
    ...existing.filter((f) => !templateNames.includes(f.name)),
  ];
}

/** 把欄位列轉成要存進紀錄的 customFields(去掉空白值) */
export function toCustomFields(fields: FieldRow[]): PeriodCustomField[] | undefined {
  const out = fields
    .map((f) => ({ name: f.name.trim(), value: f.value.trim() }))
    .filter((f) => f.name && f.value);
  return out.length ? out : undefined;
}

interface Props {
  fields: FieldRow[];
  onChange: (fields: FieldRow[]) => void;
}

/** 自訂欄位編輯區(經前痛持續時間、症狀程度⋯),記錄與編輯共用 */
const PeriodCustomFields: React.FC<Props> = ({ fields, onChange }) => {
  const { addPeriodFieldName, removePeriodFieldName } = useApp();
  const [newFieldName, setNewFieldName] = useState('');

  const setFieldValue = (name: string, value: string) =>
    onChange(fields.map((f) => (f.name === name ? { ...f, value } : f)));

  const addField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    if (fields.some((f) => f.name === name)) {
      setNewFieldName('');
      return notify('已有同名欄位');
    }
    onChange([...fields, { name, value: '' }]);
    addPeriodFieldName(name); // 記住,之後新紀錄自動帶出
    setNewFieldName('');
  };

  const removeField = (name: string) => {
    onChange(fields.filter((f) => f.name !== name));
    removePeriodFieldName(name); // 從範本移除(其他紀錄已填的值會保留)
  };

  return (
    <View>
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
    </View>
  );
};

const s = StyleSheet.create({
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

export default PeriodCustomFields;
