const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CookieJar,
  NtutError,
  decodeBody,
  fetchNtutTimetable,
  parsePeriods,
  parseSemesterList,
  parseSsoForm,
  parseTimetable,
} = require('../ntut');

const TIMETABLE = fs.readFileSync(path.join(__dirname, 'fixtures', 'select-timetable.html'), 'utf8');

const SEMESTER_PAGE = `
<HTML><HEAD><TITLE>選課系統</TITLE></HEAD><BODY>
<!-- <a href="Select.jsp?format=-2&code=110590099&year=99&sem=1">註解裡的舊連結</a> -->
<table border=1>
<tr><th>學年度 / 學期<th>選課表
<tr><td><img src=../image/or_ball.gif><A href="Select.jsp?format=-2&code=110590099&year=114&sem=1">114 學年度 第 1 學期</A>
<tr><td><img src=../image/or_ball.gif><A href="Select.jsp?format=-2&code=110590099&year=115&sem=1">115 學年度 第 1 學期</A>
<tr><td><img src=../image/or_ball.gif><A href='Select.jsp?format=-2&amp;code=110590099&amp;year=114&amp;sem=2'>114 學年度 第 2 學期</A>
<tr><td><A href="Select.jsp?format=-2&code=110590099&year=115&sem=1">重複的連結</A>
<tr><td><A href="Curr.jsp?format=-2&code=3604021&year=113&sem=2">不是選課表的連結</A>
<tr><td><A href="../main.jsp">回首頁</A>
</table></BODY></HTML>`;

const SSO_PAGE = `
<html><body onload="document.ssoForm.submit()">
<!-- <form name="ssoForm" action="https://example.com/old"></form> -->
<form name="ssoForm" method="post" action="oauth2Server.do">
<input type="hidden" name="apOu" value="aa_0010-oauth">
<input type="hidden" name="sessionId" value="abc&amp;123">
<input type='hidden' name='redirect_uri' value='https://aps.ntut.edu.tw/course/tw/courseSID.jsp'>
<input type=hidden name=ticket value=T-42>
<input type="checkbox" name="remember" value="1">
<input type="submit" name="go" value="送出">
</form>
</body></html>`;

const STUDENT = '110590099';
const PASSWORD = 'pw-才不告訴你!';

/* ---------- 測試用工具 ---------- */

function reply(body, { status = 200, headers = {}, cookies = [] } = {}) {
  const h = new Headers(headers);
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(body, { status, headers: h });
}
const html = (body, opts = {}) =>
  reply(body, { ...opts, headers: { 'content-type': 'text/html;charset=UTF-8', ...(opts.headers ?? {}) } });
const redirect = (location, cookies = [], status = 302) => reply(null, { status, headers: { location }, cookies });

/**
 * 假的北科伺服器:login.do → ssoIndex.do → oauth2Server.do(302)→ courseSID.jsp(302)→ Select.jsp。
 * 課程系統沒收到 SSO 給的 cookie 就回「尚未登錄入口網站」,跟真的一樣用 200 回。
 */
function fakeNtut(over = {}) {
  const calls = [];
  const routes = {
    'POST app.ntut.edu.tw/login.do': () =>
      reply(JSON.stringify(over.loginBody ?? { success: true, givenName: '林小狐' }), {
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        cookies: ['JSESSIONID=portal-1; Path=/; HttpOnly'],
      }),
    'GET app.ntut.edu.tw/ssoIndex.do': (u, init) =>
      init.headers.Cookie?.includes('JSESSIONID=portal-1') ? html(over.ssoPage ?? SSO_PAGE) : html('請重新登入'),
    'POST app.ntut.edu.tw/oauth2Server.do': () =>
      over.oauthReply?.() ??
      redirect('https://aps.ntut.edu.tw/course/tw/courseSID.jsp?ticket=t-123', ['ssoTrace=1; Path=/']),
    'GET aps.ntut.edu.tw/course/tw/courseSID.jsp': () =>
      // Location 刻意給 http://,client 要自己升級成 https
      redirect('http://aps.ntut.edu.tw/course/tw/Select.jsp?first=1', [
        ...(over.dropCourseCookie ? [] : ['JSESSIONID=course-9; Path=/course; HttpOnly']),
        'lang=zh; Domain=.ntut.edu.tw; Path=/',
      ]),
    'GET aps.ntut.edu.tw/course/tw/Select.jsp': (u, init) => {
      if (!init.headers.Cookie?.includes('JSESSIONID=course-9')) return html('您尚未登錄入口網站,或是連線已逾時');
      if (u.searchParams.get('format') === '-2') return over.timetableReply?.(u) ?? html(TIMETABLE);
      return html(over.semesterPage ?? SEMESTER_PAGE);
    },
  };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, method: init.method, headers: { ...init.headers }, body: init.body });
    if (over.throwOn?.(u)) throw over.throwOn(u);
    const route = routes[`${init.method} ${u.host}${u.pathname}`];
    return route ? route(u, init) : reply('not found', { status: 404 });
  };
  return { fetchImpl, calls };
}

