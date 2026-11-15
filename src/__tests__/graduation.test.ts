import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CourseEntry, GraduationPlan, GraduationStandard } from '../types';
import { extractDepartmentStandard } from '../services/ntutStandard';
import { NtutCourseRaw, prepareCourses, toCourseEntries } from '../services/ntutCourse';
import {
  checkRequiredCourses,
  classifyCourse,
  computeGraduation,
  courseKey,
  defaultPlan,
  geRequirementOf,
  groupRequiredByTerm,
  groupTakenCourses,
  isOwnDepartment,
  isPlaceholderCourse,
  ruleHints,
} from '../services/graduation';

/*
 * fixtures 來自北科課程好朋友的真實資料(115 學年度資工系課程標準、115-1 課程總表精簡版)。
 * 課號對照:
 *   363135 △ 國文 2        363134 △ 大學入門與工程倫理 1   363131 △ 體育 0(資工一占位,請選體育室)
 *   366466 △ 體育 0(體育專項,實際課)  366323 △ 專業英文-機電(一) 2(大一學院專業英文)
 *   366771 △ 生活美學 2(人文與藝術)  366773 △ 法學概論 2(社會與法治)  366777 △ 創業概論 2(創新與創業)
 *   366392 △ Python 程式設計概論與應用 2(自然與科學)
 *   362045 △ 學生自選向度 2(占位)     366437 ☆ 全民國防教育 1    362047 ☆ 體育 1(資工三)
 *   363137 ▲ 微積分 3  363138 ▲ 計算機概論 3  363139 ▲ 線性代數 3  363140 ▲ 數位邏輯設計 3
 *   363141 ▲ 計算機程式設計(一) 3  362048 ▲ 資料庫系統 3
 *   364888 ★ 資訊安全 3  364892 ★ 機器學習 3  362052 ★ 專題討論 1
 *   361536 ★ 電力系統(一) 3(電機三甲,他系)
 */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures', name), 'utf8'));
const standard = extractDepartmentStandard(fixture('standard-115-csie.json'), 115, '四技', '資工系', 0);
const mainRaw = fixture('main-115-1-mini.json') as NtutCourseRaw[];

/** 以真實總表的課號產生匯入課程 */
const imported = (ids: string[], semesterId: string, ownerId = 'u1'): CourseEntry[] => {
  const { prepared, missing } = prepareCourses(mainRaw, ids);
  assert.deepEqual(missing, [], `fixture 缺課號 ${missing.join(',')}`);
  return toCourseEntries(prepared, ownerId, semesterId);
};

const planWith = (over: Partial<GraduationPlan> = {}): GraduationPlan => ({
  ...defaultPlan('u1', 0),
  standard,
  ownClassPrefixes: ['資工'],
  ...over,
});

const bucket = (s: ReturnType<typeof computeGraduation>, cat: string) => {
  const b = s.buckets.find((x) => x.category === cat);
  assert.ok(b, `缺 bucket ${cat}`);
  return b;
};

test('課程標準:學分門檻與科目表解析正確', () => {
  assert.equal(standard.credits['最低畢業學分數'], 132);
  assert.equal(standard.credits['校訂共同必修學分'], 28);
  assert.equal(standard.credits['校訂專業必修學分'], 64);
  assert.equal(standard.credits['專業選修學分'], 20);
  assert.equal(standard.credits['跨域及自由選修學分'], 20);
  assert.equal(standard.courses.length, 161);
  assert.deepEqual(standard.courses[0], {
    year: 1,
    sem: 1,
    type: '△',
    name: '體育',
    credit: 0,
    stage: '1/4',
  });
  assert.ok(standard.rules.some((r) => r.startsWith('最低畢業學分')));
});

test('博雅門檻由科目表的向度列推出:15 學分、三個指定向度各 4、超修至多認列 4', () => {
  const ge = geRequirementOf(standard);
  assert.equal(ge.total, 15);
  assert.equal(ge.freeCap, 4);
  assert.deepEqual(
    ge.designated.map((d) => `${d.dimension}:${d.credits}`).sort(),
    ['人文與藝術:4', '創新與創業:4', '社會與法治:4']
  );
});

test('博雅門檻:舊課程標準沒有向度列時改從規定文字抓', () => {
  const old: GraduationStandard = {
    ...standard,
    courses: standard.courses.filter((c) => !c.name.includes('向度')),
    rules: ['通識博雅課程應修滿 20 學分。'],
  };
  const ge = geRequirementOf(old);
  assert.equal(ge.total, 20);
  assert.equal(ge.freeCap, 0);
  assert.deepEqual(ge.designated, []);
});

