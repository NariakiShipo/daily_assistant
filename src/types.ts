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
  /** 當月花費上限(自己 / 伴侶各一個,雙人不設);只顯示已用與剩餘,不做任何提醒 */
  budget?: ExpenseBudget;
  /** 「雙人」支出怎麼算進個人統計 */
  sharedSplit?: SharedSplit;
  /** 記一筆時的金額鍵盤 */
  expenseKeypad?: ExpenseKeypad;
  /** 記過的備註,記一筆時當成常用備註小標籤(最近的排前面) */
  recentExpenseNotes?: string[];
  /**
   * 使用者手動刪掉的固定支出月份,格式 '<recurringId>@YYYY-MM-DD'。
   * 沒有這份清單的話,下次開 App 時自動補帳會把刪掉的那一筆又補回來。
   */
  recurringSkips?: string[];
  /** 底部導覽列要放哪幾個模組(最多 4 個,順序 = 左到右;Home 固定在中間) */
  navModules?: ModuleKey[];
  /** Home 的卡片:順序與開關 */
  homeCards?: HomeCardPref[];
  /** Home 的「今日課程」看誰的課表(未設 = 主要使用者) */
  homeCourseOwnerId?: string;
  /** 是否走完「登入 → 選常用功能」;false 時進 App 會先到登入頁 */
  onboarded?: boolean;
  /** 是否看過首次使用教學;可從側邊選單「重看使用教學」重設 */
  tutorialSeen?: boolean;
}

/* ───────────────────── 導覽與 Home ───────────────────── */

/** 可以放進底部導覽列的功能模組 */
export type ModuleKey = 'calendar' | 'expense' | 'period' | 'timetable';

/** 底部導覽列最多放幾個模組(左右各 2,中間留給 Home) */
export const MAX_NAV_MODULES = 4;

/** Home 上一張卡片的偏好 */
export interface HomeCardPref {
  key: HomeCardKey;
  on: boolean;
}

export type HomeCardKey =
  | 'course'
  | 'period'
  | 'events'
  | 'expense'
  | 'tomorrow'
  | 'monthExpense';

export interface AppData {
  users: UserProfile[];
  events: CalendarEvent[];
  periods: PeriodRecord[];
  courses: CourseEntry[];
  /** 已知的學期(匯入課表時建立) */
  semesters: SemesterMeta[];
  /** 帳目 */
  expenses: Expense[];
  /** 記帳分類(預設 + 自訂) */
  expenseCategories: ExpenseCategory[];
  /** 固定支出的範本 */
  recurringExpenses: RecurringExpense[];
  settings: AppSettings;
}

/* ───────────────────────── 記帳 ───────────────────────── */

/** 一筆帳是支出還是收入 */
export type ExpenseKind = 'expense' | 'income';

/** 這筆帳算誰的:自己 / 伴侶 / 雙人共同 */
export type ExpenseWho = 'self' | 'partner' | 'both';

/** 付款方式 */
export type PaymentMethod = 'cash' | 'card' | 'transfer';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: '現金',
  card: '卡',
  transfer: '轉帳',
};

export const PAYMENT_OPTIONS = (['cash', 'card', 'transfer'] as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_LABELS[value],
}));

/**
 * 「雙人」支出怎麼算進個人統計。
 *
 * separate = 獨立一類:只出現在「雙人」,不計入任何人的上限。
 * half     = 各算一半:一半分別加進自己與伴侶的統計與上限。
 */
export type SharedSplit = 'separate' | 'half';

/** 金額輸入用哪種鍵盤 */
export type ExpenseKeypad = 'app' | 'system';

/** 一筆帳目 */
export interface Expense {
  id: string;
  /** 正數;支出或收入由 kind 決定,不用負數表示支出 */
  amount: number;
  kind: ExpenseKind;
  who: ExpenseWho;
  /** ExpenseCategory.id */
  categoryId: string;
  /** YYYY-MM-DD */
  date: string;
  note?: string;
  payment: PaymentMethod;
  /** 收據照片(本機 file:// 或 data:) */
  receiptUri?: string;
  /** 由固定支出自動產生時,來源 RecurringExpense.id */
  recurringId?: string;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
  /** 最後由哪台裝置修改;與行程同樣用來略過自己的推播 */
  updatedByDevice?: string;
}

