import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GoogleEvent,
  fromGoogleEvent,
  isFromGoogle,
  localIdFor,
  mergeGoogleEvents,
  syncSummary,
} from '../services/googleSync';
import { CalendarEvent } from '../types';

const OWNER = 'u1';

const g = (over: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: 'g1',
  status: 'confirmed',
  summary: '團隊會議',
  start: { dateTime: '2026-07-29T14:00:00+08:00' },
  end: { dateTime: '2026-07-29T15:30:00+08:00' },
  updated: '2026-07-28T10:00:00.000Z',
  ...over,
});

const local = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'local-1',
  title: '本機行程',
  date: '2026-07-29',
  startTime: '09:00',
  endTime: '10:00',
  ownerId: OWNER,
  createdBy: OWNER,
  ...over,
});

/* ---------- fromGoogleEvent ---------- */

test('轉換有時間的 Google 事件', () => {
  const ev = fromGoogleEvent(g(), OWNER);
  assert.ok(ev);
  assert.equal(ev.title, '團隊會議');
  assert.equal(ev.date, '2026-07-29');
  assert.equal(ev.startTime, '14:00');
  assert.equal(ev.endTime, '15:30');
  assert.equal(ev.allDay, undefined);
  assert.equal(ev.googleEventId, 'g1');
  assert.equal(ev.id, 'gcal:g1');
});

test('已取消的事件回傳 null', () => {
  assert.equal(fromGoogleEvent(g({ status: 'cancelled' }), OWNER), null);
});

test('缺少開始時間的事件回傳 null', () => {
  assert.equal(fromGoogleEvent(g({ start: undefined }), OWNER), null);
});

test('沒有標題時給預設文字', () => {
  const ev = fromGoogleEvent(g({ summary: undefined }), OWNER);
  assert.equal(ev?.title, '(無標題)');
});

test('整天事件的結束日要從排他換回閉區間', () => {
  // Google 的單日整天事件:start 7/29、end 7/30(排他)
  const ev = fromGoogleEvent(
    g({ start: { date: '2026-07-29' }, end: { date: '2026-07-30' } }),
    OWNER
  );
  assert.ok(ev);
  assert.equal(ev.allDay, true);
  assert.equal(ev.date, '2026-07-29');
  assert.equal(ev.endDate, undefined, '單日整天事件不該有 endDate');
});

test('跨日整天事件保留結束日', () => {
  // 7/29 至 7/31 的整天事件,Google 的 end.date 是 8/1
  const ev = fromGoogleEvent(
    g({ start: { date: '2026-07-29' }, end: { date: '2026-08-01' } }),
    OWNER
  );
  assert.equal(ev?.endDate, '2026-07-31');
});

test('跨月的整天事件換算正確', () => {
  const ev = fromGoogleEvent(
    g({ start: { date: '2026-07-30' }, end: { date: '2026-08-01' } }),
    OWNER
  );
  assert.equal(ev?.endDate, '2026-07-31');
});

test('跨日的有時間事件保留結束日', () => {
  const ev = fromGoogleEvent(
    g({
      start: { dateTime: '2026-07-29T22:00:00+08:00' },
      end: { dateTime: '2026-07-30T02:00:00+08:00' },
    }),
    OWNER
  );
  assert.equal(ev?.date, '2026-07-29');
  assert.equal(ev?.endDate, '2026-07-30');
  assert.equal(ev?.startTime, '22:00');
  assert.equal(ev?.endTime, '02:00');
});

test('備註帶入 notes', () => {
  const ev = fromGoogleEvent(g({ description: '會議室 A' }), OWNER);
  assert.equal(ev?.notes, '會議室 A');
});

test('空白備註視為未設定', () => {
  assert.equal(fromGoogleEvent(g({ description: '   ' }), OWNER)?.notes, undefined);
});

test('updated 轉成 epoch 毫秒', () => {
  const ev = fromGoogleEvent(g({ updated: '2026-07-28T10:00:00.000Z' }), OWNER);
  assert.equal(ev?.updatedAt, Date.UTC(2026, 6, 28, 10, 0, 0));
});

test('匯入的行程標記為要同步回 Google', () => {
  assert.equal(fromGoogleEvent(g(), OWNER)?.syncToGoogle, true);
});

test('isFromGoogle 依 id 前綴判斷', () => {
  assert.equal(isFromGoogle(local({ id: localIdFor('g1') })), true);
  assert.equal(isFromGoogle(local()), false);
});

/* ---------- mergeGoogleEvents ---------- */

test('新的 Google 事件會被加進來', () => {
  const r = mergeGoogleEvents([], [g()], OWNER);
  assert.equal(r.added, 1);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].title, '團隊會議');
});

test('本機沒有的事件不會影響既有行程', () => {
  const mine = local();
  const r = mergeGoogleEvents([mine], [g()], OWNER);
  assert.equal(r.events.length, 2);
  assert.ok(r.events.some((e) => e.id === 'local-1'));
});

