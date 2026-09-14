import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountFor,
  budgetState,
  categoryBreakdown,
  dailyExpenseTotals,
  formatShort,
  groupByDate,
  monthlySeries,
  pendingRecurring,
  selectableCategories,
  topSlices,
  totals,
  visibleTo,
} from '../services/expenses';
import {
  calcBackspace,
  calcDigit,
  calcDisplay,
  calcOperator,
  calcPending,
  calcValue,
  emptyCalc,
} from '../services/calculator';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  RecurringExpense,
} from '../types';

const exp = (over: Partial<Expense> & { amount: number; date: string }): Expense => ({
  id: `${over.date}-${over.amount}`,
  kind: 'expense',
  who: 'self',
  categoryId: 'c-food',
  payment: 'cash',
  createdBy: 'u1',
  ...over,
});

/* ── 歸屬與拆帳 ───────────────────────────────────────── */

test('amountFor 個人帳只算進本人', () => {
  const e = exp({ amount: 100, date: '2026-09-09', who: 'self' });
  assert.equal(amountFor(e, 'self', 'separate'), 100);
  assert.equal(amountFor(e, 'partner', 'separate'), 0);
  assert.equal(amountFor(e, 'both', 'separate'), 0);
});

test('amountFor 獨立一類時雙人帳不計入任何個人', () => {
  const e = exp({ amount: 680, date: '2026-09-09', who: 'both' });
  assert.equal(amountFor(e, 'self', 'separate'), 0);
  assert.equal(amountFor(e, 'partner', 'separate'), 0);
  assert.equal(amountFor(e, 'both', 'separate'), 680);
});

test('amountFor 各算一半時雙人帳各計入一半,看雙人仍是全額', () => {
  const e = exp({ amount: 680, date: '2026-09-09', who: 'both' });
  assert.equal(amountFor(e, 'self', 'half'), 340);
  assert.equal(amountFor(e, 'partner', 'half'), 340);
  assert.equal(amountFor(e, 'both', 'half'), 680);
});

test('amountFor 看全部時一律全額,不受拆帳模式影響', () => {
  const e = exp({ amount: 680, date: '2026-09-09', who: 'both' });
  assert.equal(amountFor(e, 'all', 'separate'), 680);
  assert.equal(amountFor(e, 'all', 'half'), 680);
});

/* ── 合計 ─────────────────────────────────────────────── */

const sample: Expense[] = [
  exp({ amount: 120, date: '2026-09-09', who: 'self' }),
  exp({ amount: 60, date: '2026-09-09', who: 'self', categoryId: 'c-transit' }),
  exp({ amount: 680, date: '2026-09-09', who: 'both' }),
  exp({ amount: 150, date: '2026-09-08', who: 'partner' }),
  exp({ amount: 32000, date: '2026-09-05', who: 'self', kind: 'income', categoryId: 'c-salary' }),
];

test('totals 分開算支出與收入,結餘是收入減支出', () => {
  assert.deepEqual(totals(sample, 'self', 'separate'), {
    expense: 180,
    income: 32000,
    balance: 31820,
  });
});

test('totals 在各算一半時把雙人帳的一半加進個人支出', () => {
  assert.deepEqual(totals(sample, 'self', 'half'), {
    expense: 520, // 120 + 60 + 680/2
    income: 32000,
    balance: 31480,
  });
});

test('totals 空清單是三個 0', () => {
  assert.deepEqual(totals([], 'all', 'separate'), { expense: 0, income: 0, balance: 0 });
});

test('visibleTo 在獨立一類時不把雙人帳列進個人明細', () => {
  const ids = visibleTo(sample, 'self', 'separate').map((e) => e.who);
  assert.deepEqual(ids, ['self', 'self', 'self']);
});

test('visibleTo 在各算一半時把雙人帳列進個人明細', () => {
  assert.equal(visibleTo(sample, 'self', 'half').length, 4);
});

/* ── 分組與排行 ───────────────────────────────────────── */

test('groupByDate 依日期由新到舊,並帶當日合計', () => {
  const groups = groupByDate(sample, 'all', 'separate');
  assert.deepEqual(
    groups.map((g) => g.date),
    ['2026-09-09', '2026-09-08', '2026-09-05']
  );
  assert.equal(groups[0].expense, 860);
  assert.equal(groups[2].income, 32000);
});

test('categoryBreakdown 由大到小,比例以該收支別的合計為分母', () => {
  const out = categoryBreakdown(sample, DEFAULT_EXPENSE_CATEGORIES, 'expense', 'all', 'separate');
  assert.deepEqual(
    out.map((s) => [s.category.name, s.amount]),
    [
      ['飲食', 950], // 120 + 680
      ['交通', 60],
    ]
  );
  assert.equal(Math.round(out[0].ratio * 100), 94);
});

