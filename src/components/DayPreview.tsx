import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarEvent, PRIORITY_LABELS, TAG_DONE, UserProfile } from '../types';
import { colors, priorityColors, radius, spacing } from '../theme';
import { formatDateZh } from '../utils/date';
import { Dot } from './ui';

/** 當日課程(唯讀顯示) */
export interface PreviewCourse {
  id: string;
  title: string;
  location?: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  color?: string;
  ownerId: string;
}

interface Props {
  visible: boolean;
  /** YYYY-MM-DD */
  dateKey: string;
  /** 該日行程(已依時間排序) */
  events: CalendarEvent[];
  /** 該日課程(依課表推算,唯讀) */
  courses?: PreviewCourse[];
  users: UserProfile[];
  onClose: () => void;
  /** 點某筆行程 → 開啟編輯 */
  onPickEvent: (ev: CalendarEvent) => void;
  /** 新增該日行程 */
  onAddNew: () => void;
}

const ownersOf = (e: CalendarEvent): string[] =>
  e.ownerIds?.length ? e.ownerIds : [e.ownerId];

/** 行程與課程混排(依開始時間) */
type Row = { kind: 'event'; ev: CalendarEvent } | { kind: 'course'; course: PreviewCourse };

/** 點日曆格子彈出的當日行程清單 */
const DayPreview: React.FC<Props> = ({
  visible,
  dateKey,
  events,
  courses = [],
  users,
  onClose,
  onPickEvent,
  onAddNew,
}) => {
  const colorOf = (id: string) => users.find((u) => u.id === id)?.color ?? colors.primary;

  const rows: Row[] = [
    ...events.map((ev): Row => ({ kind: 'event', ev })),
    ...courses.map((course): Row => ({ kind: 'course', course })),
  ].sort((a, b) => {
    const ta = a.kind === 'event' ? a.ev.startTime : a.course.startTime;
    const tb = b.kind === 'event' ? b.ev.startTime : b.course.startTime;
    return ta.localeCompare(tb);
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>
              {dateKey ? formatDateZh(dateKey) : ''} · {events.length} 筆行程
              {courses.length ? ` · ${courses.length} 堂課` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }}>
            {rows.map((row) => {
              if (row.kind === 'course') {
                const c = row.course;
                return (
                  <View key={`course-${c.id}`} style={[s.row, s.courseRow]}>
                    <View style={[s.courseBar, { backgroundColor: c.color ?? colors.accent }]} />
                    <Text style={s.time}>
                      {c.startTime}–{c.endTime}
                    </Text>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {c.title}
                      {c.location ? `(${c.location})` : ''}
                    </Text>
                    <View style={[s.badge, { backgroundColor: c.color ?? colors.accent }]}>
                      <Text style={s.badgeText}>課</Text>
                    </View>
                  </View>
                );
              }
              const e = row.ev;
              const done = !!e.tags?.includes(TAG_DONE);
              return (
                <TouchableOpacity key={e.id} style={s.row} onPress={() => onPickEvent(e)}>
                  <View style={s.dots}>
                    {ownersOf(e).map((oid) => (
                      <Dot key={oid} color={colorOf(oid)} size={8} />
                    ))}
                  </View>
                  <Text style={s.time}>
                    {e.startTime}–{e.endTime}
                  </Text>
                  <Text style={[s.rowTitle, done && s.rowTitleDone]} numberOfLines={1}>
                    {e.title}
                  </Text>
                  {e.priority && (
                    <View style={[s.badge, { backgroundColor: priorityColors[e.priority] }]}>
                      <Text style={s.badgeText}>{PRIORITY_LABELS[e.priority]}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={s.addBtn} onPress={onAddNew}>
            <Text style={s.addBtnText}>＋ 新增這天的行程</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    width: '100%',
    maxWidth: 360,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  close: { fontSize: 16, color: colors.textMuted, padding: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.xs,
  },
  courseRow: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  courseBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: spacing.sm },
  dots: { flexDirection: 'row', marginRight: spacing.sm },
  time: { fontSize: 12, color: colors.textMuted, marginRight: spacing.sm },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  rowTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: spacing.xs,
  },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  addBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    marginTop: spacing.xs,
  },
  addBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});

export default DayPreview;
