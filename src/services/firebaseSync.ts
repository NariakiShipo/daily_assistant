/**
 * Firebase Firestore 即時同步
 *
 * 設計:免帳號「配對碼」模式
 * - A 按「建立共享空間」→ 產生 10 碼隨機配對碼(= Firestore 文件 ID)
 * - B 輸入配對碼加入,雙方即時同步事件、經期紀錄與成員設定
 * - 安全性:知道配對碼才能存取(配對碼空間夠大無法猜測),
 *   搭配 firestore.rules 禁止列舉所有空間
 *
 * 結構:
 *   spaces/{code}            { users, createdAt }
 *   spaces/{code}/events/{id}
 *   spaces/{code}/periods/{id}
 */
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  Firestore,
  initializeFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  deleteField,
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from '../config';
import { CalendarEvent, CourseEntry, PeriodRecord, SemesterMeta, UserProfile } from '../types';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

/** 供 auth 等其他服務取得同一個 Firebase App 實例 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) getDb();
  return app;
}

function getDb(): Firestore | null {
  if (!isFirebaseConfigured()) return null;
  if (!db) {
    app = initializeApp(firebaseConfig);
    // RN / Expo Go 環境需自動偵測 long-polling;
    // ignoreUndefinedProperties:選填欄位(如 endDate、notes)為 undefined 時不可寫入 Firestore
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  }
  return db;
}

/** 帳號綁定的共享空間:users/{uid} → { spaceId } */
export async function getUserSpaceId(uid: string): Promise<string | null> {
  const d = getDb();
  if (!d) return null;
  const snap = await getDoc(doc(d, 'users', uid));
  return (snap.data()?.spaceId as string | undefined) ?? null;
}

export async function bindUserSpace(uid: string, spaceId: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'users', uid), { spaceId, updatedAt: serverTimestamp() }, { merge: true });
}

/** 產生 10 碼配對碼(去除易混淆字元) */
export function newSpaceCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 建立共享空間並上傳現有資料,回傳配對碼 */
export async function createSpace(
  users: UserProfile[],
  events: CalendarEvent[],
  periods: PeriodRecord[],
  courses: CourseEntry[]
): Promise<string> {
  const d = getDb();
  if (!d) throw new Error('Firebase 尚未設定');
  const code = newSpaceCode();
  await setDoc(doc(d, 'spaces', code), { users, createdAt: serverTimestamp() });
  await uploadLocal(code, events, periods, courses);
  return code;
}

/** 確認配對碼存在(加入前驗證) */
export async function spaceExists(code: string): Promise<boolean> {
  const d = getDb();
  if (!d) return false;
  const snap = await getDoc(doc(d, 'spaces', code));
  return snap.exists();
}

/** 將本機既有資料合併上傳(id 不變,重複者覆蓋) */
export async function uploadLocal(
  code: string,
  events: CalendarEvent[],
  periods: PeriodRecord[],
  courses: CourseEntry[],
  semesters?: SemesterMeta[]
): Promise<void> {
  const d = getDb();
  if (!d) return;
  const batch = writeBatch(d);
  for (const ev of events) batch.set(doc(d, 'spaces', code, 'events', ev.id), ev);
  for (const p of periods) batch.set(doc(d, 'spaces', code, 'periods', p.id), p);
  for (const c of courses) batch.set(doc(d, 'spaces', code, 'courses', c.id), c);
  await batch.commit();
  if (semesters?.length) await mergeSemesters(code, semesters);
}

/** 學期清單存在空間根文件上(小量資料,整份覆蓋) */
export async function saveSemesters(code: string, semesters: SemesterMeta[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code), { semesters }, { merge: true });
}

