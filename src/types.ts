/** 使用者(本人與共同編輯者,例如伴侶) */
export interface UserProfile {
  id: string;
  name: string;
  color: string;
  /** 是否為主要使用者(經期紀錄的對象) */
  isPrimary: boolean;
}

/** 日曆事件 */
export interface CalendarEvent {
  id: string;
  title: string;
  notes?: string;
  /** YYYY-MM-DD 開始日期 */
  date: string;
  /** YYYY-MM-DD 結束日期(跨日行程用;單日行程不設) */
  endDate?: string;
  /** HH:mm(allDay 為 true 時不具意義,但仍保留以相容舊資料與排序) */
  startTime: string;
  /** HH:mm(同上) */
  endTime: string;
  /**
   * 整天 / 無特定時間的事項(繳學費、買禮物⋯)。
   * 這類事項不該被硬塞一個時段,也不參與課表衝突判斷。
   */
  allDay?: boolean;
  /** 此事件屬於誰(向後相容:等於 ownerIds 的第一位) */
  ownerId: string;
  /** 此事件屬於哪些人(可複選;未設時視同 [ownerId]) */
  ownerIds?: string[];
  /** 由誰建立(共同編輯時可能不同) */
  createdBy: string;
  /** 最後修改時間(epoch ms);用來偵測兩人同時編輯同一筆 */
  updatedAt?: number;
  /** 最後由誰修改 */
  updatedBy?: string;
  /** 最後由哪台裝置修改;伺服器推播時用來略過來源裝置,不推給自己 */
  updatedByDevice?: string;
  /** 已同步至 Google Calendar 的事件 ID */
  googleEventId?: string;
  /** 是否要求同步至 Google Calendar */
  syncToGoogle?: boolean;
  /** 標籤(重要、完成⋯),可複選 */
  tags?: string[];
  /** 優先順序(未設定 = 一般) */
  priority?: EventPriority;
  /** 重複規則(未設 = 只發生一次) */
  recurrence?: Recurrence;
  /** 開始前幾分鐘提醒(0 = 準時;未設 = 不提醒) */
  remindMinutesBefore?: number;
  /**
   * 重複行程中已完成的日期(YYYY-MM-DD)。
   * 非重複行程的完成狀態沿用 tags 裡的「完成」;重複行程必須逐次獨立,
   * 否則勾一次就等於整個系列都完成了。
   */
  doneDates?: string[];
}

/** 重複頻率 */
export type RecurrenceFreq = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/**
 * 重複規則。
 *
 * 儲存的 CalendarEvent 只有「第一次發生」那一筆,其餘由 expandEvents() 依規則展開,
 * 不會在資料庫裡產生大量副本。
 */
export interface Recurrence {
  freq: RecurrenceFreq;
  /** 重複到哪一天為止(YYYY-MM-DD);未設 = 無限期 */
  until?: string;
  /** 已被單獨刪除的日期(YYYY-MM-DD),展開時跳過 */
  exceptions?: string[];
}

export const RECURRENCE_LABELS: Record<RecurrenceFreq, string> = {
  daily: '每天',
  weekly: '每週',
  biweekly: '每兩週',
  monthly: '每月',
};

export const RECURRENCE_OPTIONS = (
  ['daily', 'weekly', 'biweekly', 'monthly'] as RecurrenceFreq[]
).map((value) => ({ value, label: RECURRENCE_LABELS[value] }));

/** 行程提醒的可選提前時間(分鐘) */
export const REMIND_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '準時' },
  { value: 10, label: '10 分鐘前' },
  { value: 30, label: '30 分鐘前' },
  { value: 60, label: '1 小時前' },
  { value: 1440, label: '前一天' },
];

/** 提醒時間的顯示文字(含未列在選項中的自訂分鐘數) */
export const remindLabel = (mins: number): string => {
  const preset = REMIND_OPTIONS.find((o) => o.value === mins);
  if (preset) return preset.label;
  if (mins % 1440 === 0) return `${mins / 1440} 天前`;
  if (mins % 60 === 0) return `${mins / 60} 小時前`;
  return `${mins} 分鐘前`;
};

/** 行程優先順序 */
export type EventPriority = 'high' | 'medium' | 'low';

/** 優先順序顯示文字 */
export const PRIORITY_LABELS: Record<EventPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 優先順序選項(依重要度排序) */
export const PRIORITY_OPTIONS = (['high', 'medium', 'low'] as EventPriority[]).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

