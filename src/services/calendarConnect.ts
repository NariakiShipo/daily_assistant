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

/** 把 OAuth 錯誤轉成看得懂的訊息(AuthError 物件直接 String() 會變成 [object Object]) */
export function oauthErrorMessage(e: unknown): string {
  if (!e) return '請再試一次。';
  if (e instanceof Error && e.message) return e.message;
  const err = e as { code?: string; error?: string; description?: string; message?: string };
  const code = err.code ?? err.error ?? '';
  if (code === 'redirect_uri_mismatch') {
    return (
      'redirect_uri_mismatch:Google 不認得這個網址。\n' +
      '請到 Google Cloud Console → 憑證 → Web OAuth 用戶端 →「已授權的重新導向 URI」,' +
      '加入目前網址(不含結尾斜線)。'
    );
  }
  if (code === 'access_denied') return '你在 Google 同意畫面按了取消。';
  const detail = err.description ?? err.message ?? '';
  if (code && detail) return `${code}:${detail}`;
  return code || detail || '請再試一次。';
}

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
    // Google 也可能用 200 帶 error 參數回來(例如 redirect_uri_mismatch)
    if (response.params?.error) {
      onDone(false, {
        code: response.params.error,
        description: response.params.error_description,
      });
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const code = response.params?.code;
        if (!code) throw new Error('未取得授權碼');
        const tok = await exchangeGoogleCode(code, request?.codeVerifier ?? '', redirectUri);
        // 必須用後端回報的 permanent,不能寫死 true:
        // Google 沒有發 refresh token 時(且伺服器也沒有舊的),這次其實只是暫時連接,
        // 標成永久會讓 UI 顯示「授權自動續期」,一小時後卻斷線——正是原本的症狀。
        await storeCalendarToken(tok.accessToken, tok.expiresIn, tok.permanent);
        if (!tok.permanent) {
          throw new Error(
            'Google 沒有發出 refresh token,這次只是暫時連接(約 1 小時)。\n' +
              '通常是因為這個 Google 帳號先前已授權過而未撤銷。請到 ' +
              'myaccount.google.com/permissions 移除本應用程式的存取權後再連一次。'
          );
        }
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
