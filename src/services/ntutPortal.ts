/**
 * 從北科入口網站讀課表的前端介面(Firebase Functions callable)。
 *
 * 學校的伺服器沒有 CORS,網頁版 / PWA 不能直接連,所以由後端 fetchNtutTimetable
 * 代為登入並讀取課程系統的選課表(functions/ntut.js)。
 *
 * 密碼只放在這次請求裡:App 不儲存,後端也不落地。
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { isFirebaseConfigured } from '../config';
import { getFirebaseApp } from './firebaseSync';
import { getCurrentUser, waitForAuthReady } from './auth';
import { NtutPortalResult, describeNtutSyncError, validatePortalResult } from './ntutCourse';

/** 與 functions/index.js 的 REGION 一致 */
const REGION = 'asia-east1';

/** 後端要依序打 5 個學校網址,學校慢的時候整趟可能要二三十秒 */
const CALL_TIMEOUT_MS = 70_000;

interface Request {
  studentId: string;
  password: string;
  year?: number;
  sem?: number;
}

/**
 * 登入北科入口網站並讀取選課表;year / sem 不給就讀最新一學期。
 * 失敗時丟出的 Error.message 已是可直接顯示的中文。
 */
export async function fetchNtutTimetable(req: Request): Promise<NtutPortalResult> {
  const app = isFirebaseConfigured() ? getFirebaseApp() : null;
  if (!app) {
    throw new Error('這個功能需要 Firebase 後端:請先依 README 設定 Firebase 並部署 Functions。');
  }
  // 剛開 App 時登入狀態還在還原,沒等的話會把已登入誤判成沒登入。
  // 逾時(回 false)代表還不知道,就直接打後端,讓後端回 unauthenticated 來判斷。
  if ((await waitForAuthReady()) && !getCurrentUser()) {
    throw new Error('請先在 ☰ 側邊選單 →「帳號與雲端同步」登入帳號,才能從北科入口網站同步課表。');
  }

  const fn = httpsCallable<Request, unknown>(getFunctions(app, REGION), 'fetchNtutTimetable', {
    timeout: CALL_TIMEOUT_MS,
  });
  let data: unknown;
  try {
    data = (await fn(req)).data;
  } catch (e) {
    throw new Error(describeNtutSyncError(e));
  }
  return validatePortalResult(data);
}
