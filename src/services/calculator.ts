/**
 * 記一筆用的極簡計算機。
 *
 * 只做加減:記帳時真正會用到的是「120 + 60」這種當場把幾筆併成一筆的情境,
 * 乘除與括號只會讓鍵盤變擠。沒有運算子優先權的問題,所以左到右逐步結算就夠了。
 */

export interface CalcState {
  /** 目前正在輸入的數字(字串形式,保留使用者打的小數點) */
  entry: string;
  /** 已經結算的累計值;還沒按過運算子時是 null */
  acc: number | null;
  /** 待執行的運算子 */
  op: '+' | '-' | null;
}

export const emptyCalc: CalcState = { entry: '0', acc: null, op: null };

/** 從一個已知金額回推初始狀態(編輯既有帳目時用) */
export const calcFromAmount = (amount: number): CalcState => ({
  entry: String(amount),
  acc: null,
  op: null,
});

const MAX_DIGITS = 9;

/** 目前輸入框該顯示的數字 */
export const calcDisplay = (st: CalcState): string => st.entry;

/** 把狀態結算成一個數字(按「完成」時用) */
export function calcValue(st: CalcState): number {
  const cur = Number(st.entry) || 0;
  if (st.acc === null || st.op === null) return cur;
  return st.op === '+' ? st.acc + cur : st.acc - cur;
}

/** 按數字鍵 */
export function calcDigit(st: CalcState, d: string): CalcState {
  // 小數點最多一個;整數位有上限,避免打出長到排版爆掉的數字
  if (d === '.') {
    if (st.entry.includes('.')) return st;
    return { ...st, entry: `${st.entry}.` };
  }
  if (st.entry.replace('.', '').length >= MAX_DIGITS) return st;
  const entry = st.entry === '0' ? d : `${st.entry}${d}`;
  return { ...st, entry };
}

/** 按 ⌫:刪一個字,刪光了回到 0 */
export function calcBackspace(st: CalcState): CalcState {
  if (st.entry.length <= 1) return { ...st, entry: '0' };
  return { ...st, entry: st.entry.slice(0, -1) };
}

/**
 * 按 ＋ / －。
 *
 * 連按兩次運算子只換運算子,不重複結算——否則「120 ＋ ＋ 60」會變成 240。
 */
export function calcOperator(st: CalcState, op: '+' | '-'): CalcState {
  if (st.entry === '0' && st.acc !== null) return { ...st, op };
  return { entry: '0', acc: calcValue(st), op };
}

/** 是否還在輸入運算式(畫面上用來顯示「120 ＋」這種中間狀態) */
export const calcPending = (st: CalcState): string | null =>
  st.acc !== null && st.op !== null ? `${st.acc} ${st.op === '+' ? '＋' : '－'}` : null;
