import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppData,
  CalendarEvent,
  CourseEntry,
  PeriodRecord,
  SemesterMeta,
  UserProfile,
  CyclePrediction,
  semesterOrder,
} from '../types';
import { defaultData, loadData, saveData, clearData } from '../services/storage';
import { predictNextCycle, getCurrentPhase, PhaseInfo } from '../services/periodPrediction';
import * as notif from '../services/notifications';
import * as gcal from '../services/googleCalendar';
import * as fb from '../services/firebaseSync';
import * as auth from '../services/auth';
import * as push from '../services/push';
import { mergeGoogleEvents, syncSummary } from '../services/googleSync';
import { isFirebaseConfigured } from '../config';

interface AppContextValue {
  data: AppData;
  ready: boolean;
  prediction: CyclePrediction | null;
  phase: PhaseInfo | null;
  /** 是否處於跨裝置共享模式 */
  shared: boolean;
  firebaseAvailable: boolean;
  /** 已登入的帳號(null = 未登入) */
  authUser: auth.AuthUser | null;
  // events
  addEvent: (ev: CalendarEvent) => Promise<void>;
  updateEvent: (ev: CalendarEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  // periods
  addPeriod: (p: PeriodRecord) => void;
  updatePeriod: (p: PeriodRecord) => void;
  deletePeriod: (id: string) => void;
  // courses
  addCourse: (c: CourseEntry) => void;
  updateCourse: (c: CourseEntry) => void;
  deleteCourse: (id: string) => void;
  /** 課表匯入:一次移除指定課程並寫入新課程(覆蓋邏輯由呼叫端決定) */
  importCourses: (removeIds: string[], entries: CourseEntry[]) => void;
  // semesters
  upsertSemester: (meta: SemesterMeta) => void;
  // tags
  addCustomTag: (name: string) => void;
  removeCustomTag: (name: string) => void;
  // period custom fields (記住的欄位名稱)
  addPeriodFieldName: (name: string) => void;
  removePeriodFieldName: (name: string) => void;
  /** 記住使用者自訂的症狀,之後記錄時可直接點選 */
  addCustomSymptom: (name: string) => void;
  /** 上課前幾分鐘提醒(null = 關閉) */
  setCourseRemindMinutes: (mins: number | null) => void;
  /** 跨裝置推播(對方改動時即使 App 沒開也通知);回傳是否成功啟用 */
  setCrossDevicePush: (on: boolean) => Promise<boolean>;
  /** 從 Google 日曆拉回變更並合併;回傳結果摘要 */
  pullFromGoogle: () => Promise<string>;
  /** 以備份檔的內容取代目前資料(共享模式下一併上傳雲端) */
  restoreData: (next: AppData) => Promise<void>;
  // users & settings
  updateUser: (u: UserProfile) => void;
  setNotificationsEnabled: (on: boolean) => Promise<void>;
  setGoogleToken: (token: string | null) => void;
  setGoogleConnected: (on: boolean) => void;
  // sharing
  createSharedSpace: () => Promise<string>;
  joinSharedSpace: (code: string) => Promise<boolean>;
  leaveSharedSpace: () => void;
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
  const [authUser, setAuthUser] = useState<auth.AuthUser | null>(null);
  const loaded = useRef(false);
  const dataRef = useRef(data);
  /** 這台裝置的識別碼(推播時用來略過自己);非同步取得,取得前為 undefined */
  const deviceId = useRef<string | undefined>(undefined);
  useEffect(() => {
    void push.getDeviceId().then((id) => {
      deviceId.current = id;
    });
  }, []);
  useEffect(() => {
    dataRef.current = data;
  });

  const spaceId = data.settings.spaceId ?? null;
  const firebaseAvailable = isFirebaseConfigured();
  const shared = !!spaceId && firebaseAvailable;

  useEffect(() => {
    loadData().then((d) => {
      setData(d);
      loaded.current = true;
      setReady(true);
    });
  }, []);

  // 自動持久化(共享模式下作為本機快取)
  useEffect(() => {
    if (loaded.current) void saveData(data);
  }, [data]);

  const userName = useCallback(
    (id: string) => data.users.find((u) => u.id === id)?.name ?? '未知',
    [data.users]
  );

  // 共享模式:訂閱 Firestore,即時接收對方變更
  useEffect(() => {
    if (!shared || !spaceId) return;
    const unsubscribe = fb.subscribeSpace(spaceId, {
      onUsers: (users) => setData((d) => ({ ...d, users })),
      onEvents: (events, remoteChanges) => {
        setData((d) => ({ ...d, events }));
        // 對方裝置的變更 → 本機通知
        for (const ch of remoteChanges) {
          const action = ch.type === 'added' ? '新增' : ch.type === 'modified' ? '修改' : '刪除';
          void notif.notifyEventChange(ch.event, userName(ch.event.createdBy), action);
        }
      },
      onPeriods: (periods) => setData((d) => ({ ...d, periods })),
      onCourses: (courses) => setData((d) => ({ ...d, courses })),
      onSemesters: (semesters) => setData((d) => ({ ...d, semesters })),
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, spaceId]);

  // 訂閱登入狀態
  useEffect(() => {
    if (!firebaseAvailable) return;
    return auth.onAuthChanged(setAuthUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseAvailable]);

  // 登入後:解析帳號綁定的共享空間,並把本機資料合併上傳雲端
  useEffect(() => {
    if (!authUser || !ready || !firebaseAvailable) return;
    let cancelled = false;
    void (async () => {
      try {
        const cur = dataRef.current;
        let sid = await fb.getUserSpaceId(authUser.uid);
        if (!sid) {
          // 帳號還沒有空間:沿用目前配對的空間,否則建立新空間(會上傳本機資料)
          sid = cur.settings.spaceId ?? null;
          if (!sid) {
            sid = await fb.createSpace(cur.users, cur.events, cur.periods, cur.courses);
          }
          await fb.bindUserSpace(authUser.uid, sid);
        }
        // 把本機資料合併上傳(id 不變,重複者覆蓋,不會弄丟雲端既有資料)
        await fb.uploadLocal(sid, cur.events, cur.periods, cur.courses, cur.semesters);
        if (!cancelled) {
          setData((d) =>
            d.settings.spaceId === sid
              ? d
              : { ...d, settings: { ...d.settings, spaceId: sid } }
          );
        }
      } catch {
        // 同步失敗不擋本機使用,下次登入或操作時會再同步
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, ready, firebaseAvailable]);

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

  // 行程或課表變動時整批重排提醒(重複行程的展開結果會隨時間推移,逐筆維護會漏)
  const primaryUserId = data.users.find((u) => u.isPrimary)?.id ?? data.users[0]?.id;
  useEffect(() => {
    if (!loaded.current) return;
    if (data.settings.notificationsEnabled) {
      void notif.syncEventReminders({
        events: data.events,
        courses: data.courses,
        semesters: data.semesters,
        courseOwnerId: primaryUserId,
        courseRemindMinutes: data.settings.courseRemindMinutes,
      });
    } else {
      void notif.cancelEventReminders();
    }
  }, [
    data.events,
    data.courses,
    data.semesters,
    primaryUserId,
    data.settings.notificationsEnabled,
    data.settings.courseRemindMinutes,
  ]);

  /**
   * 跨裝置推播的登記。
   *
   * 只有在共享空間裡才有意義——推播的目的是通知「對方」,單機模式沒有對方。
   * 關閉或離開空間時要取消登記,否則伺服器會繼續往這台裝置送。
   */
  const pushEnabled = !!data.settings.crossDevicePush;
  useEffect(() => {
    if (!loaded.current || !shared || !spaceId) return;
    if (pushEnabled) {
      void push.registerForSpace(spaceId);
    } else {
      void push.unregisterForSpace(spaceId);
    }
  }, [pushEnabled, shared, spaceId]);

  // 分頁在前景時收到的推播不會觸發 service worker,必須自己顯示
  useEffect(() => {
    if (!pushEnabled || !shared) return;
    return push.listenForegroundPush();
  }, [pushEnabled, shared]);

  // 啟動時檢查 Google OAuth token 是否仍有效
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const ok = await gcal.isConnectedAsync();
      setData((d) =>
        d.settings.googleConnected === ok
          ? d
          : { ...d, settings: { ...d.settings, googleConnected: ok } }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const trySyncGoogle = useCallback(async (ev: CalendarEvent): Promise<CalendarEvent> => {
    if (!ev.syncToGoogle) return ev;
    try {
      const gid = await gcal.pushEvent(ev);
      return gid ? { ...ev, googleEventId: gid } : ev;
    } catch {
      return ev; // 同步失敗不擋本地儲存
    }
  }, []);

  /**
   * 蓋上修改時間與修改者。衝突偵測靠這個時間戳判斷「我編輯期間對方有沒有動過」,
   * 因此每一條寫入路徑都必須經過這裡,漏掉任何一條都會讓偵測失效。
   */
  const stamp = useCallback(
    (ev: CalendarEvent): CalendarEvent => ({
      ...ev,
      updatedAt: Date.now(),
      updatedBy: ev.updatedBy ?? ev.createdBy,
      updatedByDevice: deviceId.current,
    }),
    []
  );

  const addEvent = useCallback(
    async (ev: CalendarEvent) => {
      const synced = await trySyncGoogle(stamp(ev));
      setData((d) => ({ ...d, events: [...d.events, synced] }));
      if (shared && spaceId) {
        void fb.saveEventDoc(spaceId, synced);
      } else {
        void notif.notifyEventChange(synced, userName(ev.createdBy), '新增');
      }
    },
    [trySyncGoogle, stamp, shared, spaceId, userName]
  );

  const updateEvent = useCallback(
    async (ev: CalendarEvent) => {
      const synced = await trySyncGoogle(stamp(ev));
      setData((d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? synced : e)) }));
      if (shared && spaceId) {
        void fb.saveEventDoc(spaceId, synced);
      } else {
        void notif.notifyEventChange(synced, userName(ev.createdBy), '修改');
      }
    },
    [trySyncGoogle, stamp, shared, spaceId, userName]
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
      if (shared && spaceId) {
        void fb.deleteEventDoc(spaceId, id);
      } else if (ev) {
        void notif.notifyEventChange(ev, userName(ev.createdBy), '刪除');
      }
    },
    [data.events, shared, spaceId, userName]
  );

  const addPeriod = useCallback(
    (p: PeriodRecord) => {
      setData((d) => ({ ...d, periods: [...d.periods, p] }));
      if (shared && spaceId) void fb.savePeriodDoc(spaceId, p);
    },
    [shared, spaceId]
  );

  const updatePeriod = useCallback(
    (p: PeriodRecord) => {
      setData((d) => ({ ...d, periods: d.periods.map((r) => (r.id === p.id ? p : r)) }));
      if (shared && spaceId) void fb.savePeriodDoc(spaceId, p);
    },
    [shared, spaceId]
  );

  const deletePeriod = useCallback(
    (id: string) => {
      setData((d) => ({ ...d, periods: d.periods.filter((r) => r.id !== id) }));
      if (shared && spaceId) void fb.deletePeriodDoc(spaceId, id);
    },
    [shared, spaceId]
  );

  const addCourse = useCallback(
    (c: CourseEntry) => {
      setData((d) => ({ ...d, courses: [...d.courses, c] }));
      if (shared && spaceId) void fb.saveCourseDoc(spaceId, c);
    },
    [shared, spaceId]
  );

  const updateCourse = useCallback(
    (c: CourseEntry) => {
      setData((d) => ({ ...d, courses: d.courses.map((x) => (x.id === c.id ? c : x)) }));
      if (shared && spaceId) void fb.saveCourseDoc(spaceId, c);
    },
    [shared, spaceId]
  );

  const deleteCourse = useCallback(
    (id: string) => {
      setData((d) => ({ ...d, courses: d.courses.filter((x) => x.id !== id) }));
      if (shared && spaceId) void fb.deleteCourseDoc(spaceId, id);
    },
    [shared, spaceId]
  );

  const importCourses = useCallback(
    (removeIds: string[], entries: CourseEntry[]) => {
      const rm = new Set(removeIds);
      setData((d) => ({
        ...d,
        courses: [...d.courses.filter((c) => !rm.has(c.id)), ...entries],
      }));
      if (shared && spaceId) void fb.replaceCourseDocs(spaceId, removeIds, entries);
    },
    [shared, spaceId]
  );

  const upsertSemester = useCallback(
    (meta: SemesterMeta) => {
      setData((d) => {
        const semesters = [...d.semesters.filter((s) => s.id !== meta.id), meta].sort(
          (a, b) => semesterOrder(b.id) - semesterOrder(a.id)
        );
        if (shared && spaceId) void fb.saveSemesters(spaceId, semesters);
        return { ...d, semesters };
      });
    },
    [shared, spaceId]
  );

  const addCustomTag = useCallback((name: string) => {
    setData((d) => {
      const cur = d.settings.customTags ?? [];
      if (cur.includes(name)) return d;
      return { ...d, settings: { ...d.settings, customTags: [...cur, name] } };
    });
  }, []);

  const removeCustomTag = useCallback((name: string) => {
    setData((d) => ({
      ...d,
      settings: {
        ...d.settings,
        customTags: (d.settings.customTags ?? []).filter((t) => t !== name),
      },
    }));
  }, []);

  const addPeriodFieldName = useCallback((name: string) => {
    setData((d) => {
      const cur = d.settings.periodFieldNames ?? [];
      if (cur.includes(name)) return d;
      return { ...d, settings: { ...d.settings, periodFieldNames: [...cur, name] } };
    });
  }, []);

  const removePeriodFieldName = useCallback((name: string) => {
    setData((d) => ({
      ...d,
      settings: {
        ...d.settings,
        periodFieldNames: (d.settings.periodFieldNames ?? []).filter((n) => n !== name),
      },
    }));
  }, []);

  const addCustomSymptom = useCallback((name: string) => {
    setData((d) => {
      const cur = d.settings.customSymptoms ?? [];
      if (cur.includes(name)) return d;
      return { ...d, settings: { ...d.settings, customSymptoms: [...cur, name] } };
    });
  }, []);

  const setCourseRemindMinutes = useCallback((mins: number | null) => {
    setData((d) => ({ ...d, settings: { ...d.settings, courseRemindMinutes: mins } }));
  }, []);

  const setCrossDevicePush = useCallback(
    async (on: boolean): Promise<boolean> => {
      if (!on) {
        if (spaceId) await push.unregisterForSpace(spaceId);
        setData((d) => ({ ...d, settings: { ...d.settings, crossDevicePush: false } }));
        return true;
      }
      // 先確認真的拿得到 token 再記錄設定,否則設定顯示已開啟卻收不到推播
      if (!spaceId) return false;
      const ok = await push.registerForSpace(spaceId);
      if (ok) setData((d) => ({ ...d, settings: { ...d.settings, crossDevicePush: true } }));
      return ok;
    },
    [spaceId]
  );

  const updateUser = useCallback(
    (u: UserProfile) => {
      setData((d) => {
        const users = d.users.map((x) => (x.id === u.id ? u : x));
        if (shared && spaceId) void fb.saveUsers(spaceId, users);
        return { ...d, users };
      });
    },
    [shared, spaceId]
  );

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
      setData((d) => ({ ...d, settings: { ...d.settings, notificationsEnabled: on } }));
    },
    [prediction, data.settings.remindDaysBefore]
  );

  const setGoogleConnected = useCallback((on: boolean) => {
    setData((d) => ({ ...d, settings: { ...d.settings, googleConnected: on } }));
  }, []);

  const setGoogleToken = useCallback(
    (token: string | null) => {
      gcal.setAccessToken(token);
      setGoogleConnected(token !== null);
    },
    [setGoogleConnected]
  );

  const createSharedSpace = useCallback(async (): Promise<string> => {
    const code = await fb.createSpace(data.users, data.events, data.periods, data.courses);
    if (data.semesters.length) void fb.saveSemesters(code, data.semesters);
    if (authUser) void fb.bindUserSpace(authUser.uid, code);
    setData((d) => ({ ...d, settings: { ...d.settings, spaceId: code } }));
    return code;
  }, [data.users, data.events, data.periods, data.courses, data.semesters, authUser]);

  const joinSharedSpace = useCallback(
    async (code: string): Promise<boolean> => {
      const normalized = code.trim().toUpperCase();
      const exists = await fb.spaceExists(normalized);
      if (!exists) return false;
      // 把本機既有資料合併上去(id 唯一,不會重複)
      await fb.uploadLocal(normalized, data.events, data.periods, data.courses, data.semesters);
      if (authUser) void fb.bindUserSpace(authUser.uid, normalized);
      setData((d) => ({ ...d, settings: { ...d.settings, spaceId: normalized } }));
      return true;
    },
    [data.events, data.periods, data.courses, data.semesters, authUser]
  );

  const leaveSharedSpace = useCallback(() => {
    // 資料保留最後同步的副本,轉回本機模式
    setData((d) => ({ ...d, settings: { ...d.settings, spaceId: null } }));
  }, []);

  /**
   * 從 Google 日曆拉回變更。
   *
   * 有 syncToken 走增量;Google 回 410(token 過期)時自動退回完整同步重來一次,
   * 否則使用者會卡在「同步不動」而不知道原因。
   */
  const pullFromGoogle = useCallback(async (): Promise<string> => {
    // 先取一份快照:後面要拿它跟合併結果比對,不能等 setData 之後再讀
    // dataRef(它由 effect 更新,時機依賴 React 的排程,不該當作同步值)
    const snapshot = dataRef.current;
    const owner = snapshot.users.find((u) => u.isPrimary)?.id ?? 'u1';

    let pull = await gcal.pullEvents(snapshot.settings.googleSyncToken ?? null);
    if (pull.tokenExpired) pull = await gcal.pullEvents(null);

    const result = mergeGoogleEvents(snapshot.events, pull.events, owner);

    setData((d) => ({
      ...d,
      events: result.events,
      settings: {
        ...d.settings,
        googleSyncToken: pull.nextSyncToken ?? d.settings.googleSyncToken ?? null,
        googleLastPullAt: Date.now(),
      },
    }));

    // 共享模式下把合併結果同步給對方(未變動的項目是同一個物件參考,直接濾掉)
    if (shared && spaceId) {
      const beforeById = new Map(snapshot.events.map((e) => [e.id, e]));
      for (const ev of result.events) {
        if (beforeById.get(ev.id) !== ev) void fb.saveEventDoc(spaceId, ev);
      }
      const survivingIds = new Set(result.events.map((e) => e.id));
      for (const e of snapshot.events) {
        if (!survivingIds.has(e.id)) void fb.deleteEventDoc(spaceId, e.id);
      }
    }

    return syncSummary(result);
  }, [shared, spaceId]);

  const restoreData = useCallback(
    async (next: AppData) => {
      // 保留目前的共享空間:備份不帶配對碼,匯入不該把裝置踢出空間
      const keepSpaceId = dataRef.current.settings.spaceId ?? null;
      const merged: AppData = {
        ...next,
        settings: { ...next.settings, spaceId: keepSpaceId },
      };
      setData(merged);
      if (keepSpaceId && firebaseAvailable) {
        await fb.uploadLocal(
          keepSpaceId,
          merged.events,
          merged.periods,
          merged.courses,
          merged.semesters
        );
        await fb.saveUsers(keepSpaceId, merged.users);
      }
    },
    [firebaseAvailable]
  );

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
    shared,
    firebaseAvailable,
    authUser,
    addEvent,
    updateEvent,
    deleteEvent,
    addPeriod,
    updatePeriod,
    deletePeriod,
    addCourse,
    updateCourse,
    deleteCourse,
    importCourses,
    upsertSemester,
    addCustomTag,
    removeCustomTag,
    addPeriodFieldName,
    removePeriodFieldName,
    addCustomSymptom,
    setCourseRemindMinutes,
    setCrossDevicePush,
    pullFromGoogle,
    restoreData,
    updateUser,
    setNotificationsEnabled,
    setGoogleToken,
    setGoogleConnected,
    createSharedSpace,
    joinSharedSpace,
    leaveSharedSpace,
    resetAll,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
