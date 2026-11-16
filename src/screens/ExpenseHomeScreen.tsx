/**
 * 記帳首頁(設計稿 4a)。
 *
 * 資訊順序照「簡單記帳」:月支出 / 月收入兩個數字 → 圓餅(圓心結餘)→ 按日分組的明細,
 * 全部在一屏裡,不用切頁就知道這個月怎麼樣。
 *
 * 上限只在「月支出」下面寫一行「上限 · 剩」與一條單色細線——
 * 沒有變色、沒有推播、沒有任何「快超支了」的提示,這是使用者明確要求的。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { Expense } from '../types';
import {
  WhoFilter,
  amountFor,
  budgetState,
  categoryBreakdown,
  formatAmount,
  formatCurrency,
  formatShort,
  groupByDate,
  inMonth,
  monthKey,
  topSlices,
  totals,
  visibleTo,
  findCategory,
} from '../services/expenses';
import { fromDateKey, todayKey, weekdayZh } from '../utils/date';
import PieChart from '../components/PieChart';
import ExpenseRow from '../components/ExpenseRow';
import {
  EmptyState,
  Fab,
  PeriodStepper,
  Segmented,
  ScreenHeader,
  mutedSmall,
} from '../components/expenseUi';

/** 圓餅最多幾段,其餘併成「其他」 */
const PIE_SLICES = 6;

interface Props {
  year: number;
  month: number;
  onChangeMonth: (year: number, month: number) => void;
  who: WhoFilter;
  onChangeWho: (who: WhoFilter) => void;
  onOpenSettings: () => void;
  onOpenReport: () => void;
  onOpenCalendar: () => void;
  onAdd: () => void;
  onEdit: (e: Expense) => void;
  /** 首次使用教學要打光在 ＋ 上 */
  onFabMeasure?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

const ExpenseHomeScreen: React.FC<Props> = ({
  year,
  month,
  onChangeMonth,
  who,
  onChangeWho,
  onOpenSettings,
  onOpenReport,
  onOpenCalendar,
  onAdd,
  onEdit,
  onFabMeasure,
}) => {
  const { data, deleteExpense } = useApp();
  const split = data.settings.sharedSplit ?? 'separate';
  /** 圓心預設寫結餘,點一下改寫月支出(設計稿的 Tweaks「首頁圓心」) */
  const [centerMode, setCenterMode] = useState<'balance' | 'expense'>('balance');

  const self = data.users.find((u) => u.isPrimary) ?? data.users[0];
  const partner = data.users.find((u) => u.id !== self?.id) ?? data.users[1];

  const ym = monthKey(year, month);
  const monthList = useMemo(() => inMonth(data.expenses, ym), [data.expenses, ym]);
  const sums = useMemo(() => totals(monthList, who, split), [monthList, who, split]);

  const slices = useMemo(
    () =>
      topSlices(
        categoryBreakdown(monthList, data.expenseCategories, 'expense', who, split),
        PIE_SLICES
      ),
    [monthList, data.expenseCategories, who, split]
  );

  const groups = useMemo(
    () => groupByDate(visibleTo(monthList, who, split), who, split),
    [monthList, who, split]
  );

  /** 雙人不設上限,所以看「雙人」時整段不顯示 */
  const limit = who === 'self' ? data.settings.budget?.self : who === 'partner' ? data.settings.budget?.partner : undefined;
  const budget = budgetState(sums.expense, limit);

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onChangeMonth(d.getFullYear(), d.getMonth());
  };

  const today = todayKey();

