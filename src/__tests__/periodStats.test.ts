import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleLengths, flowCounts, symptomCounts } from '../services/periodStats';
import { PeriodRecord } from '../types';

const rec = (over: Partial<PeriodRecord> & { startDate: string }): PeriodRecord => ({
  id: over.startDate,
  recordedBy: 'u1',
  ...over,
});

test('symptomCounts 在沒有紀錄時回傳空陣列', () => {
  assert.deepEqual(symptomCounts([]), []);
});

test('symptomCounts 統計各症狀出現次數', () => {
  const out = symptomCounts([
    rec({ startDate: '2026-05-01', symptoms: ['經痛', '頭痛'] }),
    rec({ startDate: '2026-06-01', symptoms: ['經痛'] }),
    rec({ startDate: '2026-07-01', symptoms: ['經痛', '疲倦'] }),
  ]);
  assert.deepEqual(out, [
    { name: '經痛', count: 3 },
    { name: '疲倦', count: 1 },
    { name: '頭痛', count: 1 },
  ]);
});

test('symptomCounts 同一筆內重複的症狀只算一次', () => {
  const out = symptomCounts([rec({ startDate: '2026-07-01', symptoms: ['經痛', '經痛'] })]);
  assert.deepEqual(out, [{ name: '經痛', count: 1 }]);
});

test('symptomCounts 次數相同時依名稱穩定排序', () => {
  const out = symptomCounts([rec({ startDate: '2026-07-01', symptoms: ['頭痛', '經痛'] })]);
  assert.deepEqual(
    out.map((s) => s.name),
    ['經痛', '頭痛']
  );
});

test('symptomCounts 忽略沒有症狀的紀錄', () => {
  const out = symptomCounts([
    rec({ startDate: '2026-06-01' }),
    rec({ startDate: '2026-07-01', symptoms: [] }),
    rec({ startDate: '2026-07-28', symptoms: ['經痛'] }),
  ]);
  assert.deepEqual(out, [{ name: '經痛', count: 1 }]);
});

test('flowCounts 統計各經血量等級', () => {
  const out = flowCounts([
    rec({ startDate: '2026-05-01', flow: 'heavy' }),
    rec({ startDate: '2026-06-01', flow: 'medium' }),
    rec({ startDate: '2026-07-01', flow: 'heavy' }),
    rec({ startDate: '2026-07-28' }), // 未填
  ]);
  assert.deepEqual(out, { light: 0, medium: 1, heavy: 2 });
});

test('flowCounts 在沒有紀錄時全為 0', () => {
  assert.deepEqual(flowCounts([]), { light: 0, medium: 0, heavy: 0 });
});

test('cycleLengths 算出相鄰兩次的間隔', () => {
  const out = cycleLengths([
    rec({ startDate: '2026-05-01' }),
    rec({ startDate: '2026-05-29' }),
    rec({ startDate: '2026-06-28' }),
  ]);
  assert.deepEqual(out, [
    { startDate: '2026-05-01', days: 28 },
    { startDate: '2026-05-29', days: 30 },
  ]);
});

test('cycleLengths 濾掉異常間隔', () => {
  // 中間有半年空窗 → 該間隔應被濾掉
  const out = cycleLengths([
    rec({ startDate: '2026-01-01' }),
    rec({ startDate: '2026-07-01' }),
    rec({ startDate: '2026-07-29' }),
  ]);
  assert.deepEqual(out, [{ startDate: '2026-07-01', days: 28 }]);
});

test('cycleLengths 不受輸入順序影響', () => {
  const out = cycleLengths([
    rec({ startDate: '2026-06-28' }),
    rec({ startDate: '2026-05-01' }),
    rec({ startDate: '2026-05-29' }),
  ]);
  assert.deepEqual(
    out.map((c) => c.days),
    [28, 30]
  );
});

test('cycleLengths 單筆紀錄時沒有間隔可算', () => {
  assert.deepEqual(cycleLengths([rec({ startDate: '2026-07-01' })]), []);
});
