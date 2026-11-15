/**
 * 畢業門檻的計算(純函式)。
 *
 * 輸入是成員的課表(匯入自北科課程好朋友,帶有課程類別符號)與畢業計畫(課程標準、
 * 手動調整),輸出各類學分的「已取得 / 採計 / 門檻」、必修科目檢核與提醒。
 *
 * 歸類規則(對照北科課程標準):
 * - ○△ 共同必修;其中開課班級為「博雅課程」的另計為通識博雅,有向度與認列上限
 * - ☆   共同選修(大三、大四體育、全民國防),門檻為 0 時不計入畢業學分
 * - ●▲ 專業必修、★ 專業選修——只有「本系」開的才算,他系開的歸入跨域及自由選修
 * - 班級課表上的占位科目(備註「請選:⋯」,如「學院指定向度-人文與藝術」)不計學分
 * - 各類超過門檻的部分溢出到跨域及自由選修;博雅溢出受「至多認列 N 學分」限制
 *
 * 這只是依公開資料的估算,正式審查以教務處與系辦為準。
 */
import {
  CourseEntry,
  CreditCategory,
  GraduationPlan,
  GraduationStandard,
  ManualCredit,
  StandardCourse,
  semesterOrder,
} from '../types';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CREDIT_KEYS,
  GE_DIMENSIONS,
  NTUT_TYPE_INFO,
} from '../constants/ntut';
import { normalizeCourseName } from './ntutStandard';

/** 課程的識別鍵:同課號的多個時段是同一門課;手動課以學期+課名為準 */
export const courseKey = (c: Pick<CourseEntry, 'ntutCourseId' | 'semesterId' | 'title'>): string =>
  c.ntutCourseId ? `ntut:${c.ntutCourseId}` : `manual:${c.semesterId ?? ''}|${c.title.trim()}`;

/** 一門「邏輯上的課」:同課號的多個時段合併 */
export interface TakenCourse {
  key: string;
  title: string;
  credit: number;
  semesterId?: string;
  /** 類別符號 ○△☆●▲★ */
  type?: string;
  classNames: string[];
  notes?: string;
  entries: CourseEntry[];
  /** 是否來自北科匯入 */
  imported: boolean;
}

export function groupTakenCourses(courses: CourseEntry[], ownerId: string): TakenCourse[] {
  const map = new Map<string, TakenCourse>();
  for (const c of courses) {
    if (c.ownerId !== ownerId) continue;
    const key = courseKey(c);
    const cur = map.get(key);
    if (cur) {
      cur.entries.push(c);
      if (!cur.type && c.ntutCourseType) cur.type = c.ntutCourseType;
      if (!cur.classNames.length && c.ntutClassNames?.length) cur.classNames = c.ntutClassNames;
      if (!cur.notes && c.ntutNotes) cur.notes = c.ntutNotes;
      if (!cur.credit && c.credit) cur.credit = c.credit;
      continue;
    }
    map.set(key, {
      key,
      title: c.title.trim(),
      credit: c.credit ?? 0,
      semesterId: c.semesterId,
      type: c.ntutCourseType,
      classNames: c.ntutClassNames ?? [],
      notes: c.ntutNotes,
      entries: [c],
      imported: c.source === 'ntut',
    });
  }
  return [...map.values()];
}

export type CourseStatus = 'counted' | 'excluded' | 'placeholder' | 'unknown';

export interface ClassifiedCourse extends TakenCourse {
  status: CourseStatus;
  /** 採計的類別(status 不是 counted 時為 null) */
  category: CreditCategory | null;
  /** 博雅向度 */
  dimension?: string;
  /** 他系開的專業課(因此歸入跨域及自由選修) */
  crossDept: boolean;
  /** 使用者改過類別 */
  overridden: boolean;
  /** 不採計或需要處理的原因 */
  reason?: string;
}

/** 從備註或課名找出博雅向度 */
export const detectDimension = (text: string | undefined): string | undefined =>
  text ? GE_DIMENSIONS.find((d) => text.includes(d)) : undefined;

