/**
 * 記帳設定(設計稿 1k):當月上限、雙人算法、固定支出。
 *
 * 上限這一段刻意什麼都不做:沒有「快超過了」的提醒、沒有變色、沒有推播。
 * 使用者要的是「已用 / 剩餘」這個參考數字,不是一個會追著他跑的警示。
 */
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import {
  ExpenseKind,
  ExpenseWho,
  PAYMENT_OPTIONS,
  PaymentMethod,
  RecurringExpense,
  SharedSplit,
} from '../types';
import { uid } from '../utils/date';
import { findCategory, formatAmount, selectableCategories } from '../services/expenses';
import { confirmDialog, notify } from '../utils/dialog';
import CategoryIcon from '../components/CategoryIcon';
import Icon from '../components/Icon';
import { BothDot, ScreenHeader, Segmented, mutedSmall } from '../components/expenseUi';

interface Props {
  onBack: () => void;
  onManageCategories: () => void;
}

const ExpenseSettingsScreen: React.FC<Props> = ({ onBack, onManageCategories }) => {
  const {
    data,
    setBudget,
    setSharedSplit,
    setExpenseKeypad,
    saveRecurringExpense,
    deleteRecurringExpense,
  } = useApp();

  const self = data.users.find((u) => u.isPrimary) ?? data.users[0];
  const partner = data.users.find((u) => u.id !== self?.id) ?? data.users[1];
  const split = data.settings.sharedSplit ?? 'separate';
  const keypad = data.settings.expenseKeypad ?? 'app';

  const [selfLimit, setSelfLimit] = useState(String(data.settings.budget?.self ?? ''));
  const [partnerLimit, setPartnerLimit] = useState(String(data.settings.budget?.partner ?? ''));
  const [draft, setDraft] = useState<RecurringExpense | null>(null);

  /**
   * 邊打邊存,而不是等失焦才存:使用者填完直接按返回是很自然的動作,
   * 等 onBlur 的話那次輸入就沒了。
   * 空字串 = 不設上限,而不是 0——0 會被當成「上限是零元」。
   */
  const commitBudget = (which: 'self' | 'partner', raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    if (which === 'self') setSelfLimit(digits);
    else setPartnerLimit(digits);
    const n = Number(digits);
    setBudget({ ...data.settings.budget, [which]: n > 0 ? n : undefined });
  };

  const openNewRecurring = () => {
    const first = selectableCategories(data.expenseCategories, 'expense')[0];
    if (!first) {
      notify('請先建立一個支出分類');
      return;
    }
    setDraft({
      id: uid(),
      name: '',
      amount: 0,
      kind: 'expense',
      who: 'both',
      categoryId: first.id,
      payment: 'transfer',
      dayOfMonth: 1,
      startMonth: new Date().toISOString().slice(0, 7),
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      notify('請填一個名稱', '例如「房租」「Netflix」。');
      return;
    }
    if (draft.amount <= 0) {
      notify('請填金額');
      return;
    }
    saveRecurringExpense({ ...draft, name: draft.name.trim() });
    setDraft(null);
  };

  const removeDraft = () => {
    if (!draft) return;
    confirmDialog(
      `刪除「${draft.name}」?`,
      '已經自動記下的那幾筆帳目會留著,只是之後不再自動新增。',
      () => {
        deleteRecurringExpense(draft.id);
        setDraft(null);
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  const modeLabel = split === 'half' ? '各算一半' : '獨立一類';
  const modeExample =
    split === 'half'
      ? `一筆 680 的雙人支出,${self?.name ?? '自己'}與${partner?.name ?? '伴侶'}各算 340。`
      : '一筆 680 的雙人支出只出現在「雙人」,兩個人的上限都不受影響。';

  const draftCategory = draft ? findCategory(data.expenseCategories, draft.categoryId, draft.kind) : null;

  return (
    <View style={s.root}>
      <ScreenHeader title="記帳設定" onBack={onBack} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* 當月花費上限 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>當月花費上限</Text>
          <Text style={s.cardHint}>
            只用來在記帳頁顯示「已用 / 剩餘」,不會發送提醒、不會變色、不會跳出任何警示。雙人支出不設上限。
          </Text>
          <View style={s.limitRow}>
            <Text style={[s.limitName, { color: self?.color ?? colors.primary }]}>{self?.name ?? '自己'}</Text>
            <View style={s.limitField}>
              <Text style={s.currency}>NT$</Text>
              <TextInput
                style={s.limitInput}
                value={selfLimit}
                onChangeText={(t) => commitBudget('self', t)}
                keyboardType="number-pad"
                placeholder="不設"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
          <View style={s.limitRow}>
            <Text style={[s.limitName, { color: partner?.color ?? colors.accent }]}>
              {partner?.name ?? '伴侶'}
            </Text>
            <View style={s.limitField}>
              <Text style={s.currency}>NT$</Text>
              <TextInput
                style={s.limitInput}
                value={partnerLimit}
                onChangeText={(t) => commitBudget('partner', t)}
                keyboardType="number-pad"
                placeholder="不設"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* 雙人算法 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>「雙人」支出怎麼算進個人統計?</Text>
          {(
            [
              {
                value: 'separate' as SharedSplit,
                title: '獨立一類',
                desc: '雙人支出只出現在「雙人」,不計入任何人的上限。',
              },
              {
                value: 'half' as SharedSplit,
                title: '各算一半',
                desc: '雙人支出的一半分別加進自己與伴侶的統計與上限。',
              },
            ]
          ).map((o, i) => (
            <TouchableOpacity
              key={o.value}
              style={[s.choice, i > 0 && s.choiceDivider]}
              onPress={() => setSharedSplit(o.value)}
            >
              <Text style={s.check}>{split === o.value ? '◉' : '○'}</Text>
              <View style={s.flex}>
                <Text style={s.choiceTitle}>{o.title}</Text>
                <Text style={s.choiceDesc}>{o.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={s.note}>
            <Text style={s.noteText}>
              目前：<Text style={s.noteStrong}>{modeLabel}</Text>。{modeExample}
            </Text>
          </View>
        </View>

        {/* 固定支出 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>固定支出 · {data.recurringExpenses.length}</Text>
          <Text style={s.cardHint}>到期當天自動新增一筆,可在帳目清單裡修改或刪除那一筆。</Text>
          {data.recurringExpenses.map((r) => {
            const c = findCategory(data.expenseCategories, r.categoryId, r.kind);
            return (
              <TouchableOpacity key={r.id} style={s.recurRow} onPress={() => setDraft(r)}>
                <CategoryIcon category={c} size={20} />
                <View style={s.flex}>
                  <Text style={s.recurName}>{r.name}</Text>
                  <View style={s.recurMeta}>
                    <Text style={s.meta}>每月 {r.dayOfMonth} 日 · </Text>
                    {r.who === 'both' ? (
                      <>
                        <BothDot self={self?.color} partner={partner?.color} />
                        <Text style={s.meta}> 雙人</Text>
                      </>
                    ) : (
                      <Text style={s.meta}>{r.who === 'self' ? self?.name : partner?.name}</Text>
                    )}
                    <Text style={s.meta}>
                      {' · '}
                      {PAYMENT_OPTIONS.find((p) => p.value === r.payment)?.label}
                    </Text>
                  </View>
                </View>
                <Text style={s.recurAmount}>{formatAmount(r.amount)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={s.outlineBtn} onPress={openNewRecurring}>
            <Icon name="plus" size={16} color={colors.primary} />
            <Text style={s.outlineBtnText}>新增固定支出</Text>
          </TouchableOpacity>
        </View>

        {/* 金額鍵盤 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>金額鍵盤</Text>
          <Text style={s.cardHint}>App 內計算機可以直接加減,適合把幾筆併成一筆;系統鍵盤則是熟悉的數字鍵。</Text>
          <Segmented<'app' | 'system'>
            value={keypad}
            onChange={setExpenseKeypad}
            options={[
              { value: 'app', label: 'App 計算機' },
              { value: 'system', label: '系統數字鍵盤' },
            ]}
          />
        </View>

        <TouchableOpacity style={s.linkRow} onPress={onManageCategories}>
          <Text style={s.linkText}>管理分類</Text>
          <Text style={s.linkArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 新增 / 編輯固定支出 */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={s.backdrop}>
          <ScrollView style={s.sheet} contentContainerStyle={s.sheetInner}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>固定支出</Text>
              <TouchableOpacity onPress={() => setDraft(null)} accessibilityLabel="關閉">
                <Text style={s.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>名稱</Text>
            <TextInput
              style={s.input}
              value={draft?.name ?? ''}
              onChangeText={(t) => setDraft((d) => (d ? { ...d, name: t } : d))}
              placeholder="例如 房租"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>金額</Text>
            <TextInput
              style={s.input}
              value={draft && draft.amount > 0 ? String(draft.amount) : ''}
              onChangeText={(t) =>
                setDraft((d) => (d ? { ...d, amount: Number(t.replace(/[^\d]/g, '')) || 0 } : d))
              }
              keyboardType="number-pad"
              placeholder="12000"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>每月幾號</Text>
            <TextInput
              style={s.input}
              value={draft ? String(draft.dayOfMonth) : ''}
              onChangeText={(t) => {
                const n = Number(t.replace(/[^\d]/g, '')) || 1;
                setDraft((d) => (d ? { ...d, dayOfMonth: Math.max(1, Math.min(31, n)) } : d));
              }}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.fieldHint}>設 31 時,天數不足的月份會落在月底。</Text>

            <Text style={s.label}>算誰的</Text>
            <Segmented<ExpenseWho>
              value={draft?.who ?? 'both'}
              onChange={(w) => setDraft((d) => (d ? { ...d, who: w } : d))}
              options={[
                { value: 'self', label: self?.name ?? '自己', color: self?.color },
                { value: 'partner', label: partner?.name ?? '伴侶', color: partner?.color },
                { value: 'both', label: '雙人', color: colors.text },
              ]}
            />

            <Text style={s.label}>收支別</Text>
            <Segmented<ExpenseKind>
              value={draft?.kind ?? 'expense'}
              onChange={(k) =>
                setDraft((d) => {
                  if (!d) return d;
                  // 換邊時原分類屬於另一邊,改成新那邊的第一個
                  const first = selectableCategories(data.expenseCategories, k)[0];
                  return { ...d, kind: k, categoryId: first?.id ?? d.categoryId };
                })
              }
              options={[
                { value: 'expense', label: '支出', color: colors.primary },
                { value: 'income', label: '收入', color: colors.success },
              ]}
            />

            <Text style={s.label}>分類</Text>
            <View style={s.catRow}>
              {selectableCategories(data.expenseCategories, draft?.kind ?? 'expense').map((c) => {
                const on = c.id === draft?.categoryId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.catChip, on && s.catChipOn]}
                    onPress={() => setDraft((d) => (d ? { ...d, categoryId: c.id } : d))}
                  >
                    <CategoryIcon category={c} size={16} color={on ? colors.primary : colors.text} />
                    <Text style={[s.catChipText, on && { color: colors.primary }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>付款方式</Text>
            <Segmented<PaymentMethod>
              value={draft?.payment ?? 'transfer'}
              onChange={(p) => setDraft((d) => (d ? { ...d, payment: p } : d))}
              options={PAYMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />

            {!!draftCategory && (
              <Text style={s.fieldHint}>
                每月 {draft?.dayOfMonth} 日會自動記一筆「{draft?.name || draftCategory.name}」。
              </Text>
            )}

            <TouchableOpacity style={s.primaryBtn} onPress={saveDraft}>
              <Text style={s.primaryBtnText}>儲存</Text>
            </TouchableOpacity>
            {!!data.recurringExpenses.find((r) => r.id === draft?.id) && (
              <TouchableOpacity style={s.dangerBtn} onPress={removeDraft}>
                <Text style={s.dangerBtnText}>刪除這筆固定支出</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingTop: 4, gap: spacing.md },
  flex: { flex: 1 },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  cardHint: { fontSize: 12, lineHeight: 18, color: mutedSmall, marginBottom: 10 },

  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  limitName: { width: 56, fontSize: 14, fontWeight: '600' },
  limitField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  currency: { fontSize: 14, color: mutedSmall },
  limitInput: {
    flex: 1,
    textAlign: 'right',
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: spacing.sm },
  choiceDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  check: { fontSize: 16, color: colors.primary, lineHeight: 20 },
  choiceTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  choiceDesc: { fontSize: 12, lineHeight: 18, color: mutedSmall, marginTop: 2 },
  note: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, marginTop: 6 },
  noteText: { fontSize: 12, lineHeight: 18, color: colors.text },
  noteStrong: { fontWeight: '700' },

  recurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recurName: { fontSize: 14, fontWeight: '600', color: colors.text },
  recurMeta: { flexDirection: 'row', alignItems: 'center' },
  meta: { fontSize: 12, color: mutedSmall },
  recurAmount: { fontSize: 14, fontWeight: '700', color: colors.text },

  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  outlineBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.text },
  linkArrow: { fontSize: 20, color: colors.textMuted },

  backdrop: { flex: 1, backgroundColor: 'rgba(61,43,51,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
  },
  sheetInner: { padding: spacing.lg, paddingBottom: 40 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  sheetClose: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },

  label: { fontSize: 13, fontWeight: '600', color: mutedSmall, marginTop: spacing.md, marginBottom: 6 },
  fieldHint: { fontSize: 12, color: mutedSmall, marginTop: 6, lineHeight: 18 },
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

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  catChipOn: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  catChipText: { fontSize: 12, fontWeight: '600', color: colors.text },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerBtn: { alignItems: 'center', paddingVertical: spacing.md },
  dangerBtnText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});

export default ExpenseSettingsScreen;
