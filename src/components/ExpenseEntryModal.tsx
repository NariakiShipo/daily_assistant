/**
 * 記一筆(設計稿 4b)。
 *
 * 照「簡單記帳」的最少步驟:點分類格 → 按金額 → 完成,三下就結束。
 * 備註、日期、付款方式、收據都收成一列膠囊擺在金額下面,想填才填,不擋主流程。
 */
import React, { useEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import {
  Expense,
  ExpenseKind,
  ExpenseWho,
  PAYMENT_OPTIONS,
  PaymentMethod,
} from '../types';
import { fromDateKey, todayKey, uid, weekdayZh } from '../utils/date';
import { findCategory, selectableCategories } from '../services/expenses';
import {
  CalcState,
  calcBackspace,
  calcDigit,
  calcFromAmount,
  calcOperator,
  calcPending,
  calcValue,
  emptyCalc,
} from '../services/calculator';
import { confirmDialog, notify } from '../utils/dialog';
import CategoryIcon from './CategoryIcon';
import Icon from './Icon';
import MiniCalendar from './MiniCalendar';
import { Segmented, mutedSmall } from './expenseUi';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有帳目時傳入;記新的一筆時為 null */
  expense: Expense | null;
  /** 記新的一筆時的預設日期與歸屬 */
  defaultDate: string;
  defaultWho: ExpenseWho;
  /** 「＋ 新分類」要跳去分類管理 */
  onManageCategories: () => void;
}

