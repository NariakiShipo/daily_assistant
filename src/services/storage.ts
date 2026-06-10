import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../types';

const KEY = 'daily-assistant:data:v1';

export const defaultData: AppData = {
  users: [
    { id: 'u1', name: '我', color: '#E8638C', isPrimary: true },
    { id: 'u2', name: '伴侶', color: '#7C6BD6', isPrimary: false },
  ],
  events: [],
  periods: [],
  settings: {
    notificationsEnabled: false,
    googleConnected: false,
    remindDaysBefore: 3,
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
