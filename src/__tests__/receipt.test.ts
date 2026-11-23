import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEIPT_STEPS,
  RECEIPT_SYNC_LIMIT_BYTES,
  RECEIPT_TARGET_BYTES,
  acceptReceiptStep,
  expenseForSync,
  jpegDataUri,
  keepLocalReceipts,
  receiptResize,
  syncableReceipt,
} from '../services/receipt';
import { Expense } from '../types';

const expense = (id: string, receiptUri?: string): Expense => ({
  id,
  amount: 120,
  kind: 'expense',
  who: 'self',
  categoryId: 'food',
  date: '2026-11-23',
  payment: 'cash',
  createdBy: 'u1',
  ...(receiptUri === undefined ? {} : { receiptUri }),
});

/** 指定總長度的 data URI */
const dataUriOfLength = (length: number) => {
  const head = jpegDataUri('');
  return head + 'A'.repeat(length - head.length);
};

const FILE_URI = 'file:///var/mobile/Containers/Data/Application/X/Library/Caches/ImagePicker/a.jpg';

/* ───────────── 縮圖尺寸 ───────────── */

test('橫的照片縮寬、直的照片縮高,只指定長邊', () => {
  assert.deepEqual(receiptResize(4032, 3024, 1280), { width: 1280 });
  assert.deepEqual(receiptResize(3024, 4032, 1280), { height: 1280 });
});

test('正方形照片縮寬', () => {
  assert.deepEqual(receiptResize(3000, 3000, 1280), { width: 1280 });
});

test('長邊已經在上限內就不縮(不把小圖放大)', () => {
  assert.equal(receiptResize(1280, 960, 1280), null);
  assert.equal(receiptResize(600, 800, 1280), null);
});

test('不知道原圖尺寸時不縮', () => {
  assert.equal(receiptResize(0, 0, 1280), null);
  assert.equal(receiptResize(Number.NaN, 800, 1280), null);
});

test('壓縮階梯一階比一階小', () => {
  for (let i = 1; i < RECEIPT_STEPS.length; i++) {
    assert.ok(RECEIPT_STEPS[i].maxSide < RECEIPT_STEPS[i - 1].maxSide);
    assert.ok(RECEIPT_STEPS[i].compress <= RECEIPT_STEPS[i - 1].compress);
  }
});

test('目標大小遠低於 Firestore 單一文件 1MB 的上限', () => {
  assert.ok(RECEIPT_TARGET_BYTES < RECEIPT_SYNC_LIMIT_BYTES);
  assert.ok(RECEIPT_SYNC_LIMIT_BYTES < 1_048_576);
});

/* ───────────── 要不要再壓一階 ───────────── */

test('夠小就收下,不再往下壓', () => {
  assert.equal(acceptReceiptStep(dataUriOfLength(RECEIPT_TARGET_BYTES), 0), true);
});

test('太大就換下一階', () => {
  assert.equal(acceptReceiptStep(dataUriOfLength(RECEIPT_TARGET_BYTES + 1), 0), false);
});

test('最後一階無論如何都收下', () => {
  const last = RECEIPT_STEPS.length - 1;
  assert.equal(acceptReceiptStep(dataUriOfLength(RECEIPT_TARGET_BYTES + 1), last), true);
});

/* ───────────── 能不能寫上雲端 ───────────── */

test('大小在上限內的 data URI 可以同步', () => {
  const uri = dataUriOfLength(RECEIPT_SYNC_LIMIT_BYTES);
  assert.equal(syncableReceipt(uri), uri);
});

test('超過上限的 data URI 不同步', () => {
  assert.equal(syncableReceipt(dataUriOfLength(RECEIPT_SYNC_LIMIT_BYTES + 1)), undefined);
});

test('只在本機有意義的路徑不同步', () => {
  assert.equal(syncableReceipt(FILE_URI), undefined);
  assert.equal(syncableReceipt('content://media/external/images/media/42'), undefined);
  assert.equal(syncableReceipt('ph://ABCD-1234/L0/001'), undefined);
  assert.equal(syncableReceipt('blob:http://localhost:8081/1f0c-22aa'), undefined);
});

test('網址可以同步', () => {
  const url = 'https://example.com/receipts/a.jpg';
  assert.equal(syncableReceipt(url), url);
});

test('沒有收據就是沒有', () => {
  assert.equal(syncableReceipt(undefined), undefined);
  assert.equal(syncableReceipt(''), undefined);
});

/* ───────────── 寫上雲端的帳目 ───────────── */

test('收據可以同步時帳目原封不動(同一個物件)', () => {
  const e = expense('a', dataUriOfLength(5000));
  assert.equal(expenseForSync(e), e);
});

test('沒有收據的帳目原封不動', () => {
  const e = expense('a');
  assert.equal(expenseForSync(e), e);
});

test('本機路徑的收據不寫上雲端,其他欄位照舊', () => {
  const e = expense('a', FILE_URI);
  const out = expenseForSync(e);
  assert.equal('receiptUri' in out, false);
  assert.deepEqual(out, expense('a'));
  // 不改到本機那一筆
  assert.equal(e.receiptUri, FILE_URI);
});

test('超大的收據不寫上雲端,帳目仍然同步', () => {
  const out = expenseForSync(expense('a', dataUriOfLength(3_000_000)));
  assert.equal('receiptUri' in out, false);
  assert.equal(out.amount, 120);
});

/* ───────────── 雲端推回來時保住本機的收據 ───────────── */

test('雲端沒有收據、本機有上不了雲端的收據時補回去', () => {
  const big = dataUriOfLength(3_000_000);
  const merged = keepLocalReceipts(
    [expense('a'), expense('b')],
    [expense('a', FILE_URI), expense('b', big)]
  );
  assert.equal(merged[0].receiptUri, FILE_URI);
  assert.equal(merged[1].receiptUri, big);
});

test('雲端有收據時以雲端為準', () => {
  const remote = dataUriOfLength(5000);
  const merged = keepLocalReceipts([expense('a', remote)], [expense('a', FILE_URI)]);
  assert.equal(merged[0].receiptUri, remote);
});

test('本機的收據本來可以同步、雲端卻沒有,代表被拿掉了,不復活', () => {
  const merged = keepLocalReceipts([expense('a')], [expense('a', dataUriOfLength(5000))]);
  assert.equal(merged[0].receiptUri, undefined);
});

test('補收據時保留雲端那筆的其他欄位', () => {
  const remote = { ...expense('a'), amount: 999, note: '對方改過' };
  const merged = keepLocalReceipts([remote], [expense('a', FILE_URI)]);
  assert.equal(merged[0].amount, 999);
  assert.equal(merged[0].note, '對方改過');
  assert.equal(merged[0].receiptUri, FILE_URI);
});

test('本機沒有要保住的收據時直接回傳雲端清單', () => {
  const remote = [expense('a'), expense('b', dataUriOfLength(5000))];
  assert.equal(keepLocalReceipts(remote, [expense('a'), expense('b')]), remote);
});

test('雲端已刪掉的帳目不會因為本機有收據而跑回來', () => {
  const merged = keepLocalReceipts([expense('b')], [expense('a', FILE_URI), expense('b')]);
  assert.deepEqual(
    merged.map((e) => e.id),
    ['b']
  );
});

test('寫上去再推回來,本機的大張收據還在', () => {
  // 完整走一輪:本機 → expenseForSync → 雲端 → keepLocalReceipts → 本機
  const local = [expense('a', dataUriOfLength(3_000_000)), expense('b', dataUriOfLength(5000))];
  const cloud = local.map(expenseForSync);
  assert.deepEqual(keepLocalReceipts(cloud, local), local);
});
