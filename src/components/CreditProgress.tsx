/**
 * 畢業門檻頁的小元件:進度條與課程類別標籤。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CreditCategory } from '../types';
import { colors, radius } from '../theme';
import { CATEGORY_COLORS, CATEGORY_LABELS, NTUT_TYPE_INFO } from '../constants/ntut';

/** 進度條:超過 max 時填滿,max 為 0 或 null 時顯示空軌道 */
export const ProgressBar: React.FC<{
  value: number;
  max: number | null;
  color?: string;
  height?: number;
}> = ({ value, max, color = colors.primary, height = 8 }) => {
  const pct = max && max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          s.fill,
          { width: `${pct}%`, backgroundColor: color, height, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
};

/** 課程類別小標籤:符號 + 簡稱,顏色依類別 */
export const TypeBadge: React.FC<{
  type?: string;
  category: CreditCategory | null;
  /** 顯示的文字;未給則用類別簡稱 */
  label?: string;
}> = ({ type, category, label }) => {
  const info = type ? NTUT_TYPE_INFO[type] : undefined;
  const color = category ? CATEGORY_COLORS[category] : colors.textMuted;
  const text = label ?? (category ? CATEGORY_LABELS[category] : info?.label ?? '未分類');
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]} numberOfLines={1}>
        {type ? `${type} ` : ''}
        {text}
      </Text>
    </View>
  );
};

const s = StyleSheet.create({
  track: { backgroundColor: colors.primarySoft, overflow: 'hidden', width: '100%' },
  fill: { minWidth: 0 },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