/**
 * 記帳分類(= 使用者說的「標籤」)。
 *
 * 預設分類只能隱藏不能刪除,否則舊帳目會失去分類;
 * 自訂分類可改名、換圖、刪除(刪除時要先把舊帳目移到別的分類)。
 */
export interface ExpenseCategory {
  id: string;
  name: string;
  kind: ExpenseKind;
  /** 內建線條圖示的鍵(見 components/Icon) */
  icon?: string;
  /** 使用者選的 Emoji(與 icon、imageUri 三選一) */
  emoji?: string;
  /** 使用者上傳並裁成圓形的圖片 */
  imageUri?: string;
  /** 圓餅圖與排行用的顏色 */
  color: string;
  /** 預設分類:不可刪除,只能隱藏 */
  builtin: boolean;
  /** 隱藏後不再出現在記一筆的分類格,但舊帳目仍看得到分類 */
  hidden?: boolean;
  /** 顯示順序(長按拖曳調整) */
  order: number;
}

/** 固定支出:到期當天自動新增一筆真實帳目,之後可單獨修改或刪除 */
export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  kind: ExpenseKind;
  who: ExpenseWho;
  categoryId: string;
  payment: PaymentMethod;
  /** 每月幾號記一筆(1–31;超過當月天數時落在月底) */
  dayOfMonth: number;
  /** 從哪個月開始自動記(YYYY-MM);未設 = 建立當月 */
  startMonth?: string;
}

/** 當月花費上限:自己與伴侶各一個,雙人不設 */
export interface ExpenseBudget {
  self?: number;
  partner?: number;
}

/** 記帳的預設分類顏色(沿用 theme 的 tagPalette 八色與成員色) */
export const EXPENSE_CATEGORY_COLORS = [
  '#E8638C', '#4A90D9', '#B85FA8', '#E5A33D', '#7C6BD6',
  '#D9534F', '#5C7FD9', '#2BAFA0', '#46A35E', '#D97B4A',
  '#8A8F4A', '#3FA37A',
];

/**
 * 預設分類。
 *
 * 支出 10 個是使用者指定的清單;收入 4 個是最小可用集合,
 * 兩邊都 builtin(可隱藏、不可刪),自訂分類從 order 100 起跳。
 */
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'c-food', name: '飲食', kind: 'expense', icon: 'food', color: '#E8638C', builtin: true, order: 0 },
  { id: 'c-transit', name: '交通', kind: 'expense', icon: 'transit', color: '#4A90D9', builtin: true, order: 1 },
  { id: 'c-shopping', name: '購物', kind: 'expense', icon: 'shopping', color: '#B85FA8', builtin: true, order: 2 },
  { id: 'c-fun', name: '娛樂', kind: 'expense', icon: 'fun', color: '#E5A33D', builtin: true, order: 3 },
  { id: 'c-home', name: '居住', kind: 'expense', icon: 'home', color: '#7C6BD6', builtin: true, order: 4 },
  { id: 'c-health', name: '醫療', kind: 'expense', icon: 'health', color: '#D9534F', builtin: true, order: 5 },
  { id: 'c-edu', name: '教育', kind: 'expense', icon: 'edu', color: '#5C7FD9', builtin: true, order: 6 },
  { id: 'c-daily', name: '日用品', kind: 'expense', icon: 'daily', color: '#2BAFA0', builtin: true, order: 7 },
  { id: 'c-phone', name: '通訊', kind: 'expense', icon: 'phone', color: '#46A35E', builtin: true, order: 8 },
  { id: 'c-pet', name: '寵物', kind: 'expense', icon: 'pet', color: '#D97B4A', builtin: true, order: 9 },
  { id: 'c-salary', name: '薪資', kind: 'income', icon: 'salary', color: '#3FA37A', builtin: true, order: 0 },
  { id: 'c-bonus', name: '獎金', kind: 'income', icon: 'bonus', color: '#E5A33D', builtin: true, order: 1 },
  { id: 'c-invest', name: '投資', kind: 'income', icon: 'invest', color: '#4A90D9', builtin: true, order: 2 },
  { id: 'c-other-income', name: '其他', kind: 'income', icon: 'more', color: '#8A8F4A', builtin: true, order: 3 },
];

/** 找不到分類時的替身:舊帳目的分類被刪掉也不會讓畫面崩掉 */
export const UNKNOWN_CATEGORY: ExpenseCategory = {
  id: '',
  name: '未分類',
  kind: 'expense',
  icon: 'more',
  color: '#C9B8C0',
  builtin: true,
  order: 999,
};