/** 預設可選的行程標籤 */
export const EVENT_TAGS = ['重要', '完成', '工作', '家庭'] as const;

/** 完成標籤(用於完成狀態切換與「未完成」篩選) */
export const TAG_DONE = '完成';

/** 課表的一門課(每位成員一份課表,跨節次連續顯示) */
export interface CourseEntry {
  id: string;
  title: string;
  location?: string;
  /** 1 = 週一 ⋯ 5 = 週五;-1 = 無固定時段(UNSCHEDULED_WEEKDAY) */
  weekday: number;
  /** 起始節次(PERIOD_SLOTS 索引;無時段課固定為 0) */
  startPeriod: number;
  /** 結束節次(PERIOD_SLOTS 索引,>= startPeriod) */
  endPeriod: number;
  color?: string;
  /** 這是誰的課表 */
  ownerId: string;
  /** 匯入來源:'ntut' = 北科課程好朋友;未設 = 手動建立 */
  source?: 'ntut';
  /** 所屬學期(SemesterMeta.id,例如 '115-1');未設 = 未分類(舊資料) */
  semesterId?: string;
  /** 北科課號(同門課的多個時段共用) */
  ntutCourseId?: string;
  /** 學分(統計用) */
  credit?: number;
  /** 授課教師 */
  teacher?: string;
  /**
   * 北科課程類別符號(○△☆●▲★,見 constants/ntut.ts)。
   * 畢業門檻頁靠它判斷學分歸類;舊資料沒有這個欄位,可在畢業頁「補齊課程資料」。
   */
  ntutCourseType?: string;
  /** 開課班級名稱(例如「資工三」「博雅課程(一)」),用來判斷本系課 / 博雅課 */
  ntutClassNames?: string[];
  /** 課程備註(例如「人文與藝術向度」「請選:通識中心 / 博雅課程」) */
  ntutNotes?: string;
}

/** 學期:課表按學期分頁保存,起訖日用於行程衝突判斷 */
export interface SemesterMeta {
  /** '115-1' = 115 學年度第 1 學期 */
  id: string;
  /** YYYY-MM-DD 學期起日 */
  startDate: string;
  /** YYYY-MM-DD 學期迄日 */
  endDate: string;
  /** 匯入時的班級,例如「資工三」 */
  className?: string;
}

/** 學期排序權重(新的在前) */
export const semesterOrder = (id: string): number => {
  const [y, s] = id.split('-').map(Number);
  return (y || 0) * 10 + (s || 0);
};

/**
 * 畢業學分的類別。
 *
 * 對應北科課程標準的欄位:共同必修(○△)、通識博雅(△ 但另計向度與上限)、
 * 共同選修(☆)、專業必修(●▲)、專業選修(★,本系)、跨域及自由選修(他系課與超修溢出)。
 */
export type CreditCategory =
  | 'commonRequired'
  | 'generalEd'
  | 'commonElective'
  | 'proRequired'
  | 'proElective'
  | 'free';

/** 課程標準(北科課程系統 Cprog.jsp)裡的一列科目 */
export interface StandardCourse {
  /** 年級 1~4(無法解析時為 0) */
  year: number;
  /** 學期 1 或 2(無法解析時為 0) */
  sem: number;
  /** 類別符號 ○△☆●▲★ */
  type: string;
  name: string;
  credit: number;
  /** 分段修習進度,例如 '1/2';單一學期為 '1' */
  stage: string;
}

/** 某入學年度、某系所的畢業課程標準(由北科課程好朋友的爬蟲資料取得) */
export interface GraduationStandard {
  /** 入學學年度(民國),例如 113 */
  entryYear: number;
  /** 學制,例如「四技」 */
  system: string;
  /** 系所,例如「資工系」 */
  department: string;
  /** 學分門檻(原始欄名 → 數值),例如 { 最低畢業學分數: 132, 校訂共同必修學分: 28 } */
  credits: Record<string, number>;
  courses: StandardCourse[];
  /** 系所規定原文,逐條 */
  rules: string[];
  /** 下載時間(epoch ms) */
  fetchedAt: number;
}

/** 手動加入的學分(抵免、轉學、暑修、他校課程⋯) */
export interface ManualCredit {
  id: string;
  title: string;
  credit: number;
  category: CreditCategory;
  /** 博雅向度(category 為 generalEd 時選填) */
  dimension?: string;
  /** 備註,例如「113-1 抵免」 */
  note?: string;
}

