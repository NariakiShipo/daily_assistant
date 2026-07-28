/**
 * 經血量 + 症狀的選擇器。
 *
 * PeriodRecord 早就有 flow / symptoms 兩個欄位,但一直沒有介面可以填,
 * 只能靠自訂欄位打字。這個元件同時給「記錄經期」與「編輯紀錄」兩處使用。
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FLOW_OPTIONS, FlowLevel, PERIOD_SYMPTOMS } from '../types';
import { colors, radius, spacing, tagColor } from '../theme';
import { notify } from '../utils/dialog';
import { Chip } from './ui';

interface Props {
  flow: FlowLevel | null;
  onChangeFlow: (flow: FlowLevel | null) => void;
  symptoms: string[];
  onChangeSymptoms: (symptoms: string[]) => void;
  /** 使用者自訂過的症狀(顯示在預設清單之後) */
  customSymptoms: string[];
  /** 新增一個自訂症狀到記住的清單 */
  onAddCustomSymptom: (name: string) => void;
}

/** 經血量對應的深淺:少量最淡、大量最深 */
const flowColor: Record<FlowLevel, string> = {
  light: '#F2A9C0',
  medium: '#E8638C',
  heavy: '#C13B63',
};

const PeriodSymptomFields: React.FC<Props> = ({
  flow,
  onChangeFlow,
  symptoms,
  onChangeSymptoms,
  customSymptoms,
  onAddCustomSymptom,
}) => {
  const [draft, setDraft] = useState('');

  // 預設 + 自訂 + 這筆已選的(相容對方裝置加過的症狀)
  const all = [...new Set([...PERIOD_SYMPTOMS, ...customSymptoms, ...symptoms])];

  const toggle = (name: string) =>
    onChangeSymptoms(
      symptoms.includes(name) ? symptoms.filter((x) => x !== name) : [...symptoms, name]
    );

  const addDraft = () => {
    const name = draft.trim();
    if (!name) return;
    if (name.length > 8) return notify('症狀名稱太長', '請用 8 個字以內。');
    if (!all.includes(name)) onAddCustomSymptom(name);
    if (!symptoms.includes(name)) onChangeSymptoms([...symptoms, name]);
    setDraft('');
  };

  return (
    <View>
      <Text style={s.label}>經血量(再點一下可取消)</Text>
      <View style={s.chips}>
        {FLOW_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            color={flowColor[o.value]}
            active={flow === o.value}
            onPress={() => onChangeFlow(flow === o.value ? null : o.value)}
          />
        ))}
      </View>

      <Text style={s.label}>症狀(可複選)</Text>
      <View style={s.chips}>
        {all.map((name) => (
          <Chip
            key={name}
            label={name}
            color={tagColor(name)}
            active={symptoms.includes(name)}
            onPress={() => toggle(name)}
          />
        ))}
      </View>
      <View style={s.row}>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="新增症狀,例如:偏頭痛"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={addDraft}
        />
        <TouchableOpacity style={s.addBtn} onPress={addDraft}>
          <Text style={s.addBtnText}>＋ 新增</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  addBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  addBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});

export default PeriodSymptomFields;
