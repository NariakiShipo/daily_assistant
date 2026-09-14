/**
 * 分類圖示:線條圖示 / Emoji / 使用者上傳的圖片,三者擇一。
 *
 * 上傳的圖片一律裁成圓形顯示,跟 Emoji 佔一樣的尺寸,
 * 清單裡才不會因為每個分類的圖示形狀不同而看起來歪歪的。
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ExpenseCategory } from '../types';
import { colors } from '../theme';
import Icon, { IconName } from './Icon';

interface Props {
  category: ExpenseCategory;
  size?: number;
  /** 線條圖示的顏色;未指定時用一般文字色(選中的格子才會傳主色進來) */
  color?: string;
  strokeWidth?: number;
}

const CategoryIcon: React.FC<Props> = ({ category, size = 24, color, strokeWidth }) => {
  if (category.imageUri) {
    return (
      <Image
        source={{ uri: category.imageUri }}
        style={[s.image, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }
  if (category.emoji) {
    // 行高等於字級,Emoji 才不會把格子撐高
    return <Text style={{ fontSize: size * 0.92, lineHeight: size * 1.1 }}>{category.emoji}</Text>;
  }
  return (
    <Icon
      name={(category.icon ?? 'more') as IconName}
      size={size}
      color={color ?? colors.text}
      strokeWidth={strokeWidth}
    />
  );
};

const s = StyleSheet.create({
  image: { backgroundColor: colors.background },
});

export default CategoryIcon;
