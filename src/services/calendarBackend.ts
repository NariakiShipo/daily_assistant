/**
 * Google 日曆授權後端的前端介面(Firebase Functions callable)
 *
 * refresh token 保管在伺服器(Firestore googleTokens/{uid},前端規則不可讀),
 * 前端只拿短效 access token —— 讓網頁版也能永久保持連線,不再一小時斷開。
 * 對應的後端在 functions/index.js。
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { isFirebaseConfigured } from '../config';
import { getFirebaseApp } from './firebaseSync';
import { getCurrentUser, waitForAuthReady } from './auth';

/** 與 functions/index.js 的 REGION 一致 */
const REGION = 'asia-east1';

function callable<TReq, TRes>(name: string) {
  const app = getFirebaseApp();
  if (!app) return null;
  return httpsCallable<TReq, TRes>(getFunctions(app, REGION), name);
}

export interface ServerToken {
  accessToken: string;
  expiresIn: number;
}

/** 授權碼換 token(伺服器存 refresh token);回傳 access token 供立即使用 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<ServerToken & { permanent: boolean }> {
  const fn = callable<
    { code: string; codeVerifier: string; redirectUri: string },
    { accessToken: string; expiresIn: number; permanent: boolean }
  >('exchangeGoogleCode');
  if (!fn) throw new Error('Firebase 尚未設定');
  const res = await fn({ code, codeVerifier, redirectUri });
  return res.data;
}

/**
 * 向伺服器要 token 的結果。
 *
 * 'disconnected'(伺服器說沒有綁定)與 'unavailable'(這次問不到)必須分開:
 * 兩者混成同一個 null 的話,一次冷啟動或網路抖動就會被當成使用者沒連接,
 * 把「已連接」的狀態寫成斷線,而且不會自己恢復。
 */
export type ServerTokenResult =
  | { status: 'ok'; token: ServerToken }
  | { status: 'disconnected'; reason: DisconnectReason }
  | { status: 'unavailable' };

/**
 * 為什麼沒有 token。
 * - 'never'      伺服器上從來沒有這個帳號的綁定
 * - 'revoked'    綁定過但 refresh token 已失效(使用者撤銷,或同意畫面停在 Testing 滿 7 天)
 * - 'signed-out' 前端沒登入帳號 —— 伺服器根本沒被問到,綁定很可能還在
 */
export type DisconnectReason = 'never' | 'revoked' | 'signed-out';

/** 重試間隔;主要對付 asia-east1 + Secret Manager 的冷啟動 */
const RETRY_DELAYS_MS = [500, 2000];

/** 重試也沒用的錯誤:身分有問題,或函式根本沒部署 */
const NO_RETRY_CODES = ['functions/unauthenticated', 'functions/not-found'];

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function requestServerToken(): Promise<ServerTokenResult> {
  const fn = callable<
    Record<string, never>,
    { connected: boolean; accessToken?: string; expiresIn?: number; reason?: DisconnectReason }
  >('getCalendarToken');
  if (!fn) return { status: 'unavailable' }; // Firebase 未設定:不確定,不是「沒連接」

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fn({});
      // 後端明確回報未綁定(沒有 refresh token,或 refresh token 已被撤銷)。
      // reason 缺席代表後端還是加上這個欄位之前的版本,保守當成「從沒連過」。
      if (!res.data.connected || !res.data.accessToken) {
        return { status: 'disconnected', reason: res.data.reason ?? 'never' };
      }
      return {
        status: 'ok',
        token: { accessToken: res.data.accessToken, expiresIn: res.data.expiresIn ?? 3600 },
      };
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (NO_RETRY_CODES.includes(code) || attempt >= RETRY_DELAYS_MS.length) {
        return { status: 'unavailable' };
      }
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/**
 * 併發去重:多筆行程同時同步時只打一次後端。
 *
 * 必須綁住發起時的 uid。身分檢查在這之外,而一次請求(asia-east1 冷啟動 + 兩次重試)
 * 可以活上好幾分鐘;期間換帳號登入的話,B 會直接拿到用 A 的 ID token 換來的 access
 * token,接著把 B 的行程寫進 A 的 Google 日曆。
 */
let inflight: { uid: string; id: number; promise: Promise<ServerTokenResult> } | null = null;
let nextInflightId = 0;

/** 向伺服器要新的 access token */
export async function fetchServerToken(): Promise<ServerTokenResult> {
  // 一定要等登入狀態還原完:callable 得帶 ID token,而 Firebase 還原 session 比
  // App 啟動慢得多。少了這一步,開頁面時 getCurrentUser() 還是 null,永久連接會被
  // 誤判成斷線——本機 token 過期後每次開啟都必中,正是「一小時後就斷」的來源。
  // 沒有 Firebase 設定就不可能有伺服器代管綁定——這是確定的答案,不是「問不到」。
  // 混進 unavailable 的話 isConnectedAsync() 會永遠回 null,設定頁的連接狀態
  // 從此凍結在舊值,再也不會自我更正。要在 waitForAuthReady 之前擋掉:
  // 它的 false 同時代表逾時與未設定,分不出來。
  if (!isFirebaseConfigured()) return { status: 'disconnected', reason: 'never' };

  // 逾時(8 秒)代表登入狀態到現在仍然未知,不是「沒登入」。當成 disconnected 的話
  // getAccessTokenResult 會順手清掉本機的永久連接標記,比不修還糟。
  if (!(await waitForAuthReady())) return { status: 'unavailable' };

  const user = getCurrentUser();
  if (!user) return { status: 'disconnected', reason: 'signed-out' };

  if (!inflight || inflight.uid !== user.uid) {
    const id = ++nextInflightId;
    inflight = {
      uid: user.uid,
      id,
      // 只清掉自己這筆:期間若已被換帳號的新請求取代,別把新的誤清
      promise: requestServerToken().finally(() => {
        if (inflight?.id === id) inflight = null;
      }),
    };
  }
  return inflight.promise;
}

/** 解除伺服器端綁定(撤銷並刪除 refresh token);失敗靜默 */
export async function disconnectServerCalendar(): Promise<void> {
  const fn = callable<Record<string, never>, { ok: boolean }>('disconnectCalendar');
  if (!fn) return;
  try {
    await fn({});
  } catch {
    // 後端未部署或網路失敗:本機 token 已清除,不擋操作
  }
}
