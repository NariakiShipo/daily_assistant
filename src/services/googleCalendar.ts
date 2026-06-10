/**
 * Google Calendar 同步模組(MVP:REST 接口已就緒,OAuth 待接)
 *
 * 正式接入步驟:
 * 1. 到 Google Cloud Console 建立專案,啟用 Google Calendar API
 * 2. 建立 OAuth 2.0 用戶端(iOS / Android / Web 各一)
 * 3. 安裝 expo-auth-session,用以下 scope 取得 access token:
 *    https://www.googleapis.com/auth/calendar
 * 4. 呼叫 setAccessToken(token) 後,以下函式即可實際運作
 *
 * 共同編輯同個日曆的做法:
 * - 主要使用者建立一個專用日曆(createSharedCalendar)
 * - 透過 ACL 將伴侶的 Google 帳號加為 writer(shareCalendarWith)
 * - 雙方的 App 都對同一 calendarId 讀寫
 */
import { CalendarEvent } from '../types';

const API = 'https://www.googleapis.com/calendar/v3';

let accessToken: string | null = null;
let calendarId = 'primary';

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function isConnected(): boolean {
  return accessToken !== null;
}

export function setCalendarId(id: string): void {
  calendarId = id;
}

const headers = () => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});

const toGoogleEvent = (ev: CalendarEvent) => ({
  summary: ev.title,
  description: ev.notes ?? '',
  start: { dateTime: `${ev.date}T${ev.startTime}:00`, timeZone: 'Asia/Taipei' },
  end: { dateTime: `${ev.date}T${ev.endTime}:00`, timeZone: 'Asia/Taipei' },
});

/** 將事件推送至 Google Calendar,回傳 googleEventId(未連接時回傳 null) */
export async function pushEvent(ev: CalendarEvent): Promise<string | null> {
  if (!accessToken) return null;
  const url = ev.googleEventId
    ? `${API}/calendars/${encodeURIComponent(calendarId)}/events/${ev.googleEventId}`
    : `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: ev.googleEventId ? 'PUT' : 'POST',
    headers: headers(),
    body: JSON.stringify(toGoogleEvent(ev)),
  });
  if (!res.ok) throw new Error(`Google Calendar 同步失敗:${res.status}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function deleteEvent(googleEventId: string): Promise<void> {
  if (!accessToken) return;
  await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
    { method: 'DELETE', headers: headers() }
  );
}

/** 建立共用日曆,回傳 calendarId */
export async function createSharedCalendar(name: string): Promise<string | null> {
  if (!accessToken) return null;
  const res = await fetch(`${API}/calendars`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ summary: name, timeZone: 'Asia/Taipei' }),
  });
  if (!res.ok) throw new Error(`建立日曆失敗:${res.status}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** 將日曆分享給另一人(writer 權限,可共同編輯) */
export async function shareCalendarWith(email: string): Promise<void> {
  if (!accessToken) return;
  const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/acl`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      role: 'writer',
      scope: { type: 'user', value: email },
    }),
  });
  if (!res.ok) throw new Error(`分享日曆失敗:${res.status}`);
}
