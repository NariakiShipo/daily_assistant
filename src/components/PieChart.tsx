/**
 * 圓餅(其實是甜甜圈)圖。
 *
 * 用 stroke-dasharray 畫弧而不是 Path 的 arc 指令:段數會隨分類增減,
 * dasharray 只要算「佔多少比例」與「從哪裡開始」,不必處理大弧旗標與端點座標。
 *
 * 長度用真正的圓周長 2πr 而不是 SVG 的 pathLength:react-native-svg 在原生
 * 不支援 pathLength,寫了在 iOS / Android 上整個圓餅會變成一段實心圓環。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../theme';

export interface PieSlice {
  /** 0–1 */
  ratio: number;
  color: string;
  /** 點擊時回傳用 */
  key?: string;
}

interface Props {
  slices: PieSlice[];
  size: number;
  /** 圓環粗細(對 100 的 viewBox 而言) */
  thickness?: number;
  /** 圓心的三行字;不傳就留空 */
  label?: string;
  value?: string;
  hint?: string;
}

const PieChart: React.FC<Props> = ({
  slices,
  size,
  thickness = 13,
  label,
  value,
  hint,
}) => {
  const r = 50 - thickness / 2 - 0.5;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  // 一筆帳都沒有時畫一圈淡色,避免中央文字浮在空白上
  const drawn = slices.filter((s) => s.ratio > 0);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G rotation={-90} origin="50, 50" fill="none" strokeWidth={thickness}>
          {drawn.length === 0 && <Circle cx={50} cy={50} r={r} stroke={colors.border} />}
          {drawn.map((sl, i) => {
            const len = sl.ratio * circumference;
            const el = (
              <Circle
                key={sl.key ?? i}
                cx={50}
                cy={50}
                r={r}
                stroke={sl.color}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </G>
      </Svg>
      {(label || value || hint) && (
        <View style={s.center} pointerEvents="none">
          {!!label && <Text style={s.label}>{label}</Text>}
          {!!value && <Text style={s.value}>{value}</Text>}
          {!!hint && <Text style={s.hint}>{hint}</Text>}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '700', color: '#7A6570' },
  value: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 },
  hint: { fontSize: 11, color: '#7A6570', marginTop: 2 },
});

export default PieChart;
