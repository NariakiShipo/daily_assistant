/**
 * 三條折線(支出 / 收入 / 結餘)。
 *
 * 結餘用折線而不是圓餅:圓餅只能表示「一段期間裡誰佔多少」,
 * 而結餘要看的是「整年怎麼起伏」,那是趨勢不是組成。
 * 點任一點會把該期間的數字釘在上方的小卡裡。
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { PeriodPoint, formatAmount } from '../services/expenses';

interface Props {
  points: PeriodPoint[];
  /** 目前釘住的索引;null = 不顯示小卡 */
  selected: number | null;
  onSelect: (index: number) => void;
  /** 小卡標題的單位,例如 '月' 或 '日' */
  unit: string;
  width: number;
  height?: number;
}

const PAD_LEFT = 34;
const PAD_RIGHT = 10;
const PAD_TOP = 20;
const PAD_BOTTOM = 22;

/** 座標軸上緣取整到好讀的刻度(1、2、5 × 10^n) */
function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

/** 4 萬 / 3 萬 …;不到一萬時直接寫數字 */
const axisLabel = (v: number): string =>
  Math.abs(v) >= 10000 ? `${Math.round(v / 1000) / 10}萬`.replace('.0萬', '萬') : formatAmount(v);

const LineChart: React.FC<Props> = ({
  points,
  selected,
  onSelect,
  unit,
  width,
  height = 205,
}) => {
  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  /*
   * 三條線共用一個刻度,否則「結餘比支出高」這種一眼就該看出來的事
   * 會被各自縮放抹平。負的結餘也要進範圍,不然線會跑到圖外。
   */
  const values = points.flatMap((p) => [p.totals.expense, p.totals.income, p.totals.balance]);
  const rawMax = Math.max(1, ...values);
  const rawMin = Math.min(0, ...values);
  const max = niceMax(rawMax);
  const min = rawMin < 0 ? -niceMax(-rawMin) : 0;
  const span = max - min || 1;

  /** 相鄰兩點的距離;觸控靶要跟它對齊,否則點到的會是隔壁那一段 */
  const gap = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const x = (i: number) => PAD_LEFT + (points.length <= 1 ? innerW / 2 : i * gap);
  const y = (v: number) => PAD_TOP + innerH - ((v - min) / span) * innerH;

  const line = (pick: (p: PeriodPoint) => number) =>
    points.map((p, i) => `${x(i)},${y(pick(p))}`).join(' ');

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => min + span * f);
  const sel = selected !== null ? points[selected] : null;

  return (
    <View style={{ width }}>
      <Svg width={width} height={height}>
        <G>
          {gridValues.map((v, i) => (
            <Line
              key={i}
              x1={PAD_LEFT}
              y1={y(v)}
              x2={width - PAD_RIGHT}
              y2={y(v)}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}
        </G>
        {gridValues.map((v, i) => (
          <SvgText key={`l${i}`} x={PAD_LEFT - 4} y={y(v) + 3} fontSize={9} fill="#7A6570" textAnchor="end">
            {axisLabel(v)}
          </SvgText>
        ))}

        <Polyline points={line((p) => p.totals.income)} fill="none" stroke={colors.success} strokeWidth={2} />
        <Polyline points={line((p) => p.totals.expense)} fill="none" stroke={colors.primary} strokeWidth={2} />
        <Polyline points={line((p) => p.totals.balance)} fill="none" stroke={colors.accent} strokeWidth={2.5} />

        {points.map((p, i) => (
          <Circle key={`i${i}`} cx={x(i)} cy={y(p.totals.income)} r={2.5} fill={colors.success} />
        ))}
        {points.map((p, i) => (
          <Circle key={`e${i}`} cx={x(i)} cy={y(p.totals.expense)} r={2.5} fill={colors.primary} />
        ))}
        {points.map((p, i) => (
          <Circle key={`b${i}`} cx={x(i)} cy={y(p.totals.balance)} r={3} fill={colors.accent} />
        ))}

        {selected !== null && sel && (
          <>
            <Line
              x1={x(selected)}
              y1={PAD_TOP}
              x2={x(selected)}
              y2={PAD_TOP + innerH}
              stroke={colors.accent}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Circle
              cx={x(selected)}
              cy={y(sel.totals.balance)}
              r={5}
              fill="#fff"
              stroke={colors.accent}
              strokeWidth={2.5}
            />
          </>
        )}

        {points.map((p, i) => (
          <SvgText
            key={`x${i}`}
            x={x(i)}
            y={height - 5}
            fontSize={10}
            fill={i === selected ? colors.accent : '#7A6570'}
            fontWeight={i === selected ? '700' : '400'}
            textAnchor="middle"
          >
            {p.label}
          </SvgText>
        ))}
      </Svg>

      {/*
       * 觸控靶另外鋪一層:SVG 元素在 RN 上的命中範圍就是線條本身,
       * 要點到寬 2px 的折線幾乎不可能。這一層把每個期間切成整欄。
       */}
      <View style={[s.hitLayer, { left: PAD_LEFT - gap / 2, width: innerW + gap }]}>
        {points.map((p, i) => (
          <TouchableOpacity
            key={p.key}
            style={s.hit}
            onPress={() => onSelect(i)}
            accessibilityLabel={`${p.label}${unit}`}
          />
        ))}
      </View>

      {sel && (
        <View style={s.tip}>
          <Text style={s.tipTitle}>{`${sel.label} ${unit}`}</Text>
          <Text style={s.tipRow}>
            <Text style={{ color: '#FAD0DD' }}>支出 </Text>
            {formatAmount(sel.totals.expense)}
          </Text>
          <Text style={s.tipRow}>
            <Text style={{ color: '#A8DCC0' }}>收入 </Text>
            {formatAmount(sel.totals.income)}
          </Text>
          <Text style={s.tipRow}>
            <Text style={{ color: '#CFC7F3' }}>結餘 </Text>
            {formatAmount(sel.totals.balance)}
          </Text>
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  hitLayer: {
    position: 'absolute',
    top: PAD_TOP,
    bottom: PAD_BOTTOM,
    flexDirection: 'row',
  },
  hit: { flex: 1 },
  tip: {
    position: 'absolute',
    right: 6,
    top: 2,
    backgroundColor: colors.text,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  tipTitle: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  tipRow: { color: '#fff', fontSize: 11, lineHeight: 16 },
});

export default LineChart;
