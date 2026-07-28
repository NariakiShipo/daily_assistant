/**
 * 「今天有哪些課 / 下一堂是什麼」的計算(純函式)。
 *
 * 課表本身是週循環的網格,但使用者真正想知道的是「現在該去哪間教室」。
 * 這裡把週循環 + 學期起訖換算成某一天的實際課程清單。
 */
import { CourseEntry, SemesterMeta } from '../types';
import { CourseSlot, slotOf } from './conflicts';
import { fromDateKey, isWithin, timeToMinutes } from '../utils/date';

/**
 * 某位成員在某一天的課程,依開始時間排序。
 *
 * 與日曆的判定一致:有學期的課只在學期起訖內生效,
 * 未分類(無 semesterId)的課視為長期有效,以相容舊資料與手動課程。
 */
export function coursesOnDate(
  courses: CourseEntry[],
  semesters: SemesterMeta[],
  dateKey: string,
  ownerId: string
): CourseSlot[] {
  const weekday = fromDateKey(dateKey).getDay();
  const semById = new Map(semesters.map((s) => [s.id, s]));

  return courses
    .filter((c) => {
      if (c.weekday !== weekday) return false;
      if (c.ownerId !== ownerId) return false;
      if (!c.semesterId) return true;
      const sem = semById.get(c.semesterId);
      return !sem || isWithin(dateKey, sem.startDate, sem.endDate);
    })
    .map(slotOf)
    .sort((a, b) => a.startMin - b.startMin);
}

export type CourseStatus = 'ongoing' | 'upcoming';

export interface CurrentCourse {
  slot: CourseSlot;
  status: CourseStatus;
  /** ongoing = 還剩幾分鐘下課;upcoming = 還有幾分鐘上課 */
  minutes: number;
}

/**
 * 依現在時刻找出「正在上的課」或「下一堂課」。
 * 正在上的課優先;當天課都上完則回傳 null。
 */
export function currentCourseAt(
  list: CourseSlot[],
  nowMinutes: number
): CurrentCourse | null {
  for (const slot of list) {
    if (nowMinutes >= slot.startMin && nowMinutes < slot.endMin) {
      return { slot, status: 'ongoing', minutes: slot.endMin - nowMinutes };
    }
  }
  for (const slot of list) {
    if (slot.startMin > nowMinutes) {
      return { slot, status: 'upcoming', minutes: slot.startMin - nowMinutes };
    }
  }
  return null;
}

/** 由 Date 取得當日分鐘數,供 currentCourseAt 使用 */
export const minutesOfDay = (now: Date): number => now.getHours() * 60 + now.getMinutes();

/** 課程時段的文字,例如「10:10–12:00」 */
export const slotRangeText = (slot: CourseSlot): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return `${fmt(slot.startMin)}–${fmt(slot.endMin)}`;
};

/**
 * 倒數文字。超過一小時改用「N 小時 M 分鐘」——
 * 「284 分鐘後開始」雖然正確,但要心算才知道是多久。
 */
export const countdownText = (minutes: number): string => {
  if (minutes < 60) return `${minutes} 分鐘`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
};

/** 這門課的總時長(分鐘),供進度條使用 */
export const slotDuration = (slot: CourseSlot): number =>
  Math.max(1, slot.endMin - slot.startMin);

/** 把 'HH:MM' 轉成當日分鐘數(re-export,方便畫面直接使用) */
export { timeToMinutes };
