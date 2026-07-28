import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAG_UNDONE,
  filterEvents,
  matchesOwner,
  matchesQuery,
  matchesTag,
  ownersOf,
} from '../services/eventFilter';
import { CalendarEvent, TAG_DONE } from '../types';

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: '看牙醫',
  date: '2026-07-06',
  startTime: '09:00',
  endTime: '10:00',
  ownerId: 'u1',
  createdBy: 'u1',
  ...over,
});

const ids = (list: CalendarEvent[]): string[] => list.map((e) => e.id);

test('ownersOf 相容舊的單一 ownerId', () => {
  assert.deepEqual(ownersOf(event()), ['u1']);
  assert.deepEqual(ownersOf(event({ ownerIds: ['u1', 'u2'] })), ['u1', 'u2']);
  assert.deepEqual(ownersOf(event({ ownerIds: [] })), ['u1']);
});

test('空關鍵字一律命中', () => {
  assert.equal(matchesQuery(event(), ''), true);
  assert.equal(matchesQuery(event(), '   '), true);
});

test('關鍵字比對標題', () => {
  assert.equal(matchesQuery(event(), '牙醫'), true);
  assert.equal(matchesQuery(event(), '看牙'), true);
  assert.equal(matchesQuery(event(), '健身'), false);
});

test('關鍵字比對備註', () => {
  const ev = event({ notes: '記得帶健保卡' });
  assert.equal(matchesQuery(ev, '健保'), true);
  assert.equal(matchesQuery(ev, '護照'), false);
});

test('關鍵字比對標籤', () => {
  const ev = event({ tags: ['重要', '家庭'] });
  assert.equal(matchesQuery(ev, '家庭'), true);
});

test('關鍵字不分大小寫', () => {
  const ev = event({ title: 'Team Meeting' });
  assert.equal(matchesQuery(ev, 'team'), true);
  assert.equal(matchesQuery(ev, 'MEETING'), true);
});

test('關鍵字前後空白會被忽略', () => {
  assert.equal(matchesQuery(event(), '  牙醫  '), true);
});

test('沒有備註或標籤時不會出錯', () => {
  assert.equal(matchesQuery(event(), '任何字'), false);
});

test('標籤篩選比對指定標籤', () => {
  const ev = event({ tags: ['工作'] });
  assert.equal(matchesTag(ev, '工作'), true);
  assert.equal(matchesTag(ev, '家庭'), false);
});

test('未設定標籤條件時全部命中', () => {
  assert.equal(matchesTag(event(), null), true);
  assert.equal(matchesTag(event(), undefined), true);
});

test('未完成是虛擬標籤,比對的是沒有完成標籤', () => {
  assert.equal(matchesTag(event(), TAG_UNDONE), true);
  assert.equal(matchesTag(event({ tags: [TAG_DONE] }), TAG_UNDONE), false);
  assert.equal(matchesTag(event({ tags: ['工作'] }), TAG_UNDONE), true);
});

test('成員篩選比對所有擁有者', () => {
  const shared = event({ ownerIds: ['u1', 'u2'] });
  assert.equal(matchesOwner(shared, 'u1'), true);
  assert.equal(matchesOwner(shared, 'u2'), true);
  assert.equal(matchesOwner(shared, 'u3'), false);
});

test('未設定成員條件時全部命中', () => {
  assert.equal(matchesOwner(event(), null), true);
});

test('filterEvents 同時套用所有條件', () => {
  const list = [
    event({ id: 'a', title: '看牙醫', ownerId: 'u1', tags: ['重要'] }),
    event({ id: 'b', title: '看電影', ownerId: 'u1', tags: ['重要'] }),
    event({ id: 'c', title: '看牙醫', ownerId: 'u2', tags: ['重要'] }),
    event({ id: 'd', title: '看牙醫', ownerId: 'u1', tags: ['工作'] }),
  ];
  assert.deepEqual(ids(filterEvents(list, { query: '牙醫', ownerId: 'u1', tag: '重要' })), ['a']);
});

test('filterEvents 沒有條件時原樣回傳', () => {
  const list = [event({ id: 'a' }), event({ id: 'b' })];
  assert.deepEqual(ids(filterEvents(list, {})), ['a', 'b']);
});

test('filterEvents 搭配未完成篩掉已完成的行程', () => {
  const list = [
    event({ id: 'done', tags: [TAG_DONE] }),
    event({ id: 'todo' }),
    event({ id: 'partial', tags: ['工作'] }),
  ];
  assert.deepEqual(ids(filterEvents(list, { tag: TAG_UNDONE })), ['todo', 'partial']);
});

test('filterEvents 全部條件都不符時回傳空陣列', () => {
  assert.deepEqual(filterEvents([event()], { query: '不存在的字' }), []);
});

test('filterEvents 保留輸入的擴充欄位', () => {
  // 泛型應保留 EventInstance 之類的額外欄位
  const list = [{ ...event(), seriesId: 's1' }];
  const out = filterEvents(list, { query: '牙醫' });
  assert.equal(out[0].seriesId, 's1');
});
