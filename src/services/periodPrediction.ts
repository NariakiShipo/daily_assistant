import { CyclePhase, CyclePrediction, PeriodRecord } from '../types';
import { addDays, daysBetween, todayKey } from '../utils/date';

const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD = 5;
const MAX_SAMPLES = 6;

/** 依過去紀錄推算下次經期。至少需要一筆紀錄。 */
export function predictNextCycle(records: PeriodRecord[]): CyclePrediction | null {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 週期長度 = 相鄰兩次開始日的間隔(取最近 MAX_SAMPLES 筆,過濾異常值 15–60 天)
  const cycleLengths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const len = daysBetween(sorted[i - 1].startDate, sorted[i].startDate);
    if (len >= 15 && len <= 60) cycleLengths.push(len);
  }
  const recent = cycleLengths.slice(-MAX_SAMPLES);
  const avgCycle = recent.length
    ? Math.round(recent.reduce((s, n) => s + n, 0) / recent.length)
    : DEFAULT_CYCLE;

  // 經期長度
  const periodLengths = sorted
    .filter((r) => r.endDate)
    .map((r) => daysBetween(r.startDate, r.endDate!) + 1)
    .filter((n) => n >= 1 && n <= 14)
    .slice(-MAX_SAMPLES);
  const avgPeriod = periodLengths.length
    ? Math.round(periodLengths.reduce((s, n) => s + n, 0) / periodLengths.length)
    : DEFAULT_PERIOD;

  // 標準差 → 推算區間寬度(至少 ±2 天)
  let window = 2;
  if (recent.length >= 2) {
    const mean = recent.reduce((s, n) => s + n, 0) / recent.length;
    const variance = recent.reduce((s, n) => s + (n - mean) ** 2, 0) / recent.length;
    window = Math.max(2, Math.min(5, Math.round(Math.sqrt(variance))));
  }

  const lastStart = sorted[sorted.length - 1].startDate;
  let nextStart = addDays(lastStart, avgCycle);
  // 若推算日已過(逾期),往後推到今天之後最近的一個週期
  const today = todayKey();
  while (nextStart < today && daysBetween(nextStart, today) > window) {
    nextStart = addDays(nextStart, avgCycle);
  }

  const confidence: CyclePrediction['confidence'] =
    recent.length >= 4 && window <= 3 ? 'high' : recent.length >= 2 ? 'medium' : 'low';

  return {
    nextStart,
    windowStart: addDays(nextStart, -window),
    windowEnd: addDays(nextStart, window),
    avgCycleLength: avgCycle,
    avgPeriodLength: avgPeriod,
    ovulationDate: addDays(nextStart, -14),
    confidence,
    sampleCount: recent.length,
  };
}

export interface PhaseInfo {
  phase: CyclePhase;
  /** 週期第幾天(從 1 起算) */
  dayOfCycle: number;
}

/** 判斷今天處於週期哪個階段 */
export function getCurrentPhase(
  records: PeriodRecord[],
  prediction: CyclePrediction | null,
  today: string = todayKey()
): PhaseInfo | null {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const last = sorted[sorted.length - 1];
  if (today < last.startDate) return null;

  const dayOfCycle = daysBetween(last.startDate, today) + 1;
  const avgCycle = prediction?.avgCycleLength ?? DEFAULT_CYCLE;
  const periodLen = last.endDate
    ? daysBetween(last.startDate, last.endDate) + 1
    : prediction?.avgPeriodLength ?? DEFAULT_PERIOD;

  let phase: CyclePhase;
  const ovulationDay = avgCycle - 14;
  if (dayOfCycle <= periodLen && (!last.endDate || today <= last.endDate)) {
    phase = 'menstrual';
  } else if (dayOfCycle >= ovulationDay - 1 && dayOfCycle <= ovulationDay + 1) {
    phase = 'ovulation';
  } else if (dayOfCycle < ovulationDay - 1) {
    phase = 'follicular';
  } else if (dayOfCycle >= avgCycle - 5) {
    phase = 'pms';
  } else {
    phase = 'luteal';
  }
  return { phase, dayOfCycle };
}

export const phaseNameZh: Record<CyclePhase, string> = {
  menstrual: '經期中',
  follicular: '濾泡期',
  ovulation: '排卵期',
  luteal: '黃體期',
  pms: '經前期(PMS)',
};
