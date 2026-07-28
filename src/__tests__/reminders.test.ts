import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectEventReminders } from '../services/reminders';
import { CalendarEvent, TAG_DONE } from '../types';

/** 固定的「現在」:2026-07-06(週一)08:00 */
const NOW = new Date(2026, 6, 6, 8, 0, 0, 0);

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: '社課',
  date: '2026-07-06',
  startTime: '19:00',
  endTime: '21:00',
  ownerId: 'u1',
  createdBy: 'u1',
  ...over,
});

const keys = (list: { key: string }[]): string[] => list.map((r) => r.key);

test('沒有設定提醒的行程不排程', () => {
  assert.deepEqual(collectEventReminders([event()], NOW), []);
});

test('設定提醒後排在開始前指定的分鐘數', () => {
  const out = collectEventReminders([event({ remindMinutesBefore: 30 })], NOW);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].fireAt, new Date(2026, 6, 6, 18, 30));
  assert.equal(out[0].eventId, 'e1');
  assert.equal(out[0].date, '2026-07-06');
});

test('提醒設 0 分鐘時準時送出', () => {
  const out = collectEventReminders([event({ remindMinutesBefore: 0 })], NOW);
  assert.deepEqual(out[0].fireAt, new Date(2026, 6, 6, 19, 0));
});

test('前一天提醒會跨到前一天送出', () => {
  const out = collectEventReminders(
    [event({ date: '2026-07-08', remindMinutesBefore: 1440 })],
    NOW
  );
  assert.deepEqual(out[0].fireAt, new Date(2026, 6, 7, 19, 0));
});

test('提醒時刻已過的不排程', () => {
  // 今天 07:00 開始的行程,提醒設 30 分鐘前 → 06:30 已經過了
  const out = collectEventReminders(
    [event({ startTime: '07:00', endTime: '08:00', remindMinutesBefore: 30 })],
    NOW
  );
  assert.deepEqual(out, []);
});

test('提醒時刻剛好等於現在時不排程', () => {
  // 08:30 開始、30 分鐘前提醒 → 剛好是 08:00(= now)
  const out = collectEventReminders(
    [event({ startTime: '08:30', endTime: '09:00', remindMinutesBefore: 30 })],
    NOW
  );
  assert.deepEqual(out, []);
});

test('已完成的行程不再提醒', () => {
  const out = collectEventReminders(
    [event({ remindMinutesBefore: 30, tags: [TAG_DONE] })],
    NOW
  );
  assert.deepEqual(out, []);
});

test('重複行程的每一次都排提醒', () => {
  const out = collectEventReminders(
    [event({ remindMinutesBefore: 30, recurrence: { freq: 'weekly' } })],
    NOW,
    { horizonDays: 21 }
  );
  assert.deepEqual(keys(out), [
    'e1@2026-07-06',
    'e1@2026-07-13',
    'e1@2026-07-20',
    'e1@2026-07-27',
  ]);
});

test('重複行程中已完成的那一次不提醒', () => {
  const out = collectEventReminders(
    [
      event({
        remindMinutesBefore: 30,
        recurrence: { freq: 'weekly' },
        doneDates: ['2026-07-13'],
      }),
    ],
    NOW,
    { horizonDays: 21 }
  );
  assert.deepEqual(keys(out), ['e1@2026-07-06', 'e1@2026-07-20', 'e1@2026-07-27']);
});

test('重複行程中被跳過的那一次不提醒', () => {
  const out = collectEventReminders(
    [
      event({
        remindMinutesBefore: 30,
        recurrence: { freq: 'weekly', exceptions: ['2026-07-13'] },
      }),
    ],
    NOW,
    { horizonDays: 21 }
  );
  assert.deepEqual(keys(out), ['e1@2026-07-06', 'e1@2026-07-20', 'e1@2026-07-27']);
});

