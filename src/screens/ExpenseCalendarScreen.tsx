/**
 * 日曆檢視(設計稿 4e)= 使用者要的「每日」分類。
 *
 * 每一格下面寫當天的支出小計,沒記帳的日子是「—」;點一天,下面就換成那天的明細。
 * 從這裡按 ＋ 會把日期預填成選中的那一天,不用進表單再改一次。
 *
 * 沒有沿用 MiniCalendar:那個元件的格子是單純的日期數字,
 * 這裡每格要放兩行(日期 + 金額),格高與排版都不一樣。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { Expense } from '../types';
import {
  WhoFilter,
  amountFor,
  dailyExpenseTotals,
  findCategory,
  formatAmount,
  formatCurrency,
  inMonth,
  monthKey,
  onDate,
  totals,
  visibleTo,
} from '../services/expenses';
import { fromDateKey, monthGrid, todayKey, weekdayZh } from '../utils/date';
import ExpenseRow from '../components/ExpenseRow';
import {
  EmptyState,
  Fab,
  PeriodStepper,
  ScreenHeader,
  Segmented,
  mutedSmall,
} from '../components/expenseUi';

interface Props {
  onBack: () => void;
  year: number;
  month: number;
  onChangeMonth: (year: number, month: number) => void;
  who: WhoFilter;
  onChangeWho: (who: WhoFilter) => void;
  onAdd: (date: string) => void;
  onEdit: (e: Expense) => void;
}

const ExpenseCalendarScreen: React.FC<Props> = ({
  onBack,
  year,
  month,
  onChangeMonth,
  who,
  onChangeWho,
  onAdd,
  onEdit,
}) => {
  const { data, deleteExpense } = useApp();
  const split = data.settings.sharedSplit ?? 'separate';
  const [selected, setSelected] = useState(todayKey());

  const self = data.users.find((u) => u.isPrimary) ?? data.users[0];
  const partner = data.users.find((u) => u.id !== self?.id) ?? data.users[1];

  const ym = monthKey(year, month);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const perDay = useMemo(
    () => dailyExpenseTotals(data.expenses, ym, who, split),
    [data.expenses, ym, who, split]
  );

  const monthSums = useMemo(
    () => totals(inMonth(data.expenses, ym), who, split),
    [data.expenses, ym, who, split]
  );

  /** 日平均以「有記帳的天數」為分母:沒記帳的日子拉低平均只會讓數字失真 */
  const activeDays = Object.keys(perDay).length;
  const dailyAvg = activeDays > 0 ? monthSums.expense / activeDays : 0;

  const dayItems = useMemo(
    () => visibleTo(onDate(data.expenses, selected), who, split),
    [data.expenses, selected, who, split]
  );
  const daySums = useMemo(() => totals(dayItems, who, split), [dayItems, who, split]);

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onChangeMonth(d.getFullYear(), d.getMonth());
  };

  const selDate = fromDateKey(selected);

  return (
    <View style={s.root}>
      <ScreenHeader
        onBack={onBack}
        title={<PeriodStepper label={`${year} 年 ${month + 1} 月`} onPrev={() => step(-1)} onNext={() => step(1)} />}
      />

      <Segmented<WhoFilter>
        style={s.seg}
        value={who}
        onChange={onChangeWho}
        options={[
          { value: 'self', label: self?.name ?? '自己', color: self?.color },
          { value: 'partner', label: partner?.name ?? '伴侶', color: partner?.color },
          { value: 'both', label: '雙人', color: colors.text },
        ]}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <View style={s.weekRow}>
            {weekdayZh.map((w) => (
              <Text key={w} style={s.weekday}>
                {w}
              </Text>
            ))}
          </View>
          <View style={s.grid}>
            {cells.map((key, i) => {
              if (!key) return <View key={`e${i}`} style={s.cell} />;
              const amount = perDay[key];
              const on = key === selected;
              return (
                <TouchableOpacity key={key} style={[s.cell, on && s.cellOn]} onPress={() => setSelected(key)}>
                  <Text style={[s.cellDay, on && s.cellDayOn]}>{fromDateKey(key).getDate()}</Text>
                  {amount ? (
                    <Text style={[s.cellAmount, on && s.cellAmountOn]}>{formatAmount(amount)}</Text>
                  ) : (
                    <Text style={[s.cellDash, on && s.cellAmountOn]}>—</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.footRow}>
            <Text style={s.foot}>
              本月合計 <Text style={s.footStrong}>{formatCurrency(monthSums.expense)}</Text>
            </Text>
            <Text style={s.foot}>
              日平均 <Text style={s.footStrong}>{formatCurrency(dailyAvg)}</Text>
            </Text>
          </View>
        </View>

        <View style={s.dayCard}>
          <View style={s.dayHead}>
            <Text style={s.dayTitle}>
              {`${selDate.getMonth() + 1}/${selDate.getDate()} 週${weekdayZh[selDate.getDay()]} · ${dayItems.length} 筆`}
            </Text>
            {daySums.expense > 0 && <Text style={s.dayExpense}>−{formatAmount(daySums.expense)}</Text>}
          </View>
          {dayItems.length === 0 ? (
            <EmptyState title="這天沒有帳" hint="按右下角的 ＋ 記一筆，日期已經幫你填好了。" />
          ) : (
            dayItems.map((e, i) => (
              <View key={e.id} style={i > 0 && s.divider}>
                <ExpenseRow
                  expense={e}
                  category={findCategory(data.expenseCategories, e.categoryId, e.kind)}
                  users={data.users}
                  shownAmount={amountFor(e, who, split)}
                  onPress={() => onEdit(e)}
                  onDelete={() => void deleteExpense(e.id)}
                  /*
                   * 只有在「這份清單不可能混到別人的帳」時才隱藏歸屬:
                   * 獨立一類時個人檢視就只有本人的帳,看雙人時也只有雙人帳;
                   * 但各算一半的個人檢視會混進雙人帳,這時候標記得留著。
                   */
                  hideWho={who === 'both' || split === 'separate'}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Fab onPress={() => onAdd(selected)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  seg: { marginHorizontal: spacing.lg, marginBottom: 10 },
  scroll: { paddingBottom: 96 },

  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 6,
    paddingTop: spacing.sm,
    paddingBottom: 6,
  },
  weekRow: { flexDirection: 'row', paddingBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, color: mutedSmall },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: 46,
    alignItems: 'center',
    paddingTop: 4,
    borderRadius: radius.sm + 2,
  },
  cellOn: { backgroundColor: colors.primary },
  cellDay: { fontSize: 13, color: colors.text },
  cellDayOn: { color: '#fff', fontWeight: '800' },
  cellAmount: { fontSize: 10, color: mutedSmall, marginTop: 2 },
  cellAmountOn: { color: '#fff', fontWeight: '700' },
  cellDash: { fontSize: 10, color: '#C9B8C0', marginTop: 2 },
  footRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  foot: { fontSize: 12, color: mutedSmall },
  footStrong: { color: colors.text, fontWeight: '700' },

  dayCard: {
    marginHorizontal: spacing.lg,
    marginTop: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  dayExpense: { fontSize: 13, fontWeight: '700', color: colors.primary },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});

export default ExpenseCalendarScreen;
