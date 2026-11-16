/**
 * Home(設計稿 1c)— 導覽列中央那一格。
 *
 * 解決檢視清單第 02 條:打開 App 直接落在月曆,沒有一個「今天一眼看完」的地方。
 * 每張卡都直接重用既有資料,不另存一份:課表用 TodayCourseCard、經期用
 * prediction / phase、行程用 expandEvents、花費用當天的帳目。
 *
 * 卡片的順序與開關由 settings.homeCards 決定(右上「調整顯示」),
 * 所以這裡只負責「照設定把卡片排出來」,不自己決定要顯示什麼。
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing, tagColor } from '../theme';
import { HomeCardKey } from '../types';
import { visibleHomeCards } from '../services/navigation';
import { phaseNameZh } from '../services/periodPrediction';
import { expandEvents } from '../services/recurrence';
import { coursesOnDate, slotRangeText } from '../services/timetableToday';
import { budgetState, formatCurrency, inMonth, onDate, totals } from '../services/expenses';
import { addDays, daysBetween, formatDateZh, fromDateKey, todayKey, weekdayZh } from '../utils/date';
import TodayCourseCard from '../components/TodayCourseCard';
import Icon from '../components/Icon';
import { EmptyState, mutedSmall } from '../components/expenseUi';

interface Props {
  onOpenMenu: () => void;
  onOpenCardSettings: () => void;
  /** 「＋ 記一筆」與經期 / 行程卡片都可以把人帶到對應的模組 */
  onGoTo: (target: 'calendar' | 'expense' | 'period' | 'timetable') => void;
  /** ☰ 的位置,給首次使用教學打光用 */
  onMenuLayout?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

