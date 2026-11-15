/**
 * 北科入口網站 → 課程系統:登入、SSO、抓選課表並解析。
 *
 * 為什麼放在後端:學校的伺服器沒有 CORS 標頭,網頁版 / PWA 的瀏覽器根本讀不到回應;
 * 手機版雖然沒有 CORS,但 SSO 要帶著 cookie 從 app.ntut.edu.tw 一路轉到
 * aps.ntut.edu.tw。統一在這裡做,三個平台行為一致;學校改版時也只要重新部署
 * Functions,不必重新打包手機 App。
 *
 * 流程(與北科官方 App 走同一組端點):
 * 1. POST app.ntut.edu.tw/login.do(muid / mpassword)→ JSON,success 表示登入成功。
 *    帶官方 App 的 User-Agent 才會回 JSON,網頁版登入頁另有驗證碼,不能走那條。
 * 2. GET  app.ntut.edu.tw/ssoIndex.do?apOu=aa_0010-oauth → 一張自動送出的 ssoForm
 * 3. 送出 ssoForm,一路轉址到 aps.ntut.edu.tw,拿到課程系統的 session cookie
 * 4. GET  aps.ntut.edu.tw/course/tw/Select.jsp → 這個學號有哪些學期的選課表
 * 5. GET  Select.jsp?format=-2&code=學號&year=&sem= → 選課表
 *
 * 密碼只在第 1 步送給學校:不落地、不寫 log、也不放進任何錯誤訊息。
 *
 * 本檔不依賴 firebase-functions,純 Node(fetch 可注入),單元測試不需要任何套件。
 */

const PORTAL_BASE = 'https://app.ntut.edu.tw/';
const COURSE_BASE = 'https://aps.ntut.edu.tw/course/tw/';
/** 入口網站「課程系統」的 SSO 代碼 */
const COURSE_AP_OU = 'aa_0010-oauth';
/** 北科官方 iOS App 的 User-Agent;login.do 依此回傳 JSON */
const USER_AGENT = 'Direk ios App';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** 課程系統用 HTTP 200 回這幾句話代表 session 沒建立或已過期 */
const SESSION_MARKERS = ['尚未登錄入口網站', '應用系統連線已逾時'];

/**
 * 帶原因代碼的錯誤。code 給 index.js 對應成 HttpsError、前端據此給提示;
 * message 是直接顯示給使用者的中文。
 */
class NtutError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'NtutError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/* ───────────────────────── Cookie ───────────────────────── */

/**
 * 最小的 cookie jar(RFC 6265 的子集:Domain / Path / Max-Age / Expires)。
 *
 * Node 的 fetch 不管 cookie,而 SSO 的每一跳都靠 cookie 接力:
 * 登入在 app.ntut.edu.tw 拿到 session,轉到 aps.ntut.edu.tw 再拿課程系統的 session。
 * 轉址也得自己跟(redirect: 'manual'),否則中間那幾跳的 Set-Cookie 會被吃掉。
 */
class CookieJar {
  constructor(now = () => Date.now()) {
    this.now = now;
    /** key = domain|h(host-only)/d(domain)|path|name */
    this.cookies = new Map();
  }

  /** 記下回應的 Set-Cookie */
  store(url, setCookieHeaders) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const header of setCookieHeaders) {
      const c = parseSetCookie(header, this.now());
      if (!c) continue;
      let domain = host;
      let hostOnly = true;
      if (c.domain) {
        // 不屬於自己網域的 Domain 屬性一律忽略(瀏覽器也是這樣擋的)
        if (!domainMatches(host, c.domain)) continue;
        domain = c.domain;
        hostOnly = false;
      }
      const path = c.path ?? defaultCookiePath(u.pathname);
      const key = [domain, hostOnly ? 'h' : 'd', path, c.name].join('|');
      if (c.expires !== null && c.expires <= this.now()) {
        this.cookies.delete(key);
        continue;
      }
      this.cookies.set(key, { name: c.name, value: c.value, domain, hostOnly, path, expires: c.expires });
    }
  }

  /** 組出要送到 url 的 Cookie 標頭;沒有就回空字串(呼叫端不要送出空的 Cookie 標頭) */
  header(url) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const now = this.now();
    const hits = [];
    for (const [key, c] of this.cookies) {
      if (c.expires !== null && c.expires <= now) {
        this.cookies.delete(key);
        continue;
      }
      const domainOk = c.hostOnly ? host === c.domain : domainMatches(host, c.domain);
      if (domainOk && pathMatches(u.pathname, c.path)) hits.push(c);
    }
    // RFC 6265 5.4:路徑長的排前面
    hits.sort((a, b) => b.path.length - a.path.length);
    return hits.map((c) => `${c.name}=${c.value}`).join('; ');
  }
}