test('categoryBreakdown 不列出金額為 0 的分類', () => {
  const out = categoryBreakdown(sample, DEFAULT_EXPENSE_CATEGORIES, 'income', 'all', 'separate');
  assert.equal(out.length, 1);
  assert.equal(out[0].category.name, '薪資');
});

test('categoryBreakdown 對已被刪除的分類給替身而不是壞掉', () => {
  const out = categoryBreakdown(
    [exp({ amount: 50, date: '2026-09-09', categoryId: 'gone' })],
    DEFAULT_EXPENSE_CATEGORIES,
    'expense',
    'all',
    'separate'
  );
  assert.equal(out[0].category.name, '未分類');
});

test('topSlices 把超出的併成「其他」並保住合計', () => {
  const slices = [5, 4, 3, 2, 1].map((n) => ({
    category: { ...DEFAULT_EXPENSE_CATEGORIES[0], id: `c${n}` } as ExpenseCategory,
    amount: n * 100,
    ratio: n / 15,
  }));
  const out = topSlices(slices, 3);
  assert.equal(out.length, 4);
  assert.equal(out[3].category.name, '其他');
  assert.equal(out[3].amount, 300); // 200 + 100
});

test('topSlices 在段數不超過上限時原樣回傳', () => {
  const slices = categoryBreakdown(
    sample,
    DEFAULT_EXPENSE_CATEGORIES,
    'expense',
    'all',
    'separate'
  );
  assert.equal(topSlices(slices, 6).length, 2);
});

test('dailyExpenseTotals 只算支出,沒記帳的日子不會出現', () => {
  const out = dailyExpenseTotals(sample, '2026-09', 'all', 'separate');
  assert.deepEqual(out, { '2026-09-09': 860, '2026-09-08': 150 });
});

test('monthlySeries 一定給滿 12 個月,沒帳的月份是 0', () => {
  const out = monthlySeries(sample, 2026, 'all', 'separate');
  assert.equal(out.length, 12);
  assert.equal(out[8].totals.expense, 1010);
  assert.equal(out[0].totals.expense, 0);
});

/* ── 上限 ─────────────────────────────────────────────── */

test('budgetState 未設定上限時回傳 null', () => {
  assert.equal(budgetState(5000, undefined), null);
  assert.equal(budgetState(5000, 0), null);
});

test('budgetState 給已用與剩餘', () => {
  assert.deepEqual(budgetState(12480, 20000), {
    limit: 20000,
    used: 12480,
    remaining: 7520,
    ratio: 0.624,
  });
});

test('budgetState 超出上限時剩餘為負,比例夾在 1(不做任何警示)', () => {
  const st = budgetState(25000, 20000);
  assert.equal(st?.remaining, -5000);
  assert.equal(st?.ratio, 1);
});

/* ── 固定支出 ─────────────────────────────────────────── */

const rent: RecurringExpense = {
  id: 'r1',
  name: '房租',
  amount: 12000,
  kind: 'expense',
  who: 'both',
  categoryId: 'c-home',
  payment: 'transfer',
  dayOfMonth: 5,
  startMonth: '2026-07',
};

let seq = 0;
const makeId = () => `gen${seq++}`;

test('pendingRecurring 從起始月補到指定日期', () => {
  seq = 0;
  const out = pendingRecurring([rent], [], '2026-09-09', 'u1', makeId);
  assert.deepEqual(
    out.map((e) => e.date),
    ['2026-07-05', '2026-08-05', '2026-09-05']
  );
  assert.equal(out[0].amount, 12000);
  assert.equal(out[0].recurringId, 'r1');
  assert.equal(out[0].who, 'both');
});

test('pendingRecurring 不補還沒到期的那一個月', () => {
  seq = 0;
  const out = pendingRecurring([rent], [], '2026-09-04', 'u1', makeId);
  assert.deepEqual(
    out.map((e) => e.date),
    ['2026-07-05', '2026-08-05']
  );
});

test('pendingRecurring 已經記過的月份不會重複產生', () => {
  seq = 0;
  const already = [exp({ amount: 12000, date: '2026-08-05', recurringId: 'r1' })];
  const out = pendingRecurring([rent], already, '2026-09-09', 'u1', makeId);
  assert.deepEqual(
    out.map((e) => e.date),
    ['2026-07-05', '2026-09-05']
  );
});

