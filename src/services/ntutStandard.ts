/**
 * 北科「課程標準」(畢業門檻)的取得與解析。
 *
 * 資料來源與課表匯入相同,是 gnehs/ntut-course-crawler-node 爬北科課程系統
 * 「課程標準」頁(aps.ntut.edu.tw/course/tw/Cprog.jsp)後發布的 JSON:
 *   {入學年度}/standard-departments.json  系所索引(約 30KB)
 *   {入學年度}/standard.json              全部學制、系所的標準(約 3.8MB,gzip 後約 0.25MB)
 *
 * standard.json 的結構:
 *   { [學制]: { [系所]: {
 *       credits: { 部訂共同必修學分: '0', 校訂共同必修學分: '28', …, 最低畢業學分數: '132' },
 *       division, matric,
 *       courses: [{ year: '1', sem: '1', type: '△', name: '國文', credit: '2.0', hours: '2', stage: '1' }],
 *       rules: string[] | null
 *   } } }
 *
 * 畢業門檻是「入學年度」的課程標準,不是修課當年的——所以這裡以入學年度為鍵。
 */
import { CourseEntry, GraduationStandard, SemesterMeta, StandardCourse, semesterOrder } from '../types';
import { NTUT_DATA_BASE_URL } from '../constants/ntut';

