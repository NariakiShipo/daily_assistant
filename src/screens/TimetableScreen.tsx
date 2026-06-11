import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { CourseEntry } from '../types';
import { colors, radius, spacing } from '../theme';
import { PERIOD_SLOTS, WEEKDAYS } from '../constants/timetable';
import { Card, Chip } from '../components/ui';
import CourseModal from '../components/CourseModal';

const ROW_H = 48;
const LABEL_W = 56;

const TimetableScreen: React.FC = () => {
  const { data } = useApp();
  const [owner, setOwner] = useState(data.users[0]?.id ?? 'u1');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CourseEntry | null>(null);
  const [draft, setDraft] = useState({ weekday: 1, startPeriod: 0 });

  /** 同名課程顏色統一:每個課名取第一個有設定的顏色 */
  const colorByTitle = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of data.courses) {
      if (c.ownerId !== owner || !c.color) continue;
      if (!m[c.title]) m[c.title] = c.color;
    }
    return m;
  }, [data.courses, owner]);

  /** cellMap[weekday][periodIndex] = 該格的課(只看目前選取成員) */
  const cellMap = useMemo(() => {
    const map: (CourseEntry | null)[][] = Array.from({ length: 6 }, () =>
      Array(PERIOD_SLOTS.length).fill(null)
    );
    for (const c of data.courses) {
      if (c.ownerId !== owner) continue;
      for (let i = c.startPeriod; i <= c.endPeriod && i < PERIOD_SLOTS.length; i++) {
        if (c.weekday >= 1 && c.weekday <= 5) map[c.weekday][i] = c;
      }
    }
    return map;
  }, [data.courses, owner]);

  const openNew = (weekday: number, startPeriod: number) => {
    setEditing(null);
    setDraft({ weekday, startPeriod });
    setModalOpen(true);
  };

  const openEdit = (c: CourseEntry) => {
    setEditing(c);
    setModalOpen(true);
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
      </View>
      <Text style={s.hint}>點空白格新增課程;點課程色塊可編輯或刪除。</Text>

      <Card style={{ padding: spacing.sm }}>
        {/* 表頭:星期一~五 */}
        <View style={s.row}>
          <View style={[s.labelCell, { height: 28 }]} />
          {WEEKDAYS.map((w) => (
            <View key={w} style={[s.cell, { height: 28, justifyContent: 'center' }]}>
              <Text style={s.headText}>{w}</Text>
            </View>
          ))}
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
        defaultWeekday={draft.weekday}
        defaultPeriod={draft.startPeriod}
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
  ownerLabel: { fontSize: 13, color: colors.textMuted, marginRight: spacing.xs },
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
