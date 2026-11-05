import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CourseEntry } from '../types';
import {
  NtutCourseRaw,
  backfillCourseMeta,
  parseCourseSelection,
  prepareCourses,
  toCourseEntries,
} from '../services/ntutCourse';

const mainRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures/main-115-1-mini.json'), 'utf8')
) as NtutCourseRaw[];

test('parseCourseSelection 解析北科課程好朋友的匯出', () => {
  const sel = parseCourseSelection('{"key":"my-couse-data-115-1","data":"[\\"362048\\",\\"362048\\"]","classData":"資工三"}');
  assert.equal(sel.semesterId, '115-1');
  assert.deepEqual(sel.courseIds, ['362048']);
  assert.equal(sel.className, '資工三');
  assert.throws(() => parseCourseSelection('not json'), /JSON/);
});

test('匯入的課程帶有類別符號、開課班級與備註', () => {
  const { prepared } = prepareCourses(mainRaw, ['362048', '366771', '363131']);
  const entries = toCourseEntries(prepared, 'u1', '115-1');
  const db = entries.find((e) => e.ntutCourseId === '362048');
  assert.equal(db?.ntutCourseType, '▲');
  assert.deepEqual(db?.ntutClassNames, ['資工三']);
  assert.equal(db?.credit, 3);
  const ge = entries.find((e) => e.ntutCourseId === '366771');
  assert.equal(ge?.ntutCourseType, '△');
  assert.deepEqual(ge?.ntutClassNames, ['博雅課程(一)']);
  assert.equal(ge?.ntutNotes, '人文與藝術向度');
  const pe = entries.find((e) => e.ntutCourseId === '363131');
  assert.equal(pe?.credit, undefined, '0 學分不顯示學分');
  assert.match(pe?.ntutNotes ?? '', /^請選/);
});

test('backfillCourseMeta 只補缺類別的匯入課,其餘不動', () => {
  const base = { title: 'x', weekday: 1, startPeriod: 0, endPeriod: 0, ownerId: 'u1', source: 'ntut' as const };
  const courses: CourseEntry[] = [
    { ...base, id: 'a', ntutCourseId: '362048' },
    { ...base, id: 'b', ntutCourseId: '366771', ntutCourseType: '★' },
    { ...base, id: 'c', ntutCourseId: '000000' },
    { ...base, id: 'd', source: undefined },
  ];
  const updated = backfillCourseMeta(courses, mainRaw);
  assert.deepEqual(updated.map((c) => c.id), ['a']);
  assert.equal(updated[0].ntutCourseType, '▲');
  assert.equal(updated[0].credit, 3);
  assert.deepEqual(updated[0].ntutClassNames, ['資工三']);
});
