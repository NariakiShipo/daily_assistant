/**
 * ⚙️ 服務憑證設定
 *
 * 實際值放在專案根目錄的 .env(不進版控),格式見 .env.example。
 * 改了 .env 之後要用 `npx expo start -c` 重啟才會生效。
 *
 * 注意:Expo 只會靜態置換「直接寫出」的 process.env.EXPO_PUBLIC_xxx,
 * 不能用變數動態取值,所以以下都是逐一明寫。
 */

export const googleOAuth = {
  /** Web 應用程式用戶端(npm run web 用) */
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  /** iOS 用戶端(development build 用) */
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  /** Android 用戶端(development build 用) */
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
};

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

/**
 * 網頁推播的 VAPID 公開金鑰。
 * 是公開值(本來就會出現在前端 bundle),與 refresh token 那類機密不同。
 */
export const vapidKey = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY ?? '';

export const isPushConfigured = (): boolean => !!vapidKey && isFirebaseConfigured();

export const isGoogleConfigured = (): boolean =>
  !!(googleOAuth.webClientId || googleOAuth.iosClientId || googleOAuth.androidClientId);

export const isFirebaseConfigured = (): boolean =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId);
