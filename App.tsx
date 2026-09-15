/**
 * App 外殼:登入 → 選常用功能 → 以 Home 為中心的導覽。
 *
 * 三層畫面,由上到下:
 *   1. 還沒走完 onboarding → 登入頁 / 選常用功能(佔滿整個畫面,沒有導覽列)
 *   2. 從側邊選單開的子頁(設定的某一段、重新選導覽列功能)——蓋在主畫面上,
 *      有自己的返回鍵;用覆蓋而不是換分頁,返回時才會回到原本待的地方
 *   3. 主畫面:模組內容 + 底部導覽列(中央 Home)
 *
 * 這個專案沒有 navigation 套件,一直是用狀態直接換畫面;維持同樣做法,
 * 為了三層畫面引入一整套路由並不划算。
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/store/AppContext';
import CalendarScreen from './src/screens/CalendarScreen';
import ExpenseScreen, { ExpenseSubView } from './src/screens/ExpenseScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import PeriodScreen from './src/screens/PeriodScreen';
import PickModulesScreen from './src/screens/PickModulesScreen';
import SettingsScreen, { SettingsSection } from './src/screens/SettingsScreen';
import TimetableScreen from './src/screens/TimetableScreen';
import NavBar, { NavTarget } from './src/components/NavBar';
import SideMenu, { MenuDestination } from './src/components/SideMenu';
import HomeCardsModal from './src/components/HomeCardsModal';
import TutorialOverlay, { SpotRect, TutorialStep } from './src/components/TutorialOverlay';
import { normalizeNavModules } from './src/services/navigation';
import { colors } from './src/theme';

/** onboarding 的兩步 */
type OnboardStep = 'login' | 'pick';

/** 從側邊選單開的覆蓋層 */
type Overlay =
  | { kind: 'settings'; section: SettingsSection; title: string }
  | { kind: 'pickModules' }
  | null;

