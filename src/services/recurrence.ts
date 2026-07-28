/**
 * 重複行程的展開。
 *
 * 設計:資料庫只存「第一次發生」那一筆 CalendarEvent + recurrence 規則,
 * 顯示時才依檢視範圍展開成一個個實例,避免產生大量重複資料。
 *
 * 展開出的實例是 EventInstance:
 * - `id` 帶上發生日期(`原id@日期`),讓 React key 與各種 Map 不會撞在一起
 * - `seriesId` 指回原始行程,編輯/刪除時用它找回本尊
 * - `date` / `endDate` 已改寫為「這一次」的日期
 *
 * 月重複遇到不存在的日期(例如 1/31 的下個月)採「跳過該月」而非夾到月底,
 * 因為夾到月底會讓後續每一次都往前漂移,行為難以預期。
 */
import { CalendarEvent, Recurrence, TAG_DONE } from '../types';
import { addDays, daysBetween, fromDateKey, toDateKey } from '../utils/date';

/** 展開後的單次發生。非重複行程展開後 seriesId 為 undefined,其餘欄位與原本相同。 */
export interface EventInstance extends CalendarEvent {
  /** 重複行程展開出的實例才有:指向原始行程的 id */
  seriesId?: string;
}

/** 防呆:單一行程在一次展開中最多產生幾個實例 */
const MAX_OCCURRENCES = 400;

const STEP_DAYS: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14 };

/** 取回實例對應的原始行程 id(非重複行程即自身 id) */
export const seriesIdOf = (ev: EventInstance): string => ev.seriesId ?? ev.id;

/** 這一筆是不是重複行程展開出來的實例 */
export const isInstance = (ev: EventInstance): boolean => ev.seriesId !== undefined;

/** 產生實例 id:原 id + 發生日期 */
const instanceId = (id: string, date: string): string => `${id}@${date}`;

/** 行程橫跨幾天(單日為 0) */
const spanOf = (ev: CalendarEvent): number =>
  ev.endDate ? Math.max(0, daysBetween(ev.date, ev.endDate)) : 0;

/** 把某一次發生組成實例(完成狀態逐次獨立,由 doneDates 決定) */
function makeInstance(ev: CalendarEvent, date: string, span: number): EventInstance {
  const done = ev.doneDates?.includes(date);
  const base = (ev.tags ?? []).filter((t) => t !== TAG_DONE);
  const tags = done ? [...base, TAG_DONE] : base;
  return {
    ...ev,
    id: instanceId(ev.id, date),
    seriesId: ev.id,
    date,
    endDate: span > 0 ? addDays(date, span) : undefined,
    tags: tags.length ? tags : undefined,
  };
}

/** 這一次發生是否與檢視範圍重疊 */
const overlaps = (date: string, span: number, rangeStart: string, rangeEnd: string): boolean =>
  date <= rangeEnd && addDays(date, span) >= rangeStart;

/** 依固定天數間隔(每天/每週/每兩週)展開 */
function expandByDays(
  ev: CalendarEvent,
  rule: Recurrence,
  step: number,
  rangeStart: string,
  rangeEnd: string
): EventInstance[] {
  const span = spanOf(ev);
  const exceptions = new Set(rule.exceptions ?? []);
  const hardEnd = rule.until && rule.until < rangeEnd ? rule.until : rangeEnd;

  // 直接跳到範圍附近再開始逐次前進,避免從很久以前一天一天數過來
  const diff = daysBetween(ev.date, rangeStart) - span;
  const skip = diff > 0 ? Math.floor(diff / step) : 0;
  let cursor = addDays(ev.date, skip * step);

  const out: EventInstance[] = [];
  for (let i = 0; i < MAX_OCCURRENCES && cursor <= hardEnd; i++) {
    if (!exceptions.has(cursor) && overlaps(cursor, span, rangeStart, rangeEnd)) {
      out.push(makeInstance(ev, cursor, span));
    }
    cursor = addDays(cursor, step);
  }
  return out;
}