test('同課號的多個時段合併成一門課', () => {
  const base = { title: '微積分', weekday: 1, startPeriod: 0, endPeriod: 1, ownerId: 'u1' };
  const list: CourseEntry[] = [
    { ...base, id: 'a', ntutCourseId: '1', credit: 3, ntutCourseType: '▲', semesterId: '115-1' },
    { ...base, id: 'b', ntutCourseId: '1', credit: 3, weekday: 3, semesterId: '115-1' },
    { ...base, id: 'c', title: '別人的課', ntutCourseId: '2', ownerId: 'u2' },
  ];
  const taken = groupTakenCourses(list, 'u1');
  assert.equal(taken.length, 1);
  assert.equal(taken[0].entries.length, 2);
  assert.equal(taken[0].type, '▲');
  assert.equal(taken[0].credit, 3);
  assert.equal(courseKey(list[0]), 'ntut:1');
  assert.equal(courseKey({ title: '手動課', semesterId: '115-1' }), 'manual:115-1|手動課');
});

test('classifyCourse 依符號、開課班級與備註歸類', () => {
  const plan = planWith();
  const classify = (id: string) => {
    const [tc] = groupTakenCourses(imported([id], '115-1'), 'u1');
    return classifyCourse(tc, plan);
  };
  assert.equal(classify('362048').category, 'proRequired'); // ▲ 資料庫系統
  assert.equal(classify('364888').category, 'proElective'); // ★ 資訊安全
  assert.equal(classify('363135').category, 'commonRequired'); // △ 國文
  assert.equal(classify('366437').category, 'commonElective'); // ☆ 全民國防
  assert.equal(classify('362047').category, 'commonElective'); // ☆ 大三體育

  const ge = classify('366771'); // 博雅課程(一) 生活美學
  assert.equal(ge.category, 'generalEd');
  assert.equal(ge.dimension, '人文與藝術');

  const cross = classify('361536'); // 電機三甲 電力系統(一)
  assert.equal(cross.category, 'free');
  assert.equal(cross.crossDept, true);

  assert.equal(classify('362045').status, 'placeholder'); // 學生自選向度(請選)
  assert.equal(classify('363131').status, 'placeholder'); // 資工一 體育(請選體育室)
  const pe = classify('366466'); // 體育專項 實際的體育課
  assert.equal(pe.status, 'counted');
  assert.equal(pe.category, 'commonRequired');
  assert.equal(pe.credit, 0);

  assert.equal(classify('366323').category, 'commonRequired'); // 大一學院專業英文 實際課
});

test('classifyCourse:不採計與人工改類別優先於自動判斷', () => {
  const [tc] = groupTakenCourses(imported(['364888'], '115-1'), 'u1');
  const excluded = classifyCourse(tc, planWith({ excludedKeys: [tc.key] }));
  assert.equal(excluded.status, 'excluded');
  assert.equal(excluded.category, null);

  const over = classifyCourse(
    tc,
    planWith({ overrides: { [tc.key]: 'generalEd' }, overrideDimensions: { [tc.key]: '自然與科學' } })
  );
  assert.equal(over.category, 'generalEd');
  assert.equal(over.dimension, '自然與科學');
  assert.equal(over.overridden, true);
});

test('classifyCourse:沒有類別符號的手動課程標為 unknown', () => {
  const manual: CourseEntry = {
    id: 'm1',
    title: '手動課',
    weekday: 1,
    startPeriod: 0,
    endPeriod: 0,
    ownerId: 'u1',
    credit: 2,
  };
  const [tc] = groupTakenCourses([manual], 'u1');
  const c = classifyCourse(tc, planWith());
  assert.equal(c.status, 'unknown');
  assert.match(c.reason ?? '', /手動/);
});

test('isPlaceholderCourse / isOwnDepartment', () => {
  assert.equal(isPlaceholderCourse({ title: '體育', notes: '請選:體育室 \\ 體育專項', type: '△' }), true);
  assert.equal(isPlaceholderCourse({ title: '學院指定向度-人文與藝術', type: '△' }), true);
  assert.equal(isPlaceholderCourse({ title: '體育', notes: '羽球 A', type: '△' }), false);
  assert.equal(isOwnDepartment({ classNames: ['電機三甲'] }, ['資工']), false);
  assert.equal(isOwnDepartment({ classNames: ['資工二', '電資二'] }, ['資工']), true);
  assert.equal(isOwnDepartment({ classNames: ['電機三甲'] }, []), true, '沒設前綴不猜成他系');
  assert.equal(isOwnDepartment({ classNames: [] }, ['資工']), true, '沒有班級資料不猜成他系');
});

/** 一位大一上到大三上的資工生 */
const studentCourses = (): CourseEntry[] => [
  ...imported(
    ['363135', '363134', '366323', '366466', '366771', '363137', '363138', '363139', '363140', '363141', '366437', '363131'],
    '113-1'
  ),
  ...imported(['366773', '366777'], '113-2'),
  ...imported(['362048', '364888', '361536', '362045', '362047', '364892'], '115-1'),
];