test('pendingRecurring 把 31 號落在天數不足的月底', () => {
  seq = 0;
  const out = pendingRecurring(
    [{ ...rent, dayOfMonth: 31, startMonth: '2026-02' }],
    [],
    '2026-04-30',
    'u1',
    makeId
  );
  assert.deepEqual(
    out.map((e) => e.date),
    ['2026-02-28', '2026-03-31', '2026-04-30']
  );
});

test('pendingRecurring 使用者刪掉的月份不會再被補回來', () => {
  seq = 0;
  const out = pendingRecurring([rent], [], '2026-09-09', 'u1', makeId, ['r1@2026-08-05']);
  assert.deepEqual(
    out.map((e) => e.date),
    ['2026-07-05', '2026-09-05']
  );
});

test('pendingRecurring 的跳過清單只影響同一個範本', () => {
  seq = 0;
  const other = { ...rent, id: 'r2', name: 'Netflix' };
  const out = pendingRecurring([other], [], '2026-09-09', 'u1', makeId, ['r1@2026-08-05']);
  assert.equal(out.length, 3);
});

test('pendingRecurring 沒有範本時不產生任何東西', () => {
  assert.deepEqual(pendingRecurring([], [], '2026-09-09', 'u1', makeId), []);
});

/* ── 分類清單 ─────────────────────────────────────────── */

test('selectableCategories 依收支別過濾並依 order 排序', () => {
  const out = selectableCategories(DEFAULT_EXPENSE_CATEGORIES, 'income');
  assert.deepEqual(
    out.map((c) => c.name),
    ['薪資', '獎金', '投資', '其他']
  );
});

test('selectableCategories 排除隱藏的分類', () => {
  const cats = DEFAULT_EXPENSE_CATEGORIES.map((c) =>
    c.id === 'c-pet' ? { ...c, hidden: true } : c
  );
  assert.equal(
    selectableCategories(cats, 'expense').some((c) => c.id === 'c-pet'),
    false
  );
});

test('selectableCategories 保留正在編輯那筆的分類,即使已隱藏', () => {
  const cats = DEFAULT_EXPENSE_CATEGORIES.map((c) =>
    c.id === 'c-pet' ? { ...c, hidden: true } : c
  );
  assert.equal(
    selectableCategories(cats, 'expense', 'c-pet').some((c) => c.id === 'c-pet'),
    true
  );
});

/* ── 顯示 ─────────────────────────────────────────────── */

test('formatShort 萬位以上省寫', () => {
  assert.equal(formatShort(9999), '9,999');
  assert.equal(formatShort(12480), '1.2萬');
  assert.equal(formatShort(20000), '2萬');
  assert.equal(formatShort(127200), '13萬');
});

/* ── 計算機 ───────────────────────────────────────────── */

test('calcDigit 從 0 開始不會留下前導零', () => {
  let st = emptyCalc;
  st = calcDigit(st, '6');
  st = calcDigit(st, '8');
  st = calcDigit(st, '0');
  assert.equal(calcDisplay(st), '680');
});

test('calcDigit 小數點只吃一次', () => {
  let st = calcDigit(calcDigit(emptyCalc, '1'), '.');
  st = calcDigit(st, '.');
  st = calcDigit(st, '5');
  assert.equal(calcDisplay(st), '1.5');
});

test('calcValue 逐步結算加減', () => {
  // 120 ＋ 60 － 30 = 150,而且每一步都看得到當下的結果
  let st = calcDigit(calcDigit(calcDigit(emptyCalc, '1'), '2'), '0');
  st = calcOperator(st, '+');
  st = calcDigit(calcDigit(st, '6'), '0');
  assert.equal(calcValue(st), 180);
  st = calcOperator(st, '-');
  st = calcDigit(calcDigit(st, '3'), '0');
  assert.equal(calcValue(st), 150);
});

test('calcOperator 連按兩次只換運算子,不重複結算', () => {
  let st = calcDigit(calcDigit(calcDigit(emptyCalc, '1'), '2'), '0');
  st = calcOperator(st, '+');
  st = calcOperator(st, '-');
  assert.equal(st.acc, 120);
  assert.equal(st.op, '-');
});

test('calcBackspace 刪到底回到 0', () => {
  let st = calcDigit(calcDigit(emptyCalc, '4'), '2');
  st = calcBackspace(st);
  assert.equal(calcDisplay(st), '4');
  st = calcBackspace(st);
  assert.equal(calcDisplay(st), '0');
  st = calcBackspace(st);
  assert.equal(calcDisplay(st), '0');
});

test('calcPending 在等待第二個運算元時顯示中間狀態', () => {
  const st = calcOperator(calcDigit(emptyCalc, '9'), '+');
  assert.equal(calcPending(st), '9 ＋');
  assert.equal(calcPending(emptyCalc), null);
});
