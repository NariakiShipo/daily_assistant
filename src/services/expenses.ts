/**
 * 記帳的統計與衍生資料。
 *
 * 這裡只做純計算,不碰 React、不碰 react-native——記帳的數字是這個功能的全部,
 * 算錯了畫面再漂亮也沒有意義,所以歸屬、上限、固定支出的規則都寫成可單獨測試的函式。
 */
import {
  Expense,
  ExpenseCategory,
  ExpenseKind,
  ExpenseWho,
  RecurringExpense,
  SharedSplit,
  UNKNOWN_CATEGORY,
} from '../types';
import { toDateKey, fromDateKey } from '../utils/date';

/** 統計時要看誰的帳:三種歸屬,或全部 */
export type WhoFilter = ExpenseWho | 'all';

/**
 * 一筆帳有多少金額要算進「某個歸屬」的統計。
 *
 * 這是整個記帳功能唯一有歧義的規則,集中在這裡:
 * - 看「雙人」時,雙人帳全額計入(不管拆帳模式)。
 * - 看個人時:自己的帳全額計入;雙人帳在「各算一半」模式下計入一半,
 *   在「獨立一類」模式下完全不計入(也因此不吃個人的上限)。
 */
export function amountFor(e: Expense, who: WhoFilter, split: SharedSplit): number {
  if (who === 'all') return e.amount;
  if (e.who === who) return e.amount;
  if (who === 'both') return 0;
  // who 是 self / partner,而這筆是雙人帳
  if (e.who === 'both') return split === 'half' ? e.amount / 2 : 0;
  return 0;
}