/** 本機學期與雲端聯集(同 id 以本機為準),避免剛加入的裝置蓋掉雲端清單 */
export async function mergeSemesters(code: string, local: SemesterMeta[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  const snap = await getDoc(doc(d, 'spaces', code));
  const cloud = (snap.data()?.semesters as SemesterMeta[] | undefined) ?? [];
  const merged = new Map<string, SemesterMeta>();
  for (const s of cloud) merged.set(s.id, s);
  for (const s of local) merged.set(s.id, s);
  await setDoc(doc(d, 'spaces', code), { semesters: [...merged.values()] }, { merge: true });
}

/** 課表覆蓋:一次刪除舊課程並寫入新課程(匯入用) */
export async function replaceCourseDocs(
  code: string,
  removeIds: string[],
  added: CourseEntry[]
): Promise<void> {
  const d = getDb();
  if (!d) return;
  const batch = writeBatch(d);
  for (const id of removeIds) batch.delete(doc(d, 'spaces', code, 'courses', id));
  for (const c of added) batch.set(doc(d, 'spaces', code, 'courses', c.id), c);
  await batch.commit();
}

export interface RemoteEventChange {
  type: 'added' | 'modified' | 'removed';
  event: CalendarEvent;
}

export interface SpaceCallbacks {
  onUsers: (users: UserProfile[]) => void;
  /** remoteChanges 只包含「對方裝置」造成的變更(初始載入不算) */
  onEvents: (events: CalendarEvent[], remoteChanges: RemoteEventChange[]) => void;
  onPeriods: (periods: PeriodRecord[]) => void;
  onCourses: (courses: CourseEntry[]) => void;
  onSemesters?: (semesters: SemesterMeta[]) => void;
}

/** 訂閱共享空間,回傳取消訂閱函式 */
export function subscribeSpace(code: string, cb: SpaceCallbacks): () => void {
  const d = getDb();
  if (!d) return () => undefined;

  const unsubSpace = onSnapshot(doc(d, 'spaces', code), (snap) => {
    const data = snap.data();
    if (data?.users) cb.onUsers(data.users as UserProfile[]);
    if (data?.semesters) cb.onSemesters?.(data.semesters as SemesterMeta[]);
  });

  let firstEvents = true;
  const unsubEvents = onSnapshot(collection(d, 'spaces', code, 'events'), (snap) => {
    const events = snap.docs.map((x) => x.data() as CalendarEvent);
    const remoteChanges: RemoteEventChange[] =
      firstEvents || snap.metadata.hasPendingWrites
        ? []
        : snap.docChanges().map((c) => ({
            type: c.type,
            event: c.doc.data() as CalendarEvent,
          }));
    firstEvents = false;
    cb.onEvents(events, remoteChanges);
  });

  const unsubPeriods = onSnapshot(collection(d, 'spaces', code, 'periods'), (snap) => {
    cb.onPeriods(snap.docs.map((x) => x.data() as PeriodRecord));
  });

  const unsubCourses = onSnapshot(collection(d, 'spaces', code, 'courses'), (snap) => {
    cb.onCourses(snap.docs.map((x) => x.data() as CourseEntry));
  });

  return () => {
    unsubSpace();
    unsubEvents();
    unsubPeriods();
    unsubCourses();
  };
}

export async function saveEventDoc(code: string, ev: CalendarEvent): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code, 'events', ev.id), ev);
}

export async function deleteEventDoc(code: string, id: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await deleteDoc(doc(d, 'spaces', code, 'events', id));
}

export async function saveCourseDoc(code: string, c: CourseEntry): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code, 'courses', c.id), c);
}

export async function deleteCourseDoc(code: string, id: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await deleteDoc(doc(d, 'spaces', code, 'courses', id));
}

export async function savePeriodDoc(code: string, p: PeriodRecord): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code, 'periods', p.id), p);
}

export async function deletePeriodDoc(code: string, id: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await deleteDoc(doc(d, 'spaces', code, 'periods', id));
}

export async function saveUsers(code: string, users: UserProfile[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code), { users }, { merge: true });
}

/**
 * 空間的成員名單(firestore.rules 的 members 欄位)。
 *
 * 有 members 的空間只有名單內的登入帳號能存取,配對碼不再是通行證。
 * 這是使用者主動「鎖定」才會發生的事,不會自動升級——
 * 自動升級會把還沒有帳號的伴侶直接鎖在門外。
 */
export async function getSpaceMembers(code: string): Promise<string[] | null> {
  const d = getDb();
  if (!d) return null;
  const snap = await getDoc(doc(d, 'spaces', code));
  const members = snap.data()?.members as string[] | undefined;
  return members ?? null;
}

/** 鎖定空間:把自己設為第一位成員,之後只有名單內的帳號能存取 */
export async function lockSpace(code: string, uid: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code), { members: [uid] }, { merge: true });
}

/** 把另一個帳號加進成員名單 */
export async function addSpaceMember(code: string, uid: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code), { members: arrayUnion(uid) }, { merge: true });
}

/** 解除鎖定:移除 members 欄位,回到配對碼存取模式 */
export async function unlockSpace(code: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await setDoc(doc(d, 'spaces', code), { members: deleteField() }, { merge: true });
}