/** 通識博雅課:由通識中心「博雅課程」班級開課,或備註寫明向度 */
export const isGeneralEdCourse = (c: Pick<TakenCourse, 'classNames' | 'notes'>): boolean =>
  c.classNames.some((n) => n.includes('博雅')) || !!detectDimension(c.notes);

/**
 * 班級課表上的占位科目:備註「請選:通識中心 / 博雅課程」「請選:體育室 \ 體育專項」等,
 * 或課名本身是「學院指定向度-⋯」「學生自選向度」。學生實際修的是另一門課。
 */
export const isPlaceholderCourse = (c: Pick<TakenCourse, 'title' | 'notes' | 'type'>): boolean =>
  (c.notes ?? '').replace(/\s/g, '').startsWith('請選') ||
  (c.type === '△' && c.title.includes('向度'));

/** 是否為本系開的課:開課班級以任一前綴開頭;沒有班級資料或沒設前綴時不猜成他系 */
export function isOwnDepartment(c: Pick<TakenCourse, 'classNames'>, prefixes: string[]): boolean {
  const ps = prefixes.map((p) => p.trim()).filter(Boolean);
  if (!ps.length || !c.classNames.length) return true;
  return c.classNames.some((n) => ps.some((p) => n.startsWith(p)));
}

export function classifyCourse(tc: TakenCourse, plan: GraduationPlan): ClassifiedCourse {
  const base: ClassifiedCourse = {
    ...tc,
    status: 'counted',
    category: null,
    crossDept: false,
    overridden: false,
  };
  if (plan.excludedKeys.includes(tc.key)) {
    return { ...base, status: 'excluded', reason: '已設為不採計' };
  }
  const override = plan.overrides[tc.key];
  if (override) {
    const dimension =
      override === 'generalEd'
        ? plan.overrideDimensions?.[tc.key] ?? detectDimension(tc.notes)
        : undefined;
    return { ...base, category: override, dimension, overridden: true };
  }
  const info = tc.type ? NTUT_TYPE_INFO[tc.type] : undefined;
  if (!info) {
    return {
      ...base,
      status: 'unknown',
      reason: tc.imported
        ? '缺少課程類別,請點「補齊課程資料」'
        : '手動建立的課程沒有類別,點一下指定',
    };
  }
  if (isPlaceholderCourse(tc)) {
    return {
      ...base,
      status: 'placeholder',
      reason: '班級課表的占位科目,不計學分;實際修的博雅 / 體育 / 英文課另計',
    };
  }
  if (info.category === 'commonRequired' && isGeneralEdCourse(tc)) {
    return { ...base, category: 'generalEd', dimension: detectDimension(tc.notes) };
  }
  if (
    (info.category === 'proRequired' || info.category === 'proElective') &&
    !isOwnDepartment(tc, plan.ownClassPrefixes)
  ) {
    return { ...base, category: 'free', crossDept: true };
  }
  return { ...base, category: info.category };
}

/* ---------- 博雅門檻 ---------- */

export interface GeRequirement {
  /** 博雅應修學分(0 = 標準未另列,視為共同必修的一部分) */
  total: number;
  /** 學院指定向度與各自的最低學分 */
  designated: { dimension: string; credits: number }[];
  /** 超修的博雅至多可認列為跨域及自由選修的學分 */
  freeCap: number;
}

