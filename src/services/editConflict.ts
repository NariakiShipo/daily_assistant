/**
 * 同時編輯的衝突偵測(純函式)。
 *
 * Firestore 是 last-write-wins:兩人同時改同一筆行程,後寫的直接蓋掉前一筆,
 * 而且雙方都不會知道。共用日曆最惱人的正是這種靜默覆蓋——
 * 你花時間改的東西消失了,還以為是自己記錯。
 *
 * 做法:開啟編輯視窗時記下那一刻的 updatedAt 當作 baseline,存檔前比對
 * store 裡的同一筆。Firestore 訂閱是即時的,所以「現在的版本」就是對方的最新版。
 * 對不上就代表在你編輯期間有人改過,列出差異讓你決定。
 */
import { CalendarEvent, PRIORITY_LABELS, RECURRENCE_LABELS, remindLabel } from '../types';
import { formatDateZh } from '../utils/date';

/** 單一欄位的差異 */
export interface FieldDiff {
  label: string;
  /** 我正要存的值 */
  mine: string;
  /** 對方已經存進去的值 */
  theirs: string;
}

export type ConflictKind = 'none' | 'modified' | 'deleted';

export interface ConflictResult {
  kind: ConflictKind;
  /** kind = 'modified' 時的欄位差異(只列真的不同的) */
  diffs: FieldDiff[];
  /** 對方那一版(kind = 'modified' 時) */
  theirs?: CalendarEvent;
}

const EMPTY = '(未設定)';

const timeText = (e: CalendarEvent): string =>
  e.allDay ? '整天' : `${e.startTime}–${e.endTime}`;

const dateText = (e: CalendarEvent): string =>
  e.endDate && e.endDate !== e.date
    ? `${formatDateZh(e.date)} → ${formatDateZh(e.endDate)}`
    : formatDateZh(e.date);

const ownersText = (e: CalendarEvent, nameOf: (id: string) => string): string =>
  (e.ownerIds?.length ? e.ownerIds : [e.ownerId]).map(nameOf).join('、');

/** 把一筆行程攤平成「欄位 → 顯示文字」,兩版比對時逐欄對照 */
function fields(e: CalendarEvent, nameOf: (id: string) => string): Record<string, string> {
  return {
    標題: e.title,
    日期: dateText(e),
    時間: timeText(e),
    成員: ownersText(e, nameOf),
    備註: e.notes?.trim() || EMPTY,
    標籤: e.tags?.length ? e.tags.join('、') : EMPTY,
    優先順序: e.priority ? PRIORITY_LABELS[e.priority] : EMPTY,
    重複: e.recurrence ? RECURRENCE_LABELS[e.recurrence.freq] : EMPTY,
    提醒: e.remindMinutesBefore === undefined ? EMPTY : remindLabel(e.remindMinutesBefore),
    同步至Google: e.syncToGoogle ? '是' : '否',
  };
}

/** 列出兩版之間真正不同的欄位 */
export function diffEvents(
  mine: CalendarEvent,
  theirs: CalendarEvent,
  nameOf: (id: string) => string = (id) => id
): FieldDiff[] {
  const a = fields(mine, nameOf);
  const b = fields(theirs, nameOf);
  const out: FieldDiff[] = [];
  for (const label of Object.keys(a)) {
    if (a[label] !== b[label]) out.push({ label, mine: a[label], theirs: b[label] });
  }
  return out;
}

/**
 * 偵測衝突。
 *
 * - baseline 為 undefined(新增行程)→ 不可能有衝突
 * - 目前 store 裡找不到那一筆 → 對方刪掉了
 * - updatedAt 與 baseline 不同 → 對方改過
 *
 * 注意 updatedAt 為 undefined 的舊資料:兩邊都沒有時間戳就無從判斷,
 * 一律視為沒有衝突,以免對既有資料誤報。
 */
export function detectConflict(
  mine: CalendarEvent,
  baselineUpdatedAt: number | undefined,
  current: CalendarEvent | undefined,
  nameOf: (id: string) => string = (id) => id
): ConflictResult {
  if (!current) {
    // 只有「本來就存在、現在不見了」才算被刪除;新增中的行程本來就不在 store
    return baselineUpdatedAt === undefined
      ? { kind: 'none', diffs: [] }
      : { kind: 'deleted', diffs: [] };
  }
  if (current.updatedAt === undefined || current.updatedAt === baselineUpdatedAt) {
    return { kind: 'none', diffs: [] };
  }
  const diffs = diffEvents(mine, current, nameOf);
  // 對方改的欄位剛好和我要存的一致 → 結果相同,不必打擾使用者
  if (diffs.length === 0) return { kind: 'none', diffs: [] };
  return { kind: 'modified', diffs, theirs: current };
}

/** 蓋回自己的版本時要帶上對方的時間戳,否則下次存檔又會判定成衝突 */
export function stampFrom(mine: CalendarEvent, theirs: CalendarEvent | undefined): CalendarEvent {
  return theirs ? { ...mine, updatedAt: theirs.updatedAt } : mine;
}

/** 經期紀錄也可能被雙方同時編輯,但欄位少,只需知道有沒有被動過 */
export const isStale = (
  baselineUpdatedAt: number | undefined,
  currentUpdatedAt: number | undefined
): boolean =>
  baselineUpdatedAt !== undefined &&
  currentUpdatedAt !== undefined &&
  currentUpdatedAt !== baselineUpdatedAt;
