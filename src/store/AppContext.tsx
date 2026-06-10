import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppData, CalendarEvent, PeriodRecord, UserProfile, CyclePrediction } from '../types';
import { defaultData, loadData, saveData, clearData } from '../services/storage';
import { predictNextCycle, getCurrentPhase, PhaseInfo } from '../services/periodPrediction';
import * as notif from '../services/notifications';
import * as gcal from '../services/googleCalendar';

interface AppContextValue {
  data: AppData;
  ready: boolean;
  prediction: CyclePrediction | null;
  phase: PhaseInfo | null;
  // events
  addEvent: (ev: CalendarEvent) => Promise<void>;
  updateEvent: (ev: CalendarEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  // periods
  addPeriod: (p: PeriodRecord) => void;
  updatePeriod: (p: PeriodRecord) => void;
  deletePeriod: (id: string) => void;
  // users & settings
  updateUser: (u: UserProfile) => void;
  setNotificationsEnabled: (on: boolean) => Promise<void>;
  setGoogleToken: (token: string | null) => void;
  resetAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必須在 AppProvider 內使用');
  return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    loadData().then((d) => {
      setData(d);
      loaded.current = true;
      setReady(true);
    });
  }, []);

  // 自動持久化
  useEffect(() => {
    if (loaded.current) void saveData(data);
  }, [data]);

  const prediction = useMemo(() => predictNextCycle(data.periods), [data.periods]);
  const phase = useMemo(
    () => getCurrentPhase(data.periods, prediction),
    [data.periods, prediction]
  );

  // 經期資料變動時重排提醒
  useEffect(() => {
    if (!loaded.current) return;
    if (data.settings.notificationsEnabled && prediction) {
      void notif.schedulePeriodReminders(prediction, data.settings.remindDaysBefore);
    }
  }, [prediction, data.settings.notificationsEnabled, data.settings.remindDaysBefore]);

  const userName = useCallback(
    (id: string) => data.users.find((u) => u.id === id)?.name ?? '未知',
    [data.users]
  );

  const trySyncGoogle = useCallback(async (ev: CalendarEvent): Promise<CalendarEvent> => {
    if (!ev.syncToGoogle || !gcal.isConnected()) return ev;
    try {
      const gid = await gcal.pushEvent(ev);
      return gid ? { ...ev, googleEventId: gid } : ev;
    } catch {
      return ev; // 同步失敗不擋本地儲存
    }
  }, []);

  const addEvent = useCallback(
    async (ev: CalendarEvent) => {
      const synced = await trySyncGoogle(ev);
      setData((d) => ({ ...d, events: [...d.events, synced] }));
      void notif.notifyEventChange(synced, userName(ev.createdBy), '新增');
    },
    [trySyncGoogle, userName]
  );

  const updateEvent = useCallback(
    async (ev: CalendarEvent) => {
      const synced = await trySyncGoogle(ev);
      setData((d) => ({
        ...d,
        events: d.events.map((e) => (e.id === ev.id ? synced : e)),
      }));
      void notif.notifyEventChange(synced, userName(ev.createdBy), '修改');
    },
    [trySyncGoogle, userName]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const ev = data.events.find((e) => e.id === id);
      if (ev?.googleEventId) {
        try {
          await gcal.deleteEvent(ev.googleEventId);
        } catch {
          /* ignore */
        }
      }
      setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
      if (ev) void notif.notifyEventChange(ev, userName(ev.createdBy), '刪除');
    },
    [data.events, userName]
  );

  const addPeriod = useCallback((p: PeriodRecord) => {
    setData((d) => ({ ...d, periods: [...d.periods, p] }));
  }, []);

  const updatePeriod = useCallback((p: PeriodRecord) => {
    setData((d) => ({
      ...d,
      periods: d.periods.map((r) => (r.id === p.id ? p : r)),
    }));
  }, []);

  const deletePeriod = useCallback((id: string) => {
    setData((d) => ({ ...d, periods: d.periods.filter((r) => r.id !== id) }));
  }, []);

  const updateUser = useCallback((u: UserProfile) => {
    setData((d) => ({
      ...d,
      users: d.users.map((x) => (x.id === u.id ? u : x)),
    }));
  }, []);

  const setNotificationsEnabled = useCallback(
    async (on: boolean) => {
      if (on) {
        const granted = await notif.requestPermission();
        if (!granted) return;
        if (prediction) {
          await notif.schedulePeriodReminders(prediction, data.settings.remindDaysBefore);
        }
      } else {
        await notif.cancelPeriodReminders();
      }
      setData((d) => ({
        ...d,
        settings: { ...d.settings, notificationsEnabled: on },
      }));
    },
    [prediction, data.settings.remindDaysBefore]
  );

  const setGoogleToken = useCallback((token: string | null) => {
    gcal.setAccessToken(token);
    setData((d) => ({
      ...d,
      settings: { ...d.settings, googleConnected: token !== null },
    }));
  }, []);

  const resetAll = useCallback(async () => {
    await clearData();
    await notif.cancelPeriodReminders();
    setData(defaultData);
  }, []);

  const value: AppContextValue = {
    data,
    ready,
    prediction,
    phase,
    addEvent,
    updateEvent,
    deleteEvent,
    addPeriod,
    updatePeriod,
    deletePeriod,
    updateUser,
    setNotificationsEnabled,
    setGoogleToken,
    resetAll,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
