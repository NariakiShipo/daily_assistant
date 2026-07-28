import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncErrorMessage } from '../services/syncError';

/** 模擬 Firestore 丟出的錯誤 */
const err = (code: string, message = '') => Object.assign(new Error(message), { code });

test('權限不足時指出可能是空間已鎖定', () => {
  const m = syncErrorMessage('刪除課程', err('permission-denied'));
  assert.match(m, /刪除課程失敗/);
  assert.match(m, /鎖定為帳號存取/);
});

test('Firestore 的完整錯誤碼也能對應', () => {
  // 實際丟出的 code 常帶前綴,例如 'firestore/permission-denied'
  const m = syncErrorMessage('刪除行程', err('firestore/permission-denied'));
  assert.match(m, /寫入權限/);
});

test('連線問題提示檢查網路', () => {
  assert.match(syncErrorMessage('刪除課程', err('unavailable')), /連不上雲端/);
  assert.match(syncErrorMessage('刪除課程', err('deadline-exceeded')), /連不上雲端/);
});

test('資料不存在時提示可能已被對方刪除', () => {
  assert.match(syncErrorMessage('刪除課程', err('not-found')), /已被對方刪除/);
});

test('登入過期時提示重新登入', () => {
  assert.match(syncErrorMessage('刪除課程', err('unauthenticated')), /重新登入/);
});

test('未知錯誤碼仍帶出代碼與訊息,方便回報', () => {
  const m = syncErrorMessage('刪除課程', err('resource-exhausted', '配額用盡'));
  assert.match(m, /resource-exhausted/);
  assert.match(m, /配額用盡/);
});

test('沒有錯誤碼時退回訊息內容', () => {
  const m = syncErrorMessage('刪除課程', new Error('網路斷了'));
  assert.equal(m, '刪除課程失敗:網路斷了');
});

test('完全沒有資訊時給通用說明', () => {
  assert.equal(syncErrorMessage('刪除課程', {}), '刪除課程失敗,請再試一次。');
  assert.equal(syncErrorMessage('刪除課程', null), '刪除課程失敗,請再試一次。');
});

test('動作名稱會帶進訊息', () => {
  assert.match(syncErrorMessage('刪除經期紀錄', err('unavailable')), /^刪除經期紀錄失敗/);
});