test('超過地平線的行程不排程', () => {
  const out = collectEventReminders(
    [event({ date: '2026-09-01', remindMinutesBefore: 30 })],
    NOW,
    { horizonDays: 30 }
  );
  assert.deepEqual(out, []);
});

test('依提醒時刻由近到遠排序', () => {
  const out = collectEventReminders(
    [
      event({ id: 'late', date: '2026-07-20', remindMinutesBefore: 30 }),
      event({ id: 'soon', date: '2026-07-06', remindMinutesBefore: 30 }),
      event({ id: 'mid', date: '2026-07-10', remindMinutesBefore: 30 }),
    ],
    NOW
  );
  assert.deepEqual(
    out.map((r) => r.eventId),
    ['soon', 'mid', 'late']
  );
});

test('超過上限時只保留最近的幾則', () => {
  // 每天重複 + 上限 5 → 只留最近 5 天
  const out = collectEventReminders(
    [event({ remindMinutesBefore: 30, recurrence: { freq: 'daily' } })],
    NOW,
    { horizonDays: 30, max: 5 }
  );
  assert.equal(out.length, 5);
  assert.deepEqual(keys(out), [
    'e1@2026-07-06',
    'e1@2026-07-07',
    'e1@2026-07-08',
    'e1@2026-07-09',
    'e1@2026-07-10',
  ]);
});

test('提醒不會超過 iOS 的通知上限', () => {
  // 三個每日重複行程 = 90 天份,預設上限應把總數壓在 40 以內
  const out = collectEventReminders(
    [
      event({ id: 'a', remindMinutesBefore: 30, recurrence: { freq: 'daily' } }),
      event({ id: 'b', startTime: '10:00', remindMinutesBefore: 30, recurrence: { freq: 'daily' } }),
      event({ id: 'c', startTime: '12:00', remindMinutesBefore: 30, recurrence: { freq: 'daily' } }),
    ],
    NOW
  );
  assert.equal(out.length, 40);
});

test('整天事項的提醒以早上 9 點為基準', () => {
  // 從半夜提醒沒有意義,應改用 09:00
  const out = collectEventReminders(
    [
      event({
        date: '2026-07-10',
        allDay: true,
        startTime: '00:00',
        endTime: '23:59',
        remindMinutesBefore: 0,
      }),
    ],
    NOW
  );
  assert.deepEqual(out[0].fireAt, new Date(2026, 6, 10, 9, 0));
});

test('整天事項的前一天提醒落在前一天早上 9 點', () => {
  const out = collectEventReminders(
    [
      event({
        date: '2026-07-10',
        allDay: true,
        startTime: '00:00',
        endTime: '23:59',
        remindMinutesBefore: 1440,
      }),
    ],
    NOW
  );
  assert.deepEqual(out[0].fireAt, new Date(2026, 6, 9, 9, 0));
});

test('整天事項的通知內文寫整天而非時間範圍', () => {
  const out = collectEventReminders(
    [
      event({
        date: '2026-07-10',
        allDay: true,
        startTime: '00:00',
        endTime: '23:59',
        remindMinutesBefore: 0,
      }),
    ],
    NOW
  );
  assert.equal(out[0].body, '7月10日 整天');
});

test('key 讓每一次發生各自唯一', () => {
  const out = collectEventReminders(
    [event({ remindMinutesBefore: 30, recurrence: { freq: 'weekly' } })],
    NOW,
    { horizonDays: 21 }
  );
  assert.equal(new Set(keys(out)).size, out.length);
});

test('通知文字帶出提醒時機與行程時間', () => {
  const out = collectEventReminders([event({ remindMinutesBefore: 30 })], NOW);
  assert.equal(out[0].title, '⏰ 30 分鐘前:社課');
  assert.equal(out[0].body, '7月6日 19:00–21:00');
});

test('準時提醒的文字不寫成 0 分鐘前', () => {
  const out = collectEventReminders([event({ remindMinutesBefore: 0 })], NOW);
  assert.equal(out[0].title, '⏰ 準時:社課');
});
