/**
 * Google 日曆 → 本機的轉換與合併(純函式)。
 *
 * 原本只有單向推送:本機建立的行程會上去,但 Google 上既有的行程、
 * 別人寄來的邀請、或在 Google 端的修改都不會回來。這裡補上拉取那一半。
 *
 * 重複行程的取捨:向 Google 要 `singleEvents=true`,讓它把重複行程展開成
 * 一個個實例再匯入,而不是自己解析 RRULE。Google 的 RRULE 支援 BYDAY 清單、
 * INTERVAL、COUNT、EXDATE 等等,本專案的 Recurrence 模型只涵蓋其中一小部分,
 * 硬要對應會在邊角情況安靜地產生錯誤日期——寧可匯入成一筆筆獨立行程。
 */
import { CalendarEvent } from '../types';

/** Google Calendar API 回傳的單筆事件(只列用得到的欄位) */
export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
}

/** 從 Google 匯入的行程,本機 id 加這個前綴,一眼看得出來源 */
export const GOOGLE_ID_PREFIX = 'gcal:';

export const localIdFor = (googleEventId: string): string =>
  `${GOOGLE_ID_PREFIX}${googleEventId}`;

export const isFromGoogle = (ev: CalendarEvent): boolean => ev.id.startsWith(GOOGLE_ID_PREFIX);

/** 'YYYY-MM-DDTHH:mm:ss+08:00' → 'HH:mm'(取當地時間,不做時區換算) */
function timeOf(dateTime: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(dateTime);
  return m ? `${m[1]}:${m[2]}` : '00:00';
}

/** 取日期部分 */
function dateOf(value: string): string {
  return value.slice(0, 10);
}

/** 整天事件的 end.date 是排他的(隔天),換算回本機的閉區間結束日 */
function exclusiveEndToInclusive(endDate: string): string {
  const d = new Date(`${endDate}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Google 事件 → 本機行程。
 * 已取消、或缺少必要欄位的回傳 null(呼叫端據此刪除或略過)。
 */
export function fromGoogleEvent(g: GoogleEvent, ownerId: string): CalendarEvent | null {
  if (g.status === 'cancelled') return null;
  const startRaw = g.start?.dateTime ?? g.start?.date;
  if (!startRaw) return null;

  const allDay = !g.start?.dateTime;
  const date = dateOf(startRaw);
  const endRaw = g.end?.dateTime ?? g.end?.date;

  let endDate: string | undefined;
  let startTime = '00:00';
  let endTime = '23:59';

  if (allDay) {
    // 整天事件:end.date 排他,減一天才是本機認知的結束日
    const inclusive = endRaw ? exclusiveEndToInclusive(dateOf(endRaw)) : date;
    endDate = inclusive > date ? inclusive : undefined;
  } else {
    startTime = timeOf(startRaw);
    if (endRaw) {
      endTime = timeOf(endRaw);
      const endDay = dateOf(endRaw);
      if (endDay > date) endDate = endDay;
    }
  }

  return {
    id: localIdFor(g.id),
    title: g.summary?.trim() || '(無標題)',
    notes: g.description?.trim() || undefined,
    date,
    endDate,
    startTime,
    endTime,
    allDay: allDay || undefined,
    ownerId,
    ownerIds: [ownerId],
    createdBy: ownerId,
    googleEventId: g.id,
    syncToGoogle: true,
    updatedAt: g.updated ? Date.parse(g.updated) : undefined,
  };
}

export interface MergeResult {
  events: CalendarEvent[];
  added: number;
  updated: number;
  removed: number;
  /** 本機較新而保留、沒有採用 Google 版本的筆數 */
  keptLocal: number;
}

/**
 * 把拉回來的 Google 事件合併進本機清單。
 *
 * 比對依據是 googleEventId(不是本機 id),因為同一筆行程可能是本機建立後
 * 推上去的(id 為 uid()),也可能是從 Google 匯入的(id 為 gcal:xxx)。
 *
 * 衝突規則:比較兩邊的 updatedAt,新的贏。時間戳缺一不可判斷時採用 Google 版本,
 * 因為本機沒有時間戳代表那是還沒被這版程式碼改過的舊資料。
 */
export function mergeGoogleEvents(
  local: CalendarEvent[],
  remote: GoogleEvent[],
  ownerId: string
): MergeResult {
  const byGoogleId = new Map<string, CalendarEvent>();
  for (const ev of local) {
    if (ev.googleEventId) byGoogleId.set(ev.googleEventId, ev);
  }

  const removedIds = new Set<string>();
  const replacements = new Map<string, CalendarEvent>();
  let added = 0;
  let updated = 0;
  let removed = 0;
  let keptLocal = 0;

  for (const g of remote) {
    const existing = byGoogleId.get(g.id);
    const converted = fromGoogleEvent(g, ownerId);

    if (!converted) {
      // Google 端已刪除
      if (existing) {
        removedIds.add(existing.id);
        removed++;
      }
      continue;
    }

    if (!existing) {
      replacements.set(converted.id, converted);
      added++;
      continue;
    }

    const localTime = existing.updatedAt;
    const remoteTime = converted.updatedAt;
    if (localTime !== undefined && remoteTime !== undefined && localTime > remoteTime) {
      keptLocal++;
      continue;
    }

    // 沿用本機 id 與本機專屬欄位(標籤、提醒、優先順序在 Google 沒有對應)
    replacements.set(existing.id, {
      ...converted,
      id: existing.id,
      ownerId: existing.ownerId,
      ownerIds: existing.ownerIds,
      createdBy: existing.createdBy,
      tags: existing.tags,
      priority: existing.priority,
      remindMinutesBefore: existing.remindMinutesBefore,
      recurrence: existing.recurrence,
      doneDates: existing.doneDates,
    });
    updated++;
  }

  const events = local
    .filter((ev) => !removedIds.has(ev.id))
    .map((ev) => replacements.get(ev.id) ?? ev);

  // 新增的(本機原本沒有的)接在後面
  for (const [id, ev] of replacements) {
    if (!local.some((e) => e.id === id)) events.push(ev);
  }

  return { events, added, updated, removed, keptLocal };
}

/** 同步結果的中文摘要 */
export function syncSummary(r: MergeResult): string {
  const parts: string[] = [];
  if (r.added) parts.push(`新增 ${r.added} 筆`);
  if (r.updated) parts.push(`更新 ${r.updated} 筆`);
  if (r.removed) parts.push(`移除 ${r.removed} 筆`);
  if (r.keptLocal) parts.push(`保留本機較新的 ${r.keptLocal} 筆`);
  return parts.length ? parts.join(' · ') : '沒有變更';
}