/** 用 Node 自己的 Big5 解碼表反推一個編碼器,好測「學校送 Big5 又沒宣告」的情況 */
let big5Table = null;
function big5Encode(str) {
  if (!big5Table) {
    big5Table = new Map();
    const dec = new TextDecoder('big5');
    const leads = [];
    for (let b = 0xa1; b <= 0xfe; b++) leads.push(b); // 標準 Big5 優先
    for (let b = 0x81; b <= 0xa0; b++) leads.push(b);
    for (const lead of leads) {
      for (let trail = 0x40; trail <= 0xfe; trail++) {
        if (trail > 0x7e && trail < 0xa1) continue;
        const ch = dec.decode(Uint8Array.of(lead, trail));
        if (ch.length === 1 && ch !== '�' && !big5Table.has(ch)) big5Table.set(ch, [lead, trail]);
      }
    }
  }
  const out = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) {
      out.push(cp);
      continue;
    }
    const bytes = big5Table.get(ch);
    if (!bytes) throw new Error(`Big5 編不出 ${ch}(U+${cp.toString(16)})`);
    out.push(...bytes);
  }
  return Uint8Array.from(out);
}

const byName = (courses, name) => courses.find((c) => c.name.zh === name);

/* ---------- 選課表解析 ---------- */

test('選課表:讀下面那張課程清單,略過撤選、小計與註解裡的假表格', () => {
  const { courses, withdrawn, student } = parseTimetable(TIMETABLE);
  assert.deepEqual(
    courses.map((c) => c.name.zh),
    [
      '班週會及導師時間',
      '作業系統',
      '計算機網路',
      '演算法',
      '機率與統計',
      '微處理機實驗',
      '英文簡報',
      '創意設計&實作',
      '服務學習',
      '實務專題(一)',
    ]
  );
  assert.deepEqual(withdrawn, ['影像處理']);
  assert.equal(courses.some((c) => c.id === '999999'), false);
  assert.deepEqual(student, { id: '110590099', name: '林小狐', className: '資工三', year: 115, sem: 1 });
});

test('選課表:星期欄的節次、教師與教室', () => {
  const { courses } = parseTimetable(TIMETABLE);
  const os = byName(courses, '作業系統');
  assert.equal(os.id, '348921');
  assert.equal(os.credit, '3.0');
  assert.deepEqual(os.time, { sun: [], mon: ['3', '4'], tue: [], wed: ['2'], thu: [], fri: [], sat: [] });
  assert.deepEqual(os.teacher, [{ name: '陳志明' }]);
  // (e) 是 e 化教室標記,不是教室名稱
  assert.deepEqual(os.classroom, [{ name: '六教327' }]);

  assert.deepEqual(byName(courses, '演算法').classroom, [{ name: '三教205' }, { name: '資工館304' }]);
  assert.deepEqual(byName(courses, '微處理機實驗').teacher, [{ name: '吳俊宏' }, { name: '劉佳穎' }]);
  assert.deepEqual(byName(courses, '機率與統計').time.thu, ['3', '4']); // 全形「３　４」
  assert.deepEqual(byName(courses, '英文簡報').time.mon, ['A', 'B']);
  assert.deepEqual(byName(courses, '創意設計&實作').time.fri, ['C', 'D']);
  assert.deepEqual(byName(courses, '服務學習').time.sat, ['1', '2']);
  assert.deepEqual(byName(courses, '服務學習').classroom, []); // &nbsp; 不是教室
});

