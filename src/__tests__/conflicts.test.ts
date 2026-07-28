import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findConflicts,
  findEventClashes,
  freeGapsText,
  ownersOfEvent,
  slotOf,
  subtractIntervals,
  trimEventTimes,
} from '../services/conflicts';
import { CalendarEvent, CourseEntry, SemesterMeta } from '../types';
import { timeToMinutes } from '../utils/date';

/*
 * 日期對照(2026 年 7 月):
 *   07-06 週一 / 07-07 週二 / 07-08 週三 / 07-09 週四 / 07-10 週五
 *   07-11 週六 / 07-12 週日 / 07-13 週一
 * 節次:index 0 = 08:10–09:00,1 = 09:10–10:00,2 = 10:10–11:00,3 = 11:10–12:00
 */

const semester: SemesterMeta = {
  id: '115-1',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
};

const course = (over: Partial<CourseEntry> = {}): CourseEntry => ({
  id: 'c1',
  title: '演算法',
  weekday: 1, // 週一
  startPeriod: 0, // 08:10
  endPeriod: 1, // 至 10:00
  ownerId: 'u1',
  semesterId: '115-1',
  ...over,
});

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: '看牙醫',
  date: '2026-07-06', // 週一
  startTime: '09:00',
  endTime: '11:00',
  ownerId: 'u1',
  createdBy: 'u1',
  ...over,
});

test('ownersOfEvent 相容舊的單一 ownerId', () => {
  assert.deepEqual(ownersOfEvent(event()), ['u1']);
  assert.deepEqual(ownersOfEvent(event({ ownerIds: ['u1', 'u2'] })), ['u1', 'u2']);
  // ownerIds 為空陣列時退回 ownerId
  assert.deepEqual(ownersOfEvent(event({ ownerIds: [] })), ['u1']);
});

test('slotOf 由節次索引換算起訖分鐘', () => {
  const s = slotOf(course());
  assert.equal(s.startMin, timeToMinutes('08:10'));
  assert.equal(s.endMin, timeToMinutes('10:00'));
  assert.equal(s.weekday, 1);
});

test('slotOf 夾住超出範圍的結束節次', () => {
  const s = slotOf(course({ endPeriod: 99 }));
  assert.equal(s.endMin, timeToMinutes('21:40')); // 最後一節 C 的結束時刻
});

test('findEventClashes 找出與課程重疊的行程', () => {
  const clashes = findEventClashes(event(), [course()], [semester]);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].date, '2026-07-06');
  assert.equal(clashes[0].slot.course.title, '演算法');
});

test('findEventClashes 忽略沒有重疊的行程', () => {
  // 課 08:10–10:00,行程 10:30–11:30
  const clashes = findEventClashes(
    event({ startTime: '10:30', endTime: '11:30' }),
    [course()],
    [semester]
  );
  assert.equal(clashes.length, 0);
});

test('findEventClashes 對相鄰不重疊的時段不算衝突', () => {
  // 行程 10:00 開始,課剛好 10:00 結束 → 邊界相接不算重疊
  const clashes = findEventClashes(
    event({ startTime: '10:00', endTime: '11:00' }),
    [course()],
    [semester]
  );
  assert.equal(clashes.length, 0);
});

test('findEventClashes 忽略不同星期幾的課', () => {
  // 行程在週一,課在週三
  const clashes = findEventClashes(event(), [course({ weekday: 3 })], [semester]);
  assert.equal(clashes.length, 0);
});

test('findEventClashes 忽略其他成員的課', () => {
  const clashes = findEventClashes(event(), [course({ ownerId: 'u2' })], [semester]);
  assert.equal(clashes.length, 0);
});

test('findEventClashes 對共同行程比對每位擁有者的課', () => {
  const clashes = findEventClashes(
    event({ ownerIds: ['u1', 'u2'] }),
    [course({ ownerId: 'u2' })],
    [semester]
  );
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].ownerId, 'u2');
});

test('findEventClashes 只在學期範圍內生效', () => {
  const shortSem: SemesterMeta = { ...semester, startDate: '2026-09-01', endDate: '2026-12-31' };
  const clashes = findEventClashes(event(), [course()], [shortSem]);
  assert.equal(clashes.length, 0);
});

test('findEventClashes 讓未分類的課恆常生效', () => {
  // 沒有 semesterId 的舊資料/手動課程,不受學期起訖限制
  const clashes = findEventClashes(event(), [course({ semesterId: undefined })], []);
  assert.equal(clashes.length, 1);
});

test('findEventClashes 展開跨日行程的每一天', () => {
  // 週日到週二的跨日行程,應撞到週一的課
  const clashes = findEventClashes(
    event({ date: '2026-07-05', endDate: '2026-07-07', startTime: '18:00', endTime: '08:30' }),
    [course()],
    [semester]
  );
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].date, '2026-07-06'); // 中間整天都算佔用
});

test('findConflicts 掃出學期內所有重複發生的衝突', () => {
  // 每週一都有課;兩個不同週一的行程都該被抓到
  const events = [event({ id: 'a', date: '2026-07-06' }), event({ id: 'b', date: '2026-07-13' })];
  const out = findConflicts(events, [course()], semester, 'u1');
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((c) => c.event.id),
    ['a', 'b']
  );
  assert.equal(out[0].hits[0].date, '2026-07-06');
});

