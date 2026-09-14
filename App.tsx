import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/store/AppContext';
import CalendarScreen from './src/screens/CalendarScreen';
import ExpenseScreen from './src/screens/ExpenseScreen';
import PeriodScreen from './src/screens/PeriodScreen';
import TimetableScreen from './src/screens/TimetableScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Icon, { IconName } from './src/components/Icon';
import { colors } from './src/theme';

type Tab = 'calendar' | 'expense' | 'period' | 'timetable' | 'settings';

/*
 * 分頁圖示改用線條圖示而不是 Emoji:Emoji 在各平台長相不同、無法著色也對不齊
 * (設計檢視清單第 05 條)。「設定」之後會收進左上側邊選單,目前先留在分頁列。
 */
const tabs: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'calendar', label: '日曆', icon: 'calendar' },
  { key: 'expense', label: '記帳', icon: 'wallet' },
  { key: 'period', label: '經期', icon: 'period' },
  { key: 'timetable', label: '課表', icon: 'timetable' },
  { key: 'settings', label: '設定', icon: 'settings' },
];

const Main: React.FC = () => {
  const { ready } = useApp();
  const [tab, setTab] = useState<Tab>('calendar');

  if (!ready) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'calendar' && <CalendarScreen />}
        {tab === 'expense' && <ExpenseScreen />}
        {tab === 'period' && <PeriodScreen />}
        {tab === 'timetable' && <TimetableScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      <View style={s.tabBar}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={s.tabItem} onPress={() => setTab(t.key)}>
              <Icon
                name={t.icon}
                size={22}
                color={active ? colors.primary : '#9B8590'}
                strokeWidth={active ? 2 : 1.8}
              />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <Main />
  </AppProvider>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingBottom: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  // 11px 的分頁字用 #7A6570 而不是 textMuted,對比才夠(檢視清單第 06 條)
  tabLabel: { fontSize: 11, color: '#7A6570' },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
});

export default App;
