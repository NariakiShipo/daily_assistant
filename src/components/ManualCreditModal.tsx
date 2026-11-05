/**
 * 手動加入的學分:抵免、轉學、暑修、他校課程等課表上沒有的學分。
 */
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
import { CreditCategory, ManualCredit } from '../types';
import { colors, radius, spacing } from '../theme';
import { CATEGORY_LABELS, CATEGORY_ORDER, GE_DIMENSIONS } from '../constants/ntut';
import { uid } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { Button, Chip } from './ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有項目;新增時為 null */
  editing: ManualCredit | null;
  onSave: (item: ManualCredit) => void;
  onDelete: (id: string) => void;
}

const ManualCreditModal: React.FC<Props> = ({ visible, onClose, editing, onSave, onDelete }) => {
  const [title, setTitle] = useState('');
  const [creditText, setCreditText] = useState('');
  const [category, setCategory] = useState<CreditCategory>('proElective');
  const [dimension, setDimension] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(editing?.title ?? '');
    setCreditText(editing ? String(editing.credit) : '');
    setCategory(editing?.category ?? 'proElective');
    setDimension(editing?.dimension ?? null);
    setNote(editing?.note ?? '');
  }, [visible, editing]);

  const save = () => {
    const name = title.trim();
    const credit = Number(creditText);
    if (!name) return notify('請輸入名稱');
    if (!Number.isFinite(credit) || credit <= 0) return notify('學分需為大於 0 的數字');
    onSave({
      id: editing?.id ?? uid(),
      title: name,
      credit,
      category,
      dimension: category === 'generalEd' && dimension ? dimension : undefined,
      note: note.trim() || undefined,
    });
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    confirmDialog('刪除', `確定刪除「${editing.title}」?`, () => {
      onDelete(editing.id);
      onClose();
    }, { confirmLabel: '刪除', destructive: true });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{editing ? '編輯手動學分' : '手動加入學分'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.hint}>課表上沒有、但教務處已承認的學分:抵免、轉學、暑修、他校或海外課程。</Text>
            <Text style={s.label}>名稱</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="例如:微積分(抵免)"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.label}>學分</Text>
            <TextInput
              style={s.input}
              value={creditText}
              onChangeText={setCreditText}
              placeholder="例如 3"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
            <Text style={s.label}>類別</Text>
            <View style={s.chips}>
              {CATEGORY_ORDER.map((cat) => (
                <Chip
                  key={cat}
                  label={CATEGORY_LABELS[cat]}
                  color={colors.accent}
                  active={category === cat}
                  onPress={() => setCategory(cat)}
                />
              ))}
            </View>
            {category === 'generalEd' && (
              <>
                <Text style={s.label}>博雅向度</Text>
                <View style={s.chips}>
                  {GE_DIMENSIONS.map((d) => (
                    <Chip
                      key={d}
                      label={d}
                      color={colors.success}
                      active={dimension === d}
                      onPress={() => setDimension(dimension === d ? null : d)}
                    />
                  ))}
                </View>
              </>
            )}
            <Text style={s.label}>備註(選填)</Text>
            <TextInput
              style={s.input}
              value={note}
              onChangeText={setNote}
              placeholder="例如:113-1 抵免、暑修"
              placeholderTextColor={colors.textMuted}
            />
            <Button label={editing ? '儲存變更' : '加入'} onPress={save} />
            {editing && <Button label="刪除" variant="danger" onPress={remove} />}
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
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.xs },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default ManualCreditModal;
