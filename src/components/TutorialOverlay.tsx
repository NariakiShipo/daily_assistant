/**
 * 首次使用教學(設計稿 3a–3c)。
 *
 * 不做獨立的教學輪播,而是直接在真的畫面上打光:輪播看完就忘,因為看的時候
 * 那些東西還不在眼前。這裡只教「新導覽」裡三件會迷路的事——中央 Home、左上 ☰、
 * 記帳的第一筆——每步一句話,隨時可以略過。
 *
 * 打光的位置是由被教的元件自己回報的(measureInWindow),不是寫死座標:
 * 導覽列的高度會隨機型的安全區變動,寫死的圓圈在有些手機上會打在空氣上。
 */
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { mutedSmall } from './expenseUi';

/** 被打光的元件在螢幕上的位置 */
export interface SpotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TutorialStep {
  /** 打光在哪;沒有位置(元件還沒量到)時只顯示說明卡 */
  spot?: SpotRect;
  title: string;
  body: string;
  /** 說明卡要靠上還是靠下,避開被打光的東西 */
  place: 'top' | 'bottom';
  /** 最後一步的主要按鈕文字 */
  cta?: string;
}

interface Props {
  visible: boolean;
  step: number;
  steps: TutorialStep[];
  onNext: () => void;
  onSkip: () => void;
}

/** 打光圓圈比目標大一圈,才不會看起來卡在邊上 */
const PAD = 18;

const TutorialOverlay: React.FC<Props> = ({ visible, step, steps, onNext, onSkip }) => {
  const { width, height } = useWindowDimensions();
  const current = steps[step];
  if (!visible || !current) return null;

  const spot = current.spot;
  const radiusPx = spot ? Math.max(spot.width, spot.height) / 2 + PAD : 0;
  const cx = spot ? spot.x + spot.width / 2 : 0;
  const cy = spot ? spot.y + spot.height / 2 : 0;

  const isLast = step === steps.length - 1;

  /*
   * 遮罩用四塊不透明的 View 圍出中間的洞,而不是一張 radial-gradient:
   * RN 沒有 CSS 漸層,用 SVG 遮罩也可以,但四塊 View 沒有額外依賴也不會有
   * 大面積重繪的成本。洞本身是透明的,被教的元件就露出來。
   */
  const holeTop = cy - radiusPx;
  const holeBottom = cy + radiusPx;
  const holeLeft = cx - radiusPx;
  const holeRight = cx + radiusPx;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onSkip}>
      <View style={s.root} pointerEvents="box-none">
        {spot ? (
          <>
            <View style={[s.mask, { top: 0, left: 0, right: 0, height: Math.max(0, holeTop) }]} />
            <View
              style={[s.mask, { top: holeBottom, left: 0, right: 0, height: Math.max(0, height - holeBottom) }]}
            />
            <View
              style={[
                s.mask,
                { top: holeTop, left: 0, width: Math.max(0, holeLeft), height: radiusPx * 2 },
              ]}
            />
            <View
              style={[
                s.mask,
                {
                  top: holeTop,
                  left: holeRight,
                  width: Math.max(0, width - holeRight),
                  height: radiusPx * 2,
                },
              ]}
            />
            {/*
              * 打光處本身就是「下一步」:教學結束時剛好停在被教的那個東西上。
              * 真的按鈕在下面看得見但點不到——半途觸發真的動作會把教學打斷。
              */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onNext}
              accessibilityLabel={`${current.title}(點一下繼續)`}
              style={[
                s.ring,
                {
                  left: holeLeft,
                  top: holeTop,
                  width: radiusPx * 2,
                  height: radiusPx * 2,
                  borderRadius: radiusPx,
                },
              ]}
            />
          </>
        ) : (
          <View style={[s.mask, StyleSheet.absoluteFillObject]} />
        )}

        <View
          style={[
            s.card,
            current.place === 'top' ? { top: Math.max(96, holeBottom + 24) } : { bottom: 150 },
          ]}
        >
          <View style={s.cardHead}>
            <Text style={s.counter}>
              {step + 1} / {steps.length}
            </Text>
            <TouchableOpacity onPress={onSkip} hitSlop={HIT}>
              <Text style={s.skip}>略過</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.title}>{current.title}</Text>
          <Text style={s.body}>{current.body}</Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.nextBtn} onPress={onNext}>
              <Text style={s.nextBtnText}>{isLast ? current.cta ?? '開始使用' : '下一步'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const s = StyleSheet.create({
  root: { flex: 1 },
  mask: { position: 'absolute', backgroundColor: 'rgba(61,43,51,0.72)' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  card: {
    position: 'absolute',
    left: 32,
    right: 32,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  skip: { fontSize: 12, color: mutedSmall },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 6 },
  body: { fontSize: 13, lineHeight: 20, color: colors.text, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  nextBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

export default TutorialOverlay;
