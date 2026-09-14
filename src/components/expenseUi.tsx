/**
 * 記帳各頁共用的小元件。
 *
 * 跟 ui.tsx 一樣把零碎的東西放在同一個檔案裡:這些都太小,
 * 各自一個檔案只會讓 import 變長,卻不會讓它們更好懂。
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { ExpenseWho } from '../types';
import Icon, { IconName } from './Icon';

/** ≤12px 的說明字專用色(檢視清單第 06 條:原本的 textMuted 對比只有 3.3:1) */
export const mutedSmall = '#7A6570';

/* ── 頁首 ─────────────────────────────────────────────── */

export const ScreenHeader: React.FC<{
  title?: React.ReactNode;
  onBack?: () => void;
  /** 沒有返回鍵時,左上角可以改放一顆圖示按鈕 */
  leftAction?: { icon: IconName; onPress: () => void; label: string };
  /** 右側的圖示按鈕(最多兩顆) */
  actions?: { icon: IconName; onPress: () => void; label: string }[];
  /** 右側改放一顆文字按鈕(例如「編輯」「完成」) */
  actionText?: { label: string; onPress: () => void };
}> = ({ title, onBack, leftAction, actions, actionText }) => (
  <View style={s.header}>
    <View style={s.headerSide}>
      {onBack ? (
        <TouchableOpacity style={s.roundBtn} onPress={onBack} accessibilityLabel="返回">
          <Icon name="back" size={18} color={colors.primary} />
        </TouchableOpacity>
      ) : leftAction ? (
        <TouchableOpacity
          style={s.roundBtn}
          onPress={leftAction.onPress}
          accessibilityLabel={leftAction.label}
        >
          <Icon name={leftAction.icon} size={18} color={colors.primary} />
        </TouchableOpacity>
      ) : (
        <View style={s.roundBtn} />
      )}
    </View>
    <View style={s.headerMid}>{typeof title === 'string' ? <Text style={s.headerTitle}>{title}</Text> : title}</View>
    <View style={[s.headerSide, s.headerRight]}>
      {actionText ? (
        <TouchableOpacity style={s.textBtn} onPress={actionText.onPress}>
          <Text style={s.textBtnLabel}>{actionText.label}</Text>
        </TouchableOpacity>
      ) : (
        (actions ?? []).map((a) => (
          <TouchableOpacity
            key={a.label}
            style={s.roundBtn}
            onPress={a.onPress}
            accessibilityLabel={a.label}
          >
            <Icon name={a.icon} size={18} color={colors.primary} />
          </TouchableOpacity>
        ))
      )}
    </View>
  </View>
);

/** 標題列中央的「‹ 2026 年 9 月 ›」 */
export const PeriodStepper: React.FC<{
  label: string;
  onPrev: () => void;
  onNext: () => void;
  size?: 'lg' | 'sm';
}> = ({ label, onPrev, onNext, size = 'lg' }) => (
  <View style={s.stepper}>
    <TouchableOpacity onPress={onPrev} hitSlop={HIT} accessibilityLabel="上一個期間">
      <Text style={[s.stepArrow, size === 'sm' && s.stepArrowSm]}>‹</Text>
    </TouchableOpacity>
    <Text style={[s.stepLabel, size === 'sm' && s.stepLabelSm]}>{label}</Text>
    <TouchableOpacity onPress={onNext} hitSlop={HIT} accessibilityLabel="下一個期間">
      <Text style={[s.stepArrow, size === 'sm' && s.stepArrowSm]}>›</Text>
    </TouchableOpacity>
  </View>
);

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

/* ── 分段控制 ─────────────────────────────────────────── */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** 選中時的底色;未指定用主色 */
  color?: string;
}

