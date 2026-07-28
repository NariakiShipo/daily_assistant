import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarEvent, PRIORITY_LABELS, TAG_DONE, UserProfile } from '../types';
import { colors, priorityColors, radius, spacing } from '../theme';
import { formatDateZh } from '../utils/date';
import { EventInstance } from '../services/recurrence';
import { Dot } from './ui';

interface Props {
  visible: boolean;
  /** YYYY-MM-DD */
  dateKey: string;
  /** 該日行程(已依時間排序;重複行程為展開後的實例) */
  events: EventInstance[];
  users: UserProfile[];
  onClose: () => void;
  /** 點某筆行程 → 開啟編輯 */
  onPickEvent: (ev: EventInstance) => void;
  /** 新增該日行程 */
  onAddNew: () => void;
}

const ownersOf = (e: CalendarEvent): string[] =>
  e.ownerIds?.length ? e.ownerIds : [e.ownerId];

/**
 * 點日曆格子彈出的當日行程清單。
 *
 * 只顯示行程,不混入課表——課表本身已有專屬頁面與「今天」卡片,
 * 在這裡重複列出會讓當天真正要注意的事情被固定的課程淹沒。
 */
const DayPreview: React.FC<Props> = ({
  visible,
  dateKey,
  events,
  users,
  onClose,
  onPickEvent,
  onAddNew,
}) => {
  const colorOf = (id: string) => users.find((u) => u.id === id)?.color ?? colors.primary;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>
              {dateKey ? formatDateZh(dateKey) : ''} · {events.length} 筆行程
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }}>
            {events.length === 0 && <Text style={s.empty}>這天沒有行程</Text>}
            {events.map((e) => {
              const done = !!e.tags?.includes(TAG_DONE);
              return (
                <TouchableOpacity key={e.id} style={s.row} onPress={() => onPickEvent(e)}>
                  <View style={s.dots}>
                    {ownersOf(e).map((oid) => (
                      <Dot key={oid} color={colorOf(oid)} size={8} />
                    ))}
                  </View>
                  <Text style={s.time}>{e.allDay ? '整天' : `${e.startTime}–${e.endTime}`}</Text>
                  <Text style={[s.rowTitle, done && s.rowTitleDone]} numberOfLines={1}>
                    {e.recurrence ? '🔁 ' : ''}
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
  dots: { flexDirection: 'row', marginRight: spacing.sm },
  time: { fontSize: 12, color: colors.textMuted, marginRight: spacing.sm },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  rowTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.sm },
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
