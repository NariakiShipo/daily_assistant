/**
 * Google OAuth(expo-auth-session)
 *
 * - Web:implicit flow,直接拿 access token(1 小時,過期需重新登入)
 * - iOS / Android(development build):code + PKCE,自動換取
 *   access token + refresh token,過期自動刷新
 * - Expo Go:Google 不接受 Expo Go 的 redirect,請改用 development build
 *   或在設定頁貼上測試 token
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { googleOAuth, isGoogleConfigured } from '../config';

WebBrowser.maybeCompleteAuthSession();

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const TOKEN_KEY = 'daily-assistant:google-tokens:v1';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

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

/**
 * Google 登入 hook(在設定頁使用)
 * onResult(true) = 登入成功且 token 已儲存
 */
export function useGoogleAuth(onResult: (ok: boolean) => void) {
  const isWeb = Platform.OS === 'web';
  const clientId = clientIdForPlatform();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'dailyassistant' });
  const [busy, setBusy] = useState(false);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || 'not-configured',
      scopes: SCOPES,
      redirectUri,
      responseType: isWeb ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
      usePKCE: !isWeb,
      extraParams: isWeb ? {} : { access_type: 'offline', prompt: 'consent' },
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;
    void (async () => {
      if (response.type !== 'success') {
        if (response.type === 'error') onResult(false);
        return;
      }
      setBusy(true);
      try {
        if (isWeb) {
          const auth = response.authentication;
          if (auth?.accessToken) {
            await saveTokens(auth.accessToken, auth.expiresIn);
            onResult(true);
          } else onResult(false);
        } else {
          const code = response.params.code;
          const tr = await AuthSession.exchangeCodeAsync(
            {
              clientId,
              code,
              redirectUri,
              extraParams: request?.codeVerifier
                ? { code_verifier: request.codeVerifier }
                : undefined,
            },
            discovery
          );
          await saveTokens(tr.accessToken, tr.expiresIn, tr.refreshToken);
          onResult(true);
        }
      } catch {
        onResult(false);
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    configured: isGoogleConfigured(),
    ready: !!request,
    busy,
    signIn: () => promptAsync(),
  };
}
