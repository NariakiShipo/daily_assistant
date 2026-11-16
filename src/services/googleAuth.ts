/**
 * Google 日曆 token 儲存與刷新
 *
 * 日曆授權已綁定「帳號」的 Google 登入(見 googleLogin.ts / auth.ts):
 * 登入時一併取得 access token 存到這裡。
 * 這個模組負責儲存、過期檢查與(有 refresh token 時)自動刷新。
 */
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { googleOAuth } from '../config';
import { fetchServerToken } from './calendarBackend';

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const TOKEN_KEY = 'daily-assistant:google-tokens:v1';

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt: number;
  /** true = 伺服器代管 refresh token(永久連接),過期會自動向後端續期 */
  serverManaged?: boolean;
}

const clientIdForPlatform = (): string =>
  Platform.select({
    ios: googleOAuth.iosClientId,
    android: googleOAuth.androidClientId,
    default: googleOAuth.webClientId,
  }) || googleOAuth.webClientId;

async function saveTokens(
  accessToken: string,
  expiresIn?: number,
  refreshToken?: string,
  serverManaged?: boolean
): Promise<void> {
  const tokens: StoredTokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn ?? 3600) * 1000,
    serverManaged,
  };
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

/**
 * 存入日曆 access token。
 * - Firebase Google 登入順手拿到的 token:無 refresh token,約 1 小時後過期(暫時連接)
 * - 「永久連接」流程換到的 token:serverManaged = true,過期會自動向後端續期
 *
 * serverManaged 未指定時沿用既有標記。Google 登入拿到的雖然是一小時的臨時 token,
 * 但伺服器上的 refresh token 還在,不能因此把永久連接降級成暫時——否則設定頁會顯示
 * 「暫時」並引導使用者再登入一次,一小時後再斷,永遠繞不出這個圈。
 * 明確傳 false(永久連接流程確認 Google 沒發 refresh token)才會真的清掉標記。
 */
export async function storeCalendarToken(
  accessToken: string,
  expiresIn?: number,
  serverManaged?: boolean
): Promise<void> {
  const managed = serverManaged ?? (await loadTokens())?.serverManaged;
  await saveTokens(accessToken, expiresIn, undefined, managed);
}

/** 是否為伺服器代管的永久連接(設定頁顯示用) */
export async function isServerManaged(): Promise<boolean> {
  const t = await loadTokens();
  return !!t?.serverManaged;
}

export interface TokenResult {
  token: string | null;
  /**
   * 拿不到 token,但也不代表使用者沒連接——後端這次問不到(冷啟動、網路、逾時)。
   * 呼叫端不應據此把狀態改成斷線,維持現狀等下次即可。
   */
  uncertain: boolean;
}

/**
 * 取得有效 access token,依序嘗試:
 * 1. 本機尚未過期的 token
 * 2. 本機 refresh token 自行刷新(原生 code flow 才有)
 * 3. 伺服器代管的 refresh token(方案 C:網頁版永久連線的關鍵)
 */
export async function getAccessTokenResult(): Promise<TokenResult> {
  const t = await loadTokens();
  if (t && Date.now() < t.expiresAt - 60_000) return { token: t.accessToken, uncertain: false };

  if (t?.refreshToken) {
    try {
      const res = await AuthSession.refreshAsync(
        { clientId: clientIdForPlatform(), refreshToken: t.refreshToken },
        discovery
      );
      await saveTokens(res.accessToken, res.expiresIn, res.refreshToken ?? t.refreshToken);
      return { token: res.accessToken, uncertain: false };
    } catch {
      // 本機刷新失敗 → 改試伺服器
    }
  }

  const server = await fetchServerToken();
  if (server.status === 'ok') {
    await saveTokens(server.token.accessToken, server.token.expiresIn, undefined, true);
    return { token: server.token.accessToken, uncertain: false };
  }
  if (server.status === 'disconnected' && t?.serverManaged) {
    // 'unavailable' 不進這裡:那是這次問不到,動它會把暫時失敗變成真的斷線。
    if (server.reason === 'signed-out') {
      // 前端沒登入,伺服器根本沒被問到,綁定通常還在——登出帳號不該解除伺服器綁定
      // (只有「中斷連接」會),所以 token 留著。但 serverManaged 在沒登入時無從驗證,
      // 留著會被下一次「暫時連接」經由 storeCalendarToken 的 ?? 繼承,讓設定頁誤顯示
      // 「永久」並把「永久連接」按鈕藏起來。降級成暫時,下次問到伺服器再升回去。
      // 直接覆寫整筆並保留原本的 expiresAt——不能走 saveTokens,它會用 expiresIn
      // 重算到期時間,把這顆早就過期的 token 復活成再有效一小時。
      const downgraded: StoredTokens = { ...t, serverManaged: false };
      await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(downgraded));
    } else {
      // 伺服器明確說沒有綁定('never' / 'revoked'):使用者撤銷了授權,或換了帳號。
      // 清掉過時的永久標記,否則設定頁會一直顯示「已連接(永久)」。
      // 重讀一次再比對:從函式開頭讀到 t 到現在可能隔了數十秒(waitForAuthReady 8 秒
      // + 冷啟動 + 重試),期間使用者可能剛跑完「永久連接」寫入了新 token,
      // 無條件刪除會把那顆剛拿到的新 token 一起刪掉。
      const cur = await loadTokens();
      if (cur && cur.accessToken === t.accessToken) await AsyncStorage.removeItem(TOKEN_KEY);
    }
  }
  return { token: null, uncertain: server.status === 'unavailable' };
}

/** 取得有效 access token,取不到回 null(不需要區分原因時用這個) */
export async function getValidAccessToken(): Promise<string | null> {
  return (await getAccessTokenResult()).token;
}

export async function signOutGoogle(): Promise<void> {
  const t = await loadTokens();
  await AsyncStorage.removeItem(TOKEN_KEY);
  if (t?.accessToken) {
    try {
      await AuthSession.revokeAsync({ token: t.accessToken }, discovery);
    } catch {
      /* ignore */
    }
  }
}
