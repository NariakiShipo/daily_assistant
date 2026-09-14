/**
 * 報表(設計稿 4c 支出 / 收入、4d 結餘)。
 *
 * 照「簡單記帳」只有三個切換:支出 / 收入 / 結餘,再配 日 / 月 / 年 與 ‹ › 換期間。
 * 支出與收入是圓餅 + 分類排行;結餘是折線,因為要看的是整段期間的起伏而不是組成。
 *
 * 這裡的「年」與 ‹ › 就是使用者要的「年份」與「其他月份」兩種日期分類。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { ExpenseKind } from '../types';
import {
  WhoFilter,
  categoryBreakdown,
  dailySeries,
  formatAmount,
  formatCurrency,
  inMonth,
  inYear,
  monthKey,
  monthlySeries,
  onDate,
  topSlices,
  totals,
} from '../services/expenses';
import { fromDateKey, todayKey, weekdayZh } from '../utils/date';
import PieChart from '../components/PieChart';
import LineChart from '../components/LineChart';
import CategoryIcon from '../components/CategoryIcon';
import {
  EmptyState,
  OutlineSegmented,
  PeriodStepper,
  ScreenHeader,
  Segmented,
  SoftSegmented,
  mutedSmall,
} from '../components/expenseUi';

type Metric = 'expense' | 'income' | 'balance';
type Grain = 'day' | 'month' | 'year';

const PIE_SLICES = 6;

interface Props {
  onBack: () => void;
  who: WhoFilter;
  onChangeWho: (who: WhoFilter) => void;
  /** 從首頁帶進來的月份,報表打開時停在同一段期間 */
  year: number;
  month: number;
}

