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
  refreshToken?: string
): Promise<void> {
  const tokens: StoredTokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn ?? 3600) * 1000,
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
 * 存入由其他流程(如 Firebase Google 登入)取得的日曆 access token。
 * 這類 token 沒有 refresh token,過期(約 1 小時)後需重新登入。
 */
export async function storeCalendarToken(accessToken: string, expiresIn?: number): Promise<void> {
  await saveTokens(accessToken, expiresIn);
}

/** 取得有效 access token;快過期且有 refresh token 時自動刷新 */
export async function getValidAccessToken(): Promise<string | null> {
  const t = await loadTokens();
  if (!t) return null;
  if (Date.now() < t.expiresAt - 60_000) return t.accessToken;
  if (!t.refreshToken) return null;
  try {
    const res = await AuthSession.refreshAsync(
      { clientId: clientIdForPlatform(), refreshToken: t.refreshToken },
      discovery
    );
    await saveTokens(res.accessToken, res.expiresIn, res.refreshToken ?? t.refreshToken);
    return res.accessToken;
  } catch {
    return null;
  }
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
