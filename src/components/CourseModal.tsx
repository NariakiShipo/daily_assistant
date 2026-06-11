import React, { useEffect, useState } from 'react';
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
import { Button, Chip } from './ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有課程時傳入;新增時為 null */
  course: CourseEntry | null;
  /** 新增時的課表擁有者 */
  ownerId: string;
  defaultWeekday: number;
  defaultPeriod: number;
}

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
  const [weekday, setWeekday] = useState(1);
  const [startPeriod, setStartPeriod] = useState(0);
  const [endPeriod, setEndPeriod] = useState(0);
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (course) {
      setTitle(course.title);
      setLocation(course.location ?? '');
      setWeekday(course.weekday);
      setStartPeriod(course.startPeriod);
      setEndPeriod(course.endPeriod);
      setColor(course.color ?? null);
    } else {
      setTitle('');
      setLocation('');
      setWeekday(defaultWeekday);
      setStartPeriod(defaultPeriod);
      setEndPeriod(defaultPeriod);
      setColor(null);
    }
  }, [visible, course, defaultWeekday, defaultPeriod]);

  const pickStart = (i: number) => {
    setStartPeriod(i);
    if (i > endPeriod) setEndPeriod(i);
  };

  const pickEnd = (i: number) => {
    if (i < startPeriod) {
      return notify('結束節次不能早於開始節次');
    }
    setEndPeriod(i);
  };

  const save = () => {
    if (!title.trim()) return notify('請輸入課程名稱');
    // 同一份課表、同一天、節次重疊 → 擋下
    const clash = data.courses.find(
      (c) =>
        c.id !== course?.id &&
        c.ownerId === (course?.ownerId ?? ownerId) &&
        c.weekday === weekday &&
        c.startPeriod <= endPeriod &&
        c.endPeriod >= startPeriod
    );
    if (clash) {
      return notify('時段重疊', `與「${clash.title}」(第 ${PERIOD_SLOTS[clash.startPeriod].label}~${PERIOD_SLOTS[clash.endPeriod].label} 節)衝突。`);
    }
    const entry: CourseEntry = {
      id: course?.id ?? uid(),
      title: title.trim(),
      location: location.trim() || undefined,
      weekday,
      startPeriod,
      endPeriod,
      color: color ?? tagColor(title.trim()),
      ownerId: course?.ownerId ?? ownerId,
    };
    if (course) updateCourse(entry);
    else addCourse(entry);
    onClose();
  };

  const remove = () => {
    if (!course) return;
    confirmDialog(
      '刪除課程',
      `確定刪除「${course.title}」?`,
      () => {
        deleteCourse(course.id);
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
            <Text style={s.label}>課程名稱</Text>
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

            <Text style={s.label}>星期</Text>
            <View style={s.chips}>
              {WEEKDAYS.map((w, i) => (
                <Chip
                  key={w}
                  label={w}
                  active={weekday === i + 1}
                  onPress={() => setWeekday(i + 1)}
                />
              ))}
            </View>

            <Text style={s.label}>開始節次</Text>
            <View style={s.chips}>
              {PERIOD_SLOTS.map((slot, i) => (
                <Chip
                  key={slot.label}
                  label={slot.label}
                  active={startPeriod === i}
                  onPress={() => pickStart(i)}
                />
              ))}
            </View>

            <Text style={s.label}>結束節次(同節 = 只上一節)</Text>
            <View style={s.chips}>
              {PERIOD_SLOTS.map((slot, i) => (
                <Chip
                  key={slot.label}
                  label={slot.label}
                  active={endPeriod === i}
                  onPress={() => pickEnd(i)}
                />
              ))}
            </View>
            <Text style={s.timeHint}>
              {PERIOD_SLOTS[startPeriod].start} – {PERIOD_SLOTS[endPeriod].end}(
              {endPeriod - startPeriod + 1} 節連續)
            </Text>

            <Text style={s.label}>顏色(不選則依課名自動配色)</Text>
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
            {course && <Button label="刪除課程" variant="danger" onPress={remove} />}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  timeHint: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
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
