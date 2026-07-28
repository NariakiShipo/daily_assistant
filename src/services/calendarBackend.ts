/**
 * Google 日曆授權後端的前端介面(Firebase Functions callable)
 *
 * refresh token 保管在伺服器(Firestore googleTokens/{uid},前端規則不可讀),
 * 前端只拿短效 access token —— 讓網頁版也能永久保持連線,不再一小時斷開。
 * 對應的後端在 functions/index.js。
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from './firebaseSync';
import { getCurrentUser } from './auth';

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

/** 併發去重:多筆行程同時同步時只打一次後端 */
let inflight: Promise<ServerToken | null> | null = null;

/** 向伺服器要新的 access token;未登入、未連接或後端未部署時回傳 null */
export async function fetchServerToken(): Promise<ServerToken | null> {
  if (!getCurrentUser()) return null;
  if (!inflight) {
    inflight = (async () => {
      const fn = callable<
        Record<string, never>,
        { connected: boolean; accessToken?: string; expiresIn?: number }
      >('getCalendarToken');
      if (!fn) return null;
      try {
        const res = await fn({});
        if (!res.data.connected || !res.data.accessToken) return null;
        return { accessToken: res.data.accessToken, expiresIn: res.data.expiresIn ?? 3600 };
      } catch {
        return null;
      }
    })().finally(() => {
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
