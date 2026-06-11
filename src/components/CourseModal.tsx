import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CourseEntry } from '../types';
import { colors, radius, spacing, tagColor, userColorChoices } from '../theme';
import { PERIOD_SLOTS, WEEKDAYS } from '../constants/timetable';
import { uid } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button } from './ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有課程時傳入(同名同人的所有時段會一起編輯);新增時為 null */
  course: CourseEntry | null;
  /** 新增時的課表擁有者 */
  ownerId: string;
  defaultWeekday: number;
  defaultPeriod: number;
}

const cellKey = (weekday: number, period: number) => `${weekday}-${period}`;

const CourseModal: React.FC<Props> = ({
  visible,
  onClose,
  course,
  ownerId,
  defaultWeekday,
  defaultPeriod,
}) => {
  const { data, addCourse, updateCourse, deleteCourse } = useApp();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [cells, setCells] = useState<Set<string>>(new Set());

  const owner = course?.ownerId ?? ownerId;

  /** 同名同人的所有時段 = 同一門課 */
  const group = useMemo(
    () =>
      course
        ? data.courses.filter((c) => c.ownerId === course.ownerId && c.title === course.title)
        : [],
    [course, data.courses]
  );

  useEffect(() => {
    if (!visible) return;
    if (course) {
      setTitle(course.title);
      setLocation(course.location ?? '');
      setColor(course.color ?? null);
      const set = new Set<string>();
      for (const g of group) {
        for (let i = g.startPeriod; i <= g.endPeriod; i++) set.add(cellKey(g.weekday, i));
      }
      setCells(set);
    } else {
      setTitle('');
      setLocation('');
      setColor(null);
      setCells(new Set([cellKey(defaultWeekday, defaultPeriod)]));
    }
    // group 由 course 推導,只需在開啟時初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, course, defaultWeekday, defaultPeriod]);

  const toggleCell = (weekday: number, period: number) => {
    const k = cellKey(weekday, period);
    setCells((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  /** 把勾選的格子切成「同一天連續節次」的段落 */
  const toRuns = () => {
    const runs: { weekday: number; start: number; end: number }[] = [];
    for (let w = 1; w <= 5; w++) {
      const ps = [...cells]
        .map((k) => k.split('-').map(Number))
        .filter(([cw]) => cw === w)
        .map(([, p]) => p)
        .sort((a, b) => a - b);
      let start = -1;
      let prev = -2;
      for (const p of ps) {
        if (p !== prev + 1) {
          if (start >= 0) runs.push({ weekday: w, start, end: prev });
          start = p;
        }
        prev = p;
      }
      if (start >= 0) runs.push({ weekday: w, start, end: prev });
    }
    return runs;
  };

  const save = () => {
    const name = title.trim();
    if (!name) return notify('請輸入課程名稱');
    if (cells.size === 0) return notify('請至少選擇一個節次');

    const runs = toRuns();
    const groupIds = new Set(group.map((g) => g.id));

    // 與其他課程的時段重疊 → 擋下
    for (const r of runs) {
      const clash = data.courses.find(
        (c) =>
          !groupIds.has(c.id) &&
          c.ownerId === owner &&
          c.weekday === r.weekday &&
          c.startPeriod <= r.end &&
          c.endPeriod >= r.start
      );
      if (clash) {
        return notify(
          '時段重疊',
          `週${WEEKDAYS[r.weekday - 1]} 第 ${PERIOD_SLOTS[r.start].label}~${PERIOD_SLOTS[r.end].label} 節與「${clash.title}」衝突。`
        );
      }
    }

    // 顏色統一:自選 > 這門課既有色 > 其他同名課程色 > 依課名自動配色
    const sameTitle = data.courses.find((c) => c.title === name && !groupIds.has(c.id));
    const finalColor = color ?? group[0]?.color ?? sameTitle?.color ?? tagColor(name);

    // 調和:沿用既有 id 更新、不夠的新增、多出來的刪除
    const reusable = [...group];
    for (const r of runs) {
      const base = {
        title: name,
        location: location.trim() || undefined,
        weekday: r.weekday,
        startPeriod: r.start,
        endPeriod: r.end,
        color: finalColor,
        ownerId: owner,
      };
      const existing = reusable.pop();
      if (existing) updateCourse({ ...base, id: existing.id });
      else addCourse({ ...base, id: uid() });
    }
    for (const leftover of reusable) deleteCourse(leftover.id);
    onClose();
  };

  const remove = () => {
    if (!course) return;
    confirmDialog(
      '刪除課程',
      `確定刪除「${course.title}」的所有時段(${group.length} 段)?`,
      () => {
        for (const g of group) deleteCourse(g.id);
        onClose();
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{course ? '編輯課程' : '新增課程'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.label}>課程名稱(同名課程會視為同一門課、顏色統一)</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="例如:微積分"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>地點(選填)</Text>
            <TextInput
              style={s.input}
              value={location}
              onChangeText={setLocation}
              placeholder="例如:工程一館 201"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>
              上課時間(點格子可複選,不同天、不連續都可以,已選 {cells.size} 節)
            </Text>
            <View style={s.gridHead}>
              <View style={s.gridLabelCol} />
              {WEEKDAYS.map((w) => (
                <Text key={w} style={s.gridHeadText}>
                  {w}
                </Text>
              ))}
            </View>
            {PERIOD_SLOTS.map((slot, i) => (
              <View key={slot.label} style={s.gridRow}>
                <View style={s.gridLabelCol}>
                  <Text style={s.gridLabelText}>{slot.label}</Text>
                </View>
                {WEEKDAYS.map((_, wi) => {
                  const on = cells.has(cellKey(wi + 1, i));
                  return (
                    <TouchableOpacity
                      key={wi}
                      style={[s.gridCell, on && s.gridCellOn]}
                      onPress={() => toggleCell(wi + 1, i)}
                    >
                      {on && <Text style={s.gridCellTick}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <Text style={s.label}>顏色(不選則沿用同名課程或依課名自動配色)</Text>
            <View style={s.swatchRow}>
              {userColorChoices.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.swatch, { backgroundColor: c }, color === c && s.swatchActive]}
                  onPress={() => setColor(color === c ? null : c)}
                />
              ))}
            </View>

            <Button label={course ? '儲存變更' : '新增課程'} onPress={save} />
            {course && <Button label="刪除課程(所有時段)" variant="danger" onPress={remove} />}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  gridHead: { flexDirection: 'row', marginBottom: 2 },
  gridHeadText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  gridRow: { flexDirection: 'row', marginBottom: 2 },
  gridLabelCol: { width: 30, alignItems: 'center', justifyContent: 'center' },
  gridLabelText: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  gridCell: {
    flex: 1,
    height: 26,
    marginHorizontal: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  gridCellTick: { color: '#fff', fontSize: 12, fontWeight: '800' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
  },
  swatchActive: { borderWidth: 3, borderColor: colors.text },
});

export default CourseModal;