/** 一位成員的畢業門檻計畫 */
export interface GraduationPlan {
  ownerId: string;
  /** 套用的課程標準;未下載時沒有門檻,只統計已修學分 */
  standard?: GraduationStandard;
  /** 視為「本系」課程的開課班級前綴(例如 ['資工']);他系課程歸入跨域及自由選修 */
  ownClassPrefixes: string[];
  /** 不採計的課(不及格、停修、重修的舊紀錄),存 graduation.courseKey() */
  excludedKeys: string[];
  /** 人工改類別的課(courseKey → 類別) */
  overrides: Record<string, CreditCategory>;
  /** 改成博雅時指定的向度(courseKey → 向度) */
  overrideDimensions?: Record<string, string>;
  manualCredits: ManualCredit[];
  /** 已確認的系所規定(存規定原文,重新下載標準時仍對得上) */
  checkedRules: string[];
  updatedAt: number;
}

export type FlowLevel = 'light' | 'medium' | 'heavy';

/** 經血量顯示文字 */
export const FLOW_LABELS: Record<FlowLevel, string> = {
  light: '少量',
  medium: '中等',
  heavy: '大量',
};

export const FLOW_OPTIONS = (['light', 'medium', 'heavy'] as FlowLevel[]).map((value) => ({
  value,
  label: FLOW_LABELS[value],
}));

/** 預設可選症狀(可複選;使用者也能自己加) */
export const PERIOD_SYMPTOMS = [
  '經痛',
  '頭痛',
  '腰痠',
  '乳房脹痛',
  '情緒低落',
  '易怒',
  '疲倦',
  '水腫',
  '失眠',
  '食慾增加',
  '長痘痘',
  '噁心',
] as const;

/** 自訂欄位的一筆紀錄值(自描述,跟著紀錄一起同步) */
export interface PeriodCustomField {
  /** 欄位名稱,例如「經前痛持續時間」 */
  name: string;
  /** 使用者填的內容,例如「2 小時」 */
  value: string;
}

/** 一次經期紀錄 */
export interface PeriodRecord {
  id: string;
  /** YYYY-MM-DD 經期開始日 */
  startDate: string;
  /** YYYY-MM-DD 經期結束日(進行中為空) */
  endDate?: string;
  flow?: FlowLevel;
  symptoms?: string[];
  notes?: string;
  /** 自訂欄位紀錄(經前痛持續時間、症狀程度⋯) */
  customFields?: PeriodCustomField[];
  /** 由誰記錄(允許他人協助紀錄) */
  recordedBy: string;
}

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'pms';

export interface CyclePrediction {
  /** 推算的下次經期開始日 */
  nextStart: string;
  /** 可能區間開始 */
  windowStart: string;
  /** 可能區間結束 */
  windowEnd: string;
  avgCycleLength: number;
  avgPeriodLength: number;
  /** 推算排卵日 */
  ovulationDate: string;
  confidence: 'low' | 'medium' | 'high';
  /** 用了幾個週期樣本 */
  sampleCount: number;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  googleConnected: boolean;
  /** 經期前幾天提醒 */
  remindDaysBefore: number;
  /** Firebase 共享空間配對碼(null = 本機模式) */
  spaceId?: string | null;
  /** 使用者自訂的行程標籤 */
  customTags?: string[];
  /** 記住的經期自訂欄位名稱(新紀錄會自動帶出這些欄位) */
  periodFieldNames?: string[];
  /** 使用者自訂的症狀(加進預設症狀清單) */
  customSymptoms?: string[];
  /** 上課前幾分鐘提醒(未設 / null = 不提醒) */
  courseRemindMinutes?: number | null;
  /** 跨裝置推播:對方改動共用行程時,即使 App 沒開也通知 */
  crossDevicePush?: boolean;
  /** Google 日曆增量同步用的 token(由 Google 發放,過期會自動重做完整同步) */
  googleSyncToken?: string | null;
  /** 上次從 Google 拉取的時間(epoch ms),顯示用 */
  googleLastPullAt?: number | null;
}

export interface AppData {
  users: UserProfile[];
  events: CalendarEvent[];
  periods: PeriodRecord[];
  courses: CourseEntry[];
  /** 已知的學期(匯入課表時建立) */
  semesters: SemesterMeta[];
  /** 畢業門檻計畫(每位成員一份;未設定者沒有項目) */
  graduation: GraduationPlan[];
  settings: AppSettings;
}
