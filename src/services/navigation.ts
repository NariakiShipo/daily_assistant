/**
 * 導覽列與 Home 卡片的設定邏輯。
 *
 * 純資料,不碰 React:這些設定是使用者存起來的偏好,而舊版本升上來的資料
 * 一定會缺欄位、也可能存著已經不存在的模組鍵。正規化的規則寫在這裡並單獨測試,
 * 畫面就只要相信拿到的清單一定是合法的。
 */
import { HomeCardKey, HomeCardPref, MAX_NAV_MODULES, ModuleKey } from '../types';

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
  /** components/Icon 的圖示名 */
  icon: string;
  /** 選擇功能那一頁的一句話說明 */
  description: string;
  /** 新功能標記 */
  isNew?: boolean;
}

/**
 * 所有可放進導覽列的模組。
 *
 * 順序就是「選常用功能」那一頁的排列順序,也是沒有設定時的預設導覽列。
 */
export const MODULES: ModuleMeta[] = [
  {
    key: 'calendar',
    label: '日曆',
    icon: 'calendar',
    description: '兩人行程、重複與提醒',
  },
  {
    key: 'expense',
    label: '記帳',
    icon: 'wallet',
    description: '自己 / 伴侶 / 雙人的花費',
    isNew: true,
  },
  {
    key: 'period',
    label: '經期',
    icon: 'period',
    description: '紀錄、預測與建議',
  },
  {
    key: 'timetable',
    label: '課表',
    icon: 'timetable',
    description: '每人一份,含匯入與衝突',
  },
];

const MODULE_KEYS = MODULES.map((m) => m.key);

export const moduleMeta = (key: ModuleKey): ModuleMeta =>
  MODULES.find((m) => m.key === key) ?? MODULES[0];

/**
 * 正規化導覽列設定。
 *
 * 未設定時給全部模組(目前剛好 4 個);去掉不認得的鍵與重複,並截到上限。
 * 全部被濾掉時退回預設,不然會生出一條空的導覽列,使用者只剩 Home 可按。
 */
export function normalizeNavModules(raw: ModuleKey[] | undefined): ModuleKey[] {
  if (!raw) return [...MODULE_KEYS];
  const seen = new Set<ModuleKey>();
  const out: ModuleKey[] = [];
  for (const k of raw) {
    if (!MODULE_KEYS.includes(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length === MAX_NAV_MODULES) break;
  }
  return out.length ? out : [...MODULE_KEYS];
}

/**
 * 導覽列上某個模組排第幾個(從 1 起算);不在導覽列上回傳 0。
 * 側邊選單用它顯示「導覽列 2」這種標記。
 */
export const navSlot = (modules: ModuleKey[], key: ModuleKey): number =>
  modules.indexOf(key) + 1;

/**
 * 把導覽列切成左右兩半,中間留給 Home。
 *
 * 4 個時是 2 / 2;3 個時左 2 右 1;少於 3 個也不會爆掉,Home 永遠在正中間。
 */
export function splitNav(modules: ModuleKey[]): { left: ModuleKey[]; right: ModuleKey[] } {
  const half = Math.ceil(modules.length / 2);
  return { left: modules.slice(0, half), right: modules.slice(half) };
}

export interface HomeCardMeta {
  key: HomeCardKey;
  label: string;
  description: string;
  /** 沒有設定時預設開著 */
  defaultOn: boolean;
}

/** Home 可顯示的卡片,順序就是預設順序 */
export const HOME_CARDS: HomeCardMeta[] = [
  {
    key: 'course',
    label: '今日課程',
    description: '下一堂是什麼、在哪裡,加上當天完整課表',
    defaultOn: true,
  },
  {
    key: 'period',
    label: '經期狀態',
    description: '目前階段、週期第幾天、下次預計',
    defaultOn: true,
  },
  {
    key: 'events',
    label: '今日行程',
    description: '今天的行程與整天事項(兩人)',
    defaultOn: true,
  },
  {
    key: 'expense',
    label: '今日花費',
    description: '今天總額與筆數,可直接記一筆',
    defaultOn: true,
  },
  {
    key: 'tomorrow',
    label: '明天預覽',
    description: '明天第一堂課與第一個行程',
    defaultOn: false,
  },
  {
    key: 'monthExpense',
    label: '本月花費摘要',
    description: '已用 / 上限,只顯示數字',
    defaultOn: false,
  },
];

const CARD_KEYS = HOME_CARDS.map((c) => c.key);

export const homeCardMeta = (key: HomeCardKey): HomeCardMeta =>
  HOME_CARDS.find((c) => c.key === key) ?? HOME_CARDS[0];

/**
 * 正規化 Home 卡片設定。
 *
 * 使用者存的順序優先,但後來版本新增的卡片要補在後面(用它自己的預設開關),
 * 否則更新 App 之後新卡片永遠不會出現,使用者也找不到它在哪裡打開。
 */
export function normalizeHomeCards(raw: HomeCardPref[] | undefined): HomeCardPref[] {
  const out: HomeCardPref[] = [];
  const seen = new Set<HomeCardKey>();
  for (const p of raw ?? []) {
    if (!CARD_KEYS.includes(p.key) || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push({ key: p.key, on: !!p.on });
  }
  for (const c of HOME_CARDS) {
    if (!seen.has(c.key)) out.push({ key: c.key, on: c.defaultOn });
  }
  return out;
}

/** 目前要顯示的卡片(依使用者的順序,只留開著的) */
export const visibleHomeCards = (raw: HomeCardPref[] | undefined): HomeCardKey[] =>
  normalizeHomeCards(raw)
    .filter((p) => p.on)
    .map((p) => p.key);

/** 把清單裡的某一項往前或往後移一格,超出範圍時原樣回傳 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return list;
  }
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
