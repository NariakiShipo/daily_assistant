const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEventPush, isSameContent, targetTokens } = require('../pushMessage');

const NOW = Date.UTC(2026, 6, 28, 10, 0, 0);

const ev = (over = {}) => ({
  id: 'e1',
  title: '看牙醫',
  date: '2026-07-29',
  startTime: '14:00',
  endTime: '15:00',
  ownerId: 'u1',
  createdBy: 'u1',
  updatedAt: NOW - 1000,
  ...over,
});

/* ---------- 什麼時候不該推 ---------- */

test('批次重寫的舊時間戳不推播', () => {
  // 登入時 uploadLocal 會整批重寫所有行程並保留原本的 updatedAt,
  // 不擋掉的話對方會被幾十則推播洗版
  const r = buildEventPush(null, ev({ updatedAt: NOW - 86400_000 }), NOW);
  assert.equal(r.send, false);
  assert.equal(r.reason, 'stale-write');
});

test('沒有時間戳的舊資料不推播', () => {
  const r = buildEventPush(null, ev({ updatedAt: undefined }), NOW);
  assert.equal(r.send, false);
  assert.equal(r.reason, 'no-timestamp');
});

test('時間戳遠在未來時不推播', () => {
  const r = buildEventPush(null, ev({ updatedAt: NOW + 86400_000 }), NOW);
  assert.equal(r.send, false);
  assert.equal(r.reason, 'clock-skew');
});

test('內容沒有實際變更時不推播', () => {
  const before = ev({ updatedAt: NOW - 5000 });
  const after = ev({ updatedAt: NOW - 1000 });
  const r = buildEventPush(before, after, NOW);
  assert.equal(r.send, false);
  assert.equal(r.reason, 'no-change');
});

test('前後都沒有資料時不推播', () => {
  assert.equal(buildEventPush(null, null, NOW).send, false);
});

/* ---------- 什麼時候該推 ---------- */

test('新增行程會推播', () => {
  const r = buildEventPush(null, ev(), NOW);
  assert.equal(r.send, true);
  assert.equal(r.title, '新增了行程');
  assert.equal(r.body, '2026-07-29 14:00 看牙醫');
});

test('修改行程會推播', () => {
  const r = buildEventPush(ev(), ev({ title: '看眼科' }), NOW);
  assert.equal(r.send, true);
  assert.equal(r.title, '行程有更新');
  assert.match(r.body, /看眼科/);
});

test('刪除行程會推播,且不受時間戳新舊影響', () => {
  // 刪除一定是使用者操作,不會來自批次重寫
  const r = buildEventPush(ev({ updatedAt: NOW - 86400_000 }), null, NOW);
  assert.equal(r.send, true);
  assert.equal(r.title, '行程已刪除');
});

test('整天事項的內文寫整天而非時間', () => {
  const r = buildEventPush(null, ev({ allDay: true }), NOW);
  assert.equal(r.body, '2026-07-29 整天 看牙醫');
});

test('tag 以行程 id 為準,連續變更會覆蓋前一則通知', () => {
  const r = buildEventPush(null, ev(), NOW);
  assert.equal(r.tag, 'event:e1');
});

test('帶出改動來源的裝置', () => {
  const r = buildEventPush(null, ev({ updatedByDevice: 'd-abc' }), NOW);
  assert.equal(r.fromDevice, 'd-abc');
});

/* ---------- isSameContent ---------- */

test('只有中繼資料不同不算變更', () => {
  const a = ev({ updatedAt: 1, updatedByDevice: 'd-1' });
  const b = ev({ updatedAt: 2, updatedByDevice: 'd-2' });
  assert.equal(isSameContent(a, b), true);
});

test('看得見的欄位不同就算變更', () => {
  assert.equal(isSameContent(ev(), ev({ startTime: '16:00' })), false);
  assert.equal(isSameContent(ev(), ev({ notes: '記得帶健保卡' })), false);
  assert.equal(isSameContent(ev(), ev({ tags: ['重要'] })), false);
  assert.equal(isSameContent(ev(), ev({ allDay: true })), false);
});

test('重複行程逐次完成狀態的變更算變更', () => {
  assert.equal(isSameContent(ev(), ev({ doneDates: ['2026-07-29'] })), false);
});

/* ---------- targetTokens ---------- */

test('排除改動來源的裝置', () => {
  const devices = [
    { id: 'd-me', token: 't-me' },
    { id: 'd-partner', token: 't-partner' },
  ];
  assert.deepEqual(targetTokens(devices, 'd-me'), ['t-partner']);
});

test('沒有來源裝置時全部都送', () => {
  const devices = [
    { id: 'd-1', token: 't-1' },
    { id: 'd-2', token: 't-2' },
  ];
  assert.deepEqual(targetTokens(devices, undefined), ['t-1', 't-2']);
});

test('略過沒有 token 的紀錄', () => {
  const devices = [{ id: 'd-1' }, { id: 'd-2', token: 't-2' }];
  assert.deepEqual(targetTokens(devices, undefined), ['t-2']);
});

test('重複的 token 只送一次', () => {
  // 同一台裝置換過 deviceId 但 token 相同時,不該收到兩則
  const devices = [
    { id: 'd-1', token: 'same' },
    { id: 'd-2', token: 'same' },
  ];
  assert.deepEqual(targetTokens(devices, undefined), ['same']);
});

test('只有自己一台裝置時不送', () => {
  assert.deepEqual(targetTokens([{ id: 'd-me', token: 't-me' }], 'd-me'), []);
});
