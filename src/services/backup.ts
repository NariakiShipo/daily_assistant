/**
 * 資料備份的匯出與匯入。
 *
 * 「清除所有資料」是不可逆的,雲端同步也只是另一份即時副本——
 * 兩者都不算備份。這裡提供一份可以自己保存的 JSON。
 *
 * 匯入時逐筆驗證而非直接信任 JSON:壞掉的備份檔如果原樣塞進 state,
 * 畫面會在讀取時整個炸掉,而且錯誤很難追。
 */
import { AppData, CalendarEvent, CourseEntry, PeriodRecord, SemesterMeta, UserProfile } from '../types';
import { defaultData } from './storage';

/** 備份檔格式版本;之後改資料結構時用來判斷要不要轉檔 */
export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  /** 匯出當下的時間(ISO 8601) */
  exportedAt: string;
  data: AppData;
}

/** 產生備份檔內容(縮排過,方便使用者自己看) */
export function buildBackup(data: AppData, now: Date = new Date()): string {
  const file: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
  return JSON.stringify(file, null, 2);
}

/** 建議的檔名,例如 daily-assistant-2026-07-28.json */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `daily-assistant-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): v is string => typeof v === 'string';

/** 只留下欄位齊全的項目,壞掉的個別項目跳過而非整份拒絕 */
function validEvents(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is CalendarEvent =>
      isObj(e) && str(e.id) && str(e.title) && str(e.date) && str(e.startTime) && str(e.endTime)
  );
}

function validPeriods(raw: unknown): PeriodRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is PeriodRecord => isObj(p) && str(p.id) && str(p.startDate) && str(p.recordedBy)
  );
}

function validCourses(raw: unknown): CourseEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is CourseEntry =>
      isObj(c) &&
      str(c.id) &&
      str(c.title) &&
      typeof c.weekday === 'number' &&
      typeof c.startPeriod === 'number' &&
      typeof c.endPeriod === 'number' &&
      str(c.ownerId)
  );
}

function validSemesters(raw: unknown): SemesterMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SemesterMeta => isObj(s) && str(s.id) && str(s.startDate) && str(s.endDate)
  );
}

/**
 * 成員是唯一不能為空的區塊:零成員會讓行程沒有擁有者、經期沒有記錄者,
 * 整個畫面都失去依據,所以任何情況下都至少退回預設成員。
 */
function validUsers(raw: unknown): UserProfile[] {
  if (!Array.isArray(raw)) return defaultData.users;
  const users = raw.filter(
    (u): u is UserProfile => isObj(u) && str(u.id) && str(u.name) && str(u.color)
  );
  return users.length ? users : defaultData.users;
}

export interface ParseResult {
  ok: boolean;
  /** 解析成功時的資料 */
  data?: AppData;
  /** 失敗原因,或成功時的提醒 */
  message: string;
}

/**
 * 解析備份檔。
 *
 * 設定沿用預設值再覆蓋備份裡有的欄位,舊備份缺少新設定時才不會變成 undefined。
 * 共享空間的配對碼刻意不還原——把備份匯到另一台裝置時,不該把它一併拉進別人的空間。
 */
export function parseBackup(json: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: '不是有效的 JSON 檔案。' };
  }

  if (!isObj(parsed)) return { ok: false, message: '備份檔格式不正確。' };
  if (typeof parsed.version !== 'number') {
    return { ok: false, message: '缺少版本資訊,可能不是這個 App 的備份檔。' };
  }
  if (parsed.version > BACKUP_VERSION) {
    return {
      ok: false,
      message: `這份備份來自較新的版本(v${parsed.version}),請先更新 App。`,
    };
  }
  if (!isObj(parsed.data)) return { ok: false, message: '備份檔沒有資料內容。' };

  const d = parsed.data;
  const data: AppData = {
    users: validUsers(d.users),
    events: validEvents(d.events),
    periods: validPeriods(d.periods),
    courses: validCourses(d.courses),
    semesters: validSemesters(d.semesters),
    settings: {
      ...defaultData.settings,
      ...(isObj(d.settings) ? d.settings : {}),
      // 不還原配對碼:避免把這台裝置拉進備份來源的共享空間
      spaceId: null,
    },
  };

  return {
    ok: true,
    data,
    message: `行程 ${data.events.length} 筆 · 經期 ${data.periods.length} 筆 · 課程 ${data.courses.length} 筆`,
  };
}
