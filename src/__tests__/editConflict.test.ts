import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectConflict, diffEvents, isStale, stampFrom } from '../services/editConflict';
import { CalendarEvent } from '../types';

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: '看牙醫',
  date: '2026-07-29',
  startTime: '14:00',
  endTime: '15:00',
  ownerId: 'u1',
  createdBy: 'u1',
  updatedAt: 1000,
  ...over,
});

const nameOf = (id: string) => ({ u1: '我', u2: '伴侶' })[id] ?? id;

const labels = (d: { label: string }[]): string[] => d.map((x) => x.label);

/* ---------- diffEvents ---------- */

test('相同的兩版沒有差異', () => {
  assert.deepEqual(diffEvents(event(), event(), nameOf), []);
});

test('列出標題差異', () => {
  const d = diffEvents(event({ title: '看牙醫' }), event({ title: '看眼科' }), nameOf);
  assert.deepEqual(d, [{ label: '標題', mine: '看牙醫', theirs: '看眼科' }]);
});

test('列出時間差異', () => {
  const d = diffEvents(event(), event({ startTime: '16:00', endTime: '17:00' }), nameOf);
  assert.deepEqual(labels(d), ['時間']);
  assert.equal(d[0].mine, '14:00–15:00');
  assert.equal(d[0].theirs, '16:00–17:00');
});

test('整天事項的時間顯示為整天', () => {
  const d = diffEvents(event({ allDay: true }), event(), nameOf);
  assert.equal(d[0].mine, '整天');
});

test('跨日行程顯示日期範圍', () => {
  const d = diffEvents(event({ endDate: '2026-07-31' }), event(), nameOf);
  assert.equal(d[0].label, '日期');
  assert.equal(d[0].mine, '7月29日 → 7月31日');
  assert.equal(d[0].theirs, '7月29日');
});

test('成員差異以名稱顯示', () => {
  const d = diffEvents(event({ ownerIds: ['u1', 'u2'] }), event({ ownerIds: ['u2'] }), nameOf);
  assert.deepEqual(labels(d), ['成員']);
  assert.equal(d[0].mine, '我、伴侶');
  assert.equal(d[0].theirs, '伴侶');
});

test('未設定的欄位顯示為未設定', () => {
  const d = diffEvents(event({ notes: '記得帶健保卡' }), event(), nameOf);
  assert.deepEqual(labels(d), ['備註']);
  assert.equal(d[0].theirs, '(未設定)');
});

test('空白備註視同未設定', () => {
  assert.deepEqual(diffEvents(event({ notes: '   ' }), event(), nameOf), []);
});

test('一次列出多個欄位的差異', () => {
  const d = diffEvents(
    event({ title: 'A', notes: '備註', priority: 'high' }),
    event({ title: 'B' }),
    nameOf
  );
  assert.deepEqual(labels(d).sort(), ['備註', '優先順序', '標題']);
});

test('重複與提醒的差異用中文標籤', () => {
  const d = diffEvents(
    event({ recurrence: { freq: 'weekly' }, remindMinutesBefore: 30 }),
    event(),
    nameOf
  );
  const byLabel = Object.fromEntries(d.map((x) => [x.label, x]));
  assert.equal(byLabel['重複'].mine, '每週');
  assert.equal(byLabel['提醒'].mine, '30 分鐘前');
});

/* ---------- detectConflict ---------- */

test('新增行程不會有衝突', () => {
  const r = detectConflict(event({ updatedAt: undefined }), undefined, undefined, nameOf);
  assert.equal(r.kind, 'none');
});

test('沒有人動過時沒有衝突', () => {
  const r = detectConflict(event({ title: '改過的標題' }), 1000, event({ updatedAt: 1000 }), nameOf);
  assert.equal(r.kind, 'none');
});

test('對方改過同一筆時回報 modified', () => {
  const r = detectConflict(
    event({ title: '我改的' }),
    1000,
    event({ title: '對方改的', updatedAt: 2000 }),
    nameOf
  );
  assert.equal(r.kind, 'modified');
  assert.deepEqual(labels(r.diffs), ['標題']);
  assert.equal(r.theirs?.title, '對方改的');
});

test('對方刪掉那一筆時回報 deleted', () => {
  const r = detectConflict(event(), 1000, undefined, nameOf);
  assert.equal(r.kind, 'deleted');
});

test('對方改的結果與我要存的一致時不打擾', () => {
  // 兩人改成一樣的內容,時間戳不同但結果相同 → 沒必要跳衝突
  const r = detectConflict(
    event({ title: '一樣的標題' }),
    1000,
    event({ title: '一樣的標題', updatedAt: 2000 }),
    nameOf
  );
  assert.equal(r.kind, 'none');
});

test('舊資料沒有時間戳時不誤報衝突', () => {
  // 既有資料沒有 updatedAt,無從判斷,不該對每一次存檔都跳警告
  const r = detectConflict(event({ title: '我改的' }), undefined, event({ updatedAt: undefined }), nameOf);
  assert.equal(r.kind, 'none');
});

test('baseline 有時間戳但對方那版沒有時,不誤報', () => {
  const r = detectConflict(event(), 1000, event({ updatedAt: undefined }), nameOf);
  assert.equal(r.kind, 'none');
});

/* ---------- stampFrom ---------- */

test('stampFrom 帶上對方的時間戳', () => {
  const out = stampFrom(event({ updatedAt: 1000 }), event({ updatedAt: 2000 }));
  assert.equal(out.updatedAt, 2000);
});

test('stampFrom 在沒有對方版本時原樣回傳', () => {
  const mine = event({ updatedAt: 1000 });
  assert.equal(stampFrom(mine, undefined).updatedAt, 1000);
});

/* ---------- isStale ---------- */

test('isStale 在時間戳不同時為真', () => {
  assert.equal(isStale(1000, 2000), true);
});

test('isStale 在時間戳相同時為假', () => {
  assert.equal(isStale(1000, 1000), false);
});

test('isStale 在任一邊缺時間戳時為假', () => {
  assert.equal(isStale(undefined, 2000), false);
  assert.equal(isStale(1000, undefined), false);
});
