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
import PeriodScreen from './src/screens/PeriodScreen';
import TimetableScreen from './src/screens/TimetableScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';

type Tab = 'calendar' | 'period' | 'timetable' | 'settings';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'calendar', label: '日曆', icon: '📅' },
  { key: 'period', label: '經期', icon: '🌸' },
  { key: 'timetable', label: '課表', icon: '📚' },
  { key: 'settings', label: '設定', icon: '⚙️' },
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
        {tab === 'period' && <PeriodScreen />}
        {tab === 'timetable' && <TimetableScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      <View style={s.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} style={s.tabItem} onPress={() => setTab(t.key)}>
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
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
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
});

export default App;
