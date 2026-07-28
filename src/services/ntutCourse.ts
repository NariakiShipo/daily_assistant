/**
 * 北科課程好朋友(ntut-course.gnehs.net)課表匯入
 *
 * 資料來源:gnehs/ntut-course-crawler-node 的 GitHub Pages 靜態 JSON
 *   https://gnehs.github.io/ntut-course-crawler-node/{年度}/{學期}/main.json
 * (單一課程的 course/{課號}.json 只有教學大綱、沒有上課時間,必須抓學期總表)
 *
 * 匯入來源檔為該網站 localStorage 的匯出:
 *   {"key":"my-couse-data-115-1","data":"[\"362048\",...]","classData":"資工三"}
 * (「couse」為網站原始 key 的拼法)
 */
import { CourseEntry } from '../types';
import { NTUT_LABEL_TO_INDEX, PERIOD_SLOTS, UNSCHEDULED_WEEKDAY, WEEKDAYS } from '../constants/timetable';
import { tagColor } from '../theme';
import { uid } from '../utils/date';

const BASE_URL = 'https://gnehs.github.io/ntut-course-crawler-node';

/** course.json 解析結果 */
export interface NtutSelection {
  /** 民國學年度,例如 115 */
  year: number;
  /** 學期 1 或 2 */
  sem: number;
  /** '115-1' */
  semesterId: string;
  courseIds: string[];
  /** 例如「資工三」 */
  className?: string;
}

/** 解析北科課程好朋友匯出的 JSON 內容 */
export function parseCourseSelection(text: string): NtutSelection {
  let obj: unknown;
  try {
    obj = JSON.parse(text.trim());
  } catch {
    throw new Error('不是有效的 JSON,請確認貼上完整內容。');
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error('格式不符:需要北科課程好朋友匯出的物件(含 key 與 data 欄位)。');
  }
  const rec = obj as Record<string, unknown>;
  const key = typeof rec.key === 'string' ? rec.key : '';
  // 網站原始 key 拼法為 my-couse-data-{年}-{學期},保險起見也接受 my-course-data
  const m = /my-cour?se-data-(\d+)-(\d+)/.exec(key);
  if (!m) {
    throw new Error(`無法從 key「${key || '(空)'}」判斷學年度與學期。`);
  }
  const year = Number(m[1]);
  const sem = Number(m[2]);

  let ids: unknown = rec.data;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      throw new Error('data 欄位不是有效的課號清單。');
    }
  }
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
    throw new Error('data 欄位不是有效的課號清單。');
  }
  const courseIds = [...new Set(ids as string[])];
  if (courseIds.length === 0) throw new Error('課號清單是空的。');

  return {
    year,
    sem,
    semesterId: `${year}-${sem}`,
    courseIds,
    className: typeof rec.classData === 'string' ? rec.classData : undefined,
  };
}

/** 學期總表中一門課的原始格式(只列會用到的欄位) */
export interface NtutCourseRaw {
  id: string;
  name: { zh: string; en?: string };
  credit?: string;
  courseType?: string;
  time: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', string[]>;
  classroom?: { name: string }[];
  teacher?: { name: string }[];
}

