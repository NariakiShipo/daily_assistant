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

WebBrowser.maybeCompleteAuthSession();

export function useGoogleLogin(onResult: (ok: boolean, errorCode?: string) => void) {
  const isWeb = Platform.OS === 'web';
  const [busy, setBusy] = useState(false);

  // 原生:取得 Google id_token
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleOAuth.webClientId || undefined,
    iosClientId: googleOAuth.iosClientId || undefined,
    androidClientId: googleOAuth.androidClientId || undefined,
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
            onResult(true);
          } catch (e) {
            onResult(false, (e as { code?: string })?.code);
          } finally {
            setBusy(false);
          }
        } else {
          onResult(false);
        }
      } else if (response.type === 'error') {
        onResult(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signIn = async () => {
    if (isWeb) {
      setBusy(true);
      try {
        await signInWithGooglePopup();
        onResult(true);
      } catch (e) {
        onResult(false, (e as { code?: string })?.code);
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
