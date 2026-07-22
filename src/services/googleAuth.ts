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
 */
export async function storeCalendarToken(
  accessToken: string,
  expiresIn?: number,
  serverManaged?: boolean
): Promise<void> {
  await saveTokens(accessToken, expiresIn, undefined, serverManaged);
}

/** 是否為伺服器代管的永久連接(設定頁顯示用) */
export async function isServerManaged(): Promise<boolean> {
  const t = await loadTokens();
  return !!t?.serverManaged;
}

/**
 * 取得有效 access token,依序嘗試:
 * 1. 本機尚未過期的 token
 * 2. 本機 refresh token 自行刷新(原生 code flow 才有)
 * 3. 伺服器代管的 refresh token(方案 C:網頁版永久連線的關鍵)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const t = await loadTokens();
  if (t && Date.now() < t.expiresAt - 60_000) return t.accessToken;

  if (t?.refreshToken) {
    try {
      const res = await AuthSession.refreshAsync(
        { clientId: clientIdForPlatform(), refreshToken: t.refreshToken },
        discovery
      );
      await saveTokens(res.accessToken, res.expiresIn, res.refreshToken ?? t.refreshToken);
      return res.accessToken;
    } catch {
      // 本機刷新失敗 → 改試伺服器
    }
  }

  const server = await fetchServerToken();
  if (server) {
    await saveTokens(server.accessToken, server.expiresIn, undefined, true);
    return server.accessToken;
  }
  return null;
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