const ExpenseReportScreen: React.FC<Props> = ({ onBack, who, onChangeWho, year, month }) => {
  const { data } = useApp();
  const split = data.settings.sharedSplit ?? 'separate';
  const { width } = useWindowDimensions();

  const self = data.users.find((u) => u.isPrimary) ?? data.users[0];
  const partner = data.users.find((u) => u.id !== self?.id) ?? data.users[1];

  const [metric, setMetric] = useState<Metric>('expense');
  const [grain, setGrain] = useState<Grain>('month');
  /** 期間游標:日檢視看 day,月檢視看 y/m,年檢視看 y */
  const [cursor, setCursor] = useState({ y: year, m: month, d: todayKey() });
  const [picked, setPicked] = useState<number | null>(null);

  /** 目前期間涵蓋哪些帳目 */
  const list = useMemo(() => {
    if (grain === 'day') return onDate(data.expenses, cursor.d);
    if (grain === 'month') return inMonth(data.expenses, monthKey(cursor.y, cursor.m));
    return inYear(data.expenses, String(cursor.y));
  }, [data.expenses, grain, cursor]);

  const sums = useMemo(() => totals(list, who, split), [list, who, split]);

  const periodLabel = useMemo(() => {
    if (grain === 'day') {
      const d = fromDateKey(cursor.d);
      return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 週${weekdayZh[d.getDay()]}`;
    }
    if (grain === 'month') return `${cursor.y} 年 ${cursor.m + 1} 月`;
    return `${cursor.y} 年`;
  }, [grain, cursor]);

  const step = (delta: number) => {
    setPicked(null);
    setCursor((c) => {
      if (grain === 'day') {
        const d = fromDateKey(c.d);
        d.setDate(d.getDate() + delta);
        return { ...c, d: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
      }
      if (grain === 'month') {
        const d = new Date(c.y, c.m + delta, 1);
        return { ...c, y: d.getFullYear(), m: d.getMonth() };
      }
      return { ...c, y: c.y + delta };
    });
  };

  /* 支出 / 收入:圓餅 + 排行 */
  const kind: ExpenseKind = metric === 'income' ? 'income' : 'expense';
  const ranking = useMemo(
    () => categoryBreakdown(list, data.expenseCategories, kind, who, split),
    [list, data.expenseCategories, kind, who, split]
  );
  const slices = useMemo(() => topSlices(ranking, PIE_SLICES), [ranking]);
  const kindTotal = metric === 'income' ? sums.income : sums.expense;
  const maxAmount = ranking[0]?.amount ?? 0;

  /* 結餘:折線 */
  const points = useMemo(() => {
    if (grain === 'year') return monthlySeries(data.expenses, cursor.y, who, split);
    if (grain === 'month') return dailySeries(data.expenses, cursor.y, cursor.m, who, split);
    // 日檢視的「趨勢」就是那一天前後的走勢,用當月的日序列並釘在那一天
    const d = fromDateKey(cursor.d);
    return dailySeries(data.expenses, d.getFullYear(), d.getMonth(), who, split);
  }, [grain, data.expenses, cursor, who, split]);

  const monthRows = useMemo(
    () =>
      monthlySeries(data.expenses, cursor.y, who, split)
        .map((p, i) => ({ ...p, index: i }))
        .filter((p) => p.totals.expense > 0 || p.totals.income > 0)
        .reverse(),
    [data.expenses, cursor.y, who, split]
  );

  const chartWidth = Math.min(width, 420) - spacing.lg * 2 - 16;

  return (
    <View style={s.root}>
      <ScreenHeader title="報表" onBack={onBack} />

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

      <OutlineSegmented<Metric>
        style={s.seg}
        value={metric}
        onChange={(m) => {
          setMetric(m);
          setPicked(null);
        }}
        options={[
          { value: 'expense', label: '支出', color: colors.primary },
          { value: 'income', label: '收入', color: colors.success },
          { value: 'balance', label: '結餘', color: colors.accent },
        ]}
      />

      <View style={s.stepperRow}>
        <PeriodStepper label={periodLabel} onPrev={() => step(-1)} onNext={() => step(1)} size="sm" />
      </View>

      <SoftSegmented<Grain>
        style={s.seg}
        value={grain}
        onChange={(g) => {
          setGrain(g);
          setPicked(null);
        }}
        options={[
          { value: 'day', label: '日' },
          { value: 'month', label: '月' },
          { value: 'year', label: '年' },
        ]}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {metric === 'balance' ? (
          <>
            <View style={s.legendRow}>
              <Text style={[s.legend, { color: colors.primary }]}>支出 −{formatAmount(sums.expense)}</Text>
              <Text style={[s.legend, { color: colors.success }]}>收入 {formatAmount(sums.income)}</Text>
              <Text style={[s.legend, { color: colors.accent }]}>結餘 {formatAmount(sums.balance)}</Text>
            </View>
            <View style={s.card}>
              <LineChart
                points={points}
                selected={picked}
                onSelect={setPicked}
                unit={grain === 'year' ? '月' : '日'}
                width={chartWidth}
              />
            </View>
            <View style={[s.card, s.tablePad]}>
              {monthRows.length === 0 ? (
                <EmptyState title={`${cursor.y} 年還沒有帳`} />
              ) : (
                monthRows.map((r, i) => (
                  <View key={r.key} style={[s.tableRow, i === 0 && s.tableRowHead]}>
                    <Text style={s.tableMonth}>{r.label} 月</Text>
                    <Text style={[s.tableCell, { color: colors.primary }]}>−{formatAmount(r.totals.expense)}</Text>
                    <Text style={[s.tableCell, { color: colors.success }]}>+{formatAmount(r.totals.income)}</Text>
                    <Text style={s.tableBalance}>{formatAmount(r.totals.balance)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            <View style={s.pieRow}>
              <PieChart
                size={176}
                thickness={14}
                slices={slices.map((sl) => ({ ratio: sl.ratio, color: sl.category.color, key: sl.category.id }))}
                label={`${grain === 'day' ? '當日' : grain === 'month' ? '本期' : '全年'}${
                  metric === 'income' ? '收入' : '支出'
                }`}
                value={formatCurrency(kindTotal)}
              />
            </View>

            {ranking.length === 0 ? (
              <EmptyState title="這段期間沒有紀錄" hint="換個期間，或按首頁的 ＋ 記一筆。" />
            ) : (
              <View style={[s.card, s.rankPad]}>
                {ranking.map((r, i) => (
                  <View key={r.category.id || `x${i}`} style={[s.rankRow, i > 0 && s.divider]}>
                    <View style={[s.rankIcon, { backgroundColor: `${r.category.color}22` }]}>
                      <CategoryIcon category={r.category} size={16} color={r.category.color} />
                    </View>
                    <Text style={s.rankName} numberOfLines={1}>
                      {r.category.name}
                    </Text>
                    <View style={s.rankTrack}>
                      <View
                        style={[
                          s.rankFill,
                          {
                            backgroundColor: r.category.color,
                            width: `${maxAmount > 0 ? (r.amount / maxAmount) * 100 : 0}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={s.rankPct}>{Math.round(r.ratio * 100)}%</Text>
                    <Text style={s.rankAmount}>{formatAmount(r.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  seg: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  stepperRow: { alignItems: 'center', paddingBottom: 6 },
  scroll: { paddingBottom: spacing.xl },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: 6,
  },
  legend: { fontSize: 12, fontWeight: '600' },

  card: {
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  tablePad: { paddingHorizontal: 14, paddingVertical: 0 },
  rankPad: { paddingHorizontal: 14, paddingVertical: 0 },

  pieRow: { alignItems: 'center', paddingVertical: 4 },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rankIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankName: { width: 48, fontSize: 13, fontWeight: '600', color: colors.text },
  rankTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.background, overflow: 'hidden' },
  rankFill: { height: 6, borderRadius: 3 },
  rankPct: { width: 34, textAlign: 'right', fontSize: 12, color: mutedSmall },
  rankAmount: { width: 52, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },

  tableRow: { flexDirection: 'row', alignItems: 'center', height: 42, borderTopWidth: 1, borderTopColor: colors.border },
  tableRowHead: { borderTopWidth: 0 },
  tableMonth: { width: 44, fontSize: 13, fontWeight: '700', color: colors.text },
  tableCell: { flex: 1, fontSize: 13 },
  tableBalance: { width: 70, textAlign: 'right', fontSize: 13, fontWeight: '800', color: colors.accent },
});

export default ExpenseReportScreen;