test('computeGraduation:各類學分、採計與門檻', () => {
  const s = computeGraduation(planWith(), studentCourses());
  assert.equal(s.hasStandard, true);

  // 共同必修:國文 2 + 大學入門 1 + 專業英文 2 + 體育 0 = 5,加博雅 6 → 11 / 28
  const common = bucket(s, 'commonRequired');
  assert.equal(common.earned, 11);
  assert.equal(common.counted, 11);
  assert.equal(common.required, 28);
  assert.equal(common.remaining, 17);

  const ge = bucket(s, 'generalEd');
  assert.equal(ge.earned, 6);
  assert.equal(ge.required, 15);
  assert.deepEqual(
    s.ge.dimensions.map((d) => `${d.dimension} ${d.earned}/${d.required}${d.designated ? '*' : ''}`),
    ['人文與藝術 2/4*', '社會與法治 2/4*', '自然與科學 0/0', '創新與創業 2/4*']
  );

  // 共同選修門檻 0:全民國防 1 + 大三體育 1 取得,但不計入
  const ce = bucket(s, 'commonElective');
  assert.equal(ce.earned, 2);
  assert.equal(ce.counted, 0);
  assert.match(ce.note ?? '', /不計入/);

  // 專業必修:微積分、計概、線代、數邏、計程一、資料庫 = 18 / 64
  assert.equal(bucket(s, 'proRequired').counted, 18);
  assert.equal(bucket(s, 'proRequired').remaining, 46);
  // 專業選修:資訊安全 + 機器學習 = 6 / 20
  assert.equal(bucket(s, 'proElective').counted, 6);
  // 跨域及自由選修:他系的電力系統 3 / 20
  const free = bucket(s, 'free');
  assert.equal(free.earned, 3);
  assert.equal(free.counted, 3);
  assert.equal(free.required, 20);

  assert.equal(s.total.required, 132);
  assert.equal(s.total.counted, 11 + 0 + 18 + 6 + 3);
  assert.equal(s.total.remaining, 132 - 38);
  // 實際取得含不計入的 ☆ 2 學分
  assert.equal(s.total.rawEarned, 40);

  // 占位科目不計入並提醒
  assert.ok(s.courses.some((c) => c.status === 'placeholder'));
  assert.ok(s.warnings.some((w) => w.includes('占位')));
  assert.equal(s.unknownImported, 0);
});

test('computeGraduation:必修科目檢核(精確比對、同類認列、分段修習)', () => {
  const s = computeGraduation(planWith(), studentCourses());
  const find = (name: string, stage?: string) =>
    s.requiredCourses.find((r) => r.course.name === name && (!stage || r.course.stage === stage));

  assert.equal(find('國文')?.done, true);
  assert.equal(find('大學入門與工程倫理')?.done, true);
  assert.equal(find('資料庫系統')?.done, true);
  // 「計算機程式設計 (一)」(總表有空白)對上「計算機程式設計(一)」(標準沒空白)
  assert.equal(find('計算機程式設計(一)')?.done, true);
  // 分段修習:只修了 1/2
  assert.equal(find('微積分', '1/2')?.done, true);
  assert.equal(find('微積分', '2/2')?.done, false);
  // 同類認列:實際課名「專業英文 - 機電 (一)」認列「學院專業英文」
  const eng1 = find('學院專業英文', '1/2');
  assert.equal(eng1?.done, true);
  assert.equal(eng1?.matchedTitle, '專業英文 - 機電 (一)');
  assert.equal(find('學院專業英文', '2/2')?.done, false);
  // 體育:只有體育專項那一門算,占位的不算;大三 ☆ 體育不能拿來抵 △ 體育
  const pe = s.requiredCourses.filter((r) => r.course.name === '體育');
  assert.equal(pe.length, 4);
  assert.deepEqual(pe.map((r) => r.done), [true, false, false, false]);
  // 向度列交給博雅區塊,不在檢核清單
  assert.ok(!s.requiredCourses.some((r) => r.course.name.includes('向度')));

  const groups = groupRequiredByTerm(s.requiredCourses);
  assert.equal(groups[0].term, '1-1');
});

test('checkRequiredCourses:沒有課程標準時回傳空清單', () => {
  assert.deepEqual(checkRequiredCourses(undefined, []), []);
});

test('規定文字的提示:標出「」裡已修的課', () => {
  const s = computeGraduation(planWith(), studentCourses());
  const ai = s.hints.find((h) => h.rule.includes('人工智慧專業領域課群'));
  assert.ok(ai);
  assert.ok(ai.quoted.includes('機器學習'));
  assert.deepEqual(ai.taken, ['機器學習']);
  assert.equal(ruleHints(undefined, []).length, 0);
});

