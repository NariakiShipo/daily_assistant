/**
 * 「永久連接 Google 日曆」hook(方案 C 的前端入口)
 *
 * 走 authorization code + PKCE:彈出 Google 同意畫面拿授權碼,
 * 交給 Functions(calendarBackend.exchangeGoogleCode)用 client secret 換 token,
 * refresh token 存伺服器 → 之後 access token 過期自動續期,不再一小時斷線。
 *
 * 僅網頁版提供(code flow 的 redirect URI 綁定 Web OAuth 用戶端);
 * 手機版登入同一帳號後會自動沿用伺服器代管的授權。
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { googleOAuth } from '../config';
import { exchangeGoogleCode } from './calendarBackend';
import { storeCalendarToken } from './googleAuth';

WebBrowser.maybeCompleteAuthSession();

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export function useCalendarConnect(
  onDone: (ok: boolean, error?: unknown) => void,
  /** 預先帶入的 Google 帳號(減少選帳號步驟) */
  loginHint?: string
) {
  const [busy, setBusy] = useState(false);
  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleOAuth.webClientId,
      scopes: [CALENDAR_SCOPE],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        // 兩者缺一不可:offline 才會發 refresh token,consent 確保每次重連都發新的
        access_type: 'offline',
        prompt: 'consent',
        ...(loginHint ? { login_hint: loginHint } : {}),
      },
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      // 使用者關掉視窗(cancel/dismiss)不打擾;真正的錯誤才回報
      if (response.type === 'error') onDone(false, response.error);
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const code = response.params?.code;
        if (!code) throw new Error('未取得授權碼');
        const tok = await exchangeGoogleCode(code, request?.codeVerifier ?? '', redirectUri);
        await storeCalendarToken(tok.accessToken, tok.expiresIn, true);
        onDone(true);
      } catch (e) {
        onDone(false, e);
      } finally {
        setBusy(false);
      }
    })();
    // request/redirectUri 與 response 同一次流程,只需跟著 response 觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    /** 永久連接僅網頁版可用;需設定 Web OAuth 用戶端 ID */
    ready: Platform.OS === 'web' && !!googleOAuth.webClientId && !!request,
    busy,
    connect: () => void promptAsync(),
  };
}