test('選課表:沒有課號的班週會、沒有時間的專題', () => {
  const { courses } = parseTimetable(TIMETABLE);
  const meeting = byName(courses, '班週會及導師時間');
  assert.equal(meeting.id, '');
  assert.deepEqual(meeting.time.tue, ['N']);
  assert.deepEqual(meeting.teacher, []);

  const project = byName(courses, '實務專題(一)');
  assert.ok(Object.values(project.time).every((p) => p.length === 0));
  assert.deepEqual(project.classroom, []);
  assert.equal(project.teacher.length, 2);
});

test('選課表:學校送 Big5 又沒宣告編碼時一樣解得出來', () => {
  const decoded = decodeBody(big5Encode(TIMETABLE), 'text/html');
  assert.deepEqual(parseTimetable(decoded), parseTimetable(TIMETABLE));
});

test('選課表:頁面上找不到課程清單就明確報錯', () => {
  assert.throws(
    () => parseTimetable('<html><table><tr><td>系統維護中</table></html>'),
    (e) => e instanceof NtutError && e.code === 'unexpected'
  );
});

test('節次代號:全形、頓號、黏在一起都認得,其他字元忽略', () => {
  assert.deepEqual(parsePeriods(' 1 2'), ['1', '2']);
  assert.deepEqual(parsePeriods('３　４'), ['3', '4']);
  assert.deepEqual(parsePeriods('5、6'), ['5', '6']);
  assert.deepEqual(parsePeriods('34'), ['3', '4']);
  assert.deepEqual(parsePeriods('a b'), ['A', 'B']);
  assert.deepEqual(parsePeriods('N'), ['N']);
  assert.deepEqual(parsePeriods(''), []);
  assert.deepEqual(parsePeriods('(隔週)'), []);
});

/* ---------- 其他頁面 ---------- */

test('學期清單:去重、新的在前,只認選課表連結', () => {
  assert.deepEqual(parseSemesterList(SEMESTER_PAGE), [
    { year: 115, sem: 1, code: STUDENT },
    { year: 114, sem: 2, code: STUDENT },
    { year: 114, sem: 1, code: STUDENT },
  ]);
});

test('SSO 表單:相對 action 轉絕對網址,照瀏覽器規則挑欄位', () => {
  const form = parseSsoForm(SSO_PAGE, 'https://app.ntut.edu.tw/ssoIndex.do?apOu=aa_0010-oauth');
  assert.equal(form.action, 'https://app.ntut.edu.tw/oauth2Server.do');
  assert.equal(form.method, 'POST');
  assert.deepEqual(form.fields, {
    apOu: 'aa_0010-oauth',
    sessionId: 'abc&123',
    redirect_uri: 'https://aps.ntut.edu.tw/course/tw/courseSID.jsp',
    ticket: 'T-42',
  });
  assert.equal(parseSsoForm('<form name="login"></form>', 'https://app.ntut.edu.tw/'), null);
});

test('解碼:照宣告走,宣告錯或沒宣告時自動判斷 Big5', () => {
  const utf8 = new TextEncoder().encode('課表');
  assert.equal(decodeBody(utf8, 'text/html; charset=UTF-8'), '課表');
  assert.equal(decodeBody(utf8, 'text/html;charset=ISO-8859-1'), '課表');
  assert.equal(decodeBody(big5Encode('課表'), 'text/html; charset=big5'), '課表');
  assert.equal(decodeBody(big5Encode('課表'), 'text/html; charset=UTF-8'), '課表');
  assert.equal(decodeBody(big5Encode('課表'), null), '課表');
});

/* ---------- Cookie ---------- */

test('cookie:host-only 不外流,Domain cookie 給子網域,Path 有邊界', () => {
  const jar = new CookieJar(() => 1_000_000);
  jar.store('https://app.ntut.edu.tw/login.do', ['A=1; Path=/', 'D=4; Domain=.ntut.edu.tw; Path=/']);
  jar.store('https://aps.ntut.edu.tw/course/tw/courseSID.jsp', ['C=3; Path=/course', 'T=5']);
  assert.equal(jar.header('https://app.ntut.edu.tw/ssoIndex.do'), 'A=1; D=4');
  // T 沒給 Path,預設是設定它的目錄 /course/tw,比 /course 長,依 RFC 6265 排最前面
  assert.equal(jar.header('https://aps.ntut.edu.tw/course/tw/Select.jsp'), 'T=5; C=3; D=4');
  assert.equal(jar.header('https://aps.ntut.edu.tw/courseware/x'), 'D=4'); // /course 不含 /courseware
  assert.equal(jar.header('https://example.com/'), '');
});

