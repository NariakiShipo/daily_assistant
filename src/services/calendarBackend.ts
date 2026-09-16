/**
 * Google 日曆授權後端的前端介面(Firebase Functions callable)
 *
 * refresh token 保管在伺服器(Firestore googleTokens/{uid},前端規則不可讀),
 * 前端只拿短效 access token —— 讓網頁版也能永久保持連線,不再一小時斷開。
 * 對應的後端在 functions/index.js。
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
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
  | { status: 'disconnected' }
  | { status: 'unavailable' };

/** 重試間隔;主要對付 asia-east1 + Secret Manager 的冷啟動 */
const RETRY_DELAYS_MS = [500, 2000];

/** 重試也沒用的錯誤:身分有問題,或函式根本沒部署 */
const NO_RETRY_CODES = ['functions/unauthenticated', 'functions/not-found'];

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function requestServerToken(): Promise<ServerTokenResult> {
  const fn = callable<
    Record<string, never>,
    { connected: boolean; accessToken?: string; expiresIn?: number }
  >('getCalendarToken');
  if (!fn) return { status: 'unavailable' }; // Firebase 未設定:不確定,不是「沒連接」

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fn({});
      // 後端明確回報未綁定(沒有 refresh token,或 refresh token 已被撤銷)
      if (!res.data.connected || !res.data.accessToken) return { status: 'disconnected' };
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

/** 併發去重:多筆行程同時同步時只打一次後端 */
let inflight: Promise<ServerTokenResult> | null = null;

/** 向伺服器要新的 access token */
export async function fetchServerToken(): Promise<ServerTokenResult> {
  // 一定要等登入狀態還原完:callable 得帶 ID token,而 Firebase 還原 session 比
  // App 啟動慢得多。少了這一步,開頁面時 getCurrentUser() 還是 null,永久連接會被
  // 誤判成斷線——本機 token 過期後每次開啟都必中,正是「一小時後就斷」的來源。
  await waitForAuthReady();
  if (!getCurrentUser()) return { status: 'disconnected' };
  if (!inflight) {
    inflight = requestServerToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
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
