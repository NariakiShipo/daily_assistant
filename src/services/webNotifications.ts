/**
 * 網頁版的本機通知(Web Notification API)。
 *
 * 為什麼不是真正的推播:
 * 真推播需要 Service Worker + Push API + 一台推播伺服器(VAPID / FCM),
 * 而本專案的後端只有幾支 Cloud Functions。這裡採務實作法——用計時器在
 * 網頁開著的時候送出通知,涵蓋「白天開著分頁」這個最常見的情境。
 * 分頁關掉就不會響,UI 上必須誠實說明這一點。
 *
 * setTimeout 的長延遲不可靠(瀏覽器把延遲存成 32 位元,超過約 24.8 天會立刻觸發),
 * 因此只掛未來 24 小時內的提醒,更遠的等重掛時機到了再處理。
 */

/** 一則有排定時間的通知 */
export interface TimedNotification {
  key: string;
  title: string;
  body: string;
  fireAt: Date;
}

/** 只掛未來這段時間內的提醒 */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
/** 重掛間隔:讓超出 24 小時的提醒之後也排得到 */
const REARM_MS = 60 * 60 * 1000;

/** 依 tag 分組的計時器,重排時可整組清掉 */
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();

const canNotify = (): boolean =>
  typeof window !== 'undefined' && typeof Notification !== 'undefined';

/** 目前是否已取得通知權限 */
export const hasWebPermission = (): boolean =>
  canNotify() && Notification.permission === 'granted';

/** 要求通知權限(已拒絕過的瀏覽器不會再跳窗,直接回 false) */
export async function requestWebPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** 立即送出一則通知 */
export function showWebNotification(title: string, body: string): void {
  if (!hasWebPermission()) return;
  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch {
    // 部分瀏覽器(如行動版 Safari)不允許直接 new Notification,靜默略過
  }
}

/** 清掉某組已掛上的通知計時器 */
export function cancelWebNotifications(tag: string): void {
  for (const t of timers.get(tag) ?? []) clearTimeout(t);
  timers.delete(tag);
}

/**
 * 掛上一組通知計時器(會先清掉同 tag 的舊計時器)。
 * 回傳實際掛上的則數(超出 24 小時的不算)。
 */
export function scheduleWebNotifications(tag: string, list: TimedNotification[]): number {
  if (!hasWebPermission()) return 0;
  cancelWebNotifications(tag);

  const now = Date.now();
  const handles: ReturnType<typeof setTimeout>[] = [];
  let armed = 0;
  let hasLater = false;

  for (const n of list) {
    const delay = n.fireAt.getTime() - now;
    if (delay <= 0) continue;
    if (delay > MAX_TIMER_MS) {
      hasLater = true;
      continue;
    }
    handles.push(setTimeout(() => showWebNotification(n.title, n.body), delay));
    armed++;
  }

  // 還有更遠的提醒 → 一小時後用同一份清單重掛(fireAt 是絕對時間,不會過期失準)
  if (hasLater) {
    handles.push(setTimeout(() => scheduleWebNotifications(tag, list), REARM_MS));
  }

  timers.set(tag, handles);
  return armed;
}