/** 系所索引的一列 */
export interface StandardDepartmentRef {
  /** 學制,例如「四技」 */
  system: string;
  /** 系所,例如「資工系」「電資學士班【資訊工程系】」 */
  department: string;
  division: string;
  matric: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

async function fetchJson(path: string, year: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${NTUT_DATA_BASE_URL}/${path}`);
  } catch {
    throw new Error('無法連線到課程資料來源,請檢查網路。');
  }
  if (res.status === 404) throw new Error(`${year} 學年度的課程標準尚未提供。`);
  if (!res.ok) throw new Error(`課程標準下載失敗(HTTP ${res.status})。`);
  return res.json();
}

/** 下載某入學年度的系所索引 */
export async function fetchStandardIndex(entryYear: number): Promise<StandardDepartmentRef[]> {
  const raw = await fetchJson(`${entryYear}/standard-departments.json`, entryYear);
  return parseStandardIndex(raw);
}

export function parseStandardIndex(raw: unknown): StandardDepartmentRef[] {
  if (!Array.isArray(raw)) throw new Error('系所索引格式不符。');
  const list: StandardDepartmentRef[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    if (typeof item.system !== 'string' || typeof item.department !== 'string') continue;
    list.push({
      system: item.system,
      department: item.department,
      division: typeof item.division === 'string' ? item.division : '',
      matric: typeof item.matric === 'string' ? item.matric : '',
    });
  }
  if (!list.length) throw new Error('系所索引是空的。');
  return list;
}

/** 下載某入學年度全部系所的課程標準(原始 JSON,由 extractDepartmentStandard 取出需要的系所) */
export async function fetchStandardYear(entryYear: number): Promise<unknown> {
  return fetchJson(`${entryYear}/standard.json`, entryYear);
}

/** 學制清單:四技排最前面,其餘照索引順序 */
export function listSystems(index: StandardDepartmentRef[]): string[] {
  const seen = new Set<string>();
  for (const d of index) seen.add(d.system);
  const systems = [...seen];
  const i = systems.indexOf('四技');
  if (i > 0) {
    systems.splice(i, 1);
    systems.unshift('四技');
  }
  return systems;
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.trim());
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** 從全年度標準中取出一個系所,整理成 App 的 GraduationStandard */
export function extractDepartmentStandard(
  raw: unknown,
  entryYear: number,
  system: string,
  department: string,
  now: number = Date.now()
): GraduationStandard {
  if (!isObj(raw)) throw new Error('課程標準格式不符。');
  const systemData = raw[system];
  if (!isObj(systemData)) throw new Error(`${entryYear} 學年度的課程標準沒有「${system}」。`);
  const dept = systemData[department];
  if (!isObj(dept)) throw new Error(`${entryYear} 學年度「${system}」找不到「${department}」。`);

  const credits: Record<string, number> = {};
  if (isObj(dept.credits)) {
    for (const [k, v] of Object.entries(dept.credits)) {
      const n = toNumber(v);
      if (n !== null) credits[k] = n;
    }
  }

  const courses: StandardCourse[] = [];
  if (Array.isArray(dept.courses)) {
    for (const c of dept.courses) {
      if (!isObj(c) || typeof c.name !== 'string' || !c.name.trim()) continue;
      courses.push({
        year: toNumber(c.year) ?? 0,
        sem: toNumber(c.sem) ?? 0,
        type: typeof c.type === 'string' ? c.type.trim() : '',
        name: c.name.trim(),
        credit: toNumber(c.credit) ?? 0,
        stage: typeof c.stage === 'string' && c.stage.trim() ? c.stage.trim() : '1',
      });
    }
  }

  const rules = Array.isArray(dept.rules)
    ? dept.rules.filter((r): r is string => typeof r === 'string').map((r) => r.trim()).filter(Boolean)
    : [];

  if (!courses.length && !Object.keys(credits).length) {
    throw new Error(`「${department}」的課程標準是空的。`);
  }
  return { entryYear, system, department, credits, courses, rules, fetchedAt: now };
}

/* ---------- 由課表資料猜預設值 ---------- */

const GRADE_CHARS = '一二三四五六七';

/**
 * 班級名稱拆成「系所前綴 + 年級」:
 *   資工三 → { prefix: '資工', grade: 3 }、材資三甲 → { prefix: '材資', grade: 3 }
 *   沒有年級字(學位學程等)→ grade 為 null
 */
export function parseClassName(className: string | undefined): { prefix: string; grade: number | null } | null {
  const name = className?.trim();
  if (!name) return null;
  const m = new RegExp(`^(.+?)([${GRADE_CHARS}])([甲乙丙丁戊])?$`).exec(name);
  if (!m) return { prefix: name, grade: null };
  return { prefix: m[1], grade: GRADE_CHARS.indexOf(m[2]) + 1 };
}

/** 目前的學年度(民國):8 月起算新學年 */
export function currentAcademicYear(now: Date = new Date()): number {
  return now.getFullYear() - 1911 - (now.getMonth() + 1 >= 8 ? 0 : 1);
}

/**
 * 從成員的課表猜入學年度與班級前綴:
 * 取最新一個有該成員課程、且記有班級的學期,「學年度 − (年級 − 1)」就是入學年度。
 */
export function guessFromTimetable(
  semesters: SemesterMeta[],
  courses: CourseEntry[],
  ownerId: string
): { entryYear: number | null; prefix: string | null; className?: string } {
  const owned = new Set(courses.filter((c) => c.ownerId === ownerId).map((c) => c.semesterId));
  const candidates = semesters
    .filter((s) => s.className && (owned.size === 0 || owned.has(s.id)))
    .sort((a, b) => semesterOrder(b.id) - semesterOrder(a.id));
  for (const s of candidates) {
    const parsed = parseClassName(s.className);
    if (!parsed) continue;
    const year = Number(s.id.split('-')[0]);
    const entryYear = parsed.grade && Number.isFinite(year) ? year - (parsed.grade - 1) : null;
    return { entryYear, prefix: parsed.prefix, className: s.className };
  }
  return { entryYear: null, prefix: null };
}

/** 依班級前綴在索引裡找可能的系所(資工 → 資工系;電資 → 電資學士班【⋯】×4) */
export function guessDepartments(
  index: StandardDepartmentRef[],
  system: string,
  prefix: string | null
): StandardDepartmentRef[] {
  if (!prefix) return [];
  return index.filter((d) => d.system === system && d.department.startsWith(prefix));
}

/* ---------- 課名正規化 ---------- */

/**
 * 課名比對用的正規化:去空白、全形轉半形、去連字號與類別符號、轉小寫。
 * 課程總表的課名經過 pangu 加空白(「實務專題 (一)」),課程標準的沒有(「實務專題(一)」),
 * 兩邊要能對得上。
 */
export function normalizeCourseName(name: string): string {
  const nfkc = typeof name.normalize === 'function' ? name.normalize('NFKC') : name;
  return nfkc
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[\s　]+/g, '')
    .replace(/[‐‑‒–—―－-]/g, '')
    .replace(/[◆◇◎※★☆●○▲△]/g, '')
    .toLowerCase();
}
