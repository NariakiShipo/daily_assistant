/**
 * 通知模組(本機排程通知)
 *
 * MVP 使用 expo-notifications 的本機通知:
 * - 經期前 N 天提醒 + 預測開始日提醒
 * - 事件變更即時通知(共同編輯時提示對方改了什麼)
 *
 * 正式上線後的跨裝置推播(伴侶手機也收到):
 * - 改用 Expo Push API + Firebase Cloud Messaging
 * - 後端(Firebase Functions)監聽 Firestore 變更後發送推播
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CalendarEvent, CyclePrediction } from '../types';
import { formatDateZh, fromDateKey, todayKey } from '../utils/date';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // Web 推播需另行設定 service worker
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

const PERIOD_TAG = 'period-reminder';

/** 依預測結果排程經期提醒(會先清掉舊的) */
export async function schedulePeriodReminders(
  prediction: CyclePrediction,
  remindDaysBefore: number
): Promise<number> {
  if (Platform.OS === 'web') return 0;

  await cancelPeriodReminders();

  const today = todayKey();
  let scheduled = 0;

  const schedule = async (dateKey: string, title: string, body: string) => {
    if (dateKey <= today) return;
    const when = fromDateKey(dateKey);
    when.setHours(9, 0, 0, 0); // 早上 9 點提醒
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { tag: PERIOD_TAG } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
      },
    });
    scheduled++;
  };

  const beforeDay = addDaysKey(prediction.nextStart, -remindDaysBefore);
  await schedule(
    beforeDay,
    '經期提醒',
    `預計 ${formatDateZh(prediction.nextStart)} 前後經期將至,記得準備用品、多休息。`
  );
  await schedule(
    prediction.nextStart,
    '經期預測日',
    `今天是推算的經期開始日(${formatDateZh(prediction.windowStart)} – ${formatDateZh(
      prediction.windowEnd
    )} 區間)。來了記得記錄一下。`
  );
  return scheduled;
}

export async function cancelPeriodReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content.data as { tag?: string } | null)?.tag === PERIOD_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** 共同日曆變更通知(MVP:本機通知;正式版改為 FCM 推播給對方) */
export async function notifyEventChange(
  ev: CalendarEvent,
  byUserName: string,
  action: '新增' | '修改' | '刪除'
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `日曆更新:${byUserName} ${action}了行程`,
      body: `${formatDateZh(ev.date)} ${ev.startTime} ${ev.title}`,
    },
    trigger: null, // 立即送出
  });
}

export async function sendTestNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: { title: '通知測試', body: '通知功能運作正常 ✅' },
    trigger: null,
  });
}

// 避免循環引用,內部簡版 addDays
function addDaysKey(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