const Main: React.FC = () => {
  const { ready, data, authUser, setNavModules, setOnboarded, setTutorialSeen } = useApp();

  const [tab, setTab] = useState<NavTarget>('home');
  const [onboardStep, setOnboardStep] = useState<OnboardStep>('login');
  const [menuOpen, setMenuOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [expenseView, setExpenseView] = useState<ExpenseSubView | undefined>(undefined);

  /* 首次使用教學:被教的那三個元件自己回報位置,不寫死座標 */
  const [tutorialStep, setTutorialStep] = useState(0);
  const [homeRect, setHomeRect] = useState<SpotRect | undefined>(undefined);
  const [menuRect, setMenuRect] = useState<SpotRect | undefined>(undefined);
  const [fabRect, setFabRect] = useState<SpotRect | undefined>(undefined);

  const onboarded = !!data.settings.onboarded;
  const modules = normalizeNavModules(data.settings.navModules);

  /*
   * 教學只在「已經走完 onboarding、還沒看過、而且人在 Home」時跑。
   * 前兩步教的東西都在 Home 上,在別的分頁打光只會指到不存在的按鈕。
   */
  const tutorialActive = ready && onboarded && !data.settings.tutorialSeen;

  // 重看教學時把人帶回 Home,否則第一步的打光會找不到目標
  useEffect(() => {
    if (tutorialActive && tutorialStep === 0 && tab !== 'home') setTab('home');
  }, [tutorialActive, tutorialStep, tab]);

  if (!ready) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  /* ── onboarding ──────────────────────────────────── */

  if (!onboarded) {
    /*
     * 已經登入的人(例如更新前就開過帳號)不該再被要求登入一次,
     * 直接跳到選常用功能那一步。
     */
    const step: OnboardStep = onboardStep === 'login' && authUser ? 'pick' : onboardStep;
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="dark" />
        {step === 'login' ? (
          <LoginScreen onDone={() => setOnboardStep('pick')} />
        ) : (
          <PickModulesScreen
            initial={data.settings.navModules}
            onDone={(picked) => {
              setNavModules(picked);
              setOnboarded(true);
              setTab('home');
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  /* ── 主畫面 ──────────────────────────────────────── */

  const goTo = (target: NavTarget) => {
    // 切到別的模組時清掉「要停在哪個子畫面」的指定,不然下次點記帳又會跳到設定
    if (target !== 'expense') setExpenseView(undefined);
    setTab(target);
  };

  const openFromMenu = (dest: MenuDestination) => {
    switch (dest.kind) {
      case 'settings':
        setOverlay({ kind: 'settings', section: dest.section, title: dest.title });
        break;
      case 'expenseSettings':
        setExpenseView('settings');
        setTab('expense');
        break;
      case 'homeCards':
        setCardsOpen(true);
        break;
      case 'pickModules':
        setOverlay({ kind: 'pickModules' });
        break;
    }
  };

  const steps: TutorialStep[] = [
    {
      spot: homeRect,
      place: 'bottom',
      title: '這裡是 Home',
      body: '今天的課、經期狀態、行程與花費一次看完。想改顯示哪些卡片，點右上「調整顯示」。',
    },
    {
      spot: menuRect,
      place: 'top',
      title: '所有功能與設定都在 ☰',
      body: '沒放進底部導覽列的功能、成員、同步、Google 日曆、通知都從這裡進。共享狀態也在最上面。',
    },
    {
      spot: fabRect,
      place: 'bottom',
      title: '記第一筆',
      body: '點分類 → 按金額 → 完成，三步就好。當月上限只會顯示剩多少，不會跳出提醒。',
      cta: '開始使用',
    },
  ];

  const finishTutorial = () => {
    setTutorialSeen(true);
    setTutorialStep(0);
  };

  const nextTutorialStep = () => {
    // 第三步教的是記帳的 ＋,先把人帶到記帳頁,那顆按鈕才量得到位置
    if (tutorialStep === 1) {
      setExpenseView('home');
      setTab('expense');
    }
    if (tutorialStep === steps.length - 1) finishTutorial();
    else setTutorialStep((n) => n + 1);
  };

  const content = () => {
    switch (tab) {
      case 'home':
        return (
          <HomeScreen
            onOpenMenu={() => setMenuOpen(true)}
            onOpenCardSettings={() => setCardsOpen(true)}
            onGoTo={goTo}
            onMenuLayout={setMenuRect}
          />
        );
      case 'calendar':
        return <CalendarScreen />;
      case 'expense':
        return <ExpenseScreen requestedView={expenseView} onFabMeasure={setFabRect} />;
      case 'period':
        return <PeriodScreen />;
      case 'timetable':
        return <TimetableScreen />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.body}>{content()}</View>

      <NavBar
        modules={modules}
        active={tab}
        onSelect={goTo}
        onHomeLayout={setHomeRect}
      />

      {/* 側邊選單開的子頁蓋在最上面,有自己的返回鍵 */}
      {overlay?.kind === 'settings' && (
        <View style={s.overlay}>
          <SettingsScreen
            section={overlay.section}
            title={overlay.title}
            onBack={() => setOverlay(null)}
          />
        </View>
      )}
      {overlay?.kind === 'pickModules' && (
        <View style={s.overlay}>
          <PickModulesScreen
            initial={data.settings.navModules}
            onBack={() => setOverlay(null)}
            onDone={(picked) => {
              setNavModules(picked);
              setOverlay(null);
            }}
          />
        </View>
      )}

      <SideMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        active={tab}
        onNavigate={goTo}
        onOpen={openFromMenu}
        onReplayTutorial={() => {
          setTutorialStep(0);
          setTutorialSeen(false);
        }}
      />

      <HomeCardsModal visible={cardsOpen} onClose={() => setCardsOpen(false)} />

      <TutorialOverlay
        visible={tutorialActive && !overlay && !menuOpen && !cardsOpen}
        step={tutorialStep}
        steps={steps}
        onNext={nextTutorialStep}
        onSkip={finishTutorial}
      />
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
  body: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background },
});

export default App;
