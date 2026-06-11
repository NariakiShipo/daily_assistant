/**
 * Google 登入 hook(Firebase Auth)
 *
 * - Web:直接用 Firebase 的 signInWithPopup
 * - iOS / Android:用 expo-auth-session 取得 Google id_token,
 *   再換成 Firebase 憑證登入(需要在 .env 設定對應平台的 OAuth client ID)
 *
 * 與 googleAuth.ts 不同:那個是為了「Google 日曆 API」拿 access token;
 * 這裡是為了「Firebase 帳號登入」拿 id_token。
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { googleOAuth, isGoogleConfigured } from '../config';
import { signInWithGoogleIdToken, signInWithGooglePopup } from './auth';
import { storeCalendarToken } from './googleAuth';

WebBrowser.maybeCompleteAuthSession();

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/** ok:登入是否成功;calendarConnected:是否同時連上 Google 日曆 */
export function useGoogleLogin(
  onResult: (ok: boolean, error?: unknown, calendarConnected?: boolean) => void
) {
  const isWeb = Platform.OS === 'web';
  const [busy, setBusy] = useState(false);

  // 原生:取得 Google id_token,並一併要求日曆權限
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleOAuth.webClientId || undefined,
    iosClientId: googleOAuth.iosClientId || undefined,
    androidClientId: googleOAuth.androidClientId || undefined,
    scopes: ['openid', 'profile', 'email', CALENDAR_SCOPE],
  });

  useEffect(() => {
    if (isWeb || !response) return;
    void (async () => {
      if (response.type === 'success') {
        const idToken = response.params?.id_token;
        if (idToken) {
          setBusy(true);
          try {
            await signInWithGoogleIdToken(idToken);
            // 若授權流程同時回傳 access token,順便連接日曆
            const accessToken = response.authentication?.accessToken;
            let calConnected = false;
            if (accessToken) {
              await storeCalendarToken(accessToken, response.authentication?.expiresIn);
              calConnected = true;
            }
            onResult(true, undefined, calConnected);
          } catch (e) {
            onResult(false, e);
          } finally {
            setBusy(false);
          }
        } else {
          onResult(false);
        }
      } else if (response.type === 'error') {
        onResult(false, response.error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signIn = async () => {
    if (isWeb) {
      setBusy(true);
      try {
        const { calendarToken, expiresIn } = await signInWithGooglePopup();
        let calConnected = false;
        if (calendarToken) {
          await storeCalendarToken(calendarToken, expiresIn);
          calConnected = true;
        }
        onResult(true, undefined, calConnected);
      } catch (e) {
        onResult(false, e);
      } finally {
        setBusy(false);
      }
    } else {
      await promptAsync();
    }
  };

  return {
    // web 只要 Firebase 設定好即可;原生還需要 OAuth client ID 與 request 就緒
    ready: isWeb || (isGoogleConfigured() && !!request),
    busy,
    signIn,
  };
}
