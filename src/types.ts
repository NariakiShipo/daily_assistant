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
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** 此事件屬於誰 */
  ownerId: string;
  /** 由誰建立(共同編輯時可能不同) */
  createdBy: string;
  /** 已同步至 Google Calendar 的事件 ID */
  googleEventId?: string;
  /** 是否要求同步至 Google Calendar */
  syncToGoogle?: boolean;
}

export type FlowLevel = 'light' | 'medium' | 'heavy';

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
}

export interface AppData {
  users: UserProfile[];
  events: CalendarEvent[];
  periods: PeriodRecord[];
  settings: AppSettings;
}
