/* eslint-disable no-undef */
/**
 * 網頁版的背景推播 Service Worker。
 *
 * 分頁關閉或切到背景時,推播由這個 worker 接手顯示;分頁在前景時
 * 則由 src/services/push.ts 的 onMessage 處理(否則會顯示兩次)。
 *
 * 為什麼設定值從網址參數取:
 * Service Worker 拿不到打包時置換的 EXPO_PUBLIC_* 變數,又不想把設定寫死在
 * 進版控的檔案裡(專案慣例是放 .env)。因此註冊時把設定接在 query string,
 * 這裡再讀回來。這些都是公開值(本來就在前端 bundle 裡),不是機密。
 *
 * 這個檔案放在 public/,Expo 匯出網頁版時會原樣複製到 dist/ 根目錄。
 */
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;
const config = {
  apiKey: params.get('apiKey') ?? '',
  authDomain: params.get('authDomain') ?? '',
  projectId: params.get('projectId') ?? '',
  storageBucket: params.get('storageBucket') ?? '',
  messagingSenderId: params.get('messagingSenderId') ?? '',
  appId: params.get('appId') ?? '',
};

if (config.projectId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const { title, body, tag } = payload.data ?? {};
    if (!title) return;
    self.registration.showNotification(title, {
      body: body ?? '',
      icon: '/favicon.ico',
      // 同一筆行程的連續變更覆蓋前一則,不要洗版
      tag: tag || undefined,
      renotify: !!tag,
    });
  });
}

// 點通知時把既有分頁帶到前景,沒有分頁才開新的
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow('/') : undefined;
    })
  );
});