test('cookie:別人家的 Domain 不收,Max-Age=0 會刪掉', () => {
  const jar = new CookieJar(() => 1_000_000);
  jar.store('https://aps.ntut.edu.tw/', ['X=1; Domain=evil.com', 'S=1; Path=/']);
  assert.equal(jar.header('https://aps.ntut.edu.tw/'), 'S=1');
  jar.store('https://aps.ntut.edu.tw/', ['S=; Max-Age=0; Path=/']);
  assert.equal(jar.header('https://aps.ntut.edu.tw/'), '');
});

test('cookie:Expires 過了就不送', () => {
  let now = Date.parse('2026-11-05T00:00:00Z');
  const jar = new CookieJar(() => now);
  jar.store('https://aps.ntut.edu.tw/', ['S=1; Expires=Thu, 05 Nov 2026 01:00:00 GMT']);
  assert.equal(jar.header('https://aps.ntut.edu.tw/'), 'S=1');
  now += 2 * 3600_000;
  assert.equal(jar.header('https://aps.ntut.edu.tw/'), '');
});

/* ---------- 完整流程 ---------- */

test('流程:登入 → SSO → 預設抓最新學期', async () => {
  const { fetchImpl, calls } = fakeNtut();
  const r = await fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl });

  assert.deepEqual(r.student, { id: STUDENT, name: '林小狐', className: '資工三' });
  assert.deepEqual(r.semester, { year: 115, sem: 1 });
  assert.deepEqual(r.semesters, [
    { year: 115, sem: 1 },
    { year: 114, sem: 2 },
    { year: 114, sem: 1 },
  ]);
  assert.equal(r.courses.length, 10);
  assert.deepEqual(r.withdrawn, ['影像處理']);

  const last = calls.at(-1).url;
  assert.equal(last.pathname, '/course/tw/Select.jsp');
  assert.deepEqual(Object.fromEntries(last.searchParams), {
    format: '-2',
    code: STUDENT,
    year: '115',
    sem: '1',
  });
});

test('流程:請求的內容與 cookie 接力', async () => {
  const { fetchImpl, calls } = fakeNtut();
  await fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl });

  const login = calls[0];
  assert.equal(login.url.href, 'https://app.ntut.edu.tw/login.do');
  assert.equal(login.headers['User-Agent'], 'Direk ios App');
  assert.equal(login.headers.Cookie, undefined); // 沒有 cookie 就不送標頭(F5 會擋空的)
  const form = new URLSearchParams(login.body);
  assert.equal(form.get('muid'), STUDENT);
  assert.equal(form.get('mpassword'), PASSWORD);

  const ssoPost = calls.find((c) => c.url.pathname === '/oauth2Server.do');
  assert.equal(ssoPost.method, 'POST');
  assert.equal(new URLSearchParams(ssoPost.body).get('sessionId'), 'abc&123');
  assert.equal(new URLSearchParams(ssoPost.body).has('go'), false);

  // 302 之後改用 GET、不帶 body;http:// 的 Location 升級成 https
  const sid = calls.find((c) => c.url.pathname === '/course/tw/courseSID.jsp');
  assert.equal(sid.method, 'GET');
  assert.equal(sid.body, undefined);
  const firstSelect = calls.find((c) => c.url.pathname === '/course/tw/Select.jsp');
  assert.equal(firstSelect.url.protocol, 'https:');

  // 課程系統只收到自己的與 Domain cookie,入口網站的 host-only cookie 不外流
  for (const c of calls.filter((x) => x.url.host === 'aps.ntut.edu.tw' && x.url.pathname.endsWith('Select.jsp'))) {
    assert.match(c.headers.Cookie, /JSESSIONID=course-9/);
    assert.match(c.headers.Cookie, /lang=zh/);
    assert.doesNotMatch(c.headers.Cookie, /portal-1|ssoTrace/);
  }
});

test('流程:密碼只送給 login.do', async () => {
  const { fetchImpl, calls } = fakeNtut();
  await fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl });
  const encoded = new URLSearchParams({ p: PASSWORD }).toString().slice(2);
  const leaks = calls.filter(
    (c) => String(c.body ?? '').includes(encoded) || c.url.href.includes(encoded) || JSON.stringify(c.headers).includes(PASSWORD)
  );
  assert.deepEqual(
    leaks.map((c) => c.url.pathname),
    ['/login.do']
  );
});

