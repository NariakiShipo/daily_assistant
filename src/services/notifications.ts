/**
 * 通知模組(本機排程通知)
 *
 * 提供三種提醒:
 * - 經期前 N 天提醒 + 預測開始日提醒
 * - 行程開始前 N 分鐘提醒(含重複行程的每一次)
 * - 事件變更即時通知(共同編輯時提示對方改了什麼)
 *
 * 兩種後端實作,由 Platform 決定:
 * - 手機:expo-notifications,系統層排程,App 關掉也會響
 * - 網頁:Web Notification API + 計時器,只在分頁開著時有效(見 webNotifications.ts)
 *
 * 尚未涵蓋的跨裝置推播(伴侶手機鎖屏也收到):
 * 需 Expo Push API + FCM,並由 Functions 監聽 Firestore 變更後發送。
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CalendarEvent, CourseEntry, CyclePrediction, SemesterMeta } from '../types';
import { atTime, formatDateZh, fromDateKey, todayKey } from '../utils/date';
import { collectCourseReminders, collectEventReminders, mergeReminders } from './reminders';
import * as web from './webNotifications';

const isWeb = Platform.OS === 'web';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermission(): Promise<boolean> {
  if (isWeb) return web.requestWebPermission();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** 網頁版的通知只在分頁開著時有效,UI 需要據此提示使用者 */
export const isWebNotifications = (): boolean => isWeb;

const PERIOD_TAG = 'period-reminder';
const EVENT_TAG = 'event-reminder';

/** 取消所有帶指定 tag 的已排程通知 */
async function cancelByTag(tag: string): Promise<void> {
  if (isWeb) return web.cancelWebNotifications(tag);
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content.data as { tag?: string } | null)?.tag === tag) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** 依預測結果排程經期提醒(會先清掉舊的) */
export async function schedulePeriodReminders(
  prediction: CyclePrediction,
  remindDaysBefore: number
): Promise<number> {
  await cancelPeriodReminders();

  const today = todayKey();
  const beforeDay = addDaysKey(prediction.nextStart, -remindDaysBefore);

  // 兩則提醒都固定在當天早上 9 點送出
  const planned = [
    {
      key: `period-before-${beforeDay}`,
      date: beforeDay,
      title: '經期提醒',
      body: `預計 ${formatDateZh(prediction.nextStart)} 前後經期將至,記得準備用品、多休息。`,
    },
    {
      key: `period-start-${prediction.nextStart}`,
      date: prediction.nextStart,
      title: '經期預測日',
      body: `今天是推算的經期開始日(${formatDateZh(prediction.windowStart)} – ${formatDateZh(
        prediction.windowEnd
      )} 區間)。來了記得記錄一下。`,
    },
  ]
    .filter((p) => p.date > today)
    .map((p) => ({ ...p, fireAt: atTime(p.date, '09:00') }));

  if (isWeb) return web.scheduleWebNotifications(PERIOD_TAG, planned);

  for (const p of planned) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: { tag: PERIOD_TAG } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.fireAt,
      },
    });
  }
  return planned.length;
}

export async function cancelPeriodReminders(): Promise<void> {
  await cancelByTag(PERIOD_TAG);
}

export async function cancelEventReminders(): Promise<void> {
  await cancelByTag(EVENT_TAG);
}

/**
 * 依目前的行程重排所有行程提醒(先清掉舊的再重排)。
 *
 * 每次行程變動都整批重算,而不是逐筆增刪:重複行程的展開結果會隨時間推移,
 * 逐筆維護容易漏掉,整批重算則永遠與資料一致。
 */
export interface ReminderSources {
  events: CalendarEvent[];
  courses?: CourseEntry[];
  semesters?: SemesterMeta[];
  /** 上課提醒的對象(通常是主要使用者) */
  courseOwnerId?: string;
  /** 上課前幾分鐘提醒;null / undefined = 不排上課提醒 */
  courseRemindMinutes?: number | null;
}

export async function syncEventReminders(sources: ReminderSources): Promise<number> {
  await cancelEventReminders();

  const now = new Date();
  const lists = [collectEventReminders(sources.events, now)];

  if (
    sources.courseRemindMinutes !== null &&
    sources.courseRemindMinutes !== undefined &&
    sources.courses?.length &&
    sources.courseOwnerId
  ) {
    lists.push(
      collectCourseReminders(
        sources.courses,
        sources.semesters ?? [],
        sources.courseOwnerId,
        sources.courseRemindMinutes,
        now
      )
    );
  }

  // 兩種提醒共用系統的通知額度,合併後才截斷
  const reminders = mergeReminders(lists);
  if (isWeb) return web.scheduleWebNotifications(EVENT_TAG, reminders);

  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: r.title,
        body: r.body,
        data: { tag: EVENT_TAG, eventId: r.eventId, date: r.date },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.fireAt,
      },
    });
  }
  return reminders.length;
}

/** 立即送出一則通知(兩個平台共用) */
async function notifyNow(title: string, body: string): Promise<void> {
  if (isWeb) return web.showWebNotification(title, body);
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // 立即送出
  });
}

/** 共同日曆變更通知(本機通知;跨裝置推播仍待 FCM) */
export async function notifyEventChange(
  ev: CalendarEvent,
  byUserName: string,
  action: '新增' | '修改' | '刪除'
): Promise<void> {
  await notifyNow(
    `日曆更新:${byUserName} ${action}了行程`,
    `${formatDateZh(ev.date)} ${ev.startTime} ${ev.title}`
  );
}

export async function sendTestNotification(): Promise<void> {
  await notifyNow('通知測試', '通知功能運作正常 ✅');
}

// 避免循環引用,內部簡版 addDays
function addDaysKey(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
