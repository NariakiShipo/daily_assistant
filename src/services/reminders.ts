/**
 * 行程提醒的排程計算(純函式,不碰通知 API,方便測試)。
 *
 * 為什麼需要「地平線 + 上限」:
 * iOS 對「已排程的本機通知」有 64 則的硬上限,超過的會被系統默默丟掉。
 * 重複行程展開後很容易超過,所以只排未來一段期間、且取最近的前 N 則;
 * 每次資料變動都會重算,所以排在後面的提醒之後仍會補上。
 */
import { CalendarEvent, CourseEntry, SemesterMeta, TAG_DONE, remindLabel } from '../types';
import { addDays, atTime, formatDateZh, minutesToTime, toDateKey } from '../utils/date';
import { expandEvents } from './recurrence';
import { coursesOnDate } from './timetableToday';

/** 只排未來這麼多天內的提醒 */
export const DEFAULT_HORIZON_DAYS = 30;
/** 一次最多排幾則行程提醒(留餘裕給經期提醒) */
export const DEFAULT_MAX_REMINDERS = 40;
/** 整天事項的提醒基準時刻(沒有開始時間,從半夜提醒沒有意義) */
export const ALL_DAY_REMIND_AT = '09:00';

export interface EventReminder {
  /** 排程識別:原始行程 id + 發生日期,重算時可比對 */
  key: string;
  /** 原始行程 id(重複行程為系列 id) */
  eventId: string;
  /** 這一次發生的日期 */
  date: string;
  title: string;
  body: string;
  /** 何時送出通知 */
  fireAt: Date;
}

export interface CollectOptions {
  horizonDays?: number;
  max?: number;
}

/**
 * 算出接下來該排哪些行程提醒。
 *
 * 規則:
 * - 只看有設定 remindMinutesBefore 的行程
 * - 提醒時刻已經過去的不排(包含今天稍早的)
 * - 已標記完成的那一次不排
 * - 依提醒時刻由近到遠取前 max 則
 */
export function collectEventReminders(
  events: CalendarEvent[],
  now: Date,
  opts: CollectOptions = {}
): EventReminder[] {
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const max = opts.max ?? DEFAULT_MAX_REMINDERS;

  const today = toDateKey(now);
  // 「前一天」這種提醒可能落在行程前一天,所以起點往前一天抓
  const rangeStart = addDays(today, -1);
  const rangeEnd = addDays(today, horizonDays);

  const out: EventReminder[] = [];
  for (const inst of expandEvents(events, rangeStart, rangeEnd)) {
    const mins = inst.remindMinutesBefore;
    if (mins === undefined || mins === null) continue;
    if (inst.tags?.includes(TAG_DONE)) continue;

    // 整天事項沒有開始時間,從半夜提醒沒有意義,改以早上 9 點為基準
    const base = inst.allDay ? ALL_DAY_REMIND_AT : inst.startTime;
    const fireAt = new Date(atTime(inst.date, base).getTime() - mins * 60_000);
    if (fireAt.getTime() <= now.getTime()) continue;

    const eventId = inst.seriesId ?? inst.id;
    out.push({
      key: `${eventId}@${inst.date}`,
      eventId,
      date: inst.date,
      title: `⏰ ${remindLabel(mins)}:${inst.title}`,
      body: inst.allDay
        ? `${formatDateZh(inst.date)} 整天`
        : `${formatDateZh(inst.date)} ${inst.startTime}–${inst.endTime}`,
      fireAt,
    });
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, max);
}

/** 上課提醒只排未來這麼多天(課是每週固定的,排太遠沒有意義且會擠爆通知額度) */
export const COURSE_HORIZON_DAYS = 7;

/**
 * 合併多種提醒後依時間截斷。
 *
 * 行程提醒與上課提醒佔用的是同一份系統通知額度,
 * 各自截斷會讓總數超標,必須合併後再一起取前 max 則。
 */
export function mergeReminders(
  lists: EventReminder[][],
  max = DEFAULT_MAX_REMINDERS
): EventReminder[] {
  return lists
    .flat()
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, max);
}

/**
 * 算出接下來該排哪些上課提醒。
 *
 * 與行程提醒分開累計上限:兩者都會佔用系統的通知額度,
 * 呼叫端會把兩份清單合併後再一起截斷。
 */
export function collectCourseReminders(
  courses: CourseEntry[],
  semesters: SemesterMeta[],
  ownerId: string,
  minutesBefore: number,
  now: Date,
  opts: CollectOptions = {}
): EventReminder[] {
  const horizonDays = opts.horizonDays ?? COURSE_HORIZON_DAYS;
  const max = opts.max ?? DEFAULT_MAX_REMINDERS;
  const today = toDateKey(now);

  const out: EventReminder[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    for (const slot of coursesOnDate(courses, semesters, date, ownerId)) {
      const startTime = minutesToTime(slot.startMin);
      const fireAt = new Date(atTime(date, startTime).getTime() - minutesBefore * 60_000);
      if (fireAt.getTime() <= now.getTime()) continue;

      out.push({
        key: `course:${slot.course.id}@${date}`,
        eventId: slot.course.id,
        date,
        title: `📚 ${remindLabel(minutesBefore)}:${slot.course.title}`,
        body: `${formatDateZh(date)} ${startTime}${
          slot.course.location ? ` · ${slot.course.location}` : ''
        }`,
        fireAt,
      });
    }
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, max);
}