/** 依月份展開(保持同一個日期號數,該月沒有這一天就跳過) */
function expandMonthly(
  ev: CalendarEvent,
  rule: Recurrence,
  rangeStart: string,
  rangeEnd: string
): EventInstance[] {
  const span = spanOf(ev);
  const exceptions = new Set(rule.exceptions ?? []);
  const hardEnd = rule.until && rule.until < rangeEnd ? rule.until : rangeEnd;

  const first = fromDateKey(ev.date);
  const dayOfMonth = first.getDate();
  const startMonths = first.getFullYear() * 12 + first.getMonth();

  // 從範圍起點的前一個月開始掃(跨月的長行程也才涵蓋得到)
  const rangeFirst = fromDateKey(rangeStart);
  const rangeMonths = rangeFirst.getFullYear() * 12 + rangeFirst.getMonth();
  let idx = Math.max(0, rangeMonths - startMonths - 1);

  const out: EventInstance[] = [];
  for (let i = 0; i < MAX_OCCURRENCES; i++, idx++) {
    const total = startMonths + idx;
    const d = new Date(Math.floor(total / 12), total % 12, dayOfMonth);
    // 該月沒有這一天(例如 2 月 31 日)→ Date 會自動溢位到下個月,跳過
    if (d.getDate() !== dayOfMonth) continue;
    const cursor = toDateKey(d);
    if (cursor > hardEnd) break;
    if (cursor < ev.date) continue;
    if (!exceptions.has(cursor) && overlaps(cursor, span, rangeStart, rangeEnd)) {
      out.push(makeInstance(ev, cursor, span));
    }
  }
  return out;
}

/** 單一行程在範圍內的所有發生(含非重複行程) */
export function expandEvent(
  ev: CalendarEvent,
  rangeStart: string,
  rangeEnd: string
): EventInstance[] {
  const rule = ev.recurrence;
  if (!rule) {
    // 非重複行程:與範圍重疊才回傳,且不加 seriesId
    return overlaps(ev.date, spanOf(ev), rangeStart, rangeEnd) ? [ev] : [];
  }
  const step = STEP_DAYS[rule.freq];
  return step
    ? expandByDays(ev, rule, step, rangeStart, rangeEnd)
    : expandMonthly(ev, rule, rangeStart, rangeEnd);
}

/**
 * 把一批行程展開成 [rangeStart, rangeEnd] 範圍內的所有發生,依日期時間排序。
 * 這是所有畫面取得「要顯示什麼」的單一入口。
 */
export function expandEvents(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string
): EventInstance[] {
  const out: EventInstance[] = [];
  for (const ev of events) out.push(...expandEvent(ev, rangeStart, rangeEnd));
  return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/** 從一批原始行程中找出某個實例對應的本尊 */
export function findSeries(
  events: CalendarEvent[],
  inst: EventInstance
): CalendarEvent | undefined {
  return events.find((e) => e.id === seriesIdOf(inst));
}

/**
 * 只刪除重複行程的某一次:把該日期加進 exceptions,回傳更新後的原始行程。
 * 非重複行程回傳 null(呼叫端應直接刪整筆)。
 */
export function excludeOccurrence(
  series: CalendarEvent,
  date: string
): CalendarEvent | null {
  if (!series.recurrence) return null;
  const cur = series.recurrence.exceptions ?? [];
  if (cur.includes(date)) return series;
  return {
    ...series,
    recurrence: { ...series.recurrence, exceptions: [...cur, date] },
    // 這一天已不再發生,順手清掉它的完成狀態
    doneDates: series.doneDates?.filter((d) => d !== date),
  };
}

/** 切換重複行程某一次的完成狀態,回傳更新後的原始行程 */
export function toggleOccurrenceDone(series: CalendarEvent, date: string): CalendarEvent {
  const cur = series.doneDates ?? [];
  const next = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date];
  return { ...series, doneDates: next.length ? next : undefined };
}

/** 重複行程的文字描述,例如「每週」 */
export function recurrenceText(
  rule: Recurrence | undefined,
  labels: Record<string, string>
): string {
  if (!rule) return '';
  return labels[rule.freq] ?? '';
}
