/**
 * 行程的搜尋與篩選(純函式)。
 *
 * 原本這些條件散在 CalendarScreen 的 useMemo 裡,加上搜尋後條件變多,
 * 抽出來才測得到,也讓月曆與未來 7 天兩種檢視共用同一套規則。
 */
import { CalendarEvent, TAG_DONE } from '../types';

/** 「未完成」是虛擬標籤:不是真的標在行程上,而是「沒有完成標籤」的意思 */
export const TAG_UNDONE = '未完成';

export interface EventFilter {
  /** 關鍵字(比對標題、備註、標籤;空字串 = 不過濾) */
  query?: string;
  /** 只看某位成員的行程(null / undefined = 全部) */
  ownerId?: string | null;
  /** 只看某個標籤,或 TAG_UNDONE(null / undefined = 全部) */
  tag?: string | null;
}

/** 行程的所有擁有者(相容舊資料的單一 ownerId) */
export const ownersOf = (e: CalendarEvent): string[] =>
  e.ownerIds?.length ? e.ownerIds : [e.ownerId];

/** 關鍵字是否命中這筆行程(不分大小寫;空關鍵字一律命中) */
export function matchesQuery(ev: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (ev.title.toLowerCase().includes(q)) return true;
  if ((ev.notes ?? '').toLowerCase().includes(q)) return true;
  return (ev.tags ?? []).some((t) => t.toLowerCase().includes(q));
}

/** 標籤條件是否命中 */
export function matchesTag(ev: CalendarEvent, tag: string | null | undefined): boolean {
  if (!tag) return true;
  if (tag === TAG_UNDONE) return !ev.tags?.includes(TAG_DONE);
  return !!ev.tags?.includes(tag);
}

/** 成員條件是否命中 */
export function matchesOwner(ev: CalendarEvent, ownerId: string | null | undefined): boolean {
  if (!ownerId) return true;
  return ownersOf(ev).includes(ownerId);
}

/** 套用全部條件(泛型保留 EventInstance 之類的擴充型別) */
export function filterEvents<T extends CalendarEvent>(events: T[], f: EventFilter): T[] {
  return events.filter(
    (ev) =>
      matchesOwner(ev, f.ownerId) && matchesTag(ev, f.tag) && matchesQuery(ev, f.query ?? '')
  );
}
