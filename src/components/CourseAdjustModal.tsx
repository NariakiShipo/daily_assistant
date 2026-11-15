/**
 * 調整一門已修課在畢業門檻裡的歸類:不採計(不及格、停修、重修的舊紀錄)或改類別。
 */
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CreditCategory, GraduationPlan } from '../types';
import { colors, radius, spacing } from '../theme';
import { CATEGORY_LABELS, CATEGORY_ORDER, GE_DIMENSIONS, NTUT_TYPE_INFO } from '../constants/ntut';
import { ClassifiedCourse } from '../services/graduation';
import { Button, Chip } from './ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  course: ClassifiedCourse | null;
  plan: GraduationPlan;
  onSave: (plan: GraduationPlan) => void;
}

type Mode = 'auto' | 'exclude' | CreditCategory;

const CourseAdjustModal: React.FC<Props> = ({ visible, onClose, course, plan, onSave }) => {
  const [mode, setMode] = useState<Mode>('auto');
  const [dimension, setDimension] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !course) return;
    if (plan.excludedKeys.includes(course.key)) setMode('exclude');
    else setMode(plan.overrides[course.key] ?? 'auto');
    setDimension(plan.overrideDimensions?.[course.key] ?? course.dimension ?? null);
  }, [visible, course, plan]);

  if (!course) return null;

  const save = () => {
    const excludedKeys = plan.excludedKeys.filter((k) => k !== course.key);
    const overrides = { ...plan.overrides };
    const overrideDimensions = { ...(plan.overrideDimensions ?? {}) };
    delete overrides[course.key];
    delete overrideDimensions[course.key];
    if (mode === 'exclude') excludedKeys.push(course.key);
    else if (mode !== 'auto') {
      overrides[course.key] = mode;
      if (mode === 'generalEd' && dimension) overrideDimensions[course.key] = dimension;
    }
    onSave({ ...plan, excludedKeys, overrides, overrideDimensions });
    onClose();
  };

  const typeInfo = course.type ? NTUT_TYPE_INFO[course.type] : undefined;
  const autoText =
    course.status === 'counted' && !course.overridden
      ? `自動判斷:${course.category ? CATEGORY_LABELS[course.category] : '—'}${course.dimension ? `(${course.dimension})` : ''}${course.crossDept ? '(他系課程)' : ''}`
      : course.reason ?? '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle} numberOfLines={2}>
              {course.title}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={s.meta}>
              {course.semesterId ?? '未分類'} · {course.credit} 學分
              {typeInfo ? ` · ${course.type} ${typeInfo.label}` : ' · 無類別符號'}
            </Text>
            {course.classNames.length > 0 && (
              <Text style={s.meta}>開課班級:{course.classNames.join('、')}</Text>
            )}
            {!!course.notes && <Text style={s.meta}>備註:{course.notes}</Text>}
            {!!autoText && <Text style={s.auto}>{autoText}</Text>}

            <Text style={s.label}>採計方式</Text>
            <View style={s.chips}>
              <Chip label="自動判斷" active={mode === 'auto'} onPress={() => setMode('auto')} />
              <Chip
                label="不採計(不及格 / 停修 / 重修舊紀錄)"
                color={colors.danger}
                active={mode === 'exclude'}
                onPress={() => setMode('exclude')}
              />
            </View>
            <Text style={s.label}>或指定類別</Text>
            <View style={s.chips}>
              {CATEGORY_ORDER.map((cat) => (
                <Chip
                  key={cat}
                  label={CATEGORY_LABELS[cat]}
                  color={colors.accent}
                  active={mode === cat}
                  onPress={() => setMode(cat)}
                />
              ))}
            </View>
            {mode === 'generalEd' && (
              <>
                <Text style={s.label}>博雅向度</Text>
                <View style={s.chips}>
                  {GE_DIMENSIONS.map((d) => (
                    <Chip
                      key={d}
                      label={d}
                      color={colors.success}
                      active={dimension === d}
                      onPress={() => setDimension(dimension === d ? null : d)}
                    />
                  ))}
                </View>
              </>
            )}
            <Button label="儲存" onPress={save} />
            <View style={{ height: spacing.lg }} />
          </ScrollView>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  meta: { fontSize: 12, color: colors.textMuted, marginBottom: 2, lineHeight: 18 },
  auto: { fontSize: 12, color: colors.accent, marginTop: spacing.xs, fontWeight: '600' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    marginTop: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default CourseAdjustModal;