test('流程:指定學期', async () => {
  const { fetchImpl, calls } = fakeNtut();
  const r = await fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD, year: 114, sem: 2 }, { fetchImpl });
  assert.deepEqual(r.semester, { year: 114, sem: 2 });
  assert.equal(calls.at(-1).url.searchParams.get('year'), '114');
  assert.equal(calls.at(-1).url.searchParams.get('sem'), '2');
});

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (e) => {
    assert.ok(e instanceof NtutError, `應該是 NtutError,實際:${e}`);
    assert.equal(e.code, code);
    assert.equal(String(e.message).includes(PASSWORD), false);
    return true;
  });

test('流程:密碼錯誤就停在登入,不再打其他網址', async () => {
  const { fetchImpl, calls } = fakeNtut({ loginBody: { success: false, errorMsg: '帳號或密碼錯誤,請重新輸入!' } });
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), 'wrong-credentials');
  assert.equal(calls.length, 1);
});

test('流程:帳號鎖住、密碼過期、手機驗證各有代碼', async () => {
  const cases = [
    ['您的帳號已被鎖住,請 15 分鐘後再試', 'locked'],
    ['您的密碼已過期,請更改密碼', 'password-expired'],
    ['請先完成驗證手機', 'mobile-verification'],
    ['系統忙碌中', 'rejected'],
  ];
  for (const [errorMsg, code] of cases) {
    const { fetchImpl } = fakeNtut({ loginBody: { success: false, errorMsg } });
    await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), code);
  }
});

test('流程:login.do 回 HTML(維護頁)', async () => {
  const fetchImpl = async () => html('<html>系統維護中</html>');
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), 'unexpected');
});

test('流程:入口網站沒給 ssoForm', async () => {
  const { fetchImpl } = fakeNtut({ ssoPage: '<html>請重新登入</html>' });
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), 'sso-failed');
});

test('流程:SSO 轉完課程系統仍說沒登入', async () => {
  // 落地頁就是那句「尚未登錄入口網站」,在 SSO 這步就要認出來,而不是拖到讀學期才失敗
  const { fetchImpl } = fakeNtut({ dropCourseCookie: true });
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), 'sso-failed');
});

test('流程:讀選課表時 session 過期', async () => {
  const { fetchImpl } = fakeNtut({ timetableReply: () => html('應用系統連線已逾時,請重新登入') });
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), 'session-expired');
});

test('流程:沒有任何學期 / 指定的學期不存在', async () => {
  const empty = fakeNtut({ semesterPage: '<html><table><tr><td>查無資料</table></html>' });
  await rejectsWith(
    fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl: empty.fetchImpl }),
    'no-semesters'
  );
  const { fetchImpl } = fakeNtut();
  await rejectsWith(
    fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD, year: 110, sem: 1 }, { fetchImpl }),
    'semester-not-found'
  );
});

test('流程:轉址到北科以外的網域就停下,不會真的送出', async () => {
  const { fetchImpl, calls } = fakeNtut({ oauthReply: () => redirect('https://evil.example.com/steal') });
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }), 'unexpected');
  assert.equal(calls.some((c) => c.url.host === 'evil.example.com'), false);
});

test('流程:連線失敗與逾時', async () => {
  const down = fakeNtut({ throwOn: () => new TypeError('fetch failed') });
  await rejectsWith(fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl: down.fetchImpl }), 'network');

  const slow = fakeNtut({
    throwOn: (u) => (u.host === 'aps.ntut.edu.tw' ? new DOMException('timed out', 'TimeoutError') : null),
  });
  await assert.rejects(
    fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl: slow.fetchImpl }),
    (e) => e.code === 'network' && e.message.includes('太久')
  );
});

test('流程:標頭到了、body 讀到一半逾時,一樣是看得懂的逾時訊息', async () => {
  const { fetchImpl } = fakeNtut({
    timetableReply: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new DOMException('timed out', 'TimeoutError'));
          },
        }),
        { status: 200 }
      ),
  });
  await assert.rejects(
    fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }),
    (e) => e instanceof NtutError && e.code === 'network' && e.message.includes('太久')
  );
});

test('流程:學校回 5xx', async () => {
  const { fetchImpl } = fakeNtut({ timetableReply: () => html('Service Unavailable', { status: 503 }) });
  await assert.rejects(
    fetchNtutTimetable({ studentId: STUDENT, password: PASSWORD }, { fetchImpl }),
    (e) => e.code === 'http' && e.status === 503
  );
});
