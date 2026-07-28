import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  excludeOccurrence,
  expandEvent,
  expandEvents,
  findSeries,
  isInstance,
  seriesIdOf,
  toggleOccurrenceDone,
} from '../services/recurrence';
import { CalendarEvent, RecurrenceFreq, TAG_DONE } from '../types';

/*
 * 日期對照(2026 年 7 月):07-06 週一、07-13 週一、07-20 週一、07-27 週一
 */

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

const repeating = (freq: RecurrenceFreq, over: Partial<CalendarEvent> = {}): CalendarEvent =>
  event({ recurrence: { freq }, ...over });

const dates = (list: { date: string }[]): string[] => list.map((e) => e.date);

test('非重複行程與範圍重疊時原樣回傳', () => {
  const ev = event();
  const out = expandEvent(ev, '2026-07-01', '2026-07-31');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'e1');
  assert.equal(out[0].seriesId, undefined);
  assert.equal(isInstance(out[0]), false);
});

test('非重複行程落在範圍外時不回傳', () => {
  assert.deepEqual(expandEvent(event(), '2026-08-01', '2026-08-31'), []);
});

test('每週重複展開出範圍內的每一次', () => {
  const out = expandEvent(repeating('weekly'), '2026-07-01', '2026-07-31');
  assert.deepEqual(dates(out), ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']);
});

test('每兩週重複跳過中間那一週', () => {
  const out = expandEvent(repeating('biweekly'), '2026-07-01', '2026-07-31');
  assert.deepEqual(dates(out), ['2026-07-06', '2026-07-20']);
});

test('每天重複展開整個範圍', () => {
  const out = expandEvent(repeating('daily'), '2026-07-06', '2026-07-10');
  assert.deepEqual(dates(out), [
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
    '2026-07-10',
  ]);
});

test('每月重複保持同一個日期號數', () => {
  const out = expandEvent(repeating('monthly'), '2026-07-01', '2026-10-31');
  assert.deepEqual(dates(out), ['2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06']);
});

test('每月重複跳過沒有該日期的月份', () => {
  // 1 月 31 日:2 月沒有 31 日,應跳過而不是夾到 2/28
  const out = expandEvent(
    repeating('monthly', { date: '2026-01-31' }),
    '2026-01-01',
    '2026-05-31'
  );
  assert.deepEqual(dates(out), ['2026-01-31', '2026-03-31', '2026-05-31']);
});

test('展開的實例帶有指回原始行程的 seriesId', () => {
  const out = expandEvent(repeating('weekly'), '2026-07-01', '2026-07-31');
  for (const inst of out) {
    assert.equal(inst.seriesId, 'e1');
    assert.equal(seriesIdOf(inst), 'e1');
    assert.equal(isInstance(inst), true);
  }
});

test('實例 id 各自唯一', () => {
  const out = expandEvent(repeating('weekly'), '2026-07-01', '2026-07-31');
  const ids = new Set(out.map((e) => e.id));
  assert.equal(ids.size, out.length);
  assert.equal(out[0].id, 'e1@2026-07-06');
});

test('until 之後不再重複', () => {
  const ev = event({ recurrence: { freq: 'weekly', until: '2026-07-15' } });
  const out = expandEvent(ev, '2026-07-01', '2026-07-31');
  assert.deepEqual(dates(out), ['2026-07-06', '2026-07-13']);
});

test('exceptions 裡的日期會被跳過', () => {
  const ev = event({ recurrence: { freq: 'weekly', exceptions: ['2026-07-13', '2026-07-27'] } });
  const out = expandEvent(ev, '2026-07-01', '2026-07-31');
  assert.deepEqual(dates(out), ['2026-07-06', '2026-07-20']);
});

test('第一次發生之前的範圍不展開任何實例', () => {
  const out = expandEvent(repeating('weekly'), '2026-06-01', '2026-06-30');
  assert.deepEqual(out, []);
});

test('查詢很久以後的範圍仍能正確對齊', () => {
  // 起點在 2026-07-06(週一),隔年 1 月查詢應仍落在週一
  const out = expandEvent(repeating('weekly'), '2027-01-01', '2027-01-31');
  assert.deepEqual(dates(out), ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
});

test('跨日的重複行程每次都保留原本的天數', () => {
  // 週五到週日的兩天行程,每週重複
  const ev = event({ date: '2026-07-03', endDate: '2026-07-05', recurrence: { freq: 'weekly' } });
  const out = expandEvent(ev, '2026-07-01', '2026-07-20');
  assert.deepEqual(dates(out), ['2026-07-03', '2026-07-10', '2026-07-17']);
  assert.equal(out[1].endDate, '2026-07-12');
  assert.equal(out[2].endDate, '2026-07-19');
});

test('跨日的重複行程在只與範圍尾端重疊時仍被涵蓋', () => {
  // 行程 07-03 開始、持續 3 天;查詢範圍從 07-05 開始 → 該次仍與範圍重疊
  const ev = event({ date: '2026-07-03', endDate: '2026-07-05', recurrence: { freq: 'weekly' } });
  const out = expandEvent(ev, '2026-07-05', '2026-07-06');
  assert.deepEqual(dates(out), ['2026-07-03']);
});

test('expandEvents 依日期與時間排序', () => {
  const out = expandEvents(
    [
      event({ id: 'b', date: '2026-07-08', startTime: '08:00' }),
      repeating('weekly', { id: 'a' }),
    ],
    '2026-07-01',
    '2026-07-31'
  );
  assert.deepEqual(dates(out), [
    '2026-07-06',
    '2026-07-08',
    '2026-07-13',
    '2026-07-20',
    '2026-07-27',
  ]);
});

test('expandEvents 同一天內依開始時間排序', () => {
  const out = expandEvents(
    [
      event({ id: 'late', startTime: '15:00', endTime: '16:00' }),
      event({ id: 'early', startTime: '09:00', endTime: '10:00' }),
    ],
    '2026-07-01',
    '2026-07-31'
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ['early', 'late']
  );
});

test('doneDates 讓完成狀態逐次獨立', () => {
  const ev = event({ recurrence: { freq: 'weekly' }, doneDates: ['2026-07-13'] });
  const out = expandEvent(ev, '2026-07-01', '2026-07-31');
  const doneFlags = out.map((e) => !!e.tags?.includes(TAG_DONE));
  assert.deepEqual(doneFlags, [false, true, false, false]);
});

test('doneDates 不影響行程本身的其他標籤', () => {
  const ev = event({
    recurrence: { freq: 'weekly' },
    tags: ['工作'],
    doneDates: ['2026-07-06'],
  });
  const out = expandEvent(ev, '2026-07-01', '2026-07-14');
  assert.deepEqual(out[0].tags, ['工作', TAG_DONE]);
  assert.deepEqual(out[1].tags, ['工作']);
});

test('原始行程上殘留的完成標籤不會污染每一次', () => {
  // 一般行程被設為重複之後,舊的「完成」標籤不應讓所有次數都變成已完成
  const ev = event({ recurrence: { freq: 'weekly' }, tags: [TAG_DONE] });
  const out = expandEvent(ev, '2026-07-01', '2026-07-14');
  assert.equal(out.every((e) => !e.tags?.includes(TAG_DONE)), true);
});

test('toggleOccurrenceDone 只切換指定日期', () => {
  const ev = event({ recurrence: { freq: 'weekly' } });
  const marked = toggleOccurrenceDone(ev, '2026-07-13');
  assert.deepEqual(marked.doneDates, ['2026-07-13']);
  const unmarked = toggleOccurrenceDone(marked, '2026-07-13');
  assert.equal(unmarked.doneDates, undefined);
});

test('excludeOccurrence 只跳過指定的那一次', () => {
  const ev = event({ recurrence: { freq: 'weekly' } });
  const updated = excludeOccurrence(ev, '2026-07-13');
  assert.ok(updated);
  assert.deepEqual(updated.recurrence?.exceptions, ['2026-07-13']);
  const out = expandEvent(updated, '2026-07-01', '2026-07-31');
  assert.deepEqual(dates(out), ['2026-07-06', '2026-07-20', '2026-07-27']);
});

test('excludeOccurrence 一併清掉該次的完成狀態', () => {
  const ev = event({ recurrence: { freq: 'weekly' }, doneDates: ['2026-07-13', '2026-07-20'] });
  const updated = excludeOccurrence(ev, '2026-07-13');
  assert.deepEqual(updated?.doneDates, ['2026-07-20']);
});

test('excludeOccurrence 對非重複行程回傳 null', () => {
  assert.equal(excludeOccurrence(event(), '2026-07-06'), null);
});

test('findSeries 由實例找回原始行程', () => {
  const ev = repeating('weekly');
  const inst = expandEvent(ev, '2026-07-01', '2026-07-31')[2];
  assert.equal(inst.id, 'e1@2026-07-20');
  assert.equal(findSeries([ev], inst)?.id, 'e1');
});

test('findSeries 對非重複行程也能運作', () => {
  const ev = event();
  const inst = expandEvent(ev, '2026-07-01', '2026-07-31')[0];
  assert.equal(findSeries([ev], inst)?.id, 'e1');
});

test('無限期的每天重複不會失控展開', () => {
  // 沒有 until,查一整年 → 應被 MAX_OCCURRENCES 擋住而不是無窮迴圈
  const out = expandEvent(repeating('daily'), '2026-07-06', '2027-07-06');
  assert.ok(out.length <= 400, `展開 ${out.length} 筆,應受上限保護`);
  assert.ok(out.length > 300, '一年份的每日行程應展開出數百筆');
});