const HomeScreen: React.FC<Props> = ({ onOpenMenu, onOpenCardSettings, onGoTo, onMenuLayout }) => {
  const { data, prediction, phase } = useApp();
  const today = todayKey();
  const split = data.settings.sharedSplit ?? 'separate';

  const primary = data.users.find((u) => u.isPrimary) ?? data.users[0];
  const courseOwnerId = data.settings.homeCourseOwnerId ?? primary?.id ?? 'u1';
  const courseOwner = data.users.find((u) => u.id === courseOwnerId) ?? primary;

  const cards = useMemo(
    () => visibleHomeCards(data.settings.homeCards),
    [data.settings.homeCards]
  );

  /** 今天的行程(重複行程已展開);跨日行程涵蓋今天的也要算進來 */
  const todayEvents = useMemo(
    () =>
      expandEvents(data.events, today, today).filter(
        (e) => e.date <= today && (e.endDate ?? e.date) >= today
      ),
    [data.events, today]
  );

  const todayExpenses = useMemo(() => onDate(data.expenses, today), [data.expenses, today]);
  const todaySpend = useMemo(() => totals(todayExpenses, 'all', split), [todayExpenses, split]);

  const tomorrow = addDays(today, 1);
  const tomorrowEvents = useMemo(
    () => (cards.includes('tomorrow') ? expandEvents(data.events, tomorrow, tomorrow) : []),
    [cards, data.events, tomorrow]
  );
  const tomorrowCourses = useMemo(
    () =>
      cards.includes('tomorrow')
        ? coursesOnDate(data.courses, data.semesters, tomorrow, courseOwnerId)
        : [],
    [cards, data.courses, data.semesters, tomorrow, courseOwnerId]
  );

  const monthSums = useMemo(
    () => totals(inMonth(data.expenses, today.slice(0, 7)), 'self', split),
    [data.expenses, today, split]
  );
  const monthBudget = budgetState(monthSums.expense, data.settings.budget?.self);

  const d = fromDateKey(today);
  const headerTitle = `今天 ${d.getMonth() + 1}/${d.getDate()}（週${weekdayZh[d.getDay()]}）`;

  const renderCard = (key: HomeCardKey) => {
    switch (key) {
      case 'course':
        return (
          <TouchableOpacity key={key} activeOpacity={0.9} onPress={() => onGoTo('timetable')}>
            <TodayCourseCard
              courses={data.courses}
              semesters={data.semesters}
              ownerId={courseOwnerId}
              ownerName={courseOwner?.name ?? '我'}
            />
          </TouchableOpacity>
        );

      case 'period': {
        if (!phase) {
          return (
            <View key={key} style={[s.card, s.periodCard]}>
              <View style={s.flex}>
                <Text style={s.periodPhase}>還沒有經期紀錄</Text>
                <Text style={s.periodMeta}>記一次開始日之後,這裡就會顯示目前階段與預測。</Text>
              </View>
            </View>
          );
        }
        const days = prediction ? daysBetween(today, prediction.nextStart) : null;
        return (
          <TouchableOpacity
            key={key}
            style={[s.card, s.periodCard]}
            activeOpacity={0.9}
            onPress={() => onGoTo('period')}
          >
            <View style={s.flex}>
              <Text style={s.periodPhase}>{phaseNameZh[phase.phase]}</Text>
              <Text style={s.periodMeta}>
                {`週期第 ${phase.dayOfCycle} 天`}
                {prediction
                  ? ` · 預計 ${formatDateZh(prediction.nextStart)} 開始${
                      days !== null && days >= 0 ? `（${days} 天後）` : ''
                    }`
                  : ''}
              </Text>
            </View>
            <View style={s.periodIcon}>
              <Icon name="period" size={22} color={colors.primary} />
            </View>
          </TouchableOpacity>
        );
      }

      case 'events':
        return (
          <TouchableOpacity
            key={key}
            style={s.card}
            activeOpacity={0.9}
            onPress={() => onGoTo('calendar')}
          >
            <Text style={s.cardTitle}>今日行程 · {todayEvents.length} 筆</Text>
            {todayEvents.length === 0 ? (
              <Text style={s.emptyLine}>今天沒有安排。</Text>
            ) : (
              todayEvents.map((e, i) => {
                const owners = e.ownerIds?.length ? e.ownerIds : [e.ownerId];
                const names = owners
                  .map((id) => data.users.find((u) => u.id === id)?.name)
                  .filter(Boolean)
                  .join('、');
                const firstColor =
                  data.users.find((u) => u.id === owners[0])?.color ?? colors.primary;
                const secondColor = owners[1]
                  ? data.users.find((u) => u.id === owners[1])?.color
                  : undefined;
                return (
                  <View key={`${e.id}-${e.date}`} style={[s.eventRow, i > 0 && s.divider]}>
                    {/* 兩人共用的行程用上下兩色的細條,一眼看出是誰的 */}
                    <View style={s.eventBar}>
                      <View style={{ flex: 1, backgroundColor: firstColor }} />
                      {!!secondColor && <View style={{ flex: 1, backgroundColor: secondColor }} />}
                    </View>
                    <View style={s.flex}>
                      <View style={s.eventTitleRow}>
                        <Text style={s.eventTitle} numberOfLines={1}>
                          {e.title}
                        </Text>
                        {(e.tags ?? []).slice(0, 1).map((t) => (
                          <View key={t} style={[s.tag, { backgroundColor: tagColor(t) }]}>
                            <Text style={s.tagText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={s.eventMeta}>
                        {e.allDay ? '整天' : `${e.startTime} – ${e.endTime}`}
                        {names ? ` · ${names}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </TouchableOpacity>
        );

      case 'expense':
        return (
          <View key={key} style={[s.card, s.rowCard]}>
            <View style={s.flex}>
              <Text style={s.miniLabel}>今日花費</Text>
              <Text style={s.bigNumber}>
                {formatCurrency(todaySpend.expense)}
                <Text style={s.bigNumberSub}> · {todayExpenses.length} 筆</Text>
              </Text>
            </View>
            <TouchableOpacity style={s.ghostBtn} onPress={() => onGoTo('expense')}>
              <Icon name="plus" size={14} color={colors.primary} />
              <Text style={s.ghostBtnText}>記一筆</Text>
            </TouchableOpacity>
          </View>
        );

      case 'tomorrow': {
        const firstCourse = tomorrowCourses[0];
        const firstEvent = tomorrowEvents[0];
        return (
          <View key={key} style={s.card}>
            <Text style={s.cardTitle}>明天預覽</Text>
            {!firstCourse && !firstEvent ? (
              <Text style={s.emptyLine}>明天沒有課,也沒有行程。</Text>
            ) : (
              <>
                {!!firstCourse && (
                  <Text style={s.previewLine}>
                    第一堂 · {slotRangeText(firstCourse)} {firstCourse.course.title}
                    {firstCourse.course.location ? ` · ${firstCourse.course.location}` : ''}
                  </Text>
                )}
                {!!firstEvent && (
                  <Text style={s.previewLine}>
                    第一個行程 · {firstEvent.allDay ? '整天' : firstEvent.startTime}{' '}
                    {firstEvent.title}
                  </Text>
                )}
              </>
            )}
          </View>
        );
      }

      case 'monthExpense':
        return (
          <View key={key} style={[s.card, s.rowCard]}>
            <View style={s.flex}>
              <Text style={s.miniLabel}>本月花費（{primary?.name ?? '自己'}）</Text>
              <Text style={s.bigNumber}>{formatCurrency(monthSums.expense)}</Text>
            </View>
            {monthBudget && (
              /* 只寫數字,沒有進度條也沒有顏色變化——上限不做任何提醒 */
              <View style={s.limitBox}>
                <Text style={s.limitLine}>上限 {formatCurrency(monthBudget.limit)}</Text>
                <Text style={s.limitLine}>剩 {formatCurrency(monthBudget.remaining)}</Text>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.roundBtn}
          onPress={onOpenMenu}
          accessibilityLabel="選單"
          onLayout={(e) => {
            if (!onMenuLayout) return;
            e.currentTarget.measureInWindow((x, y, width, height) =>
              onMenuLayout({ x, y, width, height })
            );
          }}
        >
          <Icon name="menu" size={18} color={colors.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{headerTitle}</Text>
        <TouchableOpacity style={s.textBtn} onPress={onOpenCardSettings}>
          <Text style={s.textBtnLabel}>調整顯示</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {cards.length === 0 ? (
          <EmptyState
            title="Home 目前沒有卡片"
            hint="點右上「調整顯示」把想看的內容打開。"
          />
        ) : (
          cards.map(renderCard)
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: spacing.sm,
  },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  textBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  textBtnLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: spacing.xl, gap: spacing.md },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyLine: { fontSize: 13, color: mutedSmall },

  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.periodDay,
    paddingVertical: 14,
  },
  periodPhase: { fontSize: 20, fontWeight: '800', color: colors.primary },
  periodMeta: { fontSize: 13, color: colors.text, marginTop: 2, lineHeight: 19 },
  periodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  eventBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, overflow: 'hidden' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  eventMeta: { fontSize: 12, color: mutedSmall, marginTop: 2 },

  miniLabel: { fontSize: 12, fontWeight: '700', color: mutedSmall },
  bigNumber: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  bigNumberSub: { fontSize: 12, fontWeight: '600', color: mutedSmall },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  previewLine: { fontSize: 13, color: colors.text, lineHeight: 20 },
  limitBox: { alignItems: 'flex-end' },
  limitLine: { fontSize: 12, color: mutedSmall, lineHeight: 18 },
});

export default HomeScreen;
