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
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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
      throw new HttpsError('failed-precondition', `Google 授權碼交換失敗:${e.message}`);
    }

    const docRef = db.collection(TOKENS_COLLECTION).doc(uid);
    if (json.refresh_token) {
      await docRef.set({
        refreshToken: json.refresh_token,
        scope: json.scope ?? '',
        email: request.auth.token?.email ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    // 沒拿到新 refresh token 時,若先前已有存檔仍算永久連接
    const permanent = !!json.refresh_token || (await docRef.get()).exists;

    return {
      accessToken: json.access_token,
      expiresIn: json.expires_in ?? 3600,
      permanent,
    };
  }
);

/**
 * 取得新的 access token:前端本機 token 過期時呼叫。
 * 用保管的 refresh token 向 Google 換新;refresh token 失效(使用者撤銷)則清除存檔。
 */
exports.getCalendarToken = onCall(
  { region: REGION, secrets: [GOOGLE_CLIENT_SECRET] },
  async (request) => {
    const uid = requireUid(request);
    const docRef = db.collection(TOKENS_COLLECTION).doc(uid);
    const snap = await docRef.get();
    const refreshToken = snap.exists ? snap.data().refreshToken : null;
    if (!refreshToken) return { connected: false };

    try {
      const json = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID.value(),
        client_secret: GOOGLE_CLIENT_SECRET.value(),
      });
      return {
        connected: true,
        accessToken: json.access_token,
        expiresIn: json.expires_in ?? 3600,
      };
    } catch (e) {
      // invalid_grant = refresh token 已被撤銷或過期 → 視為未連接
      if (e.oauthError === 'invalid_grant') {
        await docRef.delete();
        return { connected: false };
      }
      throw new HttpsError('unavailable', `更新 Google token 失敗:${e.message}`);
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
