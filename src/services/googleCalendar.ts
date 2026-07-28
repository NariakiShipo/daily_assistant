/**
 * Google Calendar 同步(REST)
 *
 * Token 來源優先序:
 * 1. 設定頁手動貼上的測試 token
 * 2. OAuth 登入後儲存的 token(過期自動刷新,見 googleAuth.ts)
 *
 * 共同編輯同個日曆:
 * - createSharedCalendar() 建立專用日曆
 * - shareCalendarWith(對方email) 將對方加為 writer
 * - 雙方對同一 calendarId 讀寫
 */
import { CalendarEvent } from '../types';
import { getValidAccessToken } from './googleAuth';

const API = 'https://www.googleapis.com/calendar/v3';

let manualToken: string | null = null;
let calendarId = 'primary';

/** 設定頁手動貼 token 用(開發測試) */
export function setAccessToken(token: string | null): void {
  manualToken = token;
}

export function setCalendarId(id: string): void {
  calendarId = id;
}

async function getToken(): Promise<string | null> {
  return manualToken ?? (await getValidAccessToken());
}

/** 是否有可用的 token(含 OAuth 自動刷新) */
export async function isConnectedAsync(): Promise<boolean> {
  return (await getToken()) !== null;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/** 'YYYY-MM-DD' 加一天(整天事件的 end.date 是排他的) */
const nextDay = (key: string): string => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const toGoogleEvent = (ev: CalendarEvent) => {
  // 整天事項要用 date 而非 dateTime,否則 Google 會顯示成 00:00–23:59 的長條
  if (ev.allDay) {
    return {
      summary: ev.title,
      description: ev.notes ?? '',
      start: { date: ev.date },
      end: { date: nextDay(ev.endDate ?? ev.date) }, // end.date 為排他,需 +1 天
    };
  }
  return {
    summary: ev.title,
    description: ev.notes ?? '',
    start: { dateTime: `${ev.date}T${ev.startTime}:00`, timeZone: 'Asia/Taipei' },
    end: { dateTime: `${ev.endDate ?? ev.date}T${ev.endTime}:00`, timeZone: 'Asia/Taipei' },
  };
};

/** 推送事件至 Google Calendar,回傳 googleEventId(無 token 時回傳 null) */
export async function pushEvent(ev: CalendarEvent): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;
  const url = ev.googleEventId
    ? `${API}/calendars/${encodeURIComponent(calendarId)}/events/${ev.googleEventId}`
    : `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: ev.googleEventId ? 'PUT' : 'POST',
    headers: headers(token),
    body: JSON.stringify(toGoogleEvent(ev)),
  });
  if (!res.ok) throw new Error(`Google Calendar 同步失敗:${res.status}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function deleteEvent(googleEventId: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
}

/** 建立共用日曆,回傳 calendarId */
export async function createSharedCalendar(name: string): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${API}/calendars`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ summary: name, timeZone: 'Asia/Taipei' }),
  });
  if (!res.ok) throw new Error(`建立日曆失敗:${res.status}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** 將日曆分享給另一人(writer 權限,可共同編輯) */
export async function shareCalendarWith(email: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/acl`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ role: 'writer', scope: { type: 'user', value: email } }),
  });
  if (!res.ok) throw new Error(`分享日曆失敗:${res.status}`);
}
