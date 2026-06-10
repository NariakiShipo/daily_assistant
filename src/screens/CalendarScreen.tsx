import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { CalendarEvent, EVENT_TAGS, TAG_DONE } from '../types';
import { colors, radius, spacing, tagColor } from '../theme';
import {
  formatMonthZh,
  isWithin,
  monthGrid,
  todayKey,
  weekdayZh,
  addDays,
} from '../utils/date';
import { Card, Chip, Dot, SectionTitle } from '../components/ui';
import EventModal from '../components/EventModal';

type ViewMode = 'time' | 'person';

const CalendarScreen: React.FC = () => {
  const { data, prediction, updateEvent } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [selected, setSelected] = useState(todayKey());
  const [filterUser, setFilterUser] = useState<string | null>(null); // null = 全部
  const [filterTag, setFilterTag] = useState<string | null>(null); // 標籤名或「未完成」
  const [viewMode, setViewMode] = useState<ViewMode>('time');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  /** 可篩選標籤 = 預設 + 自訂 + 行程已使用的 */
  const allTags = useMemo(() => {
    const set = new Set<string>([...EVENT_TAGS, ...(data.settings.customTags ?? [])]);
    for (const e of data.events) for (const t of e.tags ?? []) set.add(t);
    return [...set];
  }, [data.events, data.settings.customTags]);
  const today = todayKey();

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthEvents = useMemo(
    () =>
      data.events
        .filter((e) => e.date.startsWith(monthPrefix))
        .filter((e) => (filterUser ? e.ownerId === filterUser : true))
        .filter((e) => {
          if (!filterTag) return true;
          if (filterTag === '未完成') return !e.tags?.includes(TAG_DONE);
          return !!e.tags?.includes(filterTag);
        })
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [data.events, monthPrefix, filterUser, filterTag]
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of monthEvents) (map[e.date] ??= []).push(e);
    return map;
  }, [monthEvents]);

  /** 經期實際日(粉底)與預測區間(淡粉框) */
  const periodDays = useMemo(() => {
    const set = new Set<string>();
    for (const p of data.periods) {
      const end = p.endDate ?? addDays(p.startDate, 4);
      let d = p.startDate;
      while (d <= end) {
        set.add(d);
        d = addDays(d, 1);
      }
    }
    return set;
  }, [data.periods]);

  const userOf = (id: string) => data.users.find((u) => u.id === id);

  const prevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
  };

  /** 切換事件的「完成」標籤 */
  const toggleDone = (ev: CalendarEvent) => {
    const cur = ev.tags ?? [];
    const tags = cur.includes(TAG_DONE)
      ? cur.filter((t) => t !== TAG_DONE)
      : [...cur, TAG_DONE];
    void updateEvent({ ...ev, tags: tags.length ? tags : undefined });
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (ev: CalendarEvent) => {
    setEditing(ev);
    setModalOpen(true);
  };

  const selectedEvents = eventsByDate[selected] ?? [];

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }}>
        {/* 月份切換 */}
        <View style={s.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
            <Text style={s.navBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.monthTitle}>{formatMonthZh(year, month)}</Text>
          <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
            <Text style={s.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 篩選:全部 / 個人 + 檢視模式 */}
        <View style={s.filterRow}>
          <Chip label="全部" active={filterUser === null} onPress={() => setFilterUser(null)} />
          {data.users.map((u) => (
            <Chip
              key={u.id}
              label={u.name}
              color={u.color}
              active={filterUser === u.id}
              onPress={() => setFilterUser(filterUser === u.id ? null : u.id)}
            />
          ))}
          <View style={{ flex: 1 }} />
          <Chip
            label={viewMode === 'time' ? '⇄ 依人檢視' : '⇄ 依時間'}
            color={colors.accent}
            onPress={() => setViewMode(viewMode === 'time' ? 'person' : 'time')}
          />
        </View>

        {/* 標籤篩選 */}
        <View style={s.filterRow}>
          <Text style={s.filterLabel}>標籤:</Text>
          {[...allTags, '未完成'].map((t) => (
            <Chip
              key={t}
              label={t}
              color={t === '未完成' ? colors.textMuted : tagColor(t)}
              active={filterTag === t}
              onPress={() => setFilterTag(filterTag === t ? null : t)}
            />
          ))}
        </View>

        {/* 月曆格 */}
        <Card style={{ padding: spacing.sm }}>
          <View style={s.weekRow}>
            {weekdayZh.map((w) => (
              <Text key={w} style={s.weekday}>
                {w}
              </Text>
            ))}
          </View>
          <View style={s.grid}>
            {cells.map((key, i) => {
              if (!key) return <View key={`empty-${i}`} style={s.cell} />;
              const dayNum = Number(key.slice(8));
              const evs = eventsByDate[key] ?? [];
              const isPeriod = periodDays.has(key);
              const isPredicted =
                prediction && isWithin(key, prediction.windowStart, prediction.windowEnd);
              const isSelected = key === selected;
              const isToday = key === today;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    s.cell,
                    isPeriod && { backgroundColor: colors.periodDay },
                    !isPeriod && isPredicted && { backgroundColor: colors.predictedDay },
                    isSelected && s.cellSelected,
                  ]}
                  onPress={() => setSelected(key)}
                >
                  <Text style={[s.cellDay, isToday && s.todayText]}>{dayNum}</Text>
                  <View style={s.dots}>
                    {evs.slice(0, 3).map((e) => (
                      <Dot key={e.id} color={userOf(e.ownerId)?.color ?? colors.primary} />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.legend}>
            <View style={[s.legendSwatch, { backgroundColor: colors.periodDay }]} />
            <Text style={s.legendText}>經期</Text>
            <View style={[s.legendSwatch, { backgroundColor: colors.predictedDay }]} />
            <Text style={s.legendText}>預測經期</Text>
            {data.users.map((u) => (
              <React.Fragment key={u.id}>
                <Dot color={u.color} size={8} />
                <Text style={s.legendText}>{u.name}</Text>
              </React.Fragment>
            ))}
          </View>
        </Card>

        {viewMode === 'time' ? (
          /* 依時間:選取日的行程 */
          <>
            <SectionTitle>
              {selected === today ? '今天' : selected} 的行程({selectedEvents.length})
            </SectionTitle>
            {selectedEvents.length === 0 && (
              <Text style={s.empty}>這天沒有行程,點右下角 + 新增。</Text>
            )}
            {selectedEvents.map((e) => (
              <EventRow
                key={e.id}
                ev={e}
                color={userOf(e.ownerId)?.color}
                ownerName={userOf(e.ownerId)?.name}
                onPress={() => openEdit(e)}
                onToggleDone={() => toggleDone(e)}
              />
            ))}
          </>
        ) : (
          /* 依人:本月行程分兩欄(每人一區) */
          <>
            {data.users
              .filter((u) => (filterUser ? u.id === filterUser : true))
              .map((u) => {
                const evs = monthEvents.filter((e) => e.ownerId === u.id);
                return (
                  <View key={u.id} style={{ marginBottom: spacing.md }}>
                    <SectionTitle>
                      ● {u.name} 本月行程({evs.length})
                    </SectionTitle>
                    {evs.length === 0 && <Text style={s.empty}>本月沒有行程</Text>}
                    {evs.map((e) => (
                      <EventRow
                        key={e.id}
                        ev={e}
                        color={u.color}
                        showDate
                        onPress={() => openEdit(e)}
                        onToggleDone={() => toggleDone(e)}
                      />
                    ))}
                  </View>
                );
              })}
          </>
        )}
      </ScrollView>

      {/* 新增按鈕 */}
      <TouchableOpacity style={s.fab} onPress={openNew}>
        <Text style={s.fabText}>＋</Text>
      </TouchableOpacity>

      <EventModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editing}
        defaultDate={selected}
      />
    </View>
  );
};

const EventRow: React.FC<{
  ev: CalendarEvent;
  color?: string;
  ownerName?: string;
  showDate?: boolean;
  onPress: () => void;
  onToggleDone: () => void;
}> = ({ ev, color = colors.primary, ownerName, showDate, onPress, onToggleDone }) => {
  const done = !!ev.tags?.includes(TAG_DONE);
  const badges = (ev.tags ?? []).filter((t) => t !== TAG_DONE);
  return (
    <TouchableOpacity onPress={onPress}>
      <Card style={{ padding: spacing.md, marginBottom: spacing.sm }}>
        <View style={s.eventRow}>
          <View style={[s.eventBar, { backgroundColor: color }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[s.eventTitle, done && s.eventTitleDone]}>{ev.title}</Text>
              {badges.map((t) => (
                <View key={t} style={[s.tagBadge, { backgroundColor: tagColor(t) }]}>
                  <Text style={s.tagBadgeText}>{t}</Text>
                </View>
              ))}
            </View>
            <Text style={s.eventMeta}>
              {showDate ? `${ev.date}  ` : ''}
              {ev.startTime} – {ev.endTime}
              {ownerName ? `  ·  ${ownerName}` : ''}
              {ev.googleEventId ? '  ·  已同步 G 日曆' : ev.syncToGoogle ? '  ·  待同步' : ''}
            </Text>
            {!!ev.notes && <Text style={s.eventNotes}>{ev.notes}</Text>}
          </View>
          <TouchableOpacity
            style={[s.doneBtn, done && s.doneBtnActive]}
            onPress={onToggleDone}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[s.doneBtnText, done && { color: '#fff' }]}>✓</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const CELL = `${100 / 7}%` as const;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: 20, color: colors.primary, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weekRow: { flexDirection: 'row' },
  weekday: {
    width: CELL,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    paddingVertical: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL,
    height: 52,
    alignItems: 'center',
    paddingTop: 4,
    borderRadius: radius.sm,
  },
  cellSelected: { borderWidth: 2, borderColor: colors.primary },
  cellDay: { fontSize: 13, color: colors.text },
  todayText: { fontWeight: '900', color: colors.primary },
  dots: { flexDirection: 'row', marginTop: 2 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, marginRight: 4 },
  legendText: { fontSize: 11, color: colors.textMuted, marginRight: spacing.md, marginLeft: 2 },
  empty: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.md },
  eventRow: { flexDirection: 'row', alignItems: 'center' },
  eventBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: spacing.md },
  filterLabel: { fontSize: 13, color: colors.textMuted, marginRight: spacing.xs },
  eventTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  eventTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  tagBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  tagBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  doneBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  doneBtnActive: { backgroundColor: colors.success, borderColor: colors.success },
  doneBtnText: { fontSize: 14, color: colors.border, fontWeight: '700' },
  eventMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  eventNotes: { fontSize: 12, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
});

export default CalendarScreen;