/** 白底膠囊分段控制(小熊 / 阿宏 / 雙人、支出 / 收入) */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <View style={[s.seg, style]}>
      {options.map((o) => {
        const active = o.value === value;
        const tint = o.color ?? colors.primary;
        return (
          <TouchableOpacity
            key={o.value}
            style={[s.segOpt, active && { backgroundColor: tint }]}
            onPress={() => onChange(o.value)}
          >
            {o.value === 'both' && !active && <View style={s.bothDot} />}
            {o.value === 'both' && active && <View style={[s.bothDot, s.bothDotOn]} />}
            <Text style={[s.segText, { color: active ? '#fff' : tint }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 粉底、白色滑塊的分段控制(日 / 月 / 年) */
export function SoftSegmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <View style={[s.softSeg, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[s.softOpt, active && s.softOptOn]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[s.softText, active && s.softTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 深色外框的分段控制(支出 / 收入 / 結餘) */
export function OutlineSegmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <View style={[s.outlineSeg, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[s.outlineOpt, active && { backgroundColor: o.color ?? colors.primary }]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[s.outlineText, active && { color: '#fff' }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ── 歸屬 ─────────────────────────────────────────────── */

/** 「雙人」的雙色點:左半自己的顏色、右半伴侶的顏色 */
export const BothDot: React.FC<{ size?: number; self?: string; partner?: string }> = ({
  size = 8,
  self = colors.primary,
  partner = colors.accent,
}) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexDirection: 'row' }}>
    <View style={{ flex: 1, backgroundColor: self }} />
    <View style={{ flex: 1, backgroundColor: partner }} />
  </View>
);

/** 帳目列上的歸屬標記:個人是名字 + 成員色,雙人是雙色點 + 「雙人」 */
export const WhoTag: React.FC<{
  who: ExpenseWho;
  selfName: string;
  partnerName: string;
  selfColor: string;
  partnerColor: string;
}> = ({ who, selfName, partnerName, selfColor, partnerColor }) => {
  if (who === 'both') {
    return (
      <View style={s.whoRow}>
        <BothDot self={selfColor} partner={partnerColor} />
        <Text style={s.metaText}>雙人</Text>
      </View>
    );
  }
  const name = who === 'self' ? selfName : partnerName;
  const color = who === 'self' ? selfColor : partnerColor;
  return <Text style={[s.metaText, { color, fontWeight: '600' }]}>{name}</Text>;
};

/* ── 其他 ─────────────────────────────────────────────── */

/** 右下角的 ＋ 浮動按鈕 */
export const Fab: React.FC<{ onPress: () => void; bottom?: number }> = ({ onPress, bottom = 24 }) => (
  <TouchableOpacity style={[s.fab, { bottom }]} onPress={onPress} accessibilityLabel="記一筆">
    <Icon name="plus" size={26} color="#fff" />
  </TouchableOpacity>
);

/** 空狀態:一句話 + 一個提示,不放插圖 */
export const EmptyState: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <View style={s.empty}>
    <Text style={s.emptyTitle}>{title}</Text>
    {!!hint && <Text style={s.emptyHint}>{hint}</Text>}
  </View>
);

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: spacing.sm,
  },
  headerSide: { flexDirection: 'row', gap: spacing.sm, minWidth: 80 },
  headerRight: { justifyContent: 'flex-end' },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  textBtnLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepArrow: { fontSize: 20, fontWeight: '700', color: colors.primary },
  stepArrowSm: { fontSize: 18 },
  stepLabel: { fontSize: 19, fontWeight: '700', color: colors.text },
  stepLabelSm: { fontSize: 15 },

  seg: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 3,
  },
  segOpt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  segText: { fontSize: 13, fontWeight: '700' },
  bothDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  bothDotOn: { backgroundColor: '#fff', borderLeftColor: '#fff' },

  softSeg: {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 3,
  },
  softOpt: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm + 2 },
  softOptOn: { backgroundColor: colors.card },
  softText: { fontSize: 13, fontWeight: '600', color: mutedSmall },
  softTextOn: { color: colors.primary, fontWeight: '700' },

  outlineSeg: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: radius.pill,
    padding: 2,
  },
  outlineOpt: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.pill },
  outlineText: { fontSize: 14, fontWeight: '700', color: colors.text },

  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: mutedSmall },

  fab: {
    position: 'absolute',
    right: spacing.lg + 4,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xl + spacing.md },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  emptyHint: { fontSize: 12, color: mutedSmall, marginTop: 6, textAlign: 'center', lineHeight: 18 },
});

export default s;
