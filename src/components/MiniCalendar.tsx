import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { formatMonthZh, fromDateKey, monthGrid, todayKey, weekdayZh } from '../utils/date';

export interface DayMark {
  bg?: string;
  border?: string;
  /** 日期數字顏色(例如深色底配白字) */
  textColor?: string;
  /** 日期數字加粗 */
  textBold?: boolean;
}

interface Props {
  /** 目前選取的日期(YYYY-MM-DD) */
  selected?: string | null;
  /** 點選日期時呼叫;不傳則為純顯示 */
  onSelect?: (key: string) => void;
  /** 晚於此日期的格子不可選並淡化 */
  maxDate?: string;
  /** 自訂每一天的底色/框線 */
  getMark?: (key: string) => DayMark | undefined;
  /** 初始顯示月份的基準日(預設:selected 或今天) */
  initialMonth?: string;
  legend?: { color: string; label: string }[];
}

const MiniCalendar: React.FC<Props> = ({
  selected,
  onSelect,
  maxDate,
  getMark,
  initialMonth,
  legend,
}) => {
  const anchor = fromDateKey(selected || initialMonth || todayKey());
  const [year, setYear] = useState(anchor.getFullYear());
  const [month, setMonth] = useState(anchor.getMonth()); // 0-based
  const cells = monthGrid(year, month);
  const today = todayKey();

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

  return (
    <View>
      <View style={s.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
          <Text style={s.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.monthTitle}>{formatMonthZh(year, month)}</Text>
        <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
          <Text style={s.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>
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
          const mark = getMark?.(key);
          const disabled = (!!maxDate && key > maxDate) || !onSelect;
          const isSelected = key === selected;
          const isToday = key === today;
          return (
            <TouchableOpacity
              key={key}
              disabled={disabled}
              onPress={() => onSelect?.(key)}
              style={[
                s.cell,
                !!mark?.bg && { backgroundColor: mark.bg },
                !!mark?.border && { borderWidth: 1.5, borderColor: mark.border },
                isSelected && s.cellSelected,
              ]}
            >
              <Text
                style={[
                  s.cellDay,
                  isToday && s.todayText,
                  !!maxDate && key > maxDate && s.dimText,
                  !!mark?.textColor && { color: mark.textColor },
                  mark?.textBold && { fontWeight: '900' },
                ]}
              >
                {Number(key.slice(8))}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!legend?.length && (
        <View style={s.legend}>
          {legend.map((l) => (
            <React.Fragment key={l.label}>
              <View style={[s.legendSwatch, { backgroundColor: l.color }]} />
              <Text style={s.legendText}>{l.label}</Text>
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
};

const CELL = `${100 / 7}%` as const;

const s = StyleSheet.create({
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  monthTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: 17, color: colors.primary, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekday: {
    width: CELL,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    paddingVertical: 3,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellSelected: { borderWidth: 2, borderColor: colors.primary },
  cellDay: { fontSize: 13, color: colors.text },
  todayText: { fontWeight: '900', color: colors.primary },
  dimText: { color: colors.border },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, marginRight: 4 },
  legendText: { fontSize: 11, color: colors.textMuted, marginRight: spacing.md, marginLeft: 2 },
});

export default MiniCalendar;
