import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { CalendarEvent, CourseEntry, SemesterMeta, semesterOrder } from '../types';
import { colors, radius, spacing } from '../theme';
import { PERIOD_SLOTS, UNSCHEDULED_WEEKDAY, WEEKDAYS } from '../constants/timetable';
import { todayKey } from '../utils/date';
import { notify } from '../utils/dialog';
import { Card, Chip } from '../components/ui';
import CourseModal from '../components/CourseModal';
import ImportCourseModal, { ImportResult } from '../components/ImportCourseModal';
import ConflictResolveModal from '../components/ConflictResolveModal';
import EventModal from '../components/EventModal';
import { EventConflict, findConflicts } from '../services/conflicts';

const ROW_H = 48;
const LABEL_W = 56;
/** 「未分類」課表(無學期標記的舊資料/手動課)的選擇鍵 */
const UNSORTED = '__unsorted__';

const TimetableScreen: React.FC = () => {
  const { data } = useApp();
  const [owner, setOwner] = useState(data.users[0]?.id ?? 'u1');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CourseEntry | null>(null);
  const [draft, setDraft] = useState({ weekday: 1, startPeriod: 0 });

  // 匯入與衝突處理
  const [importOpen, setImportOpen] = useState(false);
  const [conflicts, setConflicts] = useState<EventConflict[]>([]);
  const [conflictSemester, setConflictSemester] = useState<SemesterMeta | null>(null);
  const [conflictOwner, setConflictOwner] = useState(owner);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);

  const sortedSemesters = useMemo(
    () => [...data.semesters].sort((a, b) => semesterOrder(b.id) - semesterOrder(a.id)),
    [data.semesters]
  );
  const hasUnsorted = useMemo(() => data.courses.some((c) => !c.semesterId), [data.courses]);

  /** 預設學期:今天在起訖內的優先,否則最新的;都沒有 → 未分類 */
  const defaultSem = useMemo(() => {
    const today = todayKey();
    const current = sortedSemesters.find((s) => today >= s.startDate && today <= s.endDate);
    return current?.id ?? sortedSemesters[0]?.id ?? (hasUnsorted ? UNSORTED : null);
  }, [sortedSemesters, hasUnsorted]);

  const [semSel, setSemSel] = useState<string | null>(null); // null = 跟隨預設
  const semKey = semSel ?? defaultSem;
  const semMeta = sortedSemesters.find((sm) => sm.id === semKey) ?? null;

  /** 課程是否屬於目前選取的學期分頁 */
  const inBucket = (c: CourseEntry): boolean =>
    semKey && semKey !== UNSORTED ? c.semesterId === semKey : !c.semesterId;

  /** 同名課程顏色統一(跨學期同名也同色):每個課名取第一個有設定的顏色 */
  const colorByTitle = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of data.courses) {
      if (c.ownerId !== owner || !c.color) continue;
      if (!m[c.title]) m[c.title] = c.color;
    }
    return m;
  }, [data.courses, owner]);

  /** cellMap[weekday][periodIndex] = 該格的課(目前成員 + 目前學期) */
  const cellMap = useMemo(() => {
    const map: (CourseEntry | null)[][] = Array.from({ length: 6 }, () =>
      Array(PERIOD_SLOTS.length).fill(null)
    );
    for (const c of data.courses) {
      if (c.ownerId !== owner || !inBucket(c)) continue;
      for (let i = c.startPeriod; i <= c.endPeriod && i < PERIOD_SLOTS.length; i++) {
        if (c.weekday >= 1 && c.weekday <= 5) map[c.weekday][i] = c;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.courses, owner, semKey]);

  /** 無固定時段的課(實務專題等),顯示在最右側「無時段」欄 */
  const unscheduled = useMemo(
    () =>
      data.courses.filter(
        (c) => c.ownerId === owner && inBucket(c) && c.weekday === UNSCHEDULED_WEEKDAY
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.courses, owner, semKey]
  );

  /** 統計:目前分頁的課數與學分(同名多時段算一門) */
  const stats = useMemo(() => {
    const seen = new Map<string, number | undefined>();
    for (const c of data.courses) {
      if (c.ownerId !== owner || !inBucket(c)) continue;
      const prev = seen.get(c.title);
      if (prev === undefined) seen.set(c.title, c.credit);
    }
    const credits = [...seen.values()].reduce((sum: number, v) => sum + (v ?? 0), 0);
    return { count: seen.size, credits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.courses, owner, semKey]);

  const openNew = (weekday: number, startPeriod: number) => {
    setEditing(null);
    setDraft({ weekday, startPeriod });
    setModalOpen(true);
  };

  const openEdit = (c: CourseEntry) => {
    setEditing(c);
    setModalOpen(true);
  };

  /** 匯入完成:切到該學期、掃描個人行程衝突 */
  const handleImported = (r: ImportResult) => {
    setSemSel(r.semester.id);
    const courseCount = new Set(r.entries.map((e) => e.ntutCourseId ?? e.title)).size;
    const found = findConflicts(data.events, r.entries, r.semester, r.ownerId);
    if (!found.length) {
      notify('匯入完成', `已匯入 ${courseCount} 門課(${r.entries.length} 個時段),沒有行程衝突。`);
      return;
    }
    setConflicts(found);
    setConflictSemester(r.semester);
    setConflictOwner(r.ownerId);
    // 等匯入視窗關閉動畫結束再開,避免 iOS 上 Modal 疊加
    setTimeout(() => setConflictOpen(true), 250);
  };

  /** 衝突清單選「調整時間」:關衝突視窗、開行程編輯 */
  const editConflictEvent = (ev: CalendarEvent) => {
    setConflictOpen(false);
    setConflicts((prev) => prev.filter((c) => c.event.id !== ev.id));
    setEditingEvent(ev);
    setTimeout(() => setEventModalOpen(true), 250);
  };

  const closeEventModal = () => {
    setEventModalOpen(false);
    setEditingEvent(null);
    // 還有未處理的衝突 → 回到衝突清單
    if (conflicts.length) setTimeout(() => setConflictOpen(true), 250);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
    >
      {/* 成員切換:每人一份課表 */}
      <View style={s.ownerRow}>
        <Text style={s.ownerLabel}>誰的課表:</Text>
        {data.users.map((u) => (
          <Chip
            key={u.id}
            label={u.name}
            color={u.color}
            active={owner === u.id}
            onPress={() => setOwner(u.id)}
          />
        ))}
        <View style={{ flex: 1 }} />
        <Chip label="⬇ 匯入課表" color={colors.accent} onPress={() => setImportOpen(true)} />
      </View>

      {/* 學期分頁 */}
      {(sortedSemesters.length > 0 || hasUnsorted) && (
        <View style={s.semRow}>
          <Text style={s.ownerLabel}>學期:</Text>
          {sortedSemesters.map((sm) => (
            <Chip
              key={sm.id}
              label={sm.id}
              active={semKey === sm.id}
              onPress={() => setSemSel(sm.id)}
            />
          ))}
          {hasUnsorted && (
            <Chip
              label="未分類"
              color={colors.textMuted}
              active={semKey === UNSORTED}
              onPress={() => setSemSel(UNSORTED)}
            />
          )}
        </View>
      )}

      {/* 本學期統計 */}
      {(stats.count > 0 || semMeta) && (
        <Text style={s.statsText}>
          {stats.count} 門課
          {stats.credits > 0 ? ` · ${stats.credits} 學分` : ''}
          {semMeta?.className ? ` · ${semMeta.className}` : ''}
          {semMeta
            ? ` · ${semMeta.startDate.replaceAll('-', '/')} ~ ${semMeta.endDate.replaceAll('-', '/')}`
            : ''}
        </Text>
      )}
      <Text style={s.hint}>點空白格新增課程;點課程色塊可編輯或刪除。</Text>

      <Card style={{ padding: spacing.sm }}>
        {/* 表頭:星期一~五 + 無時段欄 */}
        <View style={s.row}>
          <View style={[s.labelCell, { height: 28 }]} />
          {WEEKDAYS.map((w) => (
            <View key={w} style={[s.cell, { height: 28, justifyContent: 'center' }]}>
              <Text style={s.headText}>{w}</Text>
            </View>
          ))}
          <View style={[s.cell, { height: 28, justifyContent: 'center' }]}>
            <Text style={[s.headText, { fontSize: 11 }]}>無時段</Text>
          </View>
        </View>

        {PERIOD_SLOTS.map((slot, i) => {
          const prev = PERIOD_SLOTS[i - 1];
          const newSession = !prev || prev.session !== slot.session;
          return (
            <React.Fragment key={slot.label}>
              {newSession && (
                <View style={s.sessionRow}>
                  <Text style={s.sessionText}>{slot.session}</Text>
                </View>
              )}
              <View style={s.row}>
                {/* 左欄:節次標籤 + 時間 */}
                <View style={s.labelCell}>
                  <Text style={s.periodLabel}>{slot.label}</Text>
                  <Text style={s.periodTime}>{slot.start}</Text>
                  <Text style={s.periodTime}>{slot.end}</Text>
                </View>
                {/* 一~五 */}
                {WEEKDAYS.map((_, wi) => {
                  const weekday = wi + 1;
                  const course = cellMap[weekday][i];
                  if (!course) {
                    return (
                      <TouchableOpacity
                        key={weekday}
                        style={[s.cell, s.emptyCell]}
                        onPress={() => openNew(weekday, i)}
                      />
                    );
                  }
                  const isFirst = i === course.startPeriod;
                  const isLast = i === course.endPeriod;
                  const span = course.endPeriod - course.startPeriod + 1;
                  return (
                    <TouchableOpacity
                      key={weekday}
                      style={[
                        s.cell,
                        {
                          backgroundColor:
                            colorByTitle[course.title] ?? course.color ?? colors.primary,
                        },
                        isFirst && s.blockTop,
                        isLast && s.blockBottom,
                      ]}
                      onPress={() => openEdit(course)}
                    >
                      {isFirst && (
                        <View style={s.blockTextWrap}>
                          <Text
                            style={s.courseTitle}
                            numberOfLines={
                              course.location ? Math.max(1, span * 2 - 1) : span * 2
                            }
                          >
                            {course.title}
                          </Text>
                          {!!course.location && (
                            <Text style={s.courseLoc} numberOfLines={1}>
                              {course.location}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {/* 無時段欄:每列依序放一門無固定時段的課 */}
                {(() => {
                  const nc = unscheduled[i];
                  if (!nc) {
                    return (
                      <TouchableOpacity
                        style={[s.cell, s.emptyCell]}
                        onPress={() => openNew(UNSCHEDULED_WEEKDAY, 0)}
                      />
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={[
                        s.cell,
                        s.blockTop,
                        s.blockBottom,
                        { backgroundColor: colorByTitle[nc.title] ?? nc.color ?? colors.primary },
                      ]}
                      onPress={() => openEdit(nc)}
                    >
                      <View style={s.blockTextWrap}>
                        <Text style={s.courseTitle} numberOfLines={2}>
                          {nc.title}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </React.Fragment>
          );
        })}
      </Card>

      <CourseModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        course={editing}
        ownerId={owner}
        semesterId={semKey && semKey !== UNSORTED ? semKey : null}
        defaultWeekday={draft.weekday}
        defaultPeriod={draft.startPeriod}
      />

      <ImportCourseModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        ownerId={owner}
        onImported={handleImported}
      />

      <ConflictResolveModal
        visible={conflictOpen}
        onClose={() => setConflictOpen(false)}
        conflicts={conflicts}
        semester={conflictSemester}
        ownerId={conflictOwner}
        onEdit={editConflictEvent}
        onDismiss={(ids) =>
          setConflicts((prev) => prev.filter((c) => !ids.includes(c.event.id)))
        }
      />

      <EventModal
        visible={eventModalOpen}
        onClose={closeEventModal}
        event={editingEvent}
        defaultDate={editingEvent?.date ?? todayKey()}
      />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  ownerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  semRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  ownerLabel: { fontSize: 13, color: colors.textMuted, marginRight: spacing.xs },
  statsText: { fontSize: 12, color: colors.accent, fontWeight: '600', marginBottom: 2 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  row: { flexDirection: 'row' },
  labelCell: {
    width: LABEL_W,
    height: ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  periodTime: { fontSize: 9, color: colors.textMuted, lineHeight: 11 },
  cell: {
    flex: 1,
    height: ROW_H,
    marginHorizontal: 1,
    overflow: 'hidden',
  },
  emptyCell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginVertical: 1,
    backgroundColor: colors.background,
  },
  blockTop: {
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    marginTop: 1,
  },
  blockBottom: {
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    marginBottom: 1,
  },
  blockTextWrap: { padding: 4 },
  courseTitle: { fontSize: 11, fontWeight: '700', color: '#fff', lineHeight: 14 },
  courseLoc: { fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  headText: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.text },
  sessionRow: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginVertical: 3,
  },
  sessionText: { fontSize: 11, fontWeight: '700', color: colors.primary },
});

export default TimetableScreen;