function parseSetCookie(header, nowMs) {
  const [pair, ...attrs] = String(header).split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  if (!name) return null;
  const cookie = { name, value: pair.slice(eq + 1).trim(), domain: null, path: null, expires: null };
  let maxAge = null;
  for (const attr of attrs) {
    const i = attr.indexOf('=');
    const key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase();
    const val = i < 0 ? '' : attr.slice(i + 1).trim();
    if (key === 'domain' && val) cookie.domain = val.replace(/^\./, '').toLowerCase();
    else if (key === 'path' && val.startsWith('/')) cookie.path = val;
    else if (key === 'max-age' && /^-?\d+$/.test(val)) maxAge = Number(val);
    else if (key === 'expires') {
      const t = Date.parse(val);
      if (!Number.isNaN(t)) cookie.expires = t;
    }
  }
  // Max-Age 優先於 Expires
  if (maxAge !== null) cookie.expires = nowMs + maxAge * 1000;
  return cookie;
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function defaultCookiePath(pathname) {
  if (!pathname.startsWith('/')) return '/';
  const i = pathname.lastIndexOf('/');
  return i <= 0 ? '/' : pathname.slice(0, i);
}

function pathMatches(reqPath, cookiePath) {
  if (reqPath === cookiePath) return true;
  if (!reqPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || reqPath[cookiePath.length] === '/';
}

/** Node 22 的 Headers 有 getSetCookie();保險起見也處理只有 get() 的實作 */
function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,\s]+=)/) : [];
}

/* ───────────────────────── HTTP ───────────────────────── */

/**
 * 把回應位元組轉成字串。
 * 北科的系統新舊混雜:有的宣告 UTF-8、有的沒宣告卻送 Big5、也有宣告錯的。
 * 先照宣告走;沒宣告 Big5 就先試嚴格 UTF-8,解不開再退回 Big5。
 */
function decodeBody(bytes, contentType) {
  const m = /charset\s*=\s*"?([\w-]+)/i.exec(contentType || '');
  const declared = m ? m[1].toLowerCase() : '';
  if (/big5|cp950|ms950/.test(declared)) return decodeBig5(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return decodeBig5(bytes);
  }
}

