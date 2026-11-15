import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  NtutCourseRaw,
  describeNtutSyncError,
  prepareCourse,
  prepareCourses,
  termId,
  toCourseEntries,
  validatePortalResult,
} from '../services/ntutCourse';
import { UNSCHEDULED_WEEKDAY } from '../constants/timetable';

/*
 * 節次索引(PERIOD_SLOTS):0~3 = 1~4 節、4 = 中午(北科的 N)、5~9 = 5~9 節、10~12 = A~C
 * 北科的 D 節超出課表範圍。
 */

/**
 * 契約測試:直接拿後端的解析器(functions/ntut.js)讀同一份測試頁,
 * 確認後端吐出的格式,前端轉得進課表。兩邊分開部署,格式飄掉時這裡會先壞。
 * (npm test 從專案根目錄執行;編譯後的測試在 .test-build/ 底下,不能用相對路徑)
 */
const root = process.cwd();
const { parseTimetable } = require(path.join(root, 'functions', 'ntut.js')) as {
  parseTimetable: (html: string) => { courses: NtutCourseRaw[] };
};
const portalCourses = parseTimetable(
  fs.readFileSync(path.join(root, 'functions', 'test', 'fixtures', 'select-timetable.html'), 'utf8')
).courses;
const prepared = portalCourses.map(prepareCourse);
const byTitle = (title: string) => {
  const p = prepared.find((c) => c.title === title);
  assert.ok(p, `找不到 ${title}`);
  return p;
};

test('入口網站的課程:同一門課分在兩天,切成兩段', () => {
  const os = byTitle('作業系統');
  assert.equal(os.courseId, '348921');
  assert.equal(os.credit, 3);
  assert.equal(os.teacher, '陳志明');
  assert.equal(os.location, '六教327');
  assert.deepEqual(os.runs, [
    { weekday: 1, start: 2, end: 3 },
    { weekday: 3, start: 1, end: 1 },
  ]);
  assert.deepEqual(os.skipped, []);
});

test('入口網站的課程:多間教室、多位老師用頓號串起來', () => {
  assert.equal(byTitle('演算法').location, '三教205、資工館304');
  assert.deepEqual(byTitle('演算法').runs, [{ weekday: 3, start: 5, end: 7 }]);
  assert.equal(byTitle('微處理機實驗').teacher, '吳俊宏、劉佳穎');
});

test('入口網站的課程:中午 N 節、晚上 A~C 節對到課表,D 節與週末列為無法排入', () => {
  assert.deepEqual(byTitle('班週會及導師時間').runs, [{ weekday: 2, start: 4, end: 4 }]);
  assert.deepEqual(byTitle('英文簡報').runs, [{ weekday: 1, start: 10, end: 11 }]);

  const night = byTitle('創意設計&實作');
  assert.deepEqual(night.runs, [{ weekday: 5, start: 12, end: 12 }]);
  assert.deepEqual(night.skipped, ['週五 第D節(超出課表節次)']);

  const sat = byTitle('服務學習');
  assert.deepEqual(sat.runs, []);
  assert.deepEqual(sat.skipped, ['週六 第1,2節(課表不含週末)']);
  assert.equal(sat.credit, undefined); // 0 學分不計
});

test('轉成課表項目:沒有課號的班週會不寫 ntutCourseId,沒有時間的課放無時段欄', () => {
  const entries = toCourseEntries(
    [byTitle('班週會及導師時間'), byTitle('實務專題(一)')],
    'u1',
    '115-1'
  );
  assert.equal(entries.length, 2);
  const [meeting, project] = entries;
  assert.equal(meeting.ntutCourseId, undefined);
  assert.equal(meeting.source, 'ntut');
  assert.equal(meeting.semesterId, '115-1');
  assert.equal(meeting.weekday, 2);
  assert.equal(project.ntutCourseId, '348940');
  assert.equal(project.weekday, UNSCHEDULED_WEEKDAY);
});

test('北科課程好朋友 JSON:依課號挑課,找不到的列出來', () => {
  const { prepared: got, missing } = prepareCourses(portalCourses, ['348921', '000000']);
  assert.deepEqual(
    got.map((p) => p.title),
    ['作業系統']
  );
  assert.deepEqual(missing, ['000000']);
});

/* ---------- 後端回傳檢查 ---------- */

const okResult = () => ({
  student: { id: '110590099', name: '林小狐', className: '資工三' },
  semester: { year: 115, sem: 1 },
  semesters: [
    { year: 115, sem: 1 },
    { year: 114, sem: 2 },
  ],
  courses: portalCourses,
  withdrawn: ['影像處理'],
});

test('後端回傳:格式正確就原樣通過,缺 withdrawn 補空陣列', () => {
  assert.deepEqual(validatePortalResult(okResult()), okResult());
  const { withdrawn: _omit, ...older } = okResult();
  assert.deepEqual(validatePortalResult(older).withdrawn, []);
  assert.equal(termId({ year: 115, sem: 1 }), '115-1');
});

test('後端回傳:格式不符就明確報錯,不讓半套資料進課表', () => {
  const bad: unknown[] = [
    null,
    'oops',
    { ...okResult(), semester: { year: '115', sem: 1 } },
    { ...okResult(), courses: [{ id: 1, name: { zh: 'x' }, time: {} }] },
    { ...okResult(), semesters: undefined },
    { ...okResult(), student: {} },
  ];
  for (const b of bad) assert.throws(() => validatePortalResult(b), /格式不符/);
});

/* ---------- 錯誤訊息 ---------- */

test('錯誤訊息:後端帶 reason 時用後端的中文,再補一句下一步', () => {
  assert.equal(
    describeNtutSyncError({
      code: 'functions/permission-denied',
      message: '帳號或密碼錯誤,請重新輸入!',
      details: { reason: 'wrong-credentials' },
    }),
    '帳號或密碼錯誤,請重新輸入!\n請確認輸入的是北科入口網站的帳號(學號)與密碼。'
  );
  assert.equal(
    describeNtutSyncError({
      code: 'functions/resource-exhausted',
      message: '嘗試太多次了,請 9 分鐘後再試。',
      details: { reason: 'rate-limited' },
    }),
    '嘗試太多次了,請 9 分鐘後再試。'
  );
});

test('錯誤訊息:callable 自己的錯誤要翻成人話', () => {
  // 函式沒部署:Firebase SDK 給的 message 只是代碼本身
  assert.match(describeNtutSyncError({ code: 'functions/not-found', message: 'NOT_FOUND' }), /部署 Functions/);
  assert.match(describeNtutSyncError({ code: 'functions/internal', message: 'internal' }), /連不上/);
  assert.match(describeNtutSyncError({ code: 'functions/deadline-exceeded', message: 'deadline-exceeded' }), /太久/);
  assert.match(describeNtutSyncError({ code: 'functions/unauthenticated', message: 'unauthenticated' }), /登入帳號/);
  // 後端 requireUid 的中文訊息直接用
  assert.equal(
    describeNtutSyncError({ code: 'functions/unauthenticated', message: '請先登入 Daily Bear 帳號。' }),
    '請先登入 Daily Bear 帳號。'
  );
});

test('錯誤訊息:一般 Error 與奇怪的輸入', () => {
  assert.equal(describeNtutSyncError(new Error('網路斷了')), '網路斷了');
  assert.match(describeNtutSyncError(null), /同步失敗/);
  assert.match(describeNtutSyncError({ code: 'functions/aborted', message: 'aborted' }), /aborted/);
});