test('findConflicts 依日期時間排序', () => {
  const events = [
    event({ id: 'late', date: '2026-07-13' }),
    event({ id: 'early', date: '2026-07-06' }),
  ];
  const out = findConflicts(events, [course()], semester, 'u1');
  assert.deepEqual(
    out.map((c) => c.event.id),
    ['early', 'late']
  );
});

test('findEventClashes 不把整天事項算成衝突', () => {
  // 「繳學費」這種沒有時段的事情不該被判定成撞課
  const clashes = findEventClashes(
    event({ allDay: true, startTime: '00:00', endTime: '23:59' }),
    [course()],
    [semester]
  );
  assert.equal(clashes.length, 0);
});

test('findConflicts 略過整天事項', () => {
  const out = findConflicts(
    [event({ allDay: true, startTime: '00:00', endTime: '23:59' })],
    [course()],
    semester,
    'u1'
  );
  assert.equal(out.length, 0);
});

test('findConflicts 略過其他成員的行程', () => {
  const out = findConflicts([event({ ownerId: 'u2' })], [course()], semester, 'u1');
  assert.equal(out.length, 0);
});

test('findConflicts 略過完全落在學期外的行程', () => {
  const out = findConflicts([event({ date: '2026-06-01' })], [course()], semester, 'u1');
  assert.equal(out.length, 0);
});

test('subtractIntervals 從區間中挖掉占用時段', () => {
  // 09:00–12:00 扣掉 10:00–11:00 → 前後各剩一段
  const segs = subtractIntervals(540, 720, [{ startMin: 600, endMin: 660 }]);
  assert.deepEqual(segs, [
    { start: 540, end: 600 },
    { start: 660, end: 720 },
  ]);
});

test('subtractIntervals 丟棄短於 minLen 的碎片', () => {
  // 扣完只剩 09:00–09:05(5 分鐘),小於預設 10 分鐘門檻
  const segs = subtractIntervals(540, 660, [{ startMin: 545, endMin: 660 }]);
  assert.deepEqual(segs, []);
});

test('subtractIntervals 合併重疊的占用時段', () => {
  const segs = subtractIntervals(540, 720, [
    { startMin: 570, endMin: 630 },
    { startMin: 600, endMin: 660 }, // 與前一段重疊
  ]);
  assert.deepEqual(segs, [
    { start: 540, end: 570 },
    { start: 660, end: 720 },
  ]);
});

test('subtractIntervals 在完全被占用時回傳空陣列', () => {
  const segs = subtractIntervals(540, 660, [{ startMin: 500, endMin: 700 }]);
  assert.deepEqual(segs, []);
});

test('subtractIntervals 忽略區間外的占用', () => {
  const segs = subtractIntervals(540, 660, [{ startMin: 700, endMin: 800 }]);
  assert.deepEqual(segs, [{ start: 540, end: 660 }]);
});

test('trimEventTimes 截短行程讓出上課時間', () => {
  // 行程 09:00–11:00,課 08:10–10:00 → 只剩 10:00–11:00
  const ev = event();
  const hits = [{ date: '2026-07-06', slots: [slotOf(course())] }];
  assert.deepEqual(trimEventTimes(ev, hits), [{ start: '10:00', end: '11:00' }]);
});

test('trimEventTimes 在課排中間時把行程切成兩段', () => {
  // 行程 08:00–12:00,課 09:10–10:00 → 切成 08:00–09:10 與 10:00–12:00
  const ev = event({ startTime: '08:00', endTime: '12:00' });
  const hits = [
    { date: '2026-07-06', slots: [slotOf(course({ startPeriod: 1, endPeriod: 1 }))] },
  ];
  assert.deepEqual(trimEventTimes(ev, hits), [
    { start: '08:00', end: '09:10' },
    { start: '10:00', end: '12:00' },
  ]);
});

test('trimEventTimes 丟棄短於 15 分鐘的剩餘碎片', () => {
  // 行程 08:00–09:00,課 08:10 開始 → 只剩 10 分鐘,應被丟棄
  const ev = event({ startTime: '08:00', endTime: '09:00' });
  const hits = [{ date: '2026-07-06', slots: [slotOf(course())] }];
  assert.deepEqual(trimEventTimes(ev, hits), []);
});

test('trimEventTimes 不支援跨日行程', () => {
  const ev = event({ endDate: '2026-07-07' });
  const hits = [{ date: '2026-07-06', slots: [slotOf(course())] }];
  assert.equal(trimEventTimes(ev, hits), null);
});

test('freeGapsText 列出某平日的空堂', () => {
  // 週一只有 08:10–10:00 有課 → 空堂為 10:00–22:00(08:00–08:10 僅 10 分鐘,低於 30 分鐘門檻)
  const text = freeGapsText([course()], 1);
  assert.equal(text, '10:00–22:00');
});

test('freeGapsText 在整天無課時回傳完整區間', () => {
  assert.equal(freeGapsText([course()], 5), '08:00–22:00');
});
