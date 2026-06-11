/** 課表節次定義:標籤 1~C,共 13 節(含中午彈性時間) */

export type SessionName = '上午' | '中午' | '下午' | '晚間';

export interface PeriodSlot {
  /** 左欄標籤(1,2,3,4,彈,5,6,7,8,9,A,B) */
  label: string;
  start: string;
  end: string;
  session: SessionName;
}

export const PERIOD_SLOTS: PeriodSlot[] = [
  { label: '1', start: '08:10', end: '09:00', session: '上午' },
  { label: '2', start: '09:10', end: '10:00', session: '上午' },
  { label: '3', start: '10:10', end: '11:00', session: '上午' },
  { label: '4', start: '11:10', end: '12:00', session: '上午' },
  { label: '彈', start: '12:10', end: '13:00', session: '中午' },
  { label: '5', start: '13:10', end: '14:00', session: '下午' },
  { label: '6', start: '14:10', end: '15:00', session: '下午' },
  { label: '7', start: '15:10', end: '16:00', session: '下午' },
  { label: '8', start: '16:10', end: '17:00', session: '下午' },
  { label: '9', start: '17:10', end: '18:00', session: '下午' },
  { label: 'A', start: '19:15', end: '20:00', session: '晚間' },
  { label: 'B', start: '20:10', end: '20:55', session: '晚間' },
  { label: 'C', start: '20:55', end: '21:40', session: '晚間' },
];

/** 週一到週五(weekday 1~5) */
export const WEEKDAYS = ['一', '二', '三', '四', '五'];
