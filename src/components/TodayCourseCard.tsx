/**
 * 課表頁最上方的「今天」卡片。
 *
 * 課表網格回答的是「這學期怎麼排」,但每天真正要問的是
 * 「現在該去哪間教室、還有多久」——這張卡片補上那個視角。
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CourseEntry, SemesterMeta } from '../types';
import { colors, radius, spacing } from '../theme';
import { formatDateZh, todayKey, weekdayZh, fromDateKey } from '../utils/date';
import {
  countdownText,
  coursesOnDate,
  currentCourseAt,
  minutesOfDay,
  slotDuration,
  slotRangeText,
} from '../services/timetableToday';
import { Card, SectionTitle } from './ui';

interface Props {
  courses: CourseEntry[];
  semesters: SemesterMeta[];
  ownerId: string;
  /** 這是誰的課表(顯示用) */
  ownerName: string;
}

/** 每分鐘重算一次,讓「還有 N 分鐘」不會停在開啟當下 */
const TICK_MS = 60_000;

const TodayCourseCard: React.FC<Props> = ({ courses, semesters, ownerId, ownerName }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const today = todayKey();
  const list = coursesOnDate(courses, semesters, today, ownerId);
  const current = currentCourseAt(list, minutesOfDay(now));
  const weekday = weekdayZh[fromDateKey(today).getDay()];

  const heading = `今天 ${formatDateZh(today)}(週${weekday})`;

  if (list.length === 0) {
    return (
      <Card>
        <SectionTitle>{heading}</SectionTitle>
        <Text style={s.empty}>{ownerName}今天沒有課 🎉</Text>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>
        {heading} · {list.length} 堂
      </SectionTitle>

      {current ? (
        <View
          style={[
            s.highlight,
            current.status === 'ongoing' ? s.ongoing : s.upcoming,
          ]}
        >
          <Text style={s.highlightLabel}>
            {current.status === 'ongoing' ? '● 上課中' : '下一堂'}
          </Text>
          <Text style={s.highlightTitle}>{current.slot.course.title}</Text>
          <Text style={s.highlightMeta}>
            {slotRangeText(current.slot)}
            {current.slot.course.location ? ` · ${current.slot.course.location}` : ''}
            {current.slot.course.teacher ? ` · ${current.slot.course.teacher}` : ''}
          </Text>
          <Text style={s.highlightCountdown}>
            {current.status === 'ongoing'
              ? `還有 ${countdownText(current.minutes)}下課`
              : `${countdownText(current.minutes)}後開始`}
          </Text>
          {current.status === 'ongoing' && (
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  {
                    width: `${
                      ((slotDuration(current.slot) - current.minutes) /
                        slotDuration(current.slot)) *
                      100
                    }%`,
                  },
                ]}
              />
            </View>
          )}
        </View>
      ) : (
        <Text style={s.empty}>今天的課都上完了 🎉</Text>
      )}

      {/* 當天完整課表 */}
      {list.map((slot) => {
        const done = minutesOfDay(now) >= slot.endMin;
        const isCurrent = current?.slot.course.id === slot.course.id;
        return (
          <View key={slot.course.id} style={s.row}>
            <Text style={[s.rowTime, done && s.dim]}>{slotRangeText(slot)}</Text>
            <Text
              style={[s.rowTitle, done && s.dimStrike, isCurrent && s.rowTitleCurrent]}
              numberOfLines={1}
            >
              {slot.course.title}
            </Text>
            {!!slot.course.location && (
              <Text style={[s.rowRoom, done && s.dim]} numberOfLines={1}>
                {slot.course.location}
              </Text>
            )}
          </View>
        );
      })}
    </Card>
  );
};

const s = StyleSheet.create({
  empty: { fontSize: 13, color: colors.textMuted },
  highlight: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  ongoing: { backgroundColor: colors.primarySoft },
  upcoming: { backgroundColor: colors.accentSoft },
  highlightLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  highlightTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  highlightMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  highlightCountdown: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.card,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTime: { fontSize: 11, color: colors.textMuted, width: 88 },
  rowTitle: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
  rowTitleCurrent: { color: colors.primary },
  rowRoom: { fontSize: 11, color: colors.textMuted, maxWidth: 110, marginLeft: spacing.sm },
  dim: { color: colors.border },
  dimStrike: { color: colors.textMuted, textDecorationLine: 'line-through' },
});

export default TodayCourseCard;
