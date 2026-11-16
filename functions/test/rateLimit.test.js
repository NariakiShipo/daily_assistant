const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextRateWindow } = require('../rateLimit');

const LIMIT = { windowMs: 10 * 60_000, max: 3 };
const T0 = Date.UTC(2026, 10, 5, 8, 0, 0);

test('第一次呼叫開新視窗', () => {
  assert.deepEqual(nextRateWindow(null, T0, LIMIT), {
    allowed: true,
    state: { windowStart: T0, count: 1 },
    retryAfterMs: 0,
  });
});

test('視窗內累加,到上限就擋,並告知還要等多久', () => {
  let state = null;
  for (let i = 0; i < 3; i++) {
    const r = nextRateWindow(state, T0 + i * 1000, LIMIT);
    assert.equal(r.allowed, true);
    state = r.state;
  }
  const blocked = nextRateWindow(state, T0 + 60_000, LIMIT);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 9 * 60_000);
  // 被擋的那次不算數
  assert.deepEqual(blocked.state, { windowStart: T0, count: 3 });
});

test('視窗過了就重新計算', () => {
  const r = nextRateWindow({ windowStart: T0, count: 3 }, T0 + LIMIT.windowMs, LIMIT);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.state, { windowStart: T0 + LIMIT.windowMs, count: 1 });
});

test('壞掉的紀錄或時鐘倒退都當成新視窗', () => {
  assert.equal(nextRateWindow({ windowStart: 'x', count: 99 }, T0, LIMIT).allowed, true);
  assert.equal(nextRateWindow({ windowStart: T0 + 60_000, count: 99 }, T0, LIMIT).allowed, true);
});