const ExpenseEntryModal: React.FC<Props> = ({
  visible,
  onClose,
  expense,
  defaultDate,
  defaultWho,
  onManageCategories,
}) => {
  const { data, addExpense, updateExpense, deleteExpense } = useApp();
  const useAppKeypad = (data.settings.expenseKeypad ?? 'app') === 'app';

  const self = data.users.find((u) => u.isPrimary) ?? data.users[0];
  const partner = data.users.find((u) => u.id !== self?.id) ?? data.users[1];

  const [kind, setKind] = useState<ExpenseKind>('expense');
  const [who, setWho] = useState<ExpenseWho>(defaultWho);
  const [categoryId, setCategoryId] = useState('');
  const [calc, setCalc] = useState<CalcState>(emptyCalc);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [receiptUri, setReceiptUri] = useState<string | undefined>(undefined);
  const [pickingDate, setPickingDate] = useState(false);

  const categories = useMemo(
    () => selectableCategories(data.expenseCategories, kind, expense?.categoryId),
    [data.expenseCategories, kind, expense?.categoryId]
  );

  // 每次打開都重設,否則上一筆的金額會留在畫面上被誤記成這一筆
  useEffect(() => {
    if (!visible) return;
    if (expense) {
      setKind(expense.kind);
      setWho(expense.who);
      setCategoryId(expense.categoryId);
      setCalc(calcFromAmount(expense.amount));
      setNote(expense.note ?? '');
      setDate(expense.date);
      setPayment(expense.payment);
      setReceiptUri(expense.receiptUri);
    } else {
      setKind('expense');
      setWho(defaultWho);
      setCategoryId('');
      setCalc(emptyCalc);
      setNote('');
      setDate(defaultDate);
      setPayment('cash');
      setReceiptUri(undefined);
    }
    setPickingDate(false);
  }, [visible, expense, defaultDate, defaultWho]);

  // 切支出 / 收入時,原本選的分類屬於另一邊,得清掉
  useEffect(() => {
    if (categoryId && !categories.some((c) => c.id === categoryId)) setCategoryId('');
  }, [categories, categoryId]);

  const selected = categoryId ? findCategory(data.expenseCategories, categoryId, kind) : null;
  const amount = calcValue(calc);
  const pending = calcPending(calc);
  const canSave = !!categoryId && amount > 0;

  const pickReceipt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('需要相簿權限', '要附收據照片,請先在系統設定裡允許存取相簿。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]) setReceiptUri(res.assets[0].uri);
  };

  const save = () => {
    if (!canSave) return;
    const base: Expense = {
      id: expense?.id ?? uid(),
      amount,
      kind,
      who,
      categoryId,
      date,
      note: note.trim() || undefined,
      payment,
      receiptUri,
      recurringId: expense?.recurringId,
      createdBy: expense?.createdBy ?? self?.id ?? 'u1',
    };
    if (expense) updateExpense(base);
    else addExpense(base);
    onClose();
  };

  const remove = () => {
    if (!expense) return;
    confirmDialog('刪除這筆帳?', expense.note || undefined, () => {
      void deleteExpense(expense.id).catch((e: Error) => notify('刪除失敗', e.message));
      onClose();
    }, { confirmLabel: '刪除', destructive: true });
  };

  const d = fromDateKey(date);
  const dateLabel =
    date === todayKey()
      ? `今天 ${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getMonth() + 1}/${d.getDate()} 週${weekdayZh[d.getDay()]}`;

  /** 鍵盤上一顆普通的鍵;tint 是 ⌫ ＋ － 那幾顆粉底的 */
  const key = (label: string, onPress: () => void, tint?: boolean) => (
    <TouchableOpacity key={label} style={[s.key, tint && s.keyTint]} onPress={onPress}>
      <Text style={[s.keyText, tint && s.keyTextTint]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheet}>
          <View style={s.head}>
            <TouchableOpacity style={s.roundBtn} onPress={onClose} accessibilityLabel="關閉">
              <Icon name="close" size={16} color={colors.primary} />
            </TouchableOpacity>
            <Segmented<ExpenseKind>
              style={s.kindSeg}
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: '支出', color: colors.primary },
                { value: 'income', label: '收入', color: colors.success },
              ]}
            />
            {expense ? (
              <TouchableOpacity style={s.roundBtn} onPress={remove} accessibilityLabel="刪除這筆">
                <Text style={s.deleteMark}>✕</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.roundBtn} />
            )}
          </View>

          <Segmented<ExpenseWho>
            style={s.whoSeg}
            value={who}
            onChange={setWho}
            options={[
              { value: 'self', label: self?.name ?? '自己', color: self?.color },
              { value: 'partner', label: partner?.name ?? '伴侶', color: partner?.color },
              { value: 'both', label: '雙人', color: colors.text },
            ]}
          />

          {pickingDate ? (
            <View style={s.datePicker}>
              <MiniCalendar
                selected={date}
                initialMonth={date}
                onSelect={(k) => {
                  setDate(k);
                  setPickingDate(false);
                }}
              />
            </View>
          ) : (
            <ScrollView style={s.grid} contentContainerStyle={s.gridInner} showsVerticalScrollIndicator={false}>
              {categories.map((c) => {
                const on = c.id === categoryId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.cell, on && s.cellOn]}
                    onPress={() => setCategoryId(c.id)}
                  >
                    <CategoryIcon category={c} size={24} color={on ? colors.primary : colors.text} />
                    <Text style={[s.cellText, on && s.cellTextOn]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={[s.cell, s.cellNew]} onPress={onManageCategories}>
                <Icon name="plus" size={22} color={colors.primary} />
                <Text style={[s.cellText, { color: colors.primary }]}>新分類</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          <View style={s.pad}>
            <View style={s.amountRow}>
              <View style={[s.amountIcon, !selected && { opacity: 0.35 }]}>
                {selected ? (
                  <CategoryIcon category={selected} size={20} color={colors.primary} />
                ) : (
                  <Icon name="more" size={20} color={colors.primary} />
                )}
              </View>
              <Text style={s.amountCat} numberOfLines={1}>
                {selected?.name ?? '先選分類'}
              </Text>
              <View style={s.flex} />
              {!!pending && <Text style={s.pending}>{pending}</Text>}
              <Text style={s.currency}>NT$</Text>
              <Text style={s.amount}>{calc.entry}</Text>
              <View style={s.caret} />
            </View>

            <View style={s.noteRow}>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="備註（選填）"
                placeholderTextColor={colors.textMuted}
              />
              {(data.settings.recentExpenseNotes ?? []).slice(0, 3).map((n) => (
                <TouchableOpacity key={n} style={s.noteChip} onPress={() => setNote(n)}>
                  <Text style={s.noteChipText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.metaRow}>
              <TouchableOpacity style={s.datePill} onPress={() => setPickingDate((v) => !v)}>
                <Text style={s.datePillText}>{dateLabel} ▾</Text>
              </TouchableOpacity>
              <View style={s.sep} />
              {PAYMENT_OPTIONS.map((o) => {
                const on = o.value === payment;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[s.payPill, on && s.payPillOn]}
                    onPress={() => setPayment(o.value)}
                  >
                    <Text style={[s.payText, on && s.payTextOn]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[s.receiptBtn, !!receiptUri && s.receiptBtnOn]}
                onPress={() => void pickReceipt()}
                accessibilityLabel={receiptUri ? '已附收據,點一下更換' : '附收據照片'}
              >
                <Icon name="camera" size={16} color={receiptUri ? colors.primary : mutedSmall} />
              </TouchableOpacity>
            </View>

            {useAppKeypad ? (
              <View style={s.keypad}>
                {key('7', () => setCalc((c) => calcDigit(c, '7')))}
                {key('8', () => setCalc((c) => calcDigit(c, '8')))}
                {key('9', () => setCalc((c) => calcDigit(c, '9')))}
                <TouchableOpacity
                  style={[s.key, s.keyTint]}
                  onPress={() => setCalc(calcBackspace)}
                  accessibilityLabel="刪除一位"
                >
                  <Icon name="backspace" size={22} color={colors.primary} />
                </TouchableOpacity>
                {key('4', () => setCalc((c) => calcDigit(c, '4')))}
                {key('5', () => setCalc((c) => calcDigit(c, '5')))}
                {key('6', () => setCalc((c) => calcDigit(c, '6')))}
                {key('＋', () => setCalc((c) => calcOperator(c, '+')), true)}
                {key('1', () => setCalc((c) => calcDigit(c, '1')))}
                {key('2', () => setCalc((c) => calcDigit(c, '2')))}
                {key('3', () => setCalc((c) => calcDigit(c, '3')))}
                {/* 「完成」跨兩列,跟簡單記帳一樣是鍵盤上最大的那一顆 */}
                <TouchableOpacity
                  style={[s.key, s.keyDone, !canSave && s.keyDisabled]}
                  onPress={save}
                  disabled={!canSave}
                >
                  <Text style={s.keyDoneText}>完成</Text>
                </TouchableOpacity>
                {key('.', () => setCalc((c) => calcDigit(c, '.')))}
                {key('0', () => setCalc((c) => calcDigit(c, '0')))}
                {key('－', () => setCalc((c) => calcOperator(c, '-')), true)}
              </View>
            ) : (
              <View style={s.systemPad}>
                <TextInput
                  style={s.systemInput}
                  value={calc.entry === '0' ? '' : calc.entry}
                  onChangeText={(t) => setCalc({ entry: t.replace(/[^\d.]/g, '') || '0', acc: null, op: null })}
                  keyboardType="decimal-pad"
                  placeholder="金額"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <TouchableOpacity
                  style={[s.systemDone, !canSave && s.keyDisabled]}
                  onPress={save}
                  disabled={!canSave}
                >
                  <Text style={s.keyDoneText}>完成</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,43,51,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    maxHeight: '94%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteMark: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  kindSeg: { width: 180 },
  whoSeg: { marginHorizontal: spacing.lg },

  grid: { maxHeight: 246 },
  gridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: spacing.sm,
  },
  // 4 欄:扣掉左右各 16 的邊與 3 個 8 的間距後平分
  cell: {
    width: '23%',
    height: 70,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  cellOn: { backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  cellNew: { backgroundColor: colors.background, borderStyle: 'dashed', borderColor: colors.primary },
  cellText: { fontSize: 12, fontWeight: '600', color: colors.text },
  cellTextOn: { color: colors.primary, fontWeight: '700' },

  datePicker: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: 300 },

  pad: {
    marginTop: 'auto',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 34,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCat: { fontSize: 14, fontWeight: '700', color: colors.primary, maxWidth: 96 },
  flex: { flex: 1 },
  pending: { fontSize: 13, color: mutedSmall, marginRight: 4 },
  currency: { fontSize: 14, fontWeight: '700', color: mutedSmall },
  amount: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  caret: { width: 2, height: 30, borderRadius: 1, backgroundColor: colors.primary },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  noteInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text,
  },
  noteChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  noteChipText: { fontSize: 12, fontWeight: '600', color: colors.text },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  datePill: {
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  datePillText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  sep: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 2 },
  payPill: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  payPillOn: { backgroundColor: colors.accent },
  payText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  payTextOn: { color: '#fff' },
  receiptBtn: {
    marginLeft: 'auto',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptBtnOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  key: {
    width: '23.5%',
    height: 46,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 21, fontWeight: '600', color: colors.text },
  keyTint: { backgroundColor: colors.primarySoft, borderColor: colors.periodDay },
  keyTextTint: { color: colors.primary, fontWeight: '700', fontSize: 22 },
  // 高度 = 兩列 46 + 一個 6 的間距
  keyDone: {
    height: 98,
    backgroundColor: colors.primary,
    borderWidth: 0,
  },
  keyDoneText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  keyDisabled: { opacity: 0.4 },

  systemPad: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 10 },
  systemInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  systemDone: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
});

export default ExpenseEntryModal;
