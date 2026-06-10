const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'(本地時區) */
export const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → Date(本地時區 00:00) */
export const fromDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = (): string => toDateKey(new Date());

export const addDays = (key: string, days: number): string => {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** b - a 的天數 */
export const daysBetween = (a: string, b: string): number =>
  Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86400000);

export const isWithin = (key: string, start: string, end: string): boolean =>
  key >= start && key <= end;

/** 月曆格子:回傳含前後空位的 6x7 陣列(null 為空位) */
export const monthGrid = (year: number, month: number): (string | null)[] => {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const formatDateZh = (key: string): string => {
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export const formatMonthZh = (year: number, month: number): string =>
  `${year}年${month + 1}月`;

export const weekdayZh = ['日', '一', '二', '三', '四', '五', '六'];

export const isValidTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export const isValidDateKey = (k: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  return toDateKey(fromDateKey(k)) === k;
};

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
