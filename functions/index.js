/**
 * Google 日曆授權後端(方案 C:伺服器代管 refresh token)
 *
 * 為什麼需要後端:網頁版拿 refresh token 必須走 authorization code flow,
 * 而 code 換 token 需要 client secret —— 純前端靜態站不能安全保存 secret,
 * 所以由 Functions 代為交換並保管 refresh token。
 *
 * 儲存位置:Firestore `googleTokens/{uid}`。
 * firestore.rules 的 catch-all 已擋掉所有前端存取,只有 Admin SDK(這裡)能讀寫。
 *
 * 部署前置(見 README):
 * 1. Firebase 專案升級 Blaze 方案(Functions 需要)
 * 2. `firebase functions:secrets:set GOOGLE_CLIENT_SECRET`(貼 Web OAuth 用戶端的 secret)
 * 3. functions/.env 內含 GOOGLE_CLIENT_ID(Web OAuth 用戶端 ID,非機密)
 *
 * 執行環境 Node 22(Node 20 於 2026-10-30 停用)。
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { buildEventPush, targetTokens } = require('./pushMessage');

initializeApp();
const db = getFirestore();

const GOOGLE_CLIENT_ID = defineString('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');

/** 與前端 getFunctions(app, REGION) 一致 */
const REGION = 'asia-east1';
const TOKENS_COLLECTION = 'googleTokens';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** 呼叫 Google token endpoint;失敗時丟出帶 oauthError 代碼的 Error */
async function tokenRequest(params) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || `HTTP ${res.status}`);
    err.oauthError = json.error || '';
    throw err;
  }
  return json;
}

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '請先登入帳號再連接日曆。');
  return uid;
}

/**
 * 授權碼換 token:前端完成 Google 同意畫面後,把 code 交來這裡。
 * 伺服器補上 client secret 交換,refresh token 落地 Firestore,
 * access token 回傳給前端立即使用。
 */