/** 'YYYY-MM' 月份鍵 */
export const monthKey = (year: number, month: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`;

/** 帳目屬於哪一個月('YYYY-MM') */
export const expenseMonth = (e: Expense): string => e.date.slice(0, 7);

export interface Totals {
  /** 支出合計(正數) */
  expense: number;
  /** 收入合計(正數) */
  income: number;
  /** 收入 − 支出,可能是負的 */
  balance: number;
}

/** 一組帳目在某個歸屬下的支出 / 收入 / 結餘 */
export function totals(list: Expense[], who: WhoFilter, split: SharedSplit): Totals {
  let expense = 0;
  let income = 0;
  for (const e of list) {
    const amt = amountFor(e, who, split);
    if (amt === 0) continue;
    if (e.kind === 'income') income += amt;
    else expense += amt;
  }
  return { expense, income, balance: income - expense };
}

/** 篩出某個月('YYYY-MM')的帳目 */
export const inMonth = (list: Expense[], ym: string): Expense[] =>
  list.filter((e) => e.date.startsWith(ym));

/** 篩出某一年('YYYY')的帳目 */
export const inYear = (list: Expense[], year: string): Expense[] =>
  list.filter((e) => e.date.startsWith(`${year}-`));

/** 篩出某一天的帳目 */
export const onDate = (list: Expense[], date: string): Expense[] =>
  list.filter((e) => e.date === date);

/**
 * 只留下在這個歸屬下「看得到」的帳目。
 *
 * 用在明細清單:看小熊時不該出現阿宏的帳;「獨立一類」模式下看小熊也不該
 * 出現雙人帳,因為它一毛都沒算進小熊的數字,列出來只會讓合計對不起來。
 */
export const visibleTo = (list: Expense[], who: WhoFilter, split: SharedSplit): Expense[] =>
  list.filter((e) => amountFor(e, who, split) > 0);

export interface DayGroup {
  date: string;
  items: Expense[];
  /** 當日支出合計(依歸屬換算後) */
  expense: number;
  /** 當日收入合計 */
  income: number;
}

/** 依日期由新到舊分組(每組內新加入的排前面) */
export function groupByDate(list: Expense[], who: WhoFilter, split: SharedSplit): DayGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    const arr = map.get(e.date);
    if (arr) arr.push(e);
    else map.set(e.date, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => {
      const t = totals(items, who, split);
      return {
        date,
        items: [...items].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
        expense: t.expense,
        income: t.income,
      };
    });
}

export interface CategorySlice {
  category: ExpenseCategory;
  amount: number;
  /** 佔合計的比例(0–1);合計為 0 時是 0 */
  ratio: number;
}

/**
 * 分類排行(由大到小)。
 *
 * 金額為 0 的分類不列出來——排行是拿來看「錢花在哪」的,
 * 列一排 0 元只會把真正的前幾名擠下去。
 */
export function categoryBreakdown(
  list: Expense[],
  categories: ExpenseCategory[],
  kind: ExpenseKind,
  who: WhoFilter,
  split: SharedSplit
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sums = new Map<string, number>();
  let total = 0;
  for (const e of list) {
    if (e.kind !== kind) continue;
    const amt = amountFor(e, who, split);
    if (amt === 0) continue;
    sums.set(e.categoryId, (sums.get(e.categoryId) ?? 0) + amt);
    total += amt;
  }
  return [...sums.entries()]
    .map(([id, amount]) => ({
      category: byId.get(id) ?? { ...UNKNOWN_CATEGORY, id, kind },
      amount,
      ratio: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 把排行收斂成最多 n 段,其餘併成「其他」。
 *
 * 圓餅超過七、八段就看不出誰是誰了,設計稿也是六段 + 其他。
 */
export function topSlices(slices: CategorySlice[], n: number): CategorySlice[] {
  if (slices.length <= n) return slices;
  const head = slices.slice(0, n);
  const rest = slices.slice(n);
  const amount = rest.reduce((sum, s) => sum + s.amount, 0);
  const ratio = rest.reduce((sum, s) => sum + s.ratio, 0);
  return [...head, { category: { ...UNKNOWN_CATEGORY, name: '其他' }, amount, ratio }];
}

/** 某個月每一天的支出合計(key = YYYY-MM-DD,沒有帳的那天不會出現) */
export function dailyExpenseTotals(
  list: Expense[],
  ym: string,
  who: WhoFilter,
  split: SharedSplit
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of inMonth(list, ym)) {
    if (e.kind !== 'expense') continue;
    const amt = amountFor(e, who, split);
    if (amt === 0) continue;
    out[e.date] = (out[e.date] ?? 0) + amt;
  }
  return out;
}

export interface PeriodPoint {
  /** 'YYYY-MM' 或 'YYYY-MM-DD' */
  key: string;
  /** 顯示用短標籤,例如 '9' 或 '15' */
  label: string;
  totals: Totals;
}

/** 某一年 12 個月的支出 / 收入 / 結餘(沒有帳的月份是 0,不會跳號) */
export function monthlySeries(
  list: Expense[],
  year: number,
  who: WhoFilter,
  split: SharedSplit
): PeriodPoint[] {
  const points: PeriodPoint[] = [];
  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m);
    points.push({ key, label: String(m + 1), totals: totals(inMonth(list, key), who, split) });
  }
  return points;
}

/** 某個月每一天的支出 / 收入 / 結餘 */
export function dailySeries(
  list: Expense[],
  year: number,
  month: number,
  who: WhoFilter,
  split: SharedSplit
): PeriodPoint[] {
  const days = new Date(year, month + 1, 0).getDate();
  const prefix = monthKey(year, month);
  const points: PeriodPoint[] = [];
  for (let d = 1; d <= days; d++) {
    const key = `${prefix}-${String(d).padStart(2, '0')}`;
    points.push({ key, label: String(d), totals: totals(onDate(list, key), who, split) });
  }
  return points;
}

/** 上限狀態:只給畫面顯示「已用 / 剩餘」,刻意不帶任何警示旗標 */
export interface BudgetState {
  limit: number;
  used: number;
  /** 可能是負的(超出上限),畫面照實顯示但不變色 */
  remaining: number;
  /** 進度條寬度比例,夾在 0–1 */
  ratio: number;
}

/**
 * 當月上限狀態。未設定上限時回傳 null,畫面就整段不顯示。
 *
 * 刻意沒有「接近上限」「已超出」之類的旗標:使用者明確要求不要任何超支警示。
 */
export function budgetState(used: number, limit?: number): BudgetState | null {
  if (!limit || limit <= 0) return null;
  return {
    limit,
    used,
    remaining: limit - used,
    ratio: Math.max(0, Math.min(1, used / limit)),
  };
}

/**
 * 固定支出:算出從 startMonth 到 through 之間「還沒被記過」的帳目。
 *
 * 產生的是真實帳目而不是虛擬列,所以使用者可以單獨修改或刪除某個月那一筆,
 * 匯出備份時也帶得走。
 *
 * 兩種「不要再產生」的情況都要擋:已經在 existing 裡的(相同 recurringId + 日期),
 * 以及使用者刪掉的(skips)。少了 skips 的話,刪掉的那一筆下次開 App 就會自己長回來,
 * 使用者只會覺得刪不掉。
 *
 * @param through 產到哪一天為止(YYYY-MM-DD),通常是今天
 * @param skips 使用者刪掉的月份,格式 '<recurringId>@YYYY-MM-DD'
 */
export function pendingRecurring(
  recurrings: RecurringExpense[],
  existing: Expense[],
  through: string,
  createdBy: string,
  makeId: () => string,
  skips: string[] = []
): Expense[] {
  const seen = new Set([
    ...existing.filter((e) => e.recurringId).map((e) => `${e.recurringId}@${e.date}`),
    ...skips,
  ]);
  const out: Expense[] = [];
  const end = fromDateKey(through);

  for (const r of recurrings) {
    // 沒指定起始月就從建立當月起算;再往前追溯只會憑空生出一堆舊帳
    const start = r.startMonth ?? through.slice(0, 7);
    const [sy, sm] = start.split('-').map(Number);
    if (!sy || !sm) continue;

    for (let y = sy, m = sm - 1; y * 12 + m <= end.getFullYear() * 12 + end.getMonth(); ) {
      // 31 號的固定支出遇到 30 天的月份時落在月底,而不是跳過那個月
      const lastDay = new Date(y, m + 1, 0).getDate();
      const day = Math.min(r.dayOfMonth, lastDay);
      const date = toDateKey(new Date(y, m, day));
      if (date <= through && !seen.has(`${r.id}@${date}`)) {
        out.push({
          id: makeId(),
          amount: r.amount,
          kind: r.kind,
          who: r.who,
          categoryId: r.categoryId,
          date,
          note: r.name,
          payment: r.payment,
          recurringId: r.id,
          createdBy,
          updatedAt: Date.now(),
          updatedBy: createdBy,
        });
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  return out;
}

/** 千分位;金額一律顯示整數(小數在記帳裡只會讓兩人對帳更難) */
export const formatAmount = (n: number): string =>
  Math.round(n).toLocaleString('en-US');

/** 'NT$ 12,480' */
export const formatCurrency = (n: number): string => `NT$ ${formatAmount(n)}`;

/** 大額省寫成 '1.2萬',用在寬度只有 96px 的上限那一行 */
export function formatShort(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 10000) {
    const w = v / 10000;
    return `${w.toFixed(Math.abs(w) >= 10 ? 0 : 1).replace(/\.0$/, '')}萬`;
  }
  return formatAmount(v);
}

/**
 * 只留下可以選的分類:指定收支別、沒有被隱藏,依 order 排序。
 * 編輯舊帳目時它原本的分類即使已隱藏也要留著,否則一打開編輯就換了分類。
 */
export function selectableCategories(
  categories: ExpenseCategory[],
  kind: ExpenseKind,
  keepId?: string
): ExpenseCategory[] {
  return categories
    .filter((c) => c.kind === kind && (!c.hidden || c.id === keepId))
    .sort((a, b) => a.order - b.order);
}

/** 找分類;找不到時回傳替身而不是 undefined,讓畫面不用每處都判空 */
export function findCategory(
  categories: ExpenseCategory[],
  id: string,
  kind: ExpenseKind = 'expense'
): ExpenseCategory {
  return categories.find((c) => c.id === id) ?? { ...UNKNOWN_CATEGORY, id, kind };
}
