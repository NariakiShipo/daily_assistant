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
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** 此事件屬於誰(向後相容:等於 ownerIds 的第一位) */
  ownerId: string;
  /** 此事件屬於哪些人(可複選;未設時視同 [ownerId]) */
  ownerIds?: string[];
  /** 由誰建立(共同編輯時可能不同) */
  createdBy: string;
  /** 已同步至 Google Calendar 的事件 ID */
  googleEventId?: string;
  /** 是否要求同步至 Google Calendar */
  syncToGoogle?: boolean;
  /** 標籤(重要、完成⋯),可複選 */
  tags?: string[];
  /** 優先順序(未設定 = 一般) */
  priority?: EventPriority;
}

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
  /** 1 = 週一 ⋯ 5 = 週五 */
  weekday: number;
  /** 起始節次(PERIOD_SLOTS 索引) */
  startPeriod: number;
  /** 結束節次(PERIOD_SLOTS 索引,>= startPeriod) */
  endPeriod: number;
  color?: string;
  /** 這是誰的課表 */
  ownerId: string;
}

export type FlowLevel = 'light' | 'medium' | 'heavy';

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
}

export interface AppData {
  users: UserProfile[];
  events: CalendarEvent[];
  periods: PeriodRecord[];
  courses: CourseEntry[];
  settings: AppSettings;
}
