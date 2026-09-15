import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, DEFAULT_EXPENSE_CATEGORIES } from '../types';

const KEY = 'daily-assistant:data:v1';

export const defaultData: AppData = {
  users: [
    { id: 'u1', name: '我', color: '#E8638C', isPrimary: true },
    { id: 'u2', name: '伴侶', color: '#7C6BD6', isPrimary: false },
  ],
  events: [],
  periods: [],
  courses: [],
  semesters: [],
  expenses: [],
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  recurringExpenses: [],
  settings: {
    notificationsEnabled: false,
    googleConnected: false,
    remindDaysBefore: 3,
    spaceId: null,
    customTags: [],
    periodFieldNames: [],
    customSymptoms: [],
    crossDevicePush: false,
    budget: {},
    sharedSplit: 'separate',
    expenseKeypad: 'app',
    recentExpenseNotes: [],
    recurringSkips: [],
    onboarded: false,
    tutorialSeen: false,
  },
};

export async function loadData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...defaultData,
      ...parsed,
      /*
       * 分類是「舊版本升上來」唯一會出事的欄位:舊資料沒有 expenseCategories,
       * 展開後是空陣列,記一筆就一格分類都沒有。缺少時補回預設。
       */
      expenseCategories: parsed.expenseCategories?.length
        ? parsed.expenseCategories
        : defaultData.expenseCategories,
      settings: { ...defaultData.settings, ...parsed.settings },
    };
  } catch {
    return defaultData;
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 寫入失敗時靜默處理(MVP)
  }
}

export async function clearData(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