  return (
    <View style={s.root}>
      <ScreenHeader
        leftAction={{ icon: 'menu', onPress: onOpenSettings, label: '記帳設定' }}
        title={<PeriodStepper label={`${year} 年 ${month + 1} 月`} onPrev={() => step(-1)} onNext={() => step(1)} />}
        actions={[
          { icon: 'report', onPress: onOpenReport, label: '報表' },
          { icon: 'calendar', onPress: onOpenCalendar, label: '日曆檢視' },
        ]}
      />

      <Segmented<WhoFilter>
        style={s.whoSeg}
        value={who}
        onChange={onChangeWho}
        options={[
          { value: 'self', label: self?.name ?? '自己', color: self?.color },
          { value: 'partner', label: partner?.name ?? '伴侶', color: partner?.color },
          { value: 'both', label: '雙人', color: colors.text },
        ]}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.summary}>
          <View style={s.figureLeft}>
            <View style={[s.pill, { backgroundColor: colors.primarySoft }]}>
              <Text style={[s.pillText, { color: colors.primary }]}>月支出</Text>
            </View>
            <Text style={s.figure} numberOfLines={1}>
              {formatCurrency(sums.expense)}
            </Text>
            {budget && (
              <>
                <Text style={s.limitLine} numberOfLines={1}>
                  上限 {formatShort(budget.limit)}
                </Text>
                <Text style={s.limitLine} numberOfLines={1}>
                  剩 {formatShort(budget.remaining)}
                </Text>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${budget.ratio * 100}%` }]} />
                </View>
              </>
            )}
          </View>

          <View style={s.figureRight}>
            <View style={[s.pill, { backgroundColor: '#E6F4EC' }]}>
              <Text style={[s.pillText, { color: colors.success }]}>月收入</Text>
            </View>
            <Text style={s.figure}>{formatCurrency(sums.income)}</Text>
          </View>

          <TouchableOpacity
            style={s.pieWrap}
            activeOpacity={0.85}
            onPress={() => setCenterMode((m) => (m === 'balance' ? 'expense' : 'balance'))}
          >
            <PieChart
              size={170}
              slices={slices.map((sl) => ({ ratio: sl.ratio, color: sl.category.color, key: sl.category.id }))}
              label={centerMode === 'balance' ? '月結餘' : '月支出'}
              value={formatAmount(centerMode === 'balance' ? sums.balance : sums.expense)}
              hint="點一下換算法"
            />
          </TouchableOpacity>
        </View>

        {groups.length === 0 ? (
          <EmptyState
            title="這個月還沒有帳"
            hint={'按右下角的 ＋ 記第一筆：\n點分類 → 按金額 → 完成'}
          />
        ) : (
          groups.map((g) => {
            const d = fromDateKey(g.date);
            const isToday = g.date === today;
            return (
              <View key={g.date} style={s.dayCard}>
                <View style={s.dayHead}>
                  <Text style={s.dayTitle}>
                    {`${d.getMonth() + 1}/${d.getDate()} 週${weekdayZh[d.getDay()]}`}
                    {isToday ? ' · 今天' : ''}
                  </Text>
                  <View style={s.dayTotals}>
                    {g.income > 0 && <Text style={s.dayIncome}>+{formatAmount(g.income)}</Text>}
                    {g.expense > 0 && <Text style={s.dayExpense}>−{formatAmount(g.expense)}</Text>}
                  </View>
                </View>
                {g.items.map((e, i) => (
                  <View key={e.id} style={i > 0 && s.divider}>
                    <ExpenseRow
                      expense={e}
                      category={findCategory(data.expenseCategories, e.categoryId, e.kind)}
                      users={data.users}
                      shownAmount={amountFor(e, who, split)}
                      onPress={() => onEdit(e)}
                      onDelete={() => void deleteExpense(e.id)}
                    />
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      <Fab onPress={onAdd} onMeasure={onFabMeasure} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  whoSeg: { marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  scroll: { paddingBottom: 96 },

  summary: { height: 226, position: 'relative' },
  figureLeft: { position: 'absolute', left: spacing.lg, top: 10, width: 96 },
  figureRight: { position: 'absolute', right: spacing.lg, top: 10, alignItems: 'flex-end' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  figure: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 6, letterSpacing: -0.3 },
  limitLine: { fontSize: 11, color: mutedSmall, marginTop: 2 },
  track: {
    width: 96,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primarySoft,
    marginTop: 5,
    overflow: 'hidden',
  },
  // 進度條永遠是主色,不隨用量變紅——上限只是參考,不是警告
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  pieWrap: { position: 'absolute', left: '50%', top: 56, marginLeft: -85 },

  dayCard: {
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  dayTotals: { flexDirection: 'row', gap: spacing.sm },
  dayExpense: { fontSize: 13, fontWeight: '700', color: colors.primary },
  dayIncome: { fontSize: 13, fontWeight: '700', color: colors.success },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});

export default ExpenseHomeScreen;