test('超過門檻的專業選修溢出到跨域及自由選修', () => {
  const plan = planWith({
    manualCredits: [{ id: 'm', title: '專業選修一批', credit: 25, category: 'proElective' }],
  });
  const s = computeGraduation(plan, []);
  const pe = bucket(s, 'proElective');
  assert.equal(pe.earned, 25);
  assert.equal(pe.counted, 20);
  assert.equal(pe.overflow, 5);
  const free = bucket(s, 'free');
  assert.equal(free.earned, 5);
  assert.equal(free.counted, 5);
  assert.equal(s.total.counted, 25);
});

test('博雅超修:計入共同必修 15,溢出最多認列 4 到自由選修', () => {
  const plan = planWith({
    manualCredits: [{ id: 'm', title: '博雅一批', credit: 21, category: 'generalEd', dimension: '人文與藝術' }],
  });
  const s = computeGraduation(plan, []);
  assert.equal(s.ge.earned, 21);
  assert.equal(s.ge.counted, 15);
  assert.equal(s.ge.overflowCounted, 4);
  assert.equal(bucket(s, 'commonRequired').counted, 15);
  assert.equal(bucket(s, 'free').counted, 4);
  assert.equal(s.total.counted, 19);
  assert.equal(s.ge.dimensions.find((d) => d.dimension === '人文與藝術')?.earned, 21);
});

test('舊制「跨系所選修上限」只限制他系課程,不限制溢出', () => {
  const oldStd: GraduationStandard = {
    ...standard,
    credits: {
      部訂共同必修學分: 0,
      校訂共同必修學分: 28,
      共同選修學分: 0,
      部訂專業必修學分: 0,
      校訂專業必修學分: 64,
      專業選修學分: 20,
      跨系所選修上限學分: 6,
      最低畢業學分數: 128,
    },
  };
  const plan = planWith({
    standard: oldStd,
    manualCredits: [
      { id: 'a', title: '他系課一批', credit: 10, category: 'free' },
      { id: 'b', title: '專業選修一批', credit: 23, category: 'proElective' },
    ],
  });
  const s = computeGraduation(plan, []);
  const free = bucket(s, 'free');
  assert.equal(free.required, null);
  assert.equal(free.earned, 13);
  assert.equal(free.counted, 6 + 3);
  assert.match(free.note ?? '', /上限 6/);
  assert.equal(s.total.required, 128);
});

test('沒有課程標準:只統計已修學分,沒有門檻', () => {
  const s = computeGraduation(planWith({ standard: undefined }), studentCourses());
  assert.equal(s.hasStandard, false);
  for (const b of s.buckets) assert.equal(b.required, null);
  assert.equal(bucket(s, 'commonElective').counted, 2, '沒有標準時 ☆ 也先算進去');
  assert.equal(s.total.required, null);
  assert.equal(s.total.remaining, 0);
  assert.deepEqual(s.requiredCourses, []);
  assert.ok(s.warnings.some((w) => w.includes('尚未套用課程標準')));
});

test('同名課程出現在多個學期會提醒,但課程標準列了多次的(專題討論)不會', () => {
  const twice: CourseEntry[] = [
    ...imported(['364888'], '114-1'),
    ...imported(['364888'], '115-1').map((c) => ({ ...c, id: `${c.id}-b`, ntutCourseId: '999999' })),
    ...imported(['362052'], '115-1'),
    ...imported(['362052'], '114-2').map((c) => ({ ...c, id: `${c.id}-c`, ntutCourseId: '999998' })),
  ];
  const s = computeGraduation(planWith(), twice);
  const dup = s.warnings.filter((w) => w.includes('重修'));
  assert.equal(dup.length, 1);
  assert.match(dup[0], /資訊安全/);
  assert.doesNotMatch(dup[0], /專題討論/);
  // 兩筆資訊安全都被計入(使用者要自己把重修的那筆設為不採計)
  assert.equal(bucket(s, 'proElective').earned, 8);
});

test('沒設本系班級前綴時提醒,而且所有專業課都當本系', () => {
  const s = computeGraduation(planWith({ ownClassPrefixes: [] }), imported(['361536'], '115-1'));
  assert.equal(bucket(s, 'proElective').earned, 3);
  assert.ok(s.warnings.some((w) => w.includes('班級前綴')));
});

test('defaultPlan 是空白計畫', () => {
  const p = defaultPlan('u2', 123);
  assert.equal(p.ownerId, 'u2');
  assert.equal(p.standard, undefined);
  assert.deepEqual(p.manualCredits, []);
  assert.equal(p.updatedAt, 123);
});
