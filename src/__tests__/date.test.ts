import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  daysBetween,
  fromDateKey,
  isValidDateKey,
  isValidTime,
  isWithin,
  minutesToTime,
  monthGrid,
  timeToMinutes,
  toDateKey,
} from '../utils/date';

test('addDays 跨月與跨年', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('addDays 處理閏年', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('daysBetween 回傳有號天數', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-08'), 7);
  assert.equal(daysBetween('2026-01-08', '2026-01-01'), -7);
  assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0);
});

test('daysBetween 不受日光節約時間影響', () => {
  // 用本地時區的 00:00 建構,跨越任何 DST 邊界都應為整數天
  assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31);
  assert.equal(daysBetween('2026-10-01', '2026-11-01'), 31);
});

test('toDateKey / fromDateKey 互為反函式', () => {
  const key = '2026-07-28';
  assert.equal(toDateKey(fromDateKey(key)), key);
});

test('isWithin 為閉區間', () => {
  assert.equal(isWithin('2026-01-05', '2026-01-01', '2026-01-10'), true);
  assert.equal(isWithin('2026-01-01', '2026-01-01', '2026-01-10'), true);
  assert.equal(isWithin('2026-01-10', '2026-01-01', '2026-01-10'), true);
  assert.equal(isWithin('2026-01-11', '2026-01-01', '2026-01-10'), false);
});

test('monthGrid 以完整週對齊', () => {
  const grid = monthGrid(2026, 6); // 2026 年 7 月
  assert.equal(grid.length % 7, 0);
  const days = grid.filter((c): c is string => c !== null);
  assert.equal(days.length, 31);
  assert.equal(days[0], '2026-07-01');
  assert.equal(days[30], '2026-07-31');
  // 2026-07-01 是週三,前面應有 3 個空位
  assert.deepEqual(grid.slice(0, 3), [null, null, null]);
  assert.equal(grid[3], '2026-07-01');
});

test('timeToMinutes / minutesToTime 互為反函式', () => {
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(minutesToTime(570), '09:30');
  assert.equal(minutesToTime(0), '00:00');
});

test('minutesToTime 夾在當日範圍內', () => {
  assert.equal(minutesToTime(-30), '00:00');
  assert.equal(minutesToTime(24 * 60), '23:59');
  assert.equal(minutesToTime(99999), '23:59');
});

test('isValidTime 只接受 24 小時制 HH:MM', () => {
  assert.equal(isValidTime('00:00'), true);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('09:60'), false);
  assert.equal(isValidTime('9:30'), false);
  assert.equal(isValidTime(''), false);
});

test('isValidDateKey 擋掉不存在的日期', () => {
  assert.equal(isValidDateKey('2026-07-28'), true);
  assert.equal(isValidDateKey('2026-02-30'), false);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('2026-7-28'), false);
  assert.equal(isValidDateKey('not-a-date'), false);
});
