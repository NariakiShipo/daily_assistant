import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import {
  CalendarEvent,
  EVENT_TAGS,
  PRIORITY_LABELS,
  RECURRENCE_LABELS,
  TAG_DONE,
  remindLabel,
} from '../types';
import { colors, priorityColors, radius, spacing, tagColor } from '../theme';
import {
  formatDateZh,
  formatMonthZh,
  fromDateKey,
  monthGrid,
  todayKey,
  weekdayZh,
  addDays,
} from '../utils/date';
import { Card, Chip, Dot, SectionTitle } from '../components/ui';
import EventModal from '../components/EventModal';
import DayPreview from '../components/DayPreview';
import {
  EventInstance,
  expandEvents,
  findSeries,
  toggleOccurrenceDone,
} from '../services/recurrence';
import { TAG_UNDONE, filterEvents, ownersOf } from '../services/eventFilter';

type ViewMode = 'time' | 'person' | 'agenda';

/** 未來 N 天檢視涵蓋的天數 */
const AGENDA_DAYS = 7;

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'time', label: '依時間' },
  { key: 'person', label: '依人' },
  { key: 'agenda', label: `未來 ${AGENDA_DAYS} 天` },
];

const CalendarScreen: React.FC = () => {
  const { data, updateEvent } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [selected, setSelected] = useState(todayKey());
  const [filterUser, setFilterUser] = useState<string | null>(null); // null = 全部
  const [filterTag, setFilterTag] = useState<string | null>(null); // 標籤名或「未完成」
  const [viewMode, setViewMode] = useState<ViewMode>('time');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventInstance | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  /** 可篩選標籤 = 預設 + 自訂 + 行程已使用的 */
  const allTags = useMemo(() => {
    const set = new Set<string>([...EVENT_TAGS, ...(data.settings.customTags ?? [])]);
    for (const e of data.events) for (const t of e.tags ?? []) set.add(t);
    return [...set];
  }, [data.events, data.settings.customTags]);
  const today = todayKey();

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = `${monthPrefix}-${new Date(year, month + 1, 0).getDate()}`;
  /** 本月要顯示的行程:重複行程已展開成一次次實例(expandEvents 內含排序) */
  const monthEvents = useMemo(
    () =>
      filterEvents(expandEvents(data.events, monthStart, monthEnd), {
        query,
        ownerId: filterUser,
        tag: filterTag,
      }),
    [data.events, monthStart, monthEnd, filterUser, filterTag, query]
  );

  /** 未來 N 天的行程,依日期分組(與月份無關,永遠從今天算起) */
  const agenda = useMemo(() => {
    if (viewMode !== 'agenda') return [];
    const start = today;
    const end = addDays(today, AGENDA_DAYS - 1);
    const list = filterEvents(expandEvents(data.events, start, end), {
      query,
      ownerId: filterUser,
      tag: filterTag,
    });
    const days: { date: string; events: EventInstance[] }[] = [];
    for (let i = 0; i < AGENDA_DAYS; i++) {
      const key = addDays(start, i);
      // 跨日行程在它涵蓋的每一天都要出現
      const evs = list
        .filter((e) => e.date <= key && (e.endDate ?? e.date) >= key)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      days.push({ date: key, events: evs });
    }
    return days;
  }, [viewMode, data.events, today, filterUser, filterTag, query]);

  /** 跨日行程展開到範圍內每一天(上限 62 天防呆),每天依開始時間排序 */
  const eventsByDate = useMemo(() => {
    const map: Record<string, EventInstance[]> = {};
    for (const e of monthEvents) {
      const last = e.endDate ?? e.date;
      let d = e.date;
      let guard = 0;
      while (d <= last && guard < 62) {
        (map[d] ??= []).push(e);
        d = addDays(d, 1);
        guard++;
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [monthEvents]);

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

  /**
   * 切換完成狀態。重複行程要逐次獨立(記在原始行程的 doneDates),
   * 否則勾一次就等於整個系列都完成了。
   */
  const toggleDone = (ev: EventInstance) => {
    const series = findSeries(data.events, ev);
    if (!series) return;
    if (series.recurrence) {
      void updateEvent(toggleOccurrenceDone(series, ev.date));
      return;
    }
    const cur = series.tags ?? [];
    const tags = cur.includes(TAG_DONE)
      ? cur.filter((t) => t !== TAG_DONE)
      : [...cur, TAG_DONE];
    void updateEvent({ ...series, tags: tags.length ? tags : undefined });
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (ev: EventInstance) => {
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

        {/* 搜尋 */}
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="🔍 搜尋標題、備註、標籤"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          {!!query && (
            <TouchableOpacity style={s.clearBtn} onPress={() => setQuery('')}>
              <Text style={s.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 篩選:全部 / 個人 */}
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
        </View>

        {/* 檢視模式 */}
        <View style={s.filterRow}>
          <Text style={s.filterLabel}>檢視:</Text>
          {VIEW_MODES.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              color={colors.accent}
              active={viewMode === m.key}
              onPress={() => setViewMode(m.key)}
            />
          ))}
        </View>

        {/* 標籤篩選 */}
        <View style={s.filterRow}>
          <Text style={s.filterLabel}>標籤:</Text>
          {[...allTags, TAG_UNDONE].map((t) => (
            <Chip
              key={t}
              label={t}
              color={t === TAG_UNDONE ? colors.textMuted : tagColor(t)}
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
              const isSelected = key === selected;
              const isToday = key === today;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.cell, isSelected && s.cellSelected]}
                  onPress={() => {
                    setSelected(key);
                    if (evs.length) setPreviewKey(key);
                  }}
                >
                  <Text style={[s.cellDay, isToday && s.todayText]}>{dayNum}</Text>
                  {evs.slice(0, 3).map((e) => {
                    const done = !!e.tags?.includes(TAG_DONE);
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[
                          s.cellChip,
                          { backgroundColor: userOf(ownersOf(e)[0])?.color ?? colors.primary },
                          done && { opacity: 0.55 },
                        ]}
                        onPress={() => openEdit(e)}
                      >
                        <Text
                          style={[s.cellChipText, done && s.cellChipTextDone]}
                          numberOfLines={1}
                        >
                          {e.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {evs.length > 3 && <Text style={s.cellMore}>+{evs.length - 3}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          {/* 圖例只留成員色;經期與預測經期改為只在「經期」頁顯示 */}
          <View style={s.legend}>
            {data.users.map((u) => (
              <React.Fragment key={u.id}>
                <Dot color={u.color} size={8} />
                <Text style={s.legendText}>{u.name}</Text>
              </React.Fragment>
            ))}
          </View>
        </Card>

        {viewMode === 'agenda' ? (
          /* 未來 N 天:每天一區,含空白日 */
          <>
            {agenda.map((d) => (
              <View key={d.date} style={{ marginBottom: spacing.sm }}>
                <SectionTitle>
                  {d.date === today ? '今天' : formatDateZh(d.date)}(週
                  {weekdayZh[fromDateKey(d.date).getDay()]}) · {d.events.length} 筆
                </SectionTitle>
                {d.events.length === 0 ? (
                  <Text style={s.empty}>沒有行程</Text>
                ) : (
                  d.events.map((e) => (
                    <EventRow
                      key={e.id}
                      ev={e}
                      color={userOf(ownersOf(e)[0])?.color}
                      ownerName={ownersOf(e)
                        .map((id) => userOf(id)?.name ?? '?')
                        .join('、')}
                      onPress={() => openEdit(e)}
                      onToggleDone={() => toggleDone(e)}
                    />
                  ))
                )}
              </View>
            ))}
          </>
        ) : viewMode === 'time' ? (
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
                color={userOf(ownersOf(e)[0])?.color}
                ownerName={ownersOf(e)
                  .map((id) => userOf(id)?.name ?? '?')
                  .join('、')}
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
                const evs = monthEvents.filter((e) => ownersOf(e).includes(u.id));
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

      <DayPreview
        visible={!!previewKey}
        dateKey={previewKey ?? ''}
        events={previewKey ? (eventsByDate[previewKey] ?? []) : []}
        users={data.users}
        onClose={() => setPreviewKey(null)}
        onPickEvent={(ev) => {
          setPreviewKey(null);
          // 等前一個 Modal 關閉再開編輯,避免 iOS 上兩個 Modal 疊加
          setTimeout(() => openEdit(ev), 150);
        }}
        onAddNew={() => {
          setPreviewKey(null);
          setTimeout(openNew, 150);
        }}
      />

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
  ev: EventInstance;
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
              {ev.priority && (
                <View style={[s.tagBadge, { backgroundColor: priorityColors[ev.priority] }]}>
                  <Text style={s.tagBadgeText}>{PRIORITY_LABELS[ev.priority]}優先</Text>
                </View>
              )}
              {badges.map((t) => (
                <View key={t} style={[s.tagBadge, { backgroundColor: tagColor(t) }]}>
                  <Text style={s.tagBadgeText}>{t}</Text>
                </View>
              ))}
            </View>
            <Text style={s.eventMeta}>
              {(showDate || ev.endDate)
                ? `${formatDateZh(ev.date)}${ev.endDate ? ` → ${formatDateZh(ev.endDate)}` : ''}  `
                : ''}
              {ev.allDay ? '整天' : `${ev.startTime} – ${ev.endTime}`}
              {ownerName ? `  ·  ${ownerName}` : ''}
              {ev.recurrence ? `  ·  🔁 ${RECURRENCE_LABELS[ev.recurrence.freq]}` : ''}
              {ev.remindMinutesBefore !== undefined
                ? `  ·  ⏰ ${remindLabel(ev.remindMinutesBefore)}`
                : ''}
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
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
  },
  clearBtn: {
    marginLeft: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
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
    minHeight: 86,
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 3,
    borderRadius: radius.sm,
  },
  cellSelected: { borderWidth: 2, borderColor: colors.primary },
  cellDay: { fontSize: 13, color: colors.text, textAlign: 'center' },
  todayText: { fontWeight: '900', color: colors.primary },
  cellChip: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: 2,
  },
  cellChipText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  cellChipTextDone: { textDecorationLine: 'line-through' },
  cellMore: { fontSize: 10, color: colors.textMuted, textAlign: 'center', marginTop: 1 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
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