/** 下載整學期課程總表(gzip 後約 0.7MB) */
export async function fetchSemesterCourses(year: number, sem: number): Promise<NtutCourseRaw[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${year}/${sem}/main.json`);
  } catch {
    throw new Error('無法連線到課程資料來源,請檢查網路。');
  }
  if (res.status === 404) throw new Error(`${year}-${sem} 學期的課程資料尚未提供。`);
  if (!res.ok) throw new Error(`課程資料下載失敗(HTTP ${res.status})。`);
  const list = (await res.json()) as NtutCourseRaw[];
  if (!Array.isArray(list)) throw new Error('課程資料格式不符。');
  return list;
}

/** 整理後、待匯入的一門課 */
export interface PreparedCourse {
  courseId: string;
  title: string;
  credit?: number;
  teacher?: string;
  location?: string;
  /** 可放進課表的連續節次段 */
  runs: { weekday: number; start: number; end: number }[];
  /** 無法對應的時段說明(D 節、週末課) */
  skipped: string[];
}

const DAY_TO_WEEKDAY: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
const DAY_ZH: Record<string, string> = {
  sun: '日',
  mon: '一',
  tue: '二',
  wed: '三',
  thu: '四',
  fri: '五',
  sat: '六',
};

/** 依課號從學期總表挑出課程並轉成可匯入格式 */
export function prepareCourses(
  all: NtutCourseRaw[],
  courseIds: string[]
): { prepared: PreparedCourse[]; missing: string[] } {
  const byId = new Map(all.map((c) => [c.id, c]));
  const prepared: PreparedCourse[] = [];
  const missing: string[] = [];

  for (const id of courseIds) {
    const raw = byId.get(id);
    if (!raw) {
      missing.push(id);
      continue;
    }
    const runs: PreparedCourse['runs'] = [];
    const skipped: string[] = [];
    for (const [day, labels] of Object.entries(raw.time)) {
      if (!labels.length) continue;
      const weekday = DAY_TO_WEEKDAY[day];
      if (!weekday) {
        skipped.push(`週${DAY_ZH[day] ?? day} 第${labels.join(',')}節(課表不含週末)`);
        continue;
      }
      const indexes: number[] = [];
      for (const label of labels) {
        const idx = NTUT_LABEL_TO_INDEX[label];
        if (idx === undefined) skipped.push(`週${DAY_ZH[day]} 第${label}節(超出課表節次)`);
        else indexes.push(idx);
      }
      indexes.sort((a, b) => a - b);
      // 切成連續節次段
      let start = -1;
      let prev = -2;
      for (const p of indexes) {
        if (p !== prev + 1) {
          if (start >= 0) runs.push({ weekday, start, end: prev });
          start = p;
        }
        prev = p;
      }
      if (start >= 0) runs.push({ weekday, start, end: prev });
    }
    const credit = Number(raw.credit);
    prepared.push({
      courseId: id,
      title: raw.name.zh.trim() || id,
      credit: Number.isFinite(credit) && credit > 0 ? credit : undefined,
      teacher: raw.teacher?.map((t) => t.name).join('、') || undefined,
      location: raw.classroom?.map((r) => r.name).join('、') || undefined,
      runs,
      skipped,
    });
  }
  return { prepared, missing };
}

/** 轉成 App 的課表項目(一個連續節次段一筆;無時段課放入「無時段」欄) */
export function toCourseEntries(
  prepared: PreparedCourse[],
  ownerId: string,
  semesterId: string
): CourseEntry[] {
  const entries: CourseEntry[] = [];
  for (const p of prepared) {
    const base = {
      title: p.title,
      location: p.location,
      color: tagColor(p.title),
      ownerId,
      source: 'ntut' as const,
      semesterId,
      ntutCourseId: p.courseId,
      credit: p.credit,
      teacher: p.teacher,
    };
    if (p.runs.length === 0) {
      entries.push({ ...base, id: uid(), weekday: UNSCHEDULED_WEEKDAY, startPeriod: 0, endPeriod: 0 });
      continue;
    }
    for (const r of p.runs) {
      entries.push({ ...base, id: uid(), weekday: r.weekday, startPeriod: r.start, endPeriod: r.end });
    }
  }
  return entries;
}

/** 時段的顯示文字,例如「週三 3-4節、週五 2節」 */
export function describeRuns(runs: PreparedCourse['runs']): string {
  return runs
    .map((r) => {
      const s = PERIOD_SLOTS[r.start].label;
      const e = PERIOD_SLOTS[r.end].label;
      return `週${WEEKDAYS[r.weekday - 1]} ${s === e ? s : `${s}-${e}`}節`;
    })
    .join('、');
}

/**
 * 學期預設起訖日(可在匯入時修改):
 * 第 1 學期約 9 月中至隔年 1 月中,第 2 學期約 2 月中至 6 月下旬。
 */
export function defaultSemesterRange(year: number, sem: number): { startDate: string; endDate: string } {
  const ce = year + 1911;
  return sem === 1
    ? { startDate: `${ce}-09-15`, endDate: `${ce + 1}-01-16` }
    : { startDate: `${ce + 1}-02-16`, endDate: `${ce + 1}-06-30` };
}
