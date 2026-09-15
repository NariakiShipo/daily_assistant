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
  Expense,
  ExpenseBudget,
  ExpenseCategory,
  ExpenseKeypad,
  HomeCardPref,
  ModuleKey,
  PeriodRecord,
  RecurringExpense,
  SemesterMeta,
  SharedSplit,
  UserProfile,
  CyclePrediction,
  semesterOrder,
} from '../types';
import { defaultData, loadData, saveData, clearData } from '../services/storage';
import { predictNextCycle, getCurrentPhase, PhaseInfo } from '../services/periodPrediction';
import * as notif from '../services/notifications';
import * as gcal from '../services/googleCalendar';
import * as fb from '../services/firebaseSync';
import { syncErrorMessage } from '../services/syncError';
import * as auth from '../services/auth';
import * as push from '../services/push';
import { mergeGoogleEvents, syncSummary } from '../services/googleSync';
import { isFirebaseConfigured } from '../config';
import { pendingRecurring } from '../services/expenses';
import { todayKey, uid } from '../utils/date';

/** 記過的備註最多留這麼多個,再多也塞不進記一筆那一列 */
const MAX_RECENT_NOTES = 8;

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
  /** 刪除經期紀錄;遠端刪除失敗會還原本機並拋出錯誤 */
  deletePeriod: (id: string) => Promise<void>;
  // courses
  addCourse: (c: CourseEntry) => void;
  updateCourse: (c: CourseEntry) => void;
  /** 刪除課程;遠端刪除失敗會還原本機並拋出錯誤 */
  deleteCourse: (id: string) => Promise<void>;
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
  // expenses
  addExpense: (e: Expense) => void;
  updateExpense: (e: Expense) => void;
  /** 刪除帳目;遠端刪除失敗會還原本機並拋出錯誤 */
  deleteExpense: (id: string) => Promise<void>;
  /** 新增或更新一個記帳分類 */
  saveExpenseCategory: (c: ExpenseCategory) => void;
  /**
   * 刪除自訂分類,並把它底下的帳目改到 moveToId。
   * 預設分類不可刪(呼叫端應改用 setCategoryHidden)。
   */
  deleteExpenseCategory: (id: string, moveToId: string) => void;
  /** 隱藏 / 取消隱藏分類(預設分類唯一的「移除」方式) */
  setCategoryHidden: (id: string, hidden: boolean) => void;
  /** 依新順序重排分類(長按拖曳後呼叫) */
  reorderExpenseCategories: (kind: 'expense' | 'income', orderedIds: string[]) => void;
  // 固定支出
  saveRecurringExpense: (r: RecurringExpense) => void;
  deleteRecurringExpense: (id: string) => void;
  // 導覽與 Home
  /** 底部導覽列要放哪幾個模組(順序 = 左到右) */
  setNavModules: (modules: ModuleKey[]) => void;
  /** Home 卡片的順序與開關 */
  setHomeCards: (cards: HomeCardPref[]) => void;
  /** Home 的「今日課程」要看誰的課表 */
  setHomeCourseOwner: (userId: string) => void;
  /** 走完登入 → 選常用功能之後標記完成 */
  setOnboarded: (done: boolean) => void;
  /** 看過首次使用教學;傳 false 等於「重看使用教學」 */
  setTutorialSeen: (seen: boolean) => void;
  // 記帳設定
  setBudget: (budget: ExpenseBudget) => void;
  setSharedSplit: (split: SharedSplit) => void;
  setExpenseKeypad: (keypad: ExpenseKeypad) => void;
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
      onExpenses: (expenses) => setData((d) => ({ ...d, expenses })),
      onExpenseCategories: (expenseCategories) => setData((d) => ({ ...d, expenseCategories })),
      onRecurringExpenses: (recurringExpenses) => setData((d) => ({ ...d, recurringExpenses })),
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
        /*
         * 只在「這台裝置還沒跟這個空間同步過」時把本機資料推上去。
         *
         * 先前是每次登入都無條件整批上傳,而 uploadLocal 只寫不刪——已經在雲端
         * 刪掉的項目會被本機的舊快取重新寫回去,再由訂閱推回所有裝置,看起來就像
         * 「刪掉的東西自己跑回來」。已經在同步的裝置應該以雲端為準。
         */
        if (cur.settings.spaceId !== sid) {
          await fb.uploadLocal(sid, cur.events, cur.periods, cur.courses, cur.semesters);
        }
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
        try {
          await fb.deleteEventDoc(spaceId, id);
        } catch (e) {
          // 遠端沒刪掉就把它放回來,否則訂閱推回時會像是「刪除失效」
          if (ev) {
            setData((d) =>
              d.events.some((x) => x.id === id) ? d : { ...d, events: [...d.events, ev] }
            );
          }
          throw new Error(syncErrorMessage('刪除行程', e));
        }
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
    async (id: string) => {
      const removed = dataRef.current.periods.find((r) => r.id === id);
      setData((d) => ({ ...d, periods: d.periods.filter((r) => r.id !== id) }));
      if (!(shared && spaceId)) return;
      try {
        await fb.deletePeriodDoc(spaceId, id);
      } catch (e) {
        if (removed) {
          setData((d) =>
            d.periods.some((r) => r.id === id) ? d : { ...d, periods: [...d.periods, removed] }
          );
        }
        throw new Error(syncErrorMessage('刪除經期紀錄', e));
      }
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

  /**
   * 刪除課程。
   *
   * 遠端刪除必須等結果:先前是 `void fb.deleteCourseDoc(...)`,失敗時沒有任何跡象,
   * 但畫面已經移除了——雲端那筆還在,訂閱一推回來就變成「刪掉又自己跑回來」。
   * 失敗時把那筆放回本機並往外拋,讓呼叫端能告訴使用者。
   */
  const deleteCourse = useCallback(
    async (id: string) => {
      const removed = dataRef.current.courses.find((c) => c.id === id);
      setData((d) => ({ ...d, courses: d.courses.filter((x) => x.id !== id) }));
      if (!(shared && spaceId)) return;
      try {
        await fb.deleteCourseDoc(spaceId, id);
      } catch (e) {
        if (removed) {
          setData((d) =>
            d.courses.some((c) => c.id === id) ? d : { ...d, courses: [...d.courses, removed] }
          );
        }
        throw new Error(syncErrorMessage('刪除課程', e));
      }
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

  /* ───────────────────────── 記帳 ───────────────────────── */

  /**
   * 蓋上修改時間。帳目清單依 updatedAt 排序(同一天記的好幾筆要「新的在上面」),
   * 所以每條寫入路徑都得經過這裡,跟行程的 stamp 同樣道理。
   */
  const stampExpense = useCallback(
    (e: Expense): Expense => ({
      ...e,
      updatedAt: Date.now(),
      updatedBy: e.updatedBy ?? e.createdBy,
      updatedByDevice: deviceId.current,
    }),
    []
  );

  /** 記過的備註存起來,下次記一筆可以直接點(最近的排最前面,重複的往前提) */
  const rememberNote = useCallback((note: string | undefined) => {
    const trimmed = note?.trim();
    if (!trimmed) return;
    setData((d) => {
      const rest = (d.settings.recentExpenseNotes ?? []).filter((n) => n !== trimmed);
      return {
        ...d,
        settings: {
          ...d.settings,
          recentExpenseNotes: [trimmed, ...rest].slice(0, MAX_RECENT_NOTES),
        },
      };
    });
  }, []);

  const addExpense = useCallback(
    (e: Expense) => {
      const stamped = stampExpense(e);
      setData((d) => ({ ...d, expenses: [...d.expenses, stamped] }));
      rememberNote(stamped.note);
      if (shared && spaceId) void fb.saveExpenseDoc(spaceId, stamped);
    },
    [stampExpense, rememberNote, shared, spaceId]
  );

  const updateExpense = useCallback(
    (e: Expense) => {
      const stamped = stampExpense(e);
      setData((d) => ({
        ...d,
        expenses: d.expenses.map((x) => (x.id === e.id ? stamped : x)),
      }));
      rememberNote(stamped.note);
      if (shared && spaceId) void fb.saveExpenseDoc(spaceId, stamped);
    },
    [stampExpense, rememberNote, shared, spaceId]
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      const removed = dataRef.current.expenses.find((e) => e.id === id);
      setData((d) => {
        /*
         * 刪掉自動記的那一筆時,要一併記下「這個月不用再補」。
         * 否則下次開 App,pendingRecurring 看不到那筆帳,就會當成還沒補而再生一次,
         * 使用者會覺得這筆帳刪不掉。
         */
        const skip = removed?.recurringId ? `${removed.recurringId}@${removed.date}` : null;
        const skips = d.settings.recurringSkips ?? [];
        return {
          ...d,
          expenses: d.expenses.filter((e) => e.id !== id),
          settings:
            skip && !skips.includes(skip)
              ? { ...d.settings, recurringSkips: [...skips, skip] }
              : d.settings,
        };
      });
      if (!(shared && spaceId)) return;
      try {
        await fb.deleteExpenseDoc(spaceId, id);
      } catch (e) {
        // 遠端沒刪掉就放回來,否則訂閱一推回來就像「刪掉又自己跑回來」
        if (removed) {
          setData((d) =>
            d.expenses.some((x) => x.id === id) ? d : { ...d, expenses: [...d.expenses, removed] }
          );
        }
        throw new Error(syncErrorMessage('刪除帳目', e));
      }
    },
    [shared, spaceId]
  );

  const saveExpenseCategory = useCallback(
    (c: ExpenseCategory) => {
      setData((d) => {
        const exists = d.expenseCategories.some((x) => x.id === c.id);
        const expenseCategories = exists
          ? d.expenseCategories.map((x) => (x.id === c.id ? c : x))
          : [...d.expenseCategories, c];
        if (shared && spaceId) void fb.saveExpenseCategories(spaceId, expenseCategories);
        return { ...d, expenseCategories };
      });
    },
    [shared, spaceId]
  );

  /**
   * 刪除自訂分類。
   *
   * 底下的帳目一律改掛到 moveToId,而不是留著指向已消失的分類——
   * 孤兒帳目在圓餅與排行上只會變成一塊沒有名字的灰色,兩人都看不懂那是什麼。
   * 預設分類擋在這裡不刪,畫面上也只提供「隱藏」。
   */
  const deleteExpenseCategory = useCallback(
    (id: string, moveToId: string) => {
      setData((d) => {
        const target = d.expenseCategories.find((c) => c.id === id);
        if (!target || target.builtin) return d;
        const expenseCategories = d.expenseCategories.filter((c) => c.id !== id);
        const moved: Expense[] = [];
        const expenses = d.expenses.map((e) => {
          if (e.categoryId !== id) return e;
          const next = { ...e, categoryId: moveToId, updatedAt: Date.now() };
          moved.push(next);
          return next;
        });
        if (shared && spaceId) {
          void fb.saveExpenseCategories(spaceId, expenseCategories);
          void fb.saveExpenseDocs(spaceId, moved);
        }
        return { ...d, expenseCategories, expenses };
      });
    },
    [shared, spaceId]
  );

  const setCategoryHidden = useCallback(
    (id: string, hidden: boolean) => {
      setData((d) => {
        const expenseCategories = d.expenseCategories.map((c) =>
          c.id === id ? { ...c, hidden } : c
        );
        if (shared && spaceId) void fb.saveExpenseCategories(spaceId, expenseCategories);
        return { ...d, expenseCategories };
      });
    },
    [shared, spaceId]
  );

  const reorderExpenseCategories = useCallback(
    (kind: 'expense' | 'income', orderedIds: string[]) => {
      setData((d) => {
        const rank = new Map(orderedIds.map((id, i) => [id, i]));
        const expenseCategories = d.expenseCategories.map((c) =>
          c.kind === kind && rank.has(c.id) ? { ...c, order: rank.get(c.id) as number } : c
        );
        if (shared && spaceId) void fb.saveExpenseCategories(spaceId, expenseCategories);
        return { ...d, expenseCategories };
      });
    },
    [shared, spaceId]
  );

  const saveRecurringExpense = useCallback(
    (r: RecurringExpense) => {
      setData((d) => {
        const exists = d.recurringExpenses.some((x) => x.id === r.id);
        const recurringExpenses = exists
          ? d.recurringExpenses.map((x) => (x.id === r.id ? r : x))
          : [...d.recurringExpenses, r];
        if (shared && spaceId) void fb.saveRecurringExpenses(spaceId, recurringExpenses);
        return { ...d, recurringExpenses };
      });
    },
    [shared, spaceId]
  );

  /**
   * 刪掉固定支出的範本。
   *
   * 已經自動記下的那幾筆帳目留著不動:它們是真的花掉的錢,
   * 取消訂閱不代表過去幾個月沒付過。
   */
  const deleteRecurringExpense = useCallback(
    (id: string) => {
      setData((d) => {
        const recurringExpenses = d.recurringExpenses.filter((r) => r.id !== id);
        if (shared && spaceId) void fb.saveRecurringExpenses(spaceId, recurringExpenses);
        return { ...d, recurringExpenses };
      });
    },
    [shared, spaceId]
  );

  /* ─────────────────── 導覽與 Home ─────────────────── */

  const setNavModules = useCallback((navModules: ModuleKey[]) => {
    setData((d) => ({ ...d, settings: { ...d.settings, navModules } }));
  }, []);

  const setHomeCards = useCallback((homeCards: HomeCardPref[]) => {
    setData((d) => ({ ...d, settings: { ...d.settings, homeCards } }));
  }, []);

  const setHomeCourseOwner = useCallback((homeCourseOwnerId: string) => {
    setData((d) => ({ ...d, settings: { ...d.settings, homeCourseOwnerId } }));
  }, []);

  const setOnboarded = useCallback((onboarded: boolean) => {
    setData((d) => ({ ...d, settings: { ...d.settings, onboarded } }));
  }, []);

  const setTutorialSeen = useCallback((tutorialSeen: boolean) => {
    setData((d) => ({ ...d, settings: { ...d.settings, tutorialSeen } }));
  }, []);

  const setBudget = useCallback((budget: ExpenseBudget) => {
    setData((d) => ({ ...d, settings: { ...d.settings, budget } }));
  }, []);

  const setSharedSplit = useCallback((sharedSplit: SharedSplit) => {
    setData((d) => ({ ...d, settings: { ...d.settings, sharedSplit } }));
  }, []);

  const setExpenseKeypad = useCallback((expenseKeypad: ExpenseKeypad) => {
    setData((d) => ({ ...d, settings: { ...d.settings, expenseKeypad } }));
  }, []);

  /**
   * 固定支出到期自動記一筆。
   *
   * 只在資料讀完後跑,且產生的是真實帳目——使用者可以單獨改或刪掉某個月那一筆。
   * 刪掉的月份由 settings.recurringSkips 記著,不會在下次啟動時又被補回來。
   */
  const recurringCount = data.recurringExpenses.length;
  useEffect(() => {
    if (!ready || !loaded.current || !recurringCount) return;
    const cur = dataRef.current;
    const owner = cur.users.find((u) => u.isPrimary)?.id ?? cur.users[0]?.id ?? 'u1';
    const created = pendingRecurring(
      cur.recurringExpenses,
      cur.expenses,
      todayKey(),
      owner,
      uid,
      cur.settings.recurringSkips
    );
    if (!created.length) return;
    setData((d) => ({ ...d, expenses: [...d.expenses, ...created] }));
    if (shared && spaceId) void fb.saveExpenseDocs(spaceId, created);
  }, [ready, recurringCount, shared, spaceId]);

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
    const code = await fb.createSpace(
      data.users,
      data.events,
      data.periods,
      data.courses,
      data.expenses,
      data.expenseCategories,
      data.recurringExpenses
    );
    if (data.semesters.length) void fb.saveSemesters(code, data.semesters);
    if (authUser) void fb.bindUserSpace(authUser.uid, code);
    setData((d) => ({ ...d, settings: { ...d.settings, spaceId: code } }));
    return code;
  }, [
    data.users,
    data.events,
    data.periods,
    data.courses,
    data.semesters,
    data.expenses,
    data.expenseCategories,
    data.recurringExpenses,
    authUser,
  ]);

  const joinSharedSpace = useCallback(
    async (code: string): Promise<boolean> => {
      const normalized = code.trim().toUpperCase();
      const exists = await fb.spaceExists(normalized);
      if (!exists) return false;
      // 把本機既有資料合併上去(id 唯一,不會重複)
      await fb.uploadLocal(
        normalized,
        data.events,
        data.periods,
        data.courses,
        data.semesters,
        data.expenses
      );
      if (authUser) void fb.bindUserSpace(authUser.uid, normalized);
      setData((d) => ({ ...d, settings: { ...d.settings, spaceId: normalized } }));
      return true;
    },
    [data.events, data.periods, data.courses, data.semesters, data.expenses, authUser]
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
          merged.semesters,
          merged.expenses
        );
        await fb.saveUsers(keepSpaceId, merged.users);
        await fb.saveExpenseCategories(keepSpaceId, merged.expenseCategories);
        await fb.saveRecurringExpenses(keepSpaceId, merged.recurringExpenses);
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
    addExpense,
    updateExpense,
    deleteExpense,
    saveExpenseCategory,
    deleteExpenseCategory,
    setCategoryHidden,
    reorderExpenseCategories,
    saveRecurringExpense,
    deleteRecurringExpense,
    setNavModules,
    setHomeCards,
    setHomeCourseOwner,
    setOnboarded,
    setTutorialSeen,
    setBudget,
    setSharedSplit,
    setExpenseKeypad,
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
