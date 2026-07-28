import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countdownText,
  coursesOnDate,
  currentCourseAt,
  minutesOfDay,
  slotRangeText,
} from '../services/timetableToday';
import {
  DEFAULT_MAX_REMINDERS,
  EventReminder,
  collectCourseReminders,
  mergeReminders,
} from '../services/reminders';
import { CourseEntry, SemesterMeta } from '../types';
import { timeToMinutes } from '../utils/date';

/*
 * 日期對照(2026 年 7 月):07-06 週一、07-07 週二、07-11 週六
 * 節次:0 = 08:10–09:00、1 = 09:10–10:00、2 = 10:10–11:00、5 = 13:10–14:00
 */

const semester: SemesterMeta = {
  id: '115-1',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
};

const course = (over: Partial<CourseEntry> = {}): CourseEntry => ({
  id: 'c1',
  title: '演算法',
  weekday: 1,
  startPeriod: 0,
  endPeriod: 1,
  ownerId: 'u1',
  semesterId: '115-1',
  ...over,
});

const titles = (list: { course: CourseEntry }[]): string[] => list.map((s) => s.course.title);

test('coursesOnDate 找出當天的課', () => {
  const out = coursesOnDate([course()], [semester], '2026-07-06', 'u1');
  assert.deepEqual(titles(out), ['演算法']);
});

test('coursesOnDate 略過其他星期幾的課', () => {
  const out = coursesOnDate([course()], [semester], '2026-07-07', 'u1');
  assert.deepEqual(out, []);
});

test('coursesOnDate 略過其他成員的課', () => {
  const out = coursesOnDate([course()], [semester], '2026-07-06', 'u2');
  assert.deepEqual(out, []);
});

test('coursesOnDate 只在學期範圍內生效', () => {
  const out = coursesOnDate([course()], [semester], '2026-09-07', 'u1');
  assert.deepEqual(out, []);
});

test('coursesOnDate 讓未分類的課恆常生效', () => {
  const out = coursesOnDate([course({ semesterId: undefined })], [], '2026-09-07', 'u1');
  assert.deepEqual(titles(out), ['演算法']);
});

test('coursesOnDate 依開始時間排序', () => {
  const out = coursesOnDate(
    [
      course({ id: 'late', title: '下午課', startPeriod: 5, endPeriod: 5 }),
      course({ id: 'early', title: '早上課', startPeriod: 0, endPeriod: 0 }),
    ],
    [semester],
    '2026-07-06',
    'u1'
  );
  assert.deepEqual(titles(out), ['早上課', '下午課']);
});

test('coursesOnDate 週末沒有課', () => {
  const out = coursesOnDate([course()], [semester], '2026-07-11', 'u1');
  assert.deepEqual(out, []);
});

test('slotRangeText 顯示節次的實際時間', () => {
  const [slot] = coursesOnDate([course()], [semester], '2026-07-06', 'u1');
  assert.equal(slotRangeText(slot), '08:10–10:00');
});

test('currentCourseAt 在上課中回報剩餘時間', () => {
  const list = coursesOnDate([course()], [semester], '2026-07-06', 'u1');
  const cur = currentCourseAt(list, timeToMinutes('09:00'));
  assert.ok(cur);
  assert.equal(cur.status, 'ongoing');
  assert.equal(cur.minutes, 60); // 到 10:00 還有 60 分鐘
});

test('currentCourseAt 在課前回報還有多久上課', () => {
  const list = coursesOnDate([course()], [semester], '2026-07-06', 'u1');
  const cur = currentCourseAt(list, timeToMinutes('08:00'));
  assert.ok(cur);
  assert.equal(cur.status, 'upcoming');
  assert.equal(cur.minutes, 10);
});

test('currentCourseAt 在下課時刻改指向下一堂', () => {
  const list = coursesOnDate(
    [
      course({ id: 'a', title: '第一堂', startPeriod: 0, endPeriod: 0 }), // 08:10–09:00
      course({ id: 'b', title: '第二堂', startPeriod: 1, endPeriod: 1 }), // 09:10–10:00
    ],
    [semester],
    '2026-07-06',
    'u1'
  );
  // 09:00 剛好是第一堂結束 → 不算上課中
  const cur = currentCourseAt(list, timeToMinutes('09:00'));
  assert.ok(cur);
  assert.equal(cur.slot.course.title, '第二堂');
  assert.equal(cur.status, 'upcoming');
  assert.equal(cur.minutes, 10);
});

test('currentCourseAt 優先回報正在上的課', () => {
  const list = coursesOnDate(
    [
      course({ id: 'a', title: '第一堂', startPeriod: 0, endPeriod: 0 }),
      course({ id: 'b', title: '第二堂', startPeriod: 1, endPeriod: 1 }),
    ],
    [semester],
    '2026-07-06',
    'u1'
  );
  const cur = currentCourseAt(list, timeToMinutes('08:30'));
  assert.equal(cur?.slot.course.title, '第一堂');
  assert.equal(cur?.status, 'ongoing');
});

test('currentCourseAt 課都上完時回傳 null', () => {
  const list = coursesOnDate([course()], [semester], '2026-07-06', 'u1');
  assert.equal(currentCourseAt(list, timeToMinutes('18:00')), null);
});

test('currentCourseAt 當天無課時回傳 null', () => {
  assert.equal(currentCourseAt([], 600), null);
});

test('countdownText 未滿一小時用分鐘', () => {
  assert.equal(countdownText(1), '1 分鐘');
  assert.equal(countdownText(59), '59 分鐘');
});

