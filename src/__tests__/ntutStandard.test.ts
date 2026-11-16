import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SemesterMeta } from '../types';
import {
  currentAcademicYear,
  extractDepartmentStandard,
  guessDepartments,
  guessFromTimetable,
  listSystems,
  normalizeCourseName,
  parseClassName,
  parseStandardIndex,
} from '../services/ntutStandard';

test('parseClassName 拆出系所前綴與年級', () => {
  assert.deepEqual(parseClassName('資工三'), { prefix: '資工', grade: 3 });
  assert.deepEqual(parseClassName('材資三甲'), { prefix: '材資', grade: 3 });
  assert.deepEqual(parseClassName('電資二'), { prefix: '電資', grade: 2 });
  assert.deepEqual(parseClassName('智動五'), { prefix: '智動', grade: 5 });
  assert.deepEqual(parseClassName('創新資安學位學程'), { prefix: '創新資安學位學程', grade: null });
  assert.equal(parseClassName(undefined), null);
  assert.equal(parseClassName('  '), null);
});

test('currentAcademicYear 以 8 月為新學年', () => {
  assert.equal(currentAcademicYear(new Date(2026, 10, 5)), 115);
  assert.equal(currentAcademicYear(new Date(2026, 7, 1)), 115);
  assert.equal(currentAcademicYear(new Date(2026, 2, 1)), 114);
});

const semesters: SemesterMeta[] = [
  { id: '114-1', startDate: '2025-09-15', endDate: '2026-01-16', className: '資工二' },
  { id: '115-1', startDate: '2026-09-15', endDate: '2027-01-16', className: '資工三' },
  { id: '113-2', startDate: '2025-02-16', endDate: '2025-06-30' },
];
const course = (semesterId: string, ownerId = 'u1') => ({
  id: `${semesterId}-${ownerId}`,
  title: 'x',
  weekday: 1,
  startPeriod: 0,
  endPeriod: 0,
  ownerId,
  semesterId,
});

test('guessFromTimetable 用最新學期的班級推入學年度', () => {
  const g = guessFromTimetable(semesters, [course('114-1'), course('115-1')], 'u1');
  assert.equal(g.entryYear, 113);
  assert.equal(g.prefix, '資工');
  assert.equal(g.className, '資工三');
});

test('guessFromTimetable 只看該成員有課的學期', () => {
  const g = guessFromTimetable(semesters, [course('114-1'), course('115-1', 'u2')], 'u1');
  assert.equal(g.entryYear, 113); // 114 − (2 − 1)
  assert.equal(g.className, '資工二');
});

test('guessFromTimetable 沒有課時仍用有班級的學期;完全沒有資料回傳 null', () => {
  assert.equal(guessFromTimetable(semesters, [], 'u1').entryYear, 113);
  assert.deepEqual(guessFromTimetable([], [], 'u1'), { entryYear: null, prefix: null });
});

const index = parseStandardIndex([
  { system: '學程', department: '軟工學程', division: '760', matric: '1' },
  { system: '四技', department: '資工系', division: '590', matric: '7' },
  { system: '四技', department: '電資學士班【資訊工程系】', division: '823', matric: '7' },
  { system: '碩士班', department: '資工所', division: '590', matric: '9' },
  { bad: true },
]);

test('parseStandardIndex 略過格式不符的列;listSystems 把四技排最前', () => {
  assert.equal(index.length, 4);
  assert.deepEqual(listSystems(index), ['四技', '學程', '碩士班']);
  assert.throws(() => parseStandardIndex([]), /空/);
  assert.throws(() => parseStandardIndex({}), /格式/);
});

test('guessDepartments 依前綴與學制篩選', () => {
  assert.deepEqual(
    guessDepartments(index, '四技', '資工').map((d) => d.department),
    ['資工系']
  );
  assert.deepEqual(
    guessDepartments(index, '四技', '電資').map((d) => d.department),
    ['電資學士班【資訊工程系】']
  );
  assert.deepEqual(guessDepartments(index, '四技', null), []);
});

test('normalizeCourseName 讓總表與課程標準的課名對得上', () => {
  assert.equal(normalizeCourseName('計算機程式設計 (一)'), normalizeCourseName('計算機程式設計(一)'));
  assert.equal(normalizeCourseName('實務專題（一）'), normalizeCourseName('實務專題(一)'));
  assert.equal(
    normalizeCourseName('學院指定向度 - 人文與藝術'),
    normalizeCourseName('學院指定向度-人文與藝術')
  );
  assert.equal(normalizeCourseName('JAVA技術與應用'), normalizeCourseName('Java 技術與應用'));
  assert.notEqual(normalizeCourseName('微積分'), normalizeCourseName('微積分(一)'));
});

const raw = {
  四技: {
    資工系: {
      credits: { 最低畢業學分數: '132', 校訂共同必修學分: '28', 空白: '' },
      division: '590',
      matric: '7',
      courses: [
        { year: '1', sem: '1', type: '△', name: '國文', credit: '2.0', hours: '2', stage: '1' },
        { year: '', sem: '', type: '▲', name: '  ', credit: '3.0', hours: '3', stage: '' },
        { year: '2', sem: '2', type: '▲', name: '機率', credit: '3.0', hours: '3', stage: '' },
      ],
      rules: [' 最低畢業學分:132 學分。', '', 42],
    },
  },
};

test('extractDepartmentStandard 整理學分、科目與規定', () => {
  const std = extractDepartmentStandard(raw, 115, '四技', '資工系', 7);
  assert.deepEqual(std.credits, { 最低畢業學分數: 132, 校訂共同必修學分: 28 });
  assert.equal(std.courses.length, 2);
  assert.deepEqual(std.courses[1], { year: 2, sem: 2, type: '▲', name: '機率', credit: 3, stage: '1' });
  assert.deepEqual(std.rules, ['最低畢業學分:132 學分。']);
  assert.equal(std.fetchedAt, 7);
  assert.equal(std.entryYear, 115);
});

test('extractDepartmentStandard 找不到學制或系所時說明清楚', () => {
  assert.throws(() => extractDepartmentStandard(raw, 115, '五專', '資工系'), /五專/);
  assert.throws(() => extractDepartmentStandard(raw, 115, '四技', '電機系'), /電機系/);
  assert.throws(() => extractDepartmentStandard([], 115, '四技', '資工系'), /格式/);
  assert.throws(
    () => extractDepartmentStandard({ 四技: { 空系: { credits: {}, courses: [] } } }, 115, '四技', '空系'),
    /空的/
  );
});
