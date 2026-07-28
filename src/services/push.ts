/**
 * 跨裝置推播(FCM)的前端註冊。
 *
 * 與 webNotifications.ts 的分工:
 * - webNotifications:本機排程的提醒,分頁開著才會響
 * - 這裡:對方改了共用行程時,由伺服器推播,App 沒開也收得到
 *
 * 目前只實作網頁版。手機版要走 FCM 需要:
 * - Android:google-services.json + 重新 prebuild
 * - iOS:付費 Apple Developer 會員(APNs 金鑰);目前 plugins/withoutPushEntitlement.js
 *   會移除推播 entitlement,因為免費 Apple ID 簽名不支援
 * 在那之前手機版維持既有的本機通知。
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteToken, getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, deleteDoc, setDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { firebaseConfig, isPushConfigured, vapidKey } from '../config';
import { getFirebaseApp } from './firebaseSync';
import { showWebNotification } from './webNotifications';

const DEVICE_KEY = 'daily-assistant:device-id:v1';
const SW_PATH = '/firebase-messaging-sw.js';

const isWeb = Platform.OS === 'web';

/** 這台裝置的穩定識別碼:用來讓伺服器略過「改動來源」那台,不推播給自己 */
export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

/** 這個環境能不能用跨裝置推播 */
export function isPushSupported(): boolean {
  if (!isPushConfigured()) return false;
  if (!isWeb) return false; // 手機版尚未接上(見檔頭說明)
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/**
 * 註冊 service worker。
 *
 * Firebase 設定用 query string 傳進去:Service Worker 拿不到打包時置換的
 * EXPO_PUBLIC_* 變數,而把設定寫死在進版控的檔案裡不符合這個專案的慣例。
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });
  try {
    return await navigator.serviceWorker.register(`${SW_PATH}?${params.toString()}`);
  } catch {
    return null;
  }
}

/** 取得這台裝置的 FCM token(需要通知權限;被拒或不支援回傳 null) */
export async function getPushToken(): Promise<string | null> {
  if (!isPushSupported()) return null;
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return null;
  }
  const app = getFirebaseApp();
  if (!app) return null;
  const registration = await registerServiceWorker();
  if (!registration) return null;
  try {
    return await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    // 權限被撤銷、瀏覽器不支援、或 VAPID 金鑰不符
    return null;
  }
}

/**
 * 把這台裝置登記到共享空間,之後對方改動時就會推播過來。
 * 以 deviceId 為文件 ID:token 輪替時自動取代,不會累積成一堆失效 token。
 */
export async function registerForSpace(spaceId: string): Promise<boolean> {
  const token = await getPushToken();
  if (!token) return false;
  const app = getFirebaseApp();
  if (!app) return false;
  const deviceId = await getDeviceId();
  await setDoc(doc(getFirestore(app), 'spaces', spaceId, 'pushTokens', deviceId), {
    token,
    platform: Platform.OS,
    updatedAt: serverTimestamp(),
  });
  return true;
}

/** 取消登記(關閉推播或離開空間時) */
export async function unregisterForSpace(spaceId: string): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return;
  const deviceId = await getDeviceId();
  try {
    await deleteDoc(doc(getFirestore(app), 'spaces', spaceId, 'pushTokens', deviceId));
  } catch {
    // 沒登記過或網路失敗都不影響後續
  }
  if (isPushSupported()) {
    try {
      await deleteToken(getMessaging(app));
    } catch {
      /* ignore */
    }
  }
}

/**
 * 分頁在前景時的推播處理。
 *
 * 前景訊息不會觸發 service worker 的 onBackgroundMessage,必須自己顯示,
 * 否則使用者開著分頁反而什麼都收不到。
 */
export function listenForegroundPush(): () => void {
  if (!isPushSupported()) return () => undefined;
  const app = getFirebaseApp();
  if (!app) return () => undefined;
  try {
    return onMessage(getMessaging(app), (payload) => {
      const { title, body } = payload.data ?? {};
      if (title) showWebNotification(title, body ?? '');
    });
  } catch {
    return () => undefined;
  }
}
