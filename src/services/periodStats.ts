/**
 * 經期紀錄的統計(純函式)。
 *
 * 刻意只做「數次數」這類客觀彙總,不從症狀推論任何健康結論——
 * 那需要醫療專業,不是這個 App 該說的話。
 */
import { FlowLevel, PeriodRecord } from '../types';
import { daysBetween } from '../utils/date';

export interface SymptomCount {
  name: string;
  count: number;
}

/**
 * 各症狀出現過幾次,由多到少排序(同次數則依名稱排序以維持穩定輸出)。
 * 同一筆紀錄裡重複的症狀只算一次。
 */
export function symptomCounts(records: PeriodRecord[]): SymptomCount[] {
  const tally = new Map<string, number>();
  for (const r of records) {
    for (const name of new Set(r.symptoms ?? [])) {
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 各經血量等級出現過幾次 */
export function flowCounts(records: PeriodRecord[]): Record<FlowLevel, number> {
  const out: Record<FlowLevel, number> = { light: 0, medium: 0, heavy: 0 };
  for (const r of records) {
    if (r.flow) out[r.flow] += 1;
  }
  return out;
}

export interface CycleLength {
  /** 這個週期的起算日 */
  startDate: string;
  /** 到下一次開始為止的天數 */
  days: number;
}

/**
 * 歷次週期長度(相鄰兩次開始日的間隔),依日期由舊到新。
 * 與預測一致,濾掉 15–60 天以外的異常間隔。
 */
export function cycleLengths(records: PeriodRecord[]): CycleLength[] {
  const sorted = [...records].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const out: CycleLength[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = daysBetween(sorted[i - 1].startDate, sorted[i].startDate);
    if (days >= 15 && days <= 60) out.push({ startDate: sorted[i - 1].startDate, days });
  }
  return out;
}