function decodeBig5(bytes) {
  try {
    return new TextDecoder('big5').decode(bytes);
  } catch {
    // 沒有完整 ICU 的 Node 不支援 big5;至少讓英數與錯誤訊息還讀得到
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** 只跟北科自己的網域往來:SSO 的表單與轉址都來自學校,不該被帶去別的地方 */
function isNtutHost(hostname) {
  return hostname === 'ntut.edu.tw' || hostname.endsWith('.ntut.edu.tw');
}

/**
 * 帶 cookie jar、自己跟轉址的 HTTP client。
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [opts]
 */
function createNtutClient({ fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const jar = new CookieJar();

  /**
   * @param {string} url
   * @param {{method?: string, form?: Record<string,string>}} [opts]
   * @returns {Promise<{status: number, url: string, text: string}>}
   */
  async function request(url, { method = 'GET', form } = {}) {
    let current = new URL(url);
    let currentMethod = method;
    let body = form ? new URLSearchParams(form).toString() : undefined;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // 學校的 Location 偶爾是 http://,一律升級成 https
      if (current.protocol === 'http:') current.protocol = 'https:';
      if (current.protocol !== 'https:' || !isNtutHost(current.hostname)) {
        throw new NtutError('unexpected', `學校伺服器把請求轉到了非北科的網址(${current.hostname}),已停止。`);
      }

      // 只送必要的標頭:北科前面有 F5 防火牆,怪異的標頭(例如空的 Cookie)會被當成機器人擋掉
      const headers = {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      };
      const cookie = jar.header(current.href);
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';

      let res;
      let bytes = null;
      try {
        res = await fetchImpl(current.href, {
          method: currentMethod,
          headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        // 讀 body 也算在逾時內(signal 會一路管到讀完),所以放在同一個 try 裡
        if (!REDIRECT_STATUSES.has(res.status)) bytes = new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
        throw new NtutError(
          'network',
          timedOut ? '北科伺服器太久沒有回應,請稍後再試。' : '連不上北科伺服器,請稍後再試。',
          { host: current.hostname, cause: e }
        );
      }

      jar.store(current.href, getSetCookies(res.headers));

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get('location');
        // 把 body 讀完,連線才能回收
        await res.arrayBuffer().catch(() => undefined);
        if (!location) throw new NtutError('unexpected', '學校伺服器的轉址缺少目的地。');
        current = new URL(location, current);
        // 301/302/303 改用 GET(瀏覽器的行為);307/308 保留原方法與內容
        if (res.status !== 307 && res.status !== 308) {
          currentMethod = 'GET';
          body = undefined;
        }
        continue;
      }

      const text = decodeBody(bytes, res.headers.get('content-type'));
      if (res.status >= 400) {
        throw new NtutError('http', `北科伺服器回應錯誤(HTTP ${res.status}),請稍後再試。`, {
          status: res.status,
          host: current.hostname,
        });
      }
      return { status: res.status, url: current.href, text };
    }
    throw new NtutError('unexpected', '學校伺服器轉址次數過多。');
  }

  return { request, jar };
}

/* ───────────────────────── HTML ───────────────────────── */

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** 標籤 → 文字:<br> 變換行,全形空白與 &nbsp; 變一般空白,收掉多餘空白 */
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[　 ]/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** 比對表頭用:去掉所有空白(「選課<BR>狀況」→「選課狀況」) */
const squash = (s) => s.replace(/\s+/g, '');

/** 解析一個標籤的屬性(雙引號、單引號、不加引號三種寫法都有人用) */
function parseAttrs(attrString) {
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrString))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** 拿掉註解與 script / style:學校頁面常把舊版標記整段註解掉,裡面甚至有表格 */
const stripNoise = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');

function extractTables(html) {
  const clean = stripNoise(html);
  const tables = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi;
  let m;
  while ((m = re.exec(clean))) tables.push(m[1]);
  return tables;
}

/**
 * 把表格切成列、每列切成格(回傳每格的原始 HTML)。
 * 選課表是很舊的 HTML:<tr> <td> 幾乎都不關,所以用「下一個開頭標籤」切,
 * 而不是找結尾。colspan 會展開成空格,欄位編號才對得上表頭。
 */
function tableRows(tableHtml) {
  return tableHtml
    .split(/<tr\b[^>]*>/i)
    .slice(1)
    .map((row) => {
      const parts = row.replace(/<\/tr\s*>[\s\S]*$/i, '').split(/(<t[dh]\b[^>]*>)/i);
      const cells = [];
      for (let i = 1; i < parts.length; i += 2) {
        cells.push(parts[i + 1].replace(/<\/t[dh]\s*>[\s\S]*$/i, ''));
        const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(parts[i])?.[1] ?? 1);
        for (let k = 1; k < Math.min(span, 50); k++) cells.push('');
      }
      return cells;
    });
}

/** 一格裡所有連結的文字(教師、教室常常一格好幾個) */
function anchorTexts(cellHtml) {
  const out = [];
  const re = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let m;
  while ((m = re.exec(cellHtml))) {
    const text = htmlToText(m[1]);
    if (text) out.push(text);
  }
  return out;
}

/** 一格裡的名字清單:有連結取連結文字,沒有就依換行 / 頓號切 */
function cellNames(cellHtml) {
  if (cellHtml === undefined) return [];
  const linked = anchorTexts(cellHtml);
  if (linked.length) return linked;
  return htmlToText(cellHtml)
    .split(/[\n、,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ───────────────────────── 頁面解析 ───────────────────────── */

/**
 * 從 ssoIndex.do 的頁面找出 ssoForm。
 * @returns {{action: string, method: 'GET'|'POST', fields: Record<string,string>} | null}
 */
function parseSsoForm(html, baseUrl) {
  // 只拿掉註解;表單本身不會在 script 裡,但自動送出的那段 script 留著也無妨
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<form\b([^>]*)>([\s\S]*?)(?:<\/form\s*>|$)/gi;
  let m;
  while ((m = re.exec(clean))) {
    const attrs = parseAttrs(m[1]);
    if (attrs.name !== 'ssoForm' && attrs.id !== 'ssoForm') continue;
    const fields = {};
    const inputRe = /<input\b([^>]*)>/gi;
    let im;
    while ((im = inputRe.exec(m[2]))) {
      const a = parseAttrs(im[1]);
      if (!a.name) continue;
      const type = (a.type || 'text').toLowerCase();
      // 照瀏覽器自動送出表單的規則:按鈕不送、沒勾的核取方塊不送
      if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
      if ((type === 'checkbox' || type === 'radio') && !('checked' in a)) continue;
      fields[a.name] = a.value ?? '';
    }
    return {
      action: new URL(attrs.action || baseUrl, baseUrl).href,
      method: (attrs.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET',
      fields,
    };
  }
  return null;
}

/**
 * 課程系統首頁(Select.jsp 不帶參數)列出的學期。
 * 連結長這樣:Select.jsp?format=-2&code=111590001&year=114&sem=1;新的在前。
 * @returns {{year: number, sem: number, code?: string}[]}
 */
function parseSemesterList(html) {
  const clean = stripNoise(html);
  const seen = new Set();
  const list = [];
  const re = /<a\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(clean))) {
    const href = parseAttrs(m[1]).href;
    if (!href) continue;
    let u;
    try {
      u = new URL(href, COURSE_BASE);
    } catch {
      continue;
    }
    if (!/select\.jsp$/i.test(u.pathname)) continue;
    if (!u.searchParams.has('year') || !u.searchParams.has('sem')) continue;
    const year = Number(u.searchParams.get('year'));
    const sem = Number(u.searchParams.get('sem'));
    if (!Number.isInteger(year) || year <= 0 || !Number.isInteger(sem) || sem < 0) continue;
    const key = `${year}-${sem}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ year, sem, code: u.searchParams.get('code') || undefined });
  }
  return list.sort((a, b) => b.year - a.year || b.sem - a.sem);
}

const DAY_COLUMNS = [
  ['日', 'sun'],
  ['一', 'mon'],
  ['二', 'tue'],
  ['三', 'wed'],
  ['四', 'thu'],
  ['五', 'fri'],
  ['六', 'sat'],
];

/** 全形英數 → 半形(節次偶爾寫成「３ ４」) */
const toHalfWidth = (s) => s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

/** 「 3 4」「5、6」「３４」→ ['3','4'];北科節次代號只有 1–9、N、A–D 單一字元 */
function parsePeriods(text) {
  const out = [];
  for (const token of toHalfWidth(text).toUpperCase().split(/[\s,、]+/)) {
    if (!/^[1-9NABCD]+$/.test(token)) continue;
    for (const ch of token) if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/** 「六教226(e)」的 (e) 是 e 化教室標記,不是教室名稱的一部分 */
const stripEClassroom = (name) => name.replace(/\s*[(（]\s*e\s*[)）]\s*$/i, '');

/** 表頭上方那一列:「學號:111590001 姓名:王小明 班級:智動一 111 學年度 第 1 學期」 */
function parseHeaderInfo(text) {
  const pick = (re) => re.exec(text)?.[1];
  const term = /(\d{2,3})\s*學年度\s*第\s*(\d)\s*學期/.exec(text);
  return {
    id: pick(/學號\s*[:：]\s*([A-Za-z0-9]+)/),
    name: pick(/姓名\s*[:：]\s*([^\s:：]+)/),
    className: pick(/班級\s*[:：]\s*([^\s:：]+)/),
    year: term ? Number(term[1]) : undefined,
    sem: term ? Number(term[2]) : undefined,
  };
}

/**
 * 解析選課表(Select.jsp?format=-2)。
 *
 * 頁面上有兩張表:上面是節次 × 星期的格子,下面是逐門課的清單。
 * 只讀下面那張:每門課一列,星期欄直接寫節次代號,也有學分、教師、教室與選課狀況。
 * 欄位一律依表頭文字找,不寫死第幾欄——學校加減欄位時才不會整個錯位。
 *
 * 回傳的 courses 與北科課程好朋友的課程格式相容(前端共用同一套轉換)。
 */
function parseTimetable(html) {
  let rows = null;
  let headerIndex = -1;
  for (const table of extractTables(html)) {
    const r = tableRows(table);
    const i = r.findIndex((cells) => {
      const labels = cells.map((c) => squash(htmlToText(c)));
      return labels.includes('課號') && labels.includes('課程名稱');
    });
    if (i >= 0) {
      rows = r;
      headerIndex = i;
      break;
    }
  }
  if (!rows) {
    throw new NtutError('unexpected', '在學校的頁面上找不到選課表,可能是學校改版了。');
  }

  const labels = rows[headerIndex].map((c) => squash(htmlToText(c)));
  const col = (pred) => labels.findIndex(pred);
  const idx = {
    number: col((l) => l === '課號'),
    name: col((l) => l === '課程名稱'),
    credit: col((l) => l === '學分'),
    teacher: col((l) => l === '教師'),
    room: col((l) => l === '教室'),
    status: col((l) => l.endsWith('狀況')),
  };
  const dayIdx = DAY_COLUMNS.map(([zh, key]) => [key, labels.indexOf(zh)]);

  const courses = [];
  const withdrawn = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    const text = (i) => (i >= 0 && i < cells.length ? htmlToText(cells[i]) : '');
    if (/^(小計|合計|總計)/.test(squash(text(0)))) continue;
    const name = text(idx.name).replace(/\s+/g, ' ');
    if (!name) continue;
    // 撤選 / 退選的課仍會列在表上,但已經不用去上了
    if (/撤選|退選/.test(text(idx.status))) {
      withdrawn.push(name);
      continue;
    }
    const time = {};
    for (const [key, i] of dayIdx) time[key] = i >= 0 ? parsePeriods(text(i)) : [];
    const credit = text(idx.credit);
    courses.push({
      // 班週會這類列沒有課號,留空字串
      id: squash(text(idx.number)),
      name: { zh: name },
      credit: credit || undefined,
      time,
      teacher: cellNames(cells[idx.teacher]).map((n) => ({ name: n })),
      classroom: cellNames(cells[idx.room])
        .map(stripEClassroom)
        .filter(Boolean)
        .map((n) => ({ name: n })),
    });
  }

  return { student: parseHeaderInfo(htmlToText(stripNoise(html))), courses, withdrawn };
}

/* ───────────────────────── 流程 ───────────────────────── */

/** 學校給的錯誤訊息可能夾 HTML,整理成一行短句 */
function cleanMessage(msg) {
  return typeof msg === 'string' ? htmlToText(msg).replace(/\s+/g, ' ').slice(0, 200) : '';
}

function loginError(msg) {
  if (msg.includes('密碼錯誤')) return new NtutError('wrong-credentials', msg || '學號或密碼錯誤。');
  if (msg.includes('鎖')) return new NtutError('locked', msg);
  if (msg.includes('密碼已過期')) return new NtutError('password-expired', msg);
  if (msg.includes('驗證手機')) return new NtutError('mobile-verification', msg);
  return new NtutError('rejected', msg ? `入口網站拒絕登入:${msg}` : '入口網站拒絕登入。');
}

/** 第 1 步:登入入口網站 */
async function loginPortal(client, studentId, password) {
  const res = await client.request(`${PORTAL_BASE}login.do`, {
    method: 'POST',
    form: { muid: studentId, mpassword: password, thetime: String(Date.now()) },
  });
  let body;
  try {
    body = JSON.parse(res.text);
  } catch {
    throw new NtutError('unexpected', '入口網站沒有回傳登入結果(可能正在維護),請稍後再試。');
  }
  if (body && (body.success === true || body.success === 'true')) {
    return { name: cleanMessage(body.givenName) || undefined };
  }
  throw loginError(cleanMessage(body && body.errorMsg));
}

const hasSessionMarker = (text) => SESSION_MARKERS.some((m) => text.includes(m));

/** 第 2、3 步:用入口網站的登入換課程系統的 session */
async function ssoCourseSystem(client) {
  const page = await client.request(`${PORTAL_BASE}ssoIndex.do?apOu=${encodeURIComponent(COURSE_AP_OU)}`);
  const form = parseSsoForm(page.text, page.url);
  if (!form) {
    throw new NtutError('sso-failed', '入口網站沒有提供課程系統的登入表單,可能是登入失效或學校改版了。');
  }
  let res;
  if (form.method === 'POST') {
    res = await client.request(form.action, { method: 'POST', form: form.fields });
  } else {
    const u = new URL(form.action);
    for (const [k, v] of Object.entries(form.fields)) u.searchParams.set(k, v);
    res = await client.request(u.href);
  }
  if (hasSessionMarker(res.text)) {
    throw new NtutError('sso-failed', '課程系統沒有接受入口網站的登入,請稍後再試。');
  }
}

/** 抓課程系統的頁面;session 失效時學校回 200 + 一句話,要自己認出來 */
async function getCoursePage(client, url) {
  const res = await client.request(url);
  if (hasSessionMarker(res.text)) {
    throw new NtutError('session-expired', '課程系統的登入已失效,請再試一次。');
  }
  return res.text;
}

/**
 * 完整流程:登入 → SSO → 學期清單 → 選課表。
 *
 * @param {{studentId: string, password: string, year?: number, sem?: number}} params
 *   year / sem 不給就抓最新一學期
 * @param {{fetchImpl?: typeof fetch}} [deps]
 */
async function fetchNtutTimetable({ studentId, password, year, sem }, { fetchImpl } = {}) {
  const client = createNtutClient({ fetchImpl });
  const profile = await loginPortal(client, studentId, password);
  await ssoCourseSystem(client);

  const semesters = parseSemesterList(await getCoursePage(client, `${COURSE_BASE}Select.jsp`));
  if (!semesters.length) {
    throw new NtutError('no-semesters', '課程系統裡還沒有這個學號的選課表。');
  }
  const target =
    year !== undefined && sem !== undefined
      ? semesters.find((s) => s.year === year && s.sem === sem)
      : semesters[0];
  if (!target) {
    throw new NtutError('semester-not-found', `課程系統裡沒有 ${year}-${sem} 學期的選課表。`);
  }

  const query = new URLSearchParams({
    format: '-2',
    code: target.code || studentId,
    year: String(target.year),
    sem: String(target.sem),
  });
  const table = parseTimetable(await getCoursePage(client, `${COURSE_BASE}Select.jsp?${query}`));

  return {
    student: {
      id: table.student.id || target.code || studentId,
      name: table.student.name || profile.name,
      className: table.student.className,
    },
    semester: { year: target.year, sem: target.sem },
    semesters: semesters.map((s) => ({ year: s.year, sem: s.sem })),
    courses: table.courses,
    withdrawn: table.withdrawn,
  };
}

module.exports = {
  NtutError,
  CookieJar,
  createNtutClient,
  decodeBody,
  htmlToText,
  parseSsoForm,
  parseSemesterList,
  parsePeriods,
  parseTimetable,
  loginPortal,
  fetchNtutTimetable,
  COURSE_AP_OU,
  USER_AGENT,
};
