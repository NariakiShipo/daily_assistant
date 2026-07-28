import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentPhase, predictNextCycle } from '../services/periodPrediction';
import { PeriodRecord } from '../types';
import { addDays, todayKey } from '../utils/date';

/** 建一筆經期紀錄;endDate 給 null 表示進行中 */
const rec = (startDate: string, endDate?: string | null): PeriodRecord => ({
  id: startDate,
  startDate,
  ...(endDate ? { endDate } : {}),
  recordedBy: 'u1',
});

/**
 * predictNextCycle 內部會呼叫 todayKey(),為了讓測試不隨執行日期漂移,
 * 一律用「相對今天」的日期建構樣本。
 */
const daysAgo = (n: number): string => addDays(todayKey(), -n);

test('沒有紀錄時回傳 null', () => {
  assert.equal(predictNextCycle([]), null);
});

test('單筆紀錄使用 28 天預設週期', () => {
  const p = predictNextCycle([rec(daysAgo(3))]);
  assert.ok(p);
  assert.equal(p.avgCycleLength, 28);
  assert.equal(p.avgPeriodLength, 5);
  assert.equal(p.sampleCount, 0);
  assert.equal(p.confidence, 'low');
  assert.equal(p.nextStart, addDays(daysAgo(3), 28));
});

test('多筆規律紀錄算出平均週期並提高信心', () => {
  // 每 30 天一次,共 5 個間隔
  const starts = [150, 120, 90, 60, 30, 0].map(daysAgo);
  const p = predictNextCycle(starts.map((s) => rec(s, addDays(s, 4))));
  assert.ok(p);
  assert.equal(p.avgCycleLength, 30);
  assert.equal(p.avgPeriodLength, 5);
  assert.equal(p.sampleCount, 5);
  assert.equal(p.confidence, 'high'); // 樣本 >= 4 且標準差小
  assert.equal(p.nextStart, addDays(daysAgo(0), 30));
});

test('過濾 15–60 天以外的異常間隔', () => {
  // 中間插一個 200 天的斷層(例如停用 App 一段時間),不應污染平均值
  const p = predictNextCycle([
    rec(daysAgo(290), addDays(daysAgo(290), 4)),
    rec(daysAgo(90), addDays(daysAgo(90), 4)), // 與前一筆間隔 200 天 → 應被濾掉
    rec(daysAgo(62), addDays(daysAgo(62), 4)),
    rec(daysAgo(34), addDays(daysAgo(34), 4)),
    rec(daysAgo(6), addDays(daysAgo(6), 4)),
  ]);
  assert.ok(p);
  assert.equal(p.avgCycleLength, 28); // 只採計 28、28、28
  assert.equal(p.sampleCount, 3);
});

test('經期長度只採計 1–14 天的合理值', () => {
  const p = predictNextCycle([
    rec(daysAgo(60), addDays(daysAgo(60), 2)), // 3 天
    rec(daysAgo(30), addDays(daysAgo(30), 30)), // 31 天 → 異常,濾掉
    rec(daysAgo(2), addDays(daysAgo(2), 4)), // 5 天
  ]);
  assert.ok(p);
  assert.equal(p.avgPeriodLength, 4); // (3 + 5) / 2 = 4
});

test('預測區間對稱且至少 ±2 天', () => {
  const p = predictNextCycle([rec(daysAgo(30)), rec(daysAgo(2))]);
  assert.ok(p);
  assert.equal(p.windowStart, addDays(p.nextStart, -2));
  assert.equal(p.windowEnd, addDays(p.nextStart, 2));
});

test('週期不規律時放寬預測區間', () => {
  // 間隔 21、35、24、33 天 → 標準差大
  const starts = [113, 92, 57, 33, 0].map(daysAgo);
  const p = predictNextCycle(starts.map((s) => rec(s)));
  assert.ok(p);
  assert.ok(p.windowEnd > addDays(p.nextStart, 2), '不規律時區間應比最小的 ±2 天寬');
  assert.notEqual(p.confidence, 'high');
});

test('推算日已過很久時往後推到未來', () => {
  // 最後一次是 90 天前、週期 28 天 → 樸素推算會落在 62 天前
  const p = predictNextCycle([rec(daysAgo(118)), rec(daysAgo(90))]);
  assert.ok(p);
  assert.ok(p.nextStart >= todayKey(), `nextStart ${p.nextStart} 應不早於今天`);
});

test('排卵日固定為預測開始日的 14 天前', () => {
  const p = predictNextCycle([rec(daysAgo(5))]);
  assert.ok(p);
  assert.equal(p.ovulationDate, addDays(p.nextStart, -14));
});

test('getCurrentPhase 沒有紀錄時回傳 null', () => {
  assert.equal(getCurrentPhase([], null), null);
});

test('getCurrentPhase 在經期進行中回報 menstrual', () => {
  const records = [rec('2026-07-01', '2026-07-05')];
  const phase = getCurrentPhase(records, null, '2026-07-03');
  assert.deepEqual(phase, { phase: 'menstrual', dayOfCycle: 3 });
});

test('getCurrentPhase 依週期天數判斷各階段', () => {
  const records = [rec('2026-07-01', '2026-07-05')];
  const pred = predictNextCycle([rec('2026-06-03', '2026-06-07'), rec('2026-07-01', '2026-07-05')]);
  assert.ok(pred);
  // 28 天週期 → 排卵日在第 14 天
  assert.equal(getCurrentPhase(records, pred, '2026-07-10')?.phase, 'follicular');
  assert.equal(getCurrentPhase(records, pred, '2026-07-14')?.phase, 'ovulation');
  assert.equal(getCurrentPhase(records, pred, '2026-07-20')?.phase, 'luteal');
  assert.equal(getCurrentPhase(records, pred, '2026-07-26')?.phase, 'pms');
});

test('getCurrentPhase 在最後一次紀錄之前回傳 null', () => {
  const records = [rec('2026-07-01', '2026-07-05')];
  assert.equal(getCurrentPhase(records, null, '2026-06-30'), null);
});
