import { beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelWebNotifications,
  hasWebPermission,
  requestWebPermission,
  scheduleWebNotifications,
  showWebNotification,
  TimedNotification,
} from '../services/webNotifications';

/*
 * webNotifications 直接使用瀏覽器的 Notification 全域物件,
 * 這裡用假的替身 + node:test 的假計時器,驗證排程與上限邏輯。
 */

interface Shown {
  title: string;
  body?: string;
}
let shown: Shown[] = [];
let permission = 'granted';

class FakeNotification {
  static get permission(): string {
    return permission;
  }
  static requestPermission = async (): Promise<string> => permission;
  constructor(title: string, opts?: { body?: string }) {
    shown.push({ title, body: opts?.body });
  }
}

const g = globalThis as Record<string, unknown>;
g.window = g.window ?? {};
g.Notification = FakeNotification;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const at = (msFromNow: number): Date => new Date(Date.now() + msFromNow);

const note = (key: string, msFromNow: number): TimedNotification => ({
  key,
  title: key,
  body: 'body',
  fireAt: at(msFromNow),
});

beforeEach(() => {
  shown = [];
  permission = 'granted';
  cancelWebNotifications('test');
  mock.timers.reset();
});

test('有權限時回報 granted', () => {
  assert.equal(hasWebPermission(), true);
});

test('權限被拒時不再詢問', async () => {
  permission = 'denied';
  assert.equal(hasWebPermission(), false);
  assert.equal(await requestWebPermission(), false);
});

test('已授權時直接回傳 true', async () => {
  assert.equal(await requestWebPermission(), true);
});

test('沒有權限時不送出通知', () => {
  permission = 'denied';
  showWebNotification('標題', '內容');
  assert.deepEqual(shown, []);
});

test('有權限時立即送出通知', () => {
  showWebNotification('標題', '內容');
  assert.deepEqual(shown, [{ title: '標題', body: '內容' }]);
});

test('沒有權限時不排程', () => {
  permission = 'denied';
  assert.equal(scheduleWebNotifications('test', [note('a', HOUR)]), 0);
});

test('提醒時間到了才送出', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const armed = scheduleWebNotifications('test', [note('a', 30 * MINUTE)]);
  assert.equal(armed, 1);

  mock.timers.tick(29 * MINUTE);
  // 用 length 而非 deepEqual:Node 的 deepEqual 型別是 asserts,會把 shown 收窄成 never[]
  assert.equal(shown.length, 0, '時間未到不應送出');

  mock.timers.tick(2 * MINUTE);
  assert.deepEqual(
    shown.map((s) => s.title),
    ['a']
  );
});

test('已過期的提醒不排程', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const armed = scheduleWebNotifications('test', [note('past', -HOUR)]);
  assert.equal(armed, 0);
  mock.timers.tick(HOUR);
  assert.deepEqual(shown, []);
});

test('超過 24 小時的提醒先不掛計時器', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  // setTimeout 對超長延遲不可靠,25 小時後的提醒應留到之後重掛
  const armed = scheduleWebNotifications('test', [note('far', 25 * HOUR)]);
  assert.equal(armed, 0, '不應計入這次掛上的則數');
});

test('超過 24 小時的提醒會在重掛時補上', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  scheduleWebNotifications('test', [note('far', 25 * HOUR)]);

  // 一小時後重掛:此時距離提醒剩 24 小時,仍在界線上
  mock.timers.tick(HOUR);
  assert.equal(shown.length, 0, '重掛當下不該送出');

  // 再往前推到提醒時刻
  mock.timers.tick(24 * HOUR);
  assert.deepEqual(
    shown.map((s) => s.title),
    ['far'],
    '重掛後應如期送出'
  );
});

test('同時有近期與遠期提醒時,近期照常送出', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const armed = scheduleWebNotifications('test', [
    note('soon', 10 * MINUTE),
    note('far', 48 * HOUR),
  ]);
  assert.equal(armed, 1, '只有近期那則算掛上');

  mock.timers.tick(11 * MINUTE);
  assert.deepEqual(
    shown.map((s) => s.title),
    ['soon']
  );
});

test('重新排程會清掉先前的計時器', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  scheduleWebNotifications('test', [note('old', 30 * MINUTE)]);
  scheduleWebNotifications('test', [note('new', 30 * MINUTE)]);

  mock.timers.tick(31 * MINUTE);
  assert.deepEqual(
    shown.map((s) => s.title),
    ['new'],
    '舊的那則不應再送出'
  );
});

test('取消後不再送出', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  scheduleWebNotifications('test', [note('a', 30 * MINUTE)]);
  cancelWebNotifications('test');

  mock.timers.tick(HOUR);
  assert.deepEqual(shown, []);
});

test('不同 tag 的排程互不影響', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  scheduleWebNotifications('test', [note('event', 30 * MINUTE)]);
  scheduleWebNotifications('other', [note('period', 30 * MINUTE)]);
  cancelWebNotifications('test');

  mock.timers.tick(HOUR);
  assert.deepEqual(
    shown.map((s) => s.title),
    ['period'],
    '取消一組不應影響另一組'
  );
  cancelWebNotifications('other');
});
