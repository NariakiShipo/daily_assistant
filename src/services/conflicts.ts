/**
 * 課表 × 個人行程的衝突偵測與調整運算。
 *
 * 課程是「每週循環」、行程是「特定日期」,因此:
 * - 有學期的課只在學期起訖日內生效
 * - 未分類(無學期)的課視為長期有效(相容舊資料)
 * - 跨日行程視為連續時段:首日從開始時刻起、末日到結束時刻止、中間日整天
 */
import { CalendarEvent, CourseEntry, SemesterMeta } from '../types';
import { PERIOD_SLOTS, WEEKDAYS } from '../constants/timetable';
import { addDays, fromDateKey, minutesToTime, timeToMinutes } from '../utils/date';

const DAY_END = 24 * 60;
/** 跨日行程展開上限(與月曆的防呆一致) */
const MAX_SPAN_DAYS = 62;

export const ownersOfEvent = (e: CalendarEvent): string[] =>
  e.ownerIds?.length ? e.ownerIds : [e.ownerId];

/** 課程時段(分鐘制) */
export interface CourseSlot {
  course: CourseEntry;
  weekday: number;
  startMin: number;
  endMin: number;
}

export function slotOf(c: CourseEntry): CourseSlot {
  const last = Math.min(c.endPeriod, PERIOD_SLOTS.length - 1);
  return {
    course: c,
    weekday: c.weekday,
    startMin: timeToMinutes(PERIOD_SLOTS[c.startPeriod]?.start ?? '00:00'),
    endMin: timeToMinutes(PERIOD_SLOTS[last]?.end ?? '00:00'),
  };
}

export const slotTimeText = (s: CourseSlot): string =>
  `週${WEEKDAYS[s.weekday - 1]} ${minutesToTime(s.startMin)}–${minutesToTime(s.endMin)}`;

/** 行程在某一天實際佔用的時段(跨日行程首末日不同) */
function dayWindow(ev: CalendarEvent, date: string, lastDate: string): { start: number; end: number } {
  return {
    start: date === ev.date ? timeToMinutes(ev.startTime) : 0,
    end: date === lastDate ? timeToMinutes(ev.endTime) : DAY_END,
  };
}

/** 一筆行程與課表的衝突 */
export interface EventConflict {
  event: CalendarEvent;
  /** 衝突的日期與當天撞到的課(依日期排序) */
  hits: { date: string; slots: CourseSlot[] }[];
}

/**
 * 匯入後的全面掃描:找出某成員在學期範圍內、與指定課程衝突的行程。
 * courses 應先過濾為該成員該學期的課。
 */
export function findConflicts(
  events: CalendarEvent[],
  courses: CourseEntry[],
  semester: SemesterMeta,
  ownerId: string
): EventConflict[] {
  const byWeekday = new Map<number, CourseSlot[]>();
  for (const c of courses) {
    const s = slotOf(c);
    const list = byWeekday.get(s.weekday) ?? [];
    list.push(s);
    byWeekday.set(s.weekday, list);
  }

  const out: EventConflict[] = [];
  for (const ev of events) {
    if (!ownersOfEvent(ev).includes(ownerId)) continue;
    const lastDate = ev.endDate ?? ev.date;
    if (lastDate < semester.startDate || ev.date > semester.endDate) continue;

    const hits: EventConflict['hits'] = [];
    let d = ev.date > semester.startDate ? ev.date : semester.startDate;
    const end = lastDate < semester.endDate ? lastDate : semester.endDate;
    let guard = 0;
    while (d <= end && guard < MAX_SPAN_DAYS) {
      const weekday = fromDateKey(d).getDay();
      const slots = byWeekday.get(weekday);
      if (slots) {
        const w = dayWindow(ev, d, lastDate);
        const clashed = slots.filter((s) => w.start < s.endMin && w.end > s.startMin);
        if (clashed.length) {
          hits.push({ date: d, slots: clashed.sort((a, b) => a.startMin - b.startMin) });
        }
      }
      d = addDays(d, 1);
      guard++;
    }
    if (hits.length) out.push({ event: ev, hits });
  }
  return out.sort((a, b) =>
    (a.event.date + a.event.startTime).localeCompare(b.event.date + b.event.startTime)
  );
}

/** 行程存檔前的即時檢查:撞到任一擁有者的課(依學期範圍;未分類課恆生效) */
export interface EventClash {
  date: string;
  ownerId: string;
  slot: CourseSlot;
}

export function findEventClashes(
  ev: CalendarEvent,
  courses: CourseEntry[],
  semesters: SemesterMeta[]
): EventClash[] {
  const semById = new Map(semesters.map((s) => [s.id, s]));
  const owners = new Set(ownersOfEvent(ev));
  const lastDate = ev.endDate ?? ev.date;

  const out: EventClash[] = [];
  let d = ev.date;
  let guard = 0;
  while (d <= lastDate && guard < MAX_SPAN_DAYS) {
    const weekday = fromDateKey(d).getDay();
    const w = dayWindow(ev, d, lastDate);
    for (const c of courses) {
      if (c.weekday !== weekday || !owners.has(c.ownerId)) continue;
      const sem = c.semesterId ? semById.get(c.semesterId) : undefined;
      if (c.semesterId && sem && (d < sem.startDate || d > sem.endDate)) continue;
      const s = slotOf(c);
      if (w.start < s.endMin && w.end > s.startMin) out.push({ date: d, ownerId: c.ownerId, slot: s });
    }
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

/** 從 [start, end) 扣掉多個占用區間,回傳剩餘片段(過濾短於 minLen 分鐘的碎片) */
export function subtractIntervals(
  start: number,
  end: number,
  blocks: { startMin: number; endMin: number }[],
  minLen = 10
): { start: number; end: number }[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const out: { start: number; end: number }[] = [];
  let cur = start;
  for (const b of sorted) {
    if (b.endMin <= cur || b.startMin >= end) continue;
    if (b.startMin > cur) out.push({ start: cur, end: Math.min(b.startMin, end) });
    cur = Math.max(cur, b.endMin);
    if (cur >= end) break;
  }
  if (cur < end) out.push({ start: cur, end });
  return out.filter((seg) => seg.end - seg.start >= minLen);
}

/**
 * 「截短讓出上課時間」:回傳行程扣掉衝突課程後的剩餘片段。
 * 只支援單日行程;可能 0 段(整段都在上課)或多段(課在中間,行程被切開)。
 */
export function trimEventTimes(
  ev: CalendarEvent,
  hits: EventConflict['hits']
): { start: string; end: string }[] | null {
  if (ev.endDate && ev.endDate !== ev.date) return null; // 跨日行程不支援截短
  const blocks = (hits[0]?.slots ?? []).map((s) => ({ startMin: s.startMin, endMin: s.endMin }));
  // 短於 15 分鐘的剩餘碎片直接捨棄
  const segs = subtractIntervals(timeToMinutes(ev.startTime), timeToMinutes(ev.endTime), blocks, 15);
  return segs.map((s) => ({ start: minutesToTime(s.start), end: minutesToTime(s.end) }));
}

/** 某成員某平日的空堂文字(08:00–22:00 扣掉所有課),供調整行程參考 */
export function freeGapsText(courses: CourseEntry[], weekday: number): string {
  const blocks = courses.filter((c) => c.weekday === weekday).map(slotOf);
  const gaps = subtractIntervals(8 * 60, 22 * 60, blocks, 30);
  if (!gaps.length) return '';
  return gaps.map((g) => `${minutesToTime(g.start)}–${minutesToTime(g.end)}`).join('、');
}
