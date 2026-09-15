import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_CARDS,
  MODULES,
  moveItem,
  navSlot,
  normalizeHomeCards,
  normalizeNavModules,
  splitNav,
  visibleHomeCards,
} from '../services/navigation';
import { HomeCardPref, ModuleKey } from '../types';

/* ── 導覽列 ───────────────────────────────────────────── */

test('normalizeNavModules 未設定時給全部模組', () => {
  assert.deepEqual(
    normalizeNavModules(undefined),
    MODULES.map((m) => m.key)
  );
});

test('normalizeNavModules 保留使用者選的順序', () => {
  assert.deepEqual(normalizeNavModules(['expense', 'calendar']), ['expense', 'calendar']);
});

test('normalizeNavModules 去掉不認得的鍵與重複', () => {
  const raw = ['expense', 'ghost', 'expense', 'period'] as unknown as ModuleKey[];
  assert.deepEqual(normalizeNavModules(raw), ['expense', 'period']);
});

test('normalizeNavModules 截到 4 個', () => {
  const raw: ModuleKey[] = ['calendar', 'expense', 'period', 'timetable'];
  assert.equal(normalizeNavModules([...raw, 'calendar']).length, 4);
});

test('normalizeNavModules 全被濾掉時退回預設,不會給空導覽列', () => {
  const raw = ['ghost'] as unknown as ModuleKey[];
  assert.equal(normalizeNavModules(raw).length, MODULES.length);
});

test('normalizeNavModules 空陣列也退回預設', () => {
  assert.equal(normalizeNavModules([]).length, MODULES.length);
});

test('navSlot 從 1 起算,不在導覽列上是 0', () => {
  const mods: ModuleKey[] = ['calendar', 'expense'];
  assert.equal(navSlot(mods, 'calendar'), 1);
  assert.equal(navSlot(mods, 'expense'), 2);
  assert.equal(navSlot(mods, 'period'), 0);
});

test('splitNav 在 4 個時左右各 2', () => {
  assert.deepEqual(splitNav(['calendar', 'expense', 'period', 'timetable']), {
    left: ['calendar', 'expense'],
    right: ['period', 'timetable'],
  });
});

test('splitNav 在 3 個時左 2 右 1', () => {
  assert.deepEqual(splitNav(['calendar', 'expense', 'period']), {
    left: ['calendar', 'expense'],
    right: ['period'],
  });
});

test('splitNav 在 1 個時右邊是空的', () => {
  assert.deepEqual(splitNav(['calendar']), { left: ['calendar'], right: [] });
});

/* ── Home 卡片 ────────────────────────────────────────── */

test('normalizeHomeCards 未設定時給全部卡片與各自的預設開關', () => {
  const out = normalizeHomeCards(undefined);
  assert.equal(out.length, HOME_CARDS.length);
  assert.deepEqual(
    out.filter((c) => c.on).map((c) => c.key),
    ['course', 'period', 'events', 'expense']
  );
});

test('normalizeHomeCards 沿用使用者的順序', () => {
  const raw: HomeCardPref[] = [
    { key: 'expense', on: true },
    { key: 'course', on: false },
  ];
  const out = normalizeHomeCards(raw);
  assert.deepEqual(out.slice(0, 2), raw);
});

test('normalizeHomeCards 把新版本才有的卡片補在後面', () => {
  const raw: HomeCardPref[] = [{ key: 'course', on: true }];
  const out = normalizeHomeCards(raw);
  assert.equal(out.length, HOME_CARDS.length);
  assert.equal(out[0].key, 'course');
  // 補進來的沿用自己的預設值,而不是一律開啟
  assert.equal(out.find((c) => c.key === 'tomorrow')?.on, false);
});

test('normalizeHomeCards 丟掉不認得的鍵與重複', () => {
  const raw = [
    { key: 'ghost', on: true },
    { key: 'course', on: true },
    { key: 'course', on: false },
  ] as unknown as HomeCardPref[];
  const out = normalizeHomeCards(raw);
  assert.equal(out.filter((c) => c.key === 'course').length, 1);
  assert.equal(out.length, HOME_CARDS.length);
});

test('visibleHomeCards 只給開著的,並保持順序', () => {
  // 沒列到的卡片會被補在後面並沿用自己的預設值,所以這裡把全部都寫出來
  const raw: HomeCardPref[] = [
    { key: 'expense', on: true },
    { key: 'course', on: false },
    { key: 'events', on: true },
    { key: 'period', on: false },
    { key: 'tomorrow', on: false },
    { key: 'monthExpense', on: false },
  ];
  assert.deepEqual(visibleHomeCards(raw), ['expense', 'events']);
});

test('visibleHomeCards 會顯示後來補進來、預設開啟的新卡片', () => {
  const raw: HomeCardPref[] = [{ key: 'expense', on: true }];
  // course / period / events 沒被存過,補進來時是預設開啟
  assert.deepEqual(visibleHomeCards(raw), ['expense', 'course', 'period', 'events']);
});

test('visibleHomeCards 全部關掉時是空的', () => {
  const raw: HomeCardPref[] = HOME_CARDS.map((c) => ({ key: c.key, on: false }));
  assert.deepEqual(visibleHomeCards(raw), []);
});

/* ── 排序 ─────────────────────────────────────────────── */

test('moveItem 往前移一格', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 1), ['a', 'c', 'b']);
});

test('moveItem 往後移一格', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
});

test('moveItem 超出範圍或原地不動時原樣回傳', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(moveItem(list, 0, 0), list);
  assert.equal(moveItem(list, -1, 1), list);
  assert.equal(moveItem(list, 0, 9), list);
});

test('moveItem 不改動原本的陣列', () => {
  const list = ['a', 'b', 'c'];
  moveItem(list, 0, 2);
  assert.deepEqual(list, ['a', 'b', 'c']);
});