const firstMatch = (rules: string[], re: RegExp): number | null => {
  for (const r of rules) {
    const m = re.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
};

/**
 * 從課程標準推出博雅門檻:科目表裡「學院指定向度-X」「學生自選向度」各列的學分加總,
 * 指定向度依名稱分組;沒有這些列(較舊的課程標準)時改從規定文字抓「博雅課程應修滿 N 學分」。
 */
export function geRequirementOf(std: GraduationStandard | undefined): GeRequirement {
  if (!std) return { total: 0, designated: [], freeCap: 0 };
  const rows = std.courses.filter((c) => c.name.includes('向度'));
  let total = rows.reduce((s, c) => s + c.credit, 0);
  const byDim = new Map<string, number>();
  for (const c of rows) {
    const dim = detectDimension(c.name);
    if (dim && c.name.includes('指定')) byDim.set(dim, (byDim.get(dim) ?? 0) + c.credit);
  }
  if (total === 0) total = firstMatch(std.rules, /博雅課程應修滿\s*(\d+(?:\.\d+)?)\s*學分/) ?? 0;
  const freeCap = firstMatch(std.rules, /博雅課程至多認列\s*(\d+(?:\.\d+)?)\s*學分/) ?? 0;
  return {
    total,
    designated: [...byDim].map(([dimension, credits]) => ({ dimension, credits })),
    freeCap,
  };
}

/* ---------- 必修科目檢核 ---------- */

export interface RequiredCourseStatus {
  course: StandardCourse;
  done: boolean;
  /** 實際認列的課名(與標準名稱不同時才有,例如「專業英文-機電(一)」認列「學院專業英文」) */
  matchedTitle?: string;
  matchedSemester?: string;
}

/** 名稱不同但屬同一類的共同必修(標準寫「學院專業英文」,實際開課叫「專業英文-機電(一)」) */
const FAMILIES: { key: string; test: RegExp }[] = [
  { key: 'pe', test: /體育/ },
  { key: 'english', test: /英文|英語/ },
  { key: 'chinese', test: /國文|國語文/ },
  { key: 'defense', test: /全民國防/ },
  { key: 'service', test: /服務學習|勞作教育/ },
];
const familyOf = (name: string): string | null =>
  FAMILIES.find((f) => f.test.test(name))?.key ?? null;

const REQUIRED_TYPES = new Set(['○', '△', '●', '▲']);
const COMMON_CATEGORIES = new Set<CreditCategory>(['commonRequired', 'generalEd']);
const PRO_CATEGORIES = new Set<CreditCategory>(['proRequired', 'proElective', 'free']);

/**
 * 已修課能不能拿來認列某一列必修:共同必修列只收共同類的課(大三的 ☆ 體育不能抵大一的 △ 體育),
 * 專業必修列收專業類與他系開的同名課(學院基礎課程不及格可到他系重修,仍承認)。
 */
const compatible = (row: StandardCourse, c: ClassifiedCourse): boolean => {
  if (!c.category) return false;
  const rowCategory = NTUT_TYPE_INFO[row.type]?.category;
  if (rowCategory === 'commonRequired') return COMMON_CATEGORIES.has(c.category);
  if (rowCategory === 'proRequired') return PRO_CATEGORIES.has(c.category);
  return true;
};

/**
 * 逐列核對課程標準的必修科目(向度列由博雅區塊處理,不在此)。
 * 先全部用課名精確比對,比不到的共同必修再用同類比對;每門已修課只能認列一列,
 * 分段修習(微積分 1/2、2/2)因此需要兩門課才會都打勾。
 */
export function checkRequiredCourses(
  std: GraduationStandard | undefined,
  courses: ClassifiedCourse[]
): RequiredCourseStatus[] {
  if (!std) return [];
  const rows = std.courses.filter((c) => REQUIRED_TYPES.has(c.type) && !c.name.includes('向度'));
  const pool = courses
    .filter((c) => c.status === 'counted')
    .sort((a, b) => semesterOrder(a.semesterId ?? '') - semesterOrder(b.semesterId ?? ''));
  const used = new Set<string>();
  const take = (pred: (c: ClassifiedCourse) => boolean): ClassifiedCourse | undefined => {
    const hit = pool.find((c) => !used.has(c.key) && pred(c));
    if (hit) used.add(hit.key);
    return hit;
  };

  const hits: (ClassifiedCourse | undefined)[] = rows.map((row) => {
    const norm = normalizeCourseName(row.name);
    return take((c) => compatible(row, c) && normalizeCourseName(c.title) === norm);
  });
  rows.forEach((row, i) => {
    if (hits[i]) return;
    const fam = familyOf(row.name);
    const rowCategory = NTUT_TYPE_INFO[row.type]?.category;
    if (!fam || rowCategory !== 'commonRequired') return;
    hits[i] = take(
      (c) =>
        c.category === 'commonRequired' &&
        (familyOf(c.title) === fam || c.classNames.some((n) => familyOf(n) === fam))
    );
  });

  return rows.map((row, i) => {
    const hit = hits[i];
    const sameName = hit && normalizeCourseName(hit.title) === normalizeCourseName(row.name);
    return {
      course: row,
      done: !!hit,
      matchedTitle: hit && !sameName ? hit.title : undefined,
      matchedSemester: hit?.semesterId,
    };
  });
}

/* ---------- 規定文字的提示 ---------- */

export interface RuleHint {
  rule: string;
  /** 規定裡以「」引用的課名 */
  quoted: string[];
  /** 其中已修(採計中)的課名 */
  taken: string[];
}

/** 每條規定抓出「」裡的課名,標出哪些已經修過,方便核對「至少修 1 門」這類條件 */
export function ruleHints(std: GraduationStandard | undefined, courses: ClassifiedCourse[]): RuleHint[] {
  if (!std) return [];
  const takenNames = new Set(
    courses.filter((c) => c.status === 'counted').map((c) => normalizeCourseName(c.title))
  );
  return std.rules.map((rule) => {
    const quoted = [...rule.matchAll(/「([^」]+)」/g)].map((m) => m[1].trim()).filter(Boolean);
    const taken = quoted.filter((q) => takenNames.has(normalizeCourseName(q)));
    return { rule, quoted, taken };
  });
}

/* ---------- 學分彙總 ---------- */

export interface BucketResult {
  category: CreditCategory;
  label: string;
  /** 門檻(null = 標準沒有規定) */
  required: number | null;
  /** 歸在此類的學分(含手動加入) */
  earned: number;
  /** 採計進畢業學分的部分 */
  counted: number;
  /** 超過門檻、溢出到跨域及自由選修的部分 */
  overflow: number;
  /** 距門檻還差多少(沒有門檻為 0) */
  remaining: number;
  note?: string;
}

export interface GeDimensionStatus {
  dimension: string;
  /** 學院指定向度的最低學分(非指定向度為 0) */
  required: number;
  earned: number;
  designated: boolean;
}

export interface GraduationSummary {
  hasStandard: boolean;
  /** 全部課程(含不採計),依學期新→舊 */
  courses: ClassifiedCourse[];
  buckets: BucketResult[];
  total: {
    required: number | null;
    counted: number;
    remaining: number;
    /** 採計中的課程與手動學分加總(未套用任何上限) */
    rawEarned: number;
  };
  ge: GeRequirement & {
    earned: number;
    counted: number;
    /** 溢出後認列為跨域及自由選修的學分 */
    overflowCounted: number;
    dimensions: GeDimensionStatus[];
  };
  requiredCourses: RequiredCourseStatus[];
  hints: RuleHint[];
  warnings: string[];
  /** 匯入課程中缺少類別的門數(提示補齊) */
  unknownImported: number;
}

const sumNullable = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

const capped = (earned: number, required: number | null): { counted: number; overflow: number } => {
  if (required === null) return { counted: earned, overflow: 0 };
  const counted = Math.min(earned, required);
  return { counted, overflow: earned - counted };
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 同名課程可出現的次數:課程標準列了幾次(分段修習)就允許幾次,至少 1 */
function allowedRepeats(std: GraduationStandard | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of std?.courses ?? []) {
    const k = normalizeCourseName(c.name);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function computeGraduation(plan: GraduationPlan, courses: CourseEntry[]): GraduationSummary {
  const std = plan.standard;
  const credits = std?.credits ?? {};
  const req = (key: string): number | null => (key in credits ? credits[key] : null);

  const classified = groupTakenCourses(courses, plan.ownerId)
    .map((tc) => classifyCourse(tc, plan))
    .sort(
      (a, b) =>
        semesterOrder(b.semesterId ?? '') - semesterOrder(a.semesterId ?? '') ||
        CATEGORY_ORDER.indexOf(a.category ?? 'free') - CATEGORY_ORDER.indexOf(b.category ?? 'free') ||
        a.title.localeCompare(b.title, 'zh-Hant')
    );

  // 各類原始學分
  const earned: Record<CreditCategory, number> = {
    commonRequired: 0,
    generalEd: 0,
    commonElective: 0,
    proRequired: 0,
    proElective: 0,
    free: 0,
  };
  const dimEarned = new Map<string, number>();
  const addGe = (credit: number, dimension?: string) => {
    earned.generalEd += credit;
    if (dimension) dimEarned.set(dimension, (dimEarned.get(dimension) ?? 0) + credit);
  };
  let rawEarned = 0;
  for (const c of classified) {
    if (c.status !== 'counted' || !c.category) continue;
    rawEarned += c.credit;
    if (c.category === 'generalEd') addGe(c.credit, c.dimension);
    else earned[c.category] += c.credit;
  }
  for (const m of plan.manualCredits) {
    rawEarned += m.credit;
    if (m.category === 'generalEd') addGe(m.credit, m.dimension);
    else earned[m.category] += m.credit;
  }

  // 博雅:先在共同必修裡認列到門檻,超修部分最多認列 freeCap 到自由選修
  const geReq = geRequirementOf(std);
  const geCounted = geReq.total > 0 ? Math.min(earned.generalEd, geReq.total) : earned.generalEd;
  const geOverflowCounted = Math.min(earned.generalEd - geCounted, geReq.freeCap);

  const rCommon = sumNullable(req(CREDIT_KEYS.ministryCommon), req(CREDIT_KEYS.schoolCommon));
  const rCommonElective = req(CREDIT_KEYS.commonElective);
  const rPro = sumNullable(req(CREDIT_KEYS.ministryPro), req(CREDIT_KEYS.schoolPro));
  const rProElective = req(CREDIT_KEYS.proElective);
  const rFree = req(CREDIT_KEYS.free);
  const crossCap = req(CREDIT_KEYS.crossCap);
  const rTotal = req(CREDIT_KEYS.total);

  const common = capped(earned.commonRequired + geCounted, rCommon);
  const pro = capped(earned.proRequired, rPro);
  const proElective = capped(earned.proElective, rProElective);

  // 共同選修:門檻為 0(北科各系多半如此)就完全不計入
  let commonElectiveCounted: number;
  let commonElectiveNote: string | undefined;
  if (rCommonElective === null) {
    commonElectiveCounted = std ? 0 : earned.commonElective;
  } else {
    commonElectiveCounted = Math.min(earned.commonElective, rCommonElective);
    if (rCommonElective === 0) commonElectiveNote = '門檻為 0,不計入畢業學分';
  }

  // 跨域及自由選修:他系課(受舊制「跨系所選修上限」限制)+ 各類溢出 + 博雅溢出
  const crossCounted = crossCap === null ? earned.free : Math.min(earned.free, crossCap);
  const overflowSum = common.overflow + pro.overflow + proElective.overflow + geOverflowCounted;
  const freeEarned = earned.free + overflowSum;
  const freeCounted = crossCounted + overflowSum;

  const bucketOf = (
    category: CreditCategory,
    required: number | null,
    e: number,
    counted: number,
    overflow: number,
    note?: string
  ): BucketResult => ({
    category,
    label: CATEGORY_LABELS[category],
    required,
    earned: round1(e),
    counted: round1(counted),
    overflow: round1(overflow),
    remaining: required === null ? 0 : round1(Math.max(0, required - counted)),
    note,
  });

  const buckets: BucketResult[] = [
    bucketOf(
      'commonRequired',
      rCommon,
      earned.commonRequired + geCounted,
      common.counted,
      common.overflow,
      geReq.total > 0 ? `含通識博雅 ${round1(geCounted)} / ${geReq.total} 學分` : undefined
    ),
    bucketOf(
      'generalEd',
      geReq.total > 0 ? geReq.total : null,
      earned.generalEd,
      geCounted,
      geOverflowCounted,
      geReq.total > 0
        ? `計入共同必修;超修至多 ${geReq.freeCap} 學分認列為跨域及自由選修`
        : '標準未另列博雅門檻,全數計入共同必修'
    ),
    bucketOf(
      'commonElective',
      rCommonElective,
      earned.commonElective,
      commonElectiveCounted,
      0,
      commonElectiveNote
    ),
    bucketOf('proRequired', rPro, earned.proRequired, pro.counted, pro.overflow),
    bucketOf('proElective', rProElective, earned.proElective, proElective.counted, proElective.overflow),
    bucketOf(
      'free',
      rFree,
      freeEarned,
      freeCounted,
      0,
      [
        earned.free > 0 ? `他系課程 ${round1(earned.free)}` : '',
        overflowSum > 0 ? `各類超修溢出 ${round1(overflowSum)}` : '',
        crossCap !== null ? `跨系所選修上限 ${crossCap}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || undefined
    ),
  ];

  const totalCounted = round1(
    common.counted + commonElectiveCounted + pro.counted + proElective.counted + freeCounted
  );

  const dimensions: GeDimensionStatus[] = GE_DIMENSIONS.map((dimension) => {
    const d = geReq.designated.find((x) => x.dimension === dimension);
    return {
      dimension,
      required: d?.credits ?? 0,
      earned: round1(dimEarned.get(dimension) ?? 0),
      designated: !!d,
    };
  });

  // 提醒
  const warnings: string[] = [];
  if (!std) warnings.push('尚未套用課程標準,目前只統計已修學分,沒有門檻可比對。');
  const repeats = allowedRepeats(std);
  const seen = new Map<string, ClassifiedCourse[]>();
  for (const c of classified) {
    if (c.status !== 'counted' || c.credit <= 0) continue;
    const k = normalizeCourseName(c.title);
    seen.set(k, [...(seen.get(k) ?? []), c]);
  }
  for (const [k, list] of seen) {
    if (list.length > (repeats.get(k) ?? 1)) {
      warnings.push(
        `「${list[0].title}」在 ${list.map((c) => c.semesterId ?? '未分類').join('、')} 都有,若是重修請把其中一筆設為不採計。`
      );
    }
  }
  const placeholders = classified.filter((c) => c.status === 'placeholder');
  if (placeholders.length) {
    warnings.push(
      `${placeholders.length} 門班級課表的占位科目未計入(${[...new Set(placeholders.map((c) => c.title))].join('、')})。`
    );
  }
  const unknownImported = classified.filter((c) => c.status === 'unknown' && c.imported).length;
  const unknownManual = classified.filter((c) => c.status === 'unknown' && !c.imported).length;
  if (unknownManual) warnings.push(`${unknownManual} 門手動建立的課程沒有類別,點課程可指定。`);
  const hasPro = classified.some((c) => c.type && ['●', '▲', '★'].includes(c.type));
  if (hasPro && !plan.ownClassPrefixes.some((p) => p.trim())) {
    warnings.push('尚未設定本系班級前綴(例如「資工」),所有專業課程都會被當成本系課。');
  }

  return {
    hasStandard: !!std,
    courses: classified,
    buckets,
    total: {
      required: rTotal,
      counted: totalCounted,
      remaining: rTotal === null ? 0 : round1(Math.max(0, rTotal - totalCounted)),
      rawEarned: round1(rawEarned),
    },
    ge: {
      ...geReq,
      earned: round1(earned.generalEd),
      counted: round1(geCounted),
      overflowCounted: round1(geOverflowCounted),
      dimensions,
    },
    requiredCourses: checkRequiredCourses(std, classified),
    hints: ruleHints(std, classified),
    warnings,
    unknownImported,
  };
}

/** 新成員的空白計畫 */
export function defaultPlan(ownerId: string, now: number = Date.now()): GraduationPlan {
  return {
    ownerId,
    ownClassPrefixes: [],
    excludedKeys: [],
    overrides: {},
    overrideDimensions: {},
    manualCredits: [],
    checkedRules: [],
    updatedAt: now,
  };
}

/** 必修科目依年級、學期分組(顯示用) */
export function groupRequiredByTerm(
  list: RequiredCourseStatus[]
): { term: string; items: RequiredCourseStatus[] }[] {
  const groups = new Map<string, RequiredCourseStatus[]>();
  for (const r of list) {
    const term = r.course.year && r.course.sem ? `${r.course.year}-${r.course.sem}` : '其他';
    groups.set(term, [...(groups.get(term) ?? []), r]);
  }
  return [...groups].map(([term, items]) => ({ term, items }));
}

export type { ManualCredit };
