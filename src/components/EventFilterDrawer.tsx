/**
 * 日曆的「篩選」抽屜(設計稿 1m)。
 *
 * 原本標籤與檢視模式各佔月曆上方一整列,月曆因此被推到第二屏(檢視清單第 03 條)。
 * 這些條件是「偶爾才改」的東西,收進抽屜;有條件生效時按鈕上會有數字徽章,
 * 收起來之後才不會忘記自己還開著篩選。
 */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, tagColor } from '../theme';
import { EventPriority, PRIORITY_OPTIONS } from '../types';
import { TAG_UNDONE } from '../services/eventFilter';
import { priorityColors } from '../theme';
import { Chip } from './ui';
import { mutedSmall } from './expenseUi';

interface Props {
  visible: boolean;
  onClose: () => void;
  tags: string[];
  tag: string | null;
  onChangeTag: (tag: string | null) => void;
  priority: EventPriority | null;
  onChangePriority: (p: EventPriority | null) => void;
  /** 一次清掉抽屜裡的全部條件 */
  onClear: () => void;
}

const EventFilterDrawer: React.FC<Props> = ({
  visible,
  onClose,
  tags,
  tag,
  onChangeTag,
  priority,
  onChangePriority,
  onClear,
}) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={s.backdrop}>
      <View style={s.sheet}>
        <View style={s.head}>
          <Text style={s.title}>篩選</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="關閉">
            <Text style={s.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.body}>
          <Text style={s.label}>狀態</Text>
          <View style={s.chips}>
            <Chip
              label={TAG_UNDONE}
              color={colors.textMuted}
              active={tag === TAG_UNDONE}
              onPress={() => onChangeTag(tag === TAG_UNDONE ? null : TAG_UNDONE)}
            />
          </View>

          <Text style={s.label}>優先順序</Text>
          <View style={s.chips}>
            {PRIORITY_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={`${o.label}優先`}
                color={priorityColors[o.value]}
                active={priority === o.value}
                onPress={() => onChangePriority(priority === o.value ? null : o.value)}
              />
            ))}
          </View>

          <Text style={s.label}>標籤</Text>
          {tags.length === 0 ? (
            <Text style={s.empty}>還沒有標籤。在行程的「更多選項」裡可以加。</Text>
          ) : (
            <View style={s.chips}>
              {tags.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  color={tagColor(t)}
                  active={tag === t}
                  onPress={() => onChangeTag(tag === t ? null : t)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={s.actions}>
          <TouchableOpacity style={s.clearBtn} onPress={onClear}>
            <Text style={s.clearBtnText}>清除條件</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.doneBtn} onPress={onClose}>
            <Text style={s.doneBtnText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,43,51,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  body: { paddingTop: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: mutedSmall, marginTop: spacing.md, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { fontSize: 12, color: mutedSmall, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  clearBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  clearBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  doneBtn: {
    flex: 1.4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default EventFilterDrawer;
