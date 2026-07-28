import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CalendarEvent, SemesterMeta } from '../types';
import { colors, radius, spacing } from '../theme';
import { WEEKDAYS } from '../constants/timetable';
import { formatDateZh, uid } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button } from './ui';
import {
  EventConflict,
  freeGapsText,
  slotTimeText,
  trimEventTimes,
} from '../services/conflicts';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 尚待處理的衝突(由呼叫端持有,處理完以 onDismiss 移除) */
  conflicts: EventConflict[];
  semester: SemesterMeta | null;
  ownerId: string;
  /** 使用者選「調整時間」:呼叫端關閉本視窗、開啟行程編輯 */
  onEdit: (ev: CalendarEvent) => void;
  /** 這些行程已處理(截短/刪除/略過),從清單移除 */
  onDismiss: (eventIds: string[]) => void;
}

/** 同名同時段的行程視為同一組(打工等每週固定行程一次處理) */
interface Group {
  key: string;
  title: string;
  startTime: string;
  endTime: string;
  items: EventConflict[];
  multiDay: boolean;
}

const ConflictResolveModal: React.FC<Props> = ({
  visible,
  onClose,
  conflicts,
  semester,
  ownerId,
  onEdit,
  onDismiss,
}) => {
  const { data, addEvent, updateEvent, deleteEvent } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo((): Group[] => {
    const map = new Map<string, Group>();
    for (const c of conflicts) {
      const key = `${c.event.title}|${c.event.startTime}|${c.event.endTime}`;
      const g = map.get(key) ?? {
        key,
        title: c.event.title,
        startTime: c.event.startTime,
        endTime: c.event.endTime,
        items: [],
        multiDay: false,
      };
      g.items.push(c);
      g.multiDay = g.multiDay || !!(c.event.endDate && c.event.endDate !== c.event.date);
      map.set(key, g);
    }
    return [...map.values()];
  }, [conflicts]);

  /** 空堂提示用:此成員此學期的全部課程(含保留的手動課) */
  const bucketCourses = useMemo(
    () =>
      data.courses.filter(
        (c) => c.ownerId === ownerId && (semester ? c.semesterId === semester.id : true)
      ),
    [data.courses, ownerId, semester]
  );

  /** 一組衝突撞到的課(去重)與涉及的星期 */
  const groupInfo = (g: Group) => {
    const courseText = new Set<string>();
    const weekdays = new Set<number>();
    for (const item of g.items) {
      for (const hit of item.hits) {
        for (const s of hit.slots) {
          courseText.add(`「${s.course.title}」${slotTimeText(s)}`);
          weekdays.add(s.weekday);
        }
      }
    }
    return { courseText: [...courseText], weekdays: [...weekdays].sort() };
  };

  /** 截短:扣掉上課時間,剩餘片段回寫(課在中間會切成多段) */
  const trimGroup = (g: Group) => {
    const doneIds: string[] = [];
    let split = 0;
    let failed = 0;
    for (const item of g.items) {
      const segs = trimEventTimes(item.event, item.hits);
      if (!segs || segs.length === 0) {
        failed++;
        continue;
      }
      const [first, ...rest] = segs;
      void updateEvent({ ...item.event, startTime: first.start, endTime: first.end });
      for (const r of rest) {
        void addEvent({
          ...item.event,
          id: uid(),
          googleEventId: undefined,
          startTime: r.start,
          endTime: r.end,
        });
        split++;
      }
      doneIds.push(item.event.id);
    }
    if (doneIds.length) onDismiss(doneIds);
    let msg = `已截短 ${doneIds.length} 筆「${g.title}」`;
    if (split) msg += `,課程在中間的部分切成了多段`;
    if (failed) msg += `;另有 ${failed} 筆整段都在上課時間內,請改用調整或刪除`;
    notify('截短完成', msg + '。');
  };

  const deleteGroup = (g: Group) => {
    confirmDialog(
      '刪除行程',
      `確定刪除 ${g.items.length} 筆「${g.title}」?`,
      () => {
        for (const item of g.items) void deleteEvent(item.event.id);
        onDismiss(g.items.map((i) => i.event.id));
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  const deleteOne = (c: EventConflict) => {
    confirmDialog(
      '刪除行程',
      `確定刪除 ${formatDateZh(c.event.date)}「${c.event.title}」?`,
      () => {
        void deleteEvent(c.event.id);
        onDismiss([c.event.id]);
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>
              行程與課表衝突{conflicts.length ? `(剩 ${conflicts.length} 筆)` : ''}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {groups.length === 0 ? (
            <View style={s.doneBox}>
              <Text style={s.doneText}>✓ 衝突都處理好了</Text>
              <Button label="完成" onPress={onClose} />
            </View>
          ) : (
            <ScrollView>
              <Text style={s.hint}>
                {semester ? `${semester.id} 學期(${semester.startDate} ~ ${semester.endDate})` : ''}
                內,以下行程與上課時間重疊。可截短讓出上課時間、調整時間、刪除,或略過保持原樣。
              </Text>
              {groups.map((g) => {
                const info = groupInfo(g);
                const isOpen = expanded === g.key;
                return (
                  <View key={g.key} style={s.groupCard}>
                    <TouchableOpacity
                      onPress={() => setExpanded(isOpen ? null : g.key)}
                      disabled={g.items.length === 1}
                    >
                      <Text style={s.groupTitle}>
                        {g.title} {g.startTime}–{g.endTime}
                        {g.items.length > 1 ? ` × ${g.items.length} 筆 ${isOpen ? '▾' : '▸'}` : ''}
                      </Text>
                      <Text style={s.groupMeta}>
                        {g.items
                          .slice(0, 3)
                          .map((i) => formatDateZh(i.event.date))
                          .join('、')}
                        {g.items.length > 3 ? ` ⋯共 ${g.items.length} 天` : ''}
                      </Text>
                    </TouchableOpacity>
                    {info.courseText.map((t) => (
                      <Text key={t} style={s.clashText}>
                        ✕ 撞到 {t}
                      </Text>
                    ))}
                    {info.weekdays.map((w) => {
                      const gaps = freeGapsText(bucketCourses, w);
                      return gaps ? (
                        <Text key={w} style={s.gapText}>
                          💡 週{WEEKDAYS[w - 1]}空堂:{gaps}
                        </Text>
                      ) : null;
                    })}
                    {g.multiDay && (
                      <Text style={s.gapText}>ℹ 跨日行程不支援截短,請調整或刪除。</Text>
                    )}

                    {isOpen && (
                      <View style={s.itemList}>
                        {g.items.map((item) => (
                          <View key={item.event.id} style={s.itemRow}>
                            <Text style={s.itemDate}>
                              {formatDateZh(item.event.date)}
                              {item.event.endDate ? ` → ${formatDateZh(item.event.endDate)}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => onEdit(item.event)}>
                              <Text style={s.itemAction}>編輯</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteOne(item)}>
                              <Text style={[s.itemAction, { color: colors.danger }]}>刪除</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={s.actions}>
                      {!g.multiDay && (
                        <TouchableOpacity style={s.actionBtn} onPress={() => trimGroup(g)}>
                          <Text style={s.actionText}>✂ 截短避開課程</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={s.actionBtn}
                        onPress={() =>
                          g.items.length === 1 ? onEdit(g.items[0].event) : setExpanded(g.key)
                        }
                      >
                        <Text style={s.actionText}>🕐 調整時間</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.actionBtn} onPress={() => deleteGroup(g)}>
                        <Text style={[s.actionText, { color: colors.danger }]}>🗑 刪除</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.actionBtn}
                        onPress={() => onDismiss(g.items.map((i) => i.event.id))}
                      >
                        <Text style={[s.actionText, { color: colors.textMuted }]}>略過</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              <Text style={s.note}>「略過」會保留行程原樣(接受與課程重疊)。</Text>
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },
  doneBox: { alignItems: 'center', paddingVertical: spacing.xl },
  doneText: { fontSize: 16, fontWeight: '700', color: colors.success, marginBottom: spacing.md },
  groupCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  groupTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  groupMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  clashText: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  gapText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  itemList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  itemDate: { flex: 1, fontSize: 13, color: colors.text },
  itemAction: { fontSize: 13, fontWeight: '700', color: colors.primary, marginLeft: spacing.lg },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  actionBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginRight: spacing.xs,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  note: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
});

export default ConflictResolveModal;
