/**
 * 記帳分頁的外殼。
 *
 * 這個 App 沒有 navigation 套件,分頁切換一直是 App.tsx 用狀態直接換畫面;
 * 記帳的子畫面(報表、日曆檢視、分類、設定)沿用同一套做法,
 * 為了五個畫面引入一整套導航依賴並不划算。
 *
 * 月份與歸屬留在這一層:從首頁跳到報表或日曆檢視時,期間與「看誰的」要跟著走,
 * 否則每換一個畫面都得重選一次。
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Expense } from '../types';
import { WhoFilter } from '../services/expenses';
import { todayKey } from '../utils/date';
import ExpenseHomeScreen from './ExpenseHomeScreen';
import ExpenseReportScreen from './ExpenseReportScreen';
import ExpenseCalendarScreen from './ExpenseCalendarScreen';
import ExpenseCategoryScreen from './ExpenseCategoryScreen';
import ExpenseSettingsScreen from './ExpenseSettingsScreen';
import ExpenseEntryModal from '../components/ExpenseEntryModal';

export type ExpenseSubView = 'home' | 'report' | 'calendar' | 'categories' | 'settings';

interface Props {
  /**
   * 從外面指定要停在哪個子畫面(側邊選單的「記帳設定」會用到)。
   * 只在值改變時套用,之後使用者在頁內怎麼切都不會被拉回去。
   */
  requestedView?: ExpenseSubView;
  /** 首次使用教學要打光在 ＋ 上 */
  onFabMeasure?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

const ExpenseScreen: React.FC<Props> = ({ requestedView, onFabMeasure }) => {
  const now = new Date();
  const [view, setView] = useState<ExpenseSubView>(requestedView ?? 'home');

  useEffect(() => {
    if (requestedView) setView(requestedView);
  }, [requestedView]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [who, setWho] = useState<WhoFilter>('self');

  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [entryDate, setEntryDate] = useState(todayKey());

  const changeMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  const openAdd = (date = todayKey()) => {
    setEditing(null);
    setEntryDate(date);
    setEntryOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setEntryOpen(true);
  };

  return (
    <View style={{ flex: 1 }}>
      {view === 'home' && (
        <ExpenseHomeScreen
          year={year}
          month={month}
          onChangeMonth={changeMonth}
          who={who}
          onChangeWho={setWho}
          onOpenSettings={() => setView('settings')}
          onOpenReport={() => setView('report')}
          onOpenCalendar={() => setView('calendar')}
          onAdd={() => openAdd()}
          onEdit={openEdit}
          onFabMeasure={onFabMeasure}
        />
      )}
      {view === 'report' && (
        <ExpenseReportScreen
          onBack={() => setView('home')}
          who={who}
          onChangeWho={setWho}
          year={year}
          month={month}
        />
      )}
      {view === 'calendar' && (
        <ExpenseCalendarScreen
          onBack={() => setView('home')}
          year={year}
          month={month}
          onChangeMonth={changeMonth}
          who={who}
          onChangeWho={setWho}
          onAdd={openAdd}
          onEdit={openEdit}
        />
      )}
      {view === 'categories' && <ExpenseCategoryScreen onBack={() => setView('home')} />}
      {view === 'settings' && (
        <ExpenseSettingsScreen
          onBack={() => setView('home')}
          onManageCategories={() => setView('categories')}
        />
      )}

      <ExpenseEntryModal
        visible={entryOpen}
        onClose={() => setEntryOpen(false)}
        expense={editing}
        defaultDate={entryDate}
        defaultWho={who === 'all' ? 'self' : who}
        onManageCategories={() => {
          setEntryOpen(false);
          setView('categories');
        }}
      />
    </View>
  );
};

export default ExpenseScreen;