exports.exchangeGoogleCode = onCall(
  { region: REGION, secrets: [GOOGLE_CLIENT_SECRET] },
  async (request) => {
    const uid = requireUid(request);
    const { code, codeVerifier, redirectUri } = request.data ?? {};
    if (typeof code !== 'string' || !code || typeof redirectUri !== 'string' || !redirectUri) {
      throw new HttpsError('invalid-argument', '缺少授權碼或 redirect URI。');
    }

    let json;
    try {
      json = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: GOOGLE_CLIENT_ID.value(),
        client_secret: GOOGLE_CLIENT_SECRET.value(),
        redirect_uri: redirectUri,
        ...(typeof codeVerifier === 'string' && codeVerifier
          ? { code_verifier: codeVerifier }
          : {}),
      });
    } catch (e) {
      // 初次連接最容易壞(redirect_uri 不符、授權碼過期、client secret 設錯),
      // 而 HttpsError 不會被框架寫進 log —— 少了這行,Cloud Logging 一片空白。
      // redirectUri 是公開網址可以印;code / codeVerifier 是憑證,絕不能印。
      logger.error('exchangeGoogleCode: 交換失敗', e, {
        uid,
        oauthError: e.oauthError ?? '',
        oauthErrorDescription: e.message,
        redirectUri,
        hasCodeVerifier: typeof codeVerifier === 'string' && !!codeVerifier,
      });
      throw new HttpsError('failed-precondition', `Google 授權碼交換失敗:${e.message}`);
    }

    const docRef = db.collection(TOKENS_COLLECTION).doc(uid);
    if (json.refresh_token) {
      // 不用 merge:整份覆寫,順便清掉上次失效時留下的 revokedAt
      await docRef.set({
        refreshToken: json.refresh_token,
        scope: json.scope ?? '',
        email: request.auth.token?.email ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    // 沒拿到新 refresh token 時,若先前已有「還有效的」存檔仍算永久連接。
    // 注意要看 refreshToken 欄位而不是文件存在:失效時我們保留文件(只把欄位清成 null)
    // 留稽核線索,只看 exists 會把已撤銷的綁定誤報成永久連接。
    const permanent = !!json.refresh_token || !!(await docRef.get()).data()?.refreshToken;
    logger.info('exchangeGoogleCode', {
      uid,
      permanent,
      gotRefreshToken: !!json.refresh_token,
      scope: json.scope ?? '',
    });

    return {
      accessToken: json.access_token,
      expiresIn: json.expires_in ?? 3600,
      permanent,
    };
  }
);

/**
 * 取得新的 access token:前端本機 token 過期時呼叫。
 * 用保管的 refresh token 向 Google 換新;refresh token 失效則標記為已撤銷。
 *
 * 回傳的 reason 讓前端能分辨「從沒連過」與「連過但授權死了」——前者該引導去連接,
 * 後者該引導重新授權。少了它兩種情況的畫面一模一樣,使用者只會覺得「又斷了」。
 *
 * 三條出口都留 log:沒有它就無法分辨這支「根本沒被呼叫」(前端時序問題)、
 * 「回報未連接」(綁定真的沒了)與「丟 unavailable」(後端或 Google 暫時失敗),
 * 而這三種情況的修法完全不同。
 */
exports.getCalendarToken = onCall(
  { region: REGION, secrets: [GOOGLE_CLIENT_SECRET] },
  async (request) => {
    const uid = requireUid(request);
    const docRef = db.collection(TOKENS_COLLECTION).doc(uid);
    const snap = await docRef.get();
    const refreshToken = snap.exists ? snap.data().refreshToken : null;
    if (!refreshToken) {
      // 文件在但沒 token = 之前被標記撤銷過;文件不在 = 這個帳號從沒連過
      const reason = snap.exists ? 'revoked' : 'never';
      logger.info('getCalendarToken: 未連接', { uid, reason });
      return { connected: false, reason };
    }

    try {
      const json = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID.value(),
        client_secret: GOOGLE_CLIENT_SECRET.value(),
      });
      logger.info('getCalendarToken: 續期成功', { uid, expiresIn: json.expires_in ?? 3600 });
      return {
        connected: true,
        accessToken: json.access_token,
        expiresIn: json.expires_in ?? 3600,
      };
    } catch (e) {
      if (e.oauthError === 'invalid_grant') {
        // refresh token 已失效。**不刪文件**,只把 token 清成 null 並記下時間:
        // invalid_grant 不等於使用者撤銷 —— OAuth 同意畫面停在 Testing 時,
        // refresh token 每 7 天就會自己過期。整份刪掉會把唯一的線索一起刪掉,
        // 「為什麼又斷了」就永遠查不出來。重新授權時 exchangeGoogleCode 會整份覆寫。
        await docRef.set(
          { refreshToken: null, revokedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        // 欄位不可叫 message:firebase-functions 的 entryFromArgs 會用日誌文字
        // 蓋掉結構化物件的 message 鍵(out = {...entry, severity}; out.message = message),
        // Google 回的錯誤描述會整個消失。
        logger.warn('getCalendarToken: refresh token 失效', {
          uid,
          oauthError: e.oauthError,
          oauthErrorDescription: e.message,
          hint: '若 OAuth 同意畫面仍是 Testing,refresh token 每 7 天必過期',
        });
        return { connected: false, reason: 'revoked' };
      }
      // 把 Error 實例一起傳進去:ERROR severity 的參數裡沒有 Error 時,
      // firebase-functions 會把 message 換成指向這行 logger 呼叫的合成堆疊。
      logger.error('getCalendarToken: 續期失敗', e, {
        uid,
        oauthError: e.oauthError ?? '',
        oauthErrorDescription: e.message,
      });
      throw new HttpsError('unavailable', `更新 Google token 失敗:${e.message}`);
    }
  }
);

/**
 * 共用行程變動 → 推播給空間內其他裝置。
 *
 * 為什麼需要:App 沒開時 Firestore 的即時訂閱不會執行,對方改了行程你不會知道。
 * 本機通知只在 App 執行中有效,這支補的正是那個缺口。
 *
 * 不推播的情況(判斷邏輯在 pushMessage.js,有單元測試):
 * - 批次重寫(登入/加入空間時的 uploadLocal)——否則對方會被幾十則推播洗版
 * - 內容沒有實際變更
 * - 改動來源那台裝置自己
 */
exports.onEventWritten = onDocumentWritten(
  { region: REGION, document: 'spaces/{spaceId}/events/{eventId}' },
  async (event) => {
    const before = event.data?.before?.data() ?? null;
    const after = event.data?.after?.data() ?? null;

    const push = buildEventPush(before, after, Date.now());
    if (!push.send) return;

    const { spaceId } = event.params;
    const snap = await db.collection('spaces').doc(spaceId).collection('pushTokens').get();
    const devices = snap.docs.map((d) => ({ id: d.id, token: d.data().token }));
    const tokens = targetTokens(devices, push.fromDevice);
    if (!tokens.length) return;

    // 只送 data payload:網頁端統一由 service worker / onMessage 顯示,
    // 用 notification payload 會讓前景訊息被瀏覽器自行處理而重複顯示
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      data: { title: push.title, body: push.body, tag: push.tag ?? '' },
      webpush: { headers: { Urgency: 'normal' } },
    });

    // 清掉已失效的 token,否則會一直累積並拖慢每次推播
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code ?? '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-argument') ||
        code.includes('invalid-registration-token')
      ) {
        dead.push(tokens[i]);
      }
    });
    if (dead.length) {
      const stale = devices.filter((d) => dead.includes(d.token));
      await Promise.all(
        stale.map((d) =>
          db.collection('spaces').doc(spaceId).collection('pushTokens').doc(d.id).delete()
        )
      );
    }
  }
);

/** 解除綁定:撤銷 refresh token 並刪除存檔(僅「中斷連接」時呼叫,登出不呼叫) */
exports.disconnectCalendar = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const docRef = db.collection(TOKENS_COLLECTION).doc(uid);
  const snap = await docRef.get();
  const refreshToken = snap.exists ? snap.data().refreshToken : null;
  await docRef.delete();
  logger.info('disconnectCalendar: 已解除綁定', { uid, hadRefreshToken: !!refreshToken });
  if (refreshToken) {
    // 撤銷失敗不影響解除結果(token 之後自然過期)
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    }).catch(() => undefined);
  }
  return { ok: true };
});