test('countdownText 超過一小時改用時分', () => {
  // 「284 分鐘後」要心算,「4 小時 44 分鐘」不用
  assert.equal(countdownText(284), '4 小時 44 分鐘');
  assert.equal(countdownText(60), '1 小時');
  assert.equal(countdownText(125), '2 小時 5 分鐘');
});

test('countdownText 整點不顯示 0 分鐘', () => {
  assert.equal(countdownText(120), '2 小時');
});

test('minutesOfDay 換算當日分鐘數', () => {
  assert.equal(minutesOfDay(new Date(2026, 6, 6, 9, 30)), 570);
  assert.equal(minutesOfDay(new Date(2026, 6, 6, 0, 0)), 0);
});

/* ---------- 上課提醒 ---------- */

/** 2026-07-06(週一)07:00 */
const NOW = new Date(2026, 6, 6, 7, 0, 0, 0);

test('collectCourseReminders 為每週的課排提醒', () => {
  const out = collectCourseReminders([course()], [semester], 'u1', 10, NOW);
  // 一週內只有 07-06 這個週一
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].fireAt, new Date(2026, 6, 6, 8, 0)); // 08:10 的 10 分鐘前
  assert.equal(out[0].eventId, 'c1');
});

test('collectCourseReminders 的通知帶出教室', () => {
  const out = collectCourseReminders(
    [course({ location: '綜科館 306' })],
    [semester],
    'u1',
    10,
    NOW
  );
  assert.equal(out[0].title, '📚 10 分鐘前:演算法');
  assert.equal(out[0].body, '7月6日 08:10 · 綜科館 306');
});

test('collectCourseReminders 沒有教室時不留下多餘符號', () => {
  const out = collectCourseReminders([course()], [semester], 'u1', 10, NOW);
  assert.equal(out[0].body, '7月6日 08:10');
});

test('collectCourseReminders 略過已經過去的時刻', () => {
  // 09:30 時,08:10 那堂的提醒早就過了
  const late = new Date(2026, 6, 6, 9, 30);
  const out = collectCourseReminders([course()], [semester], 'u1', 10, late);
  assert.equal(out.length, 0);
});

test('collectCourseReminders 涵蓋一週內的多天', () => {
  const out = collectCourseReminders(
    [
      course({ id: 'mon', title: '週一課', weekday: 1 }),
      course({ id: 'wed', title: '週三課', weekday: 3 }),
    ],
    [semester],
    'u1',
    10,
    NOW
  );
  assert.deepEqual(
    out.map((r) => r.date),
    ['2026-07-06', '2026-07-08']
  );
});

test('collectCourseReminders 依提醒時刻排序', () => {
  const out = collectCourseReminders(
    [
      course({ id: 'wed', title: '週三課', weekday: 3 }),
      course({ id: 'mon', title: '週一課', weekday: 1 }),
    ],
    [semester],
    'u1',
    10,
    NOW
  );
  assert.deepEqual(
    out.map((r) => r.eventId),
    ['mon', 'wed']
  );
});

test('collectCourseReminders 只排指定成員的課', () => {
  const out = collectCourseReminders([course({ ownerId: 'u2' })], [semester], 'u1', 10, NOW);
  assert.equal(out.length, 0);
});

test('collectCourseReminders 學期結束後不再提醒', () => {
  const past: SemesterMeta = { ...semester, startDate: '2026-01-01', endDate: '2026-06-30' };
  const out = collectCourseReminders([course()], [past], 'u1', 10, NOW);
  assert.equal(out.length, 0);
});

/* ---------- 合併與總量上限 ---------- */

const fake = (key: string, msFromNow: number): EventReminder => ({
  key,
  eventId: key,
  date: '2026-07-06',
  title: key,
  body: '',
  fireAt: new Date(NOW.getTime() + msFromNow),
});

test('mergeReminders 交錯合併並依時間排序', () => {
  const out = mergeReminders([
    [fake('event-a', 3000), fake('event-b', 1000)],
    [fake('course-a', 2000)],
  ]);
  assert.deepEqual(
    out.map((r) => r.key),
    ['event-b', 'course-a', 'event-a']
  );
});

test('mergeReminders 以合併後的總數截斷', () => {
  // 兩份各自都沒超過上限,合併後才超過——這正是要防的情況
  const a = Array.from({ length: 30 }, (_, i) => fake(`a${i}`, i * 1000));
  const b = Array.from({ length: 30 }, (_, i) => fake(`b${i}`, i * 1000 + 500));
  const out = mergeReminders([a, b]);
  assert.equal(out.length, DEFAULT_MAX_REMINDERS);
});

test('mergeReminders 截斷時保留最近的', () => {
  const out = mergeReminders([[fake('far', 9000), fake('near', 1000)]], 1);
  assert.deepEqual(
    out.map((r) => r.key),
    ['near']
  );
});

test('mergeReminders 處理空輸入', () => {
  assert.deepEqual(mergeReminders([]), []);
  assert.deepEqual(mergeReminders([[], []]), []);
});

test('collectCourseReminders key 各自唯一', () => {
  const out = collectCourseReminders(
    [
      course({ id: 'mon', weekday: 1 }),
      course({ id: 'wed', weekday: 3 }),
      course({ id: 'fri', weekday: 5 }),
    ],
    [semester],
    'u1',
    10,
    NOW
  );
  assert.equal(new Set(out.map((r) => r.key)).size, out.length);
});
