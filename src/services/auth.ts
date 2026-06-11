/**
 * Firebase Authentication(Email/密碼)
 *
 * 登入後 AppContext 會把帳號綁定到共享空間(users/{uid}.spaceId),
 * 並把本機資料合併上傳;其他裝置登入同一帳號即自動同步。
 *
 * 注意:需在 Firebase Console → Authentication → Sign-in method
 * 啟用「電子郵件/密碼」供應商,否則會收到 operation-not-allowed。
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  // RN 入口才有的匯出,web 型別檔沒有宣告
  // @ts-expect-error -- getReactNativePersistence 不在 web 型別中
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirebaseApp } from './firebaseSync';

let auth: Auth | null = null;

function getAuthInstance(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!auth) {
    auth =
      Platform.OS === 'web'
        ? getAuth(app) // web 預設持久化到 IndexedDB
        : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  }
  return auth;
}

export interface AuthUser {
  uid: string;
  email: string | null;
}

/** 訂閱登入狀態,回傳取消訂閱函式 */
export function onAuthChanged(cb: (u: AuthUser | null) => void): () => void {
  const a = getAuthInstance();
  if (!a) return () => undefined;
  return onAuthStateChanged(a, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
}

export async function signUpEmail(email: string, password: string): Promise<void> {
  const a = getAuthInstance();
  if (!a) throw new Error('Firebase 尚未設定');
  await createUserWithEmailAndPassword(a, email.trim(), password);
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const a = getAuthInstance();
  if (!a) throw new Error('Firebase 尚未設定');
  await signInWithEmailAndPassword(a, email.trim(), password);
}

export async function signOutUser(): Promise<void> {
  const a = getAuthInstance();
  if (!a) return;
  await signOut(a);
}

/** Google 登入(網頁:彈窗) */
export async function signInWithGooglePopup(): Promise<void> {
  const a = getAuthInstance();
  if (!a) throw new Error('Firebase 尚未設定');
  const provider = new GoogleAuthProvider();
  await signInWithPopup(a, provider);
}

/** Google 登入(手機:用 expo-auth-session 取得的 id_token 換 Firebase 憑證) */
export async function signInWithGoogleIdToken(idToken: string): Promise<void> {
  const a = getAuthInstance();
  if (!a) throw new Error('Firebase 尚未設定');
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(a, credential);
}

/** 把 Firebase Auth 錯誤碼轉成中文訊息 */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return '這個 Email 已註冊過,請直接登入。';
    case 'auth/invalid-email':
      return 'Email 格式不正確。';
    case 'auth/weak-password':
      return '密碼太短,至少需要 6 個字元。';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email 或密碼錯誤。';
    case 'auth/too-many-requests':
      return '嘗試次數過多,請稍後再試。';
    case 'auth/network-request-failed':
      return '網路連線失敗,請檢查網路。';
    case 'auth/operation-not-allowed':
      return '尚未啟用此登入方式:請到 Firebase Console → Authentication → Sign-in method 啟用(Email/密碼 或 Google)。';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '已取消 Google 登入。';
    case 'auth/popup-blocked':
      return '瀏覽器封鎖了登入彈窗,請允許彈出視窗後再試。';
    case 'auth/account-exists-with-different-credential':
      return '這個 Email 已用其他方式註冊,請改用原本的方式登入。';
    case 'auth/unauthorized-domain':
      return '此網域未授權:請到 Firebase Console → Authentication → Settings → 授權網域加入此網站。';
    case 'auth/configuration-not-found':
    case 'auth/internal-error':
      return 'Google 登入尚未設定完成:請到 Firebase Console → Authentication → Sign-in method 啟用 Google 供應商。';
    default: {
      const msg = (e as { message?: string })?.message;
      if (code) return `登入失敗(${code})`;
      if (msg) return `登入失敗:${msg}`;
      return '登入失敗,請稍後再試。';
    }
  }
}