test('比對依據是 googleEventId 而非本機 id', () => {
  // 本機建立後推上去的行程,id 是 uid() 而不是 gcal: 開頭
  const pushed = local({ id: 'my-own-id', googleEventId: 'g1', updatedAt: 1000 });
  const r = mergeGoogleEvents([pushed], [g()], OWNER);
  assert.equal(r.added, 0);
  assert.equal(r.updated, 1);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].id, 'my-own-id', '應沿用本機 id,不要產生重複行程');
});

test('Google 較新時採用 Google 版本', () => {
  const older = local({ id: 'x', googleEventId: 'g1', title: '舊標題', updatedAt: 1000 });
  const r = mergeGoogleEvents([older], [g({ updated: '2026-07-28T10:00:00.000Z' })], OWNER);
  assert.equal(r.events[0].title, '團隊會議');
  assert.equal(r.updated, 1);
});

test('本機較新時保留本機版本', () => {
  const newer = local({
    id: 'x',
    googleEventId: 'g1',
    title: '本機剛改的',
    updatedAt: Date.UTC(2026, 6, 28, 23, 0, 0),
  });
  const r = mergeGoogleEvents([newer], [g({ updated: '2026-07-28T10:00:00.000Z' })], OWNER);
  assert.equal(r.keptLocal, 1);
  assert.equal(r.updated, 0);
  assert.equal(r.events[0].title, '本機剛改的');
});

test('本機沒有時間戳時採用 Google 版本', () => {
  // 沒有 updatedAt 代表是還沒被新版程式改過的舊資料,不該壓過 Google
  const noStamp = local({ id: 'x', googleEventId: 'g1', title: '舊資料', updatedAt: undefined });
  const r = mergeGoogleEvents([noStamp], [g()], OWNER);
  assert.equal(r.events[0].title, '團隊會議');
});

test('Google 端刪除會移除本機那一筆', () => {
  const existing = local({ id: 'x', googleEventId: 'g1' });
  const r = mergeGoogleEvents([existing], [g({ status: 'cancelled' })], OWNER);
  assert.equal(r.removed, 1);
  assert.equal(r.events.length, 0);
});

test('Google 刪除本機沒有的事件不算移除', () => {
  const r = mergeGoogleEvents([local()], [g({ status: 'cancelled' })], OWNER);
  assert.equal(r.removed, 0);
  assert.equal(r.events.length, 1);
});

test('更新時保留 Google 沒有的本機欄位', () => {
  // 標籤、提醒、優先順序在 Google 沒有對應,不該因為同步而消失
  const existing = local({
    id: 'x',
    googleEventId: 'g1',
    updatedAt: 1000,
    tags: ['重要'],
    priority: 'high',
    remindMinutesBefore: 30,
    doneDates: ['2026-07-29'],
  });
  const r = mergeGoogleEvents([existing], [g()], OWNER);
  const merged = r.events[0];
  assert.deepEqual(merged.tags, ['重要']);
  assert.equal(merged.priority, 'high');
  assert.equal(merged.remindMinutesBefore, 30);
  assert.deepEqual(merged.doneDates, ['2026-07-29']);
  assert.equal(merged.title, '團隊會議', '來自 Google 的欄位仍要更新');
});

test('更新時保留本機的擁有者設定', () => {
  const existing = local({
    id: 'x',
    googleEventId: 'g1',
    updatedAt: 1000,
    ownerId: 'u2',
    ownerIds: ['u1', 'u2'],
  });
  const r = mergeGoogleEvents([existing], [g()], OWNER);
  assert.deepEqual(r.events[0].ownerIds, ['u1', 'u2']);
});

test('一次處理多筆變更', () => {
  const existing = [
    local({ id: 'a', googleEventId: 'g1', updatedAt: 1000 }),
    local({ id: 'b', googleEventId: 'g2', updatedAt: 1000 }),
    local({ id: 'c' }),
  ];
  const remote = [
    g({ id: 'g1', summary: '更新過' }),
    g({ id: 'g2', status: 'cancelled' }),
    g({ id: 'g3', summary: '全新的' }),
  ];
  const r = mergeGoogleEvents(existing, remote, OWNER);
  assert.equal(r.updated, 1);
  assert.equal(r.removed, 1);
  assert.equal(r.added, 1);
  assert.deepEqual(
    r.events.map((e) => e.id).sort(),
    ['a', 'c', 'gcal:g3']
  );
});

test('空的遠端清單不改動任何東西', () => {
  const existing = [local({ id: 'a' }), local({ id: 'b' })];
  const r = mergeGoogleEvents(existing, [], OWNER);
  assert.deepEqual(r.events, existing);
  assert.equal(r.added + r.updated + r.removed, 0);
});

/* ---------- syncSummary ---------- */

test('沒有變更時的摘要', () => {
  assert.equal(syncSummary({ events: [], added: 0, updated: 0, removed: 0, keptLocal: 0 }), '沒有變更');
});

test('摘要列出各類數量', () => {
  const s = syncSummary({ events: [], added: 2, updated: 1, removed: 3, keptLocal: 1 });
  assert.match(s, /新增 2 筆/);
  assert.match(s, /更新 1 筆/);
  assert.match(s, /移除 3 筆/);
  assert.match(s, /保留本機較新的 1 筆/);
});
