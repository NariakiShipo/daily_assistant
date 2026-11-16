/**
 * 調整圖片(設計稿 2a)。
 *
 * 這一步是 Nariaki 的意見加進來的:選好照片後,要能自己決定圓形裡框到哪一塊,
 * 並且事先知道建議尺寸,而不是系統直接從正中央硬裁。
 *
 * 做法:把圖片等比放進 300×300 的舞台,使用者拖曳平移、用滑桿縮放,
 * 中間的圓形遮罩就是最後會留下的範圍;按完成時把螢幕座標換算回原圖像素,
 * 交給 expo-image-manipulator 裁切並縮到 256×256。
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, radius, spacing } from '../theme';
import { notify } from '../utils/dialog';
import Icon from './Icon';
import { mutedSmall } from './expenseUi';

/** 舞台邊長 */
const STAGE = 300;
/** 圓形遮罩直徑 */
const CIRCLE = 238;
/** 存檔尺寸 */
const OUTPUT = 256;
/** 建議的最小短邊 */
const RECOMMENDED = 256;
/** 低於這個短邊會明顯糊掉,但仍然允許使用 */
const BLURRY_BELOW = 128;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  image: PickedImage | null;
  onCancel: () => void;
  /** 重新挑一張照片 */
  onRepick: () => void;
  /** 裁切完成,回傳裁好的正方形圖片 uri */
  onDone: (uri: string) => void;
}

const ImageCropModal: React.FC<Props> = ({ visible, image, onCancel, onRepick, onDone }) => {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [busy, setBusy] = useState(false);
  const offset = useRef({ x: 0, y: 0 }).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [sliderWidth, setSliderWidth] = useState(200);

  /**
   * 圖片鋪滿舞台後的顯示尺寸(cover)。
   * 短邊貼齊舞台,長邊溢出,溢出的部分就是可以拖曳的範圍。
   */
  const fitted = useMemo(() => {
    if (!image) return { w: STAGE, h: STAGE };
    const scale = Math.max(STAGE / image.width, STAGE / image.height);
    return { w: image.width * scale, h: image.height * scale };
  }, [image]);

  const shown = { w: fitted.w * zoom, h: fitted.h * zoom };
  /** 拖曳上限:不能把圖拖到讓圓圈露出空白 */
  const limitX = Math.max(0, (shown.w - CIRCLE) / 2);
  const limitY = Math.max(0, (shown.h - CIRCLE) / 2);

  const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        pan.setValue({
          x: clamp(offset.x + g.dx, limitRef.current.x),
          y: clamp(offset.y + g.dy, limitRef.current.y),
        });
      },
      onPanResponderRelease: (_e, g) => {
        offset.x = clamp(offset.x + g.dx, limitRef.current.x);
        offset.y = clamp(offset.y + g.dy, limitRef.current.y);
      },
    })
  ).current;

  // PanResponder 只建立一次,縮放後的新上限要透過 ref 傳進去
  const limitRef = useRef({ x: limitX, y: limitY });
  limitRef.current = { x: limitX, y: limitY };

  const changeZoom = (next: number) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    setZoom(z);
    // 放大後原本的位移可能超出新上限,縮回來免得露白
    const nl = {
      x: Math.max(0, (fitted.w * z - CIRCLE) / 2),
      y: Math.max(0, (fitted.h * z - CIRCLE) / 2),
    };
    offset.x = clamp(offset.x, nl.x);
    offset.y = clamp(offset.y, nl.y);
    pan.setValue({ x: offset.x, y: offset.y });
  };

  const reset = () => {
    offset.x = 0;
    offset.y = 0;
    pan.setValue({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
  };

  const crop = async () => {
    if (!image || busy) return;
    setBusy(true);
    try {
      /*
       * 螢幕座標 → 原圖像素。
       * 顯示時的總縮放倍率 = fit 倍率 × 使用者的 zoom,除回去就是原圖上的長度。
       */
      const displayScale = (fitted.w * zoom) / image.width;
      const sizeInSource = CIRCLE / displayScale;
      // 圓心在顯示圖上的位置:圖片中心 − 使用者的位移
      const centerX = shown.w / 2 - offset.x;
      const centerY = shown.h / 2 - offset.y;
      const originX = Math.max(0, Math.round((centerX - CIRCLE / 2) / displayScale));
      const originY = Math.max(0, Math.round((centerY - CIRCLE / 2) / displayScale));
      const side = Math.round(
        Math.min(sizeInSource, image.width - originX, image.height - originY)
      );

      const result = await ImageManipulator.manipulateAsync(
        image.uri,
        [
          { crop: { originX, originY, width: side, height: side } },
          { resize: { width: OUTPUT, height: OUTPUT } },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.PNG }
      );
      onDone(result.uri);
      reset();
    } catch {
      notify('裁切失敗', '這張圖片沒辦法處理,換一張試試。');
    } finally {
      setBusy(false);
    }
  };

  const shortSide = image ? Math.min(image.width, image.height) : 0;
  const tooSmall = shortSide > 0 && shortSide < BLURRY_BELOW;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.head}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={s.cancel}>取消</Text>
            </TouchableOpacity>
            <Text style={s.title}>調整圖片</Text>
            <TouchableOpacity onPress={() => void crop()} disabled={busy}>
              <Text style={[s.done, busy && { opacity: 0.4 }]}>完成</Text>
            </TouchableOpacity>
          </View>

          <View style={s.stage} {...panResponder.panHandlers}>
            {image && (
              <Animated.View style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }] }}>
                <Image source={{ uri: image.uri }} style={{ width: shown.w, height: shown.h }} />
              </Animated.View>
            )}
            {/* 遮罩與圓圈都不吃觸控,否則拖曳會被擋住 */}
            <View style={s.mask} pointerEvents="none">
              <View style={s.maskRow} />
              <View style={s.maskMid}>
                <View style={s.maskSide} />
                <View style={s.circle} />
                <View style={s.maskSide} />
              </View>
              <View style={s.maskRow} />
            </View>
            <Text style={s.gestureHint} pointerEvents="none">
              拖曳移動 · 用下面的滑桿縮放
            </Text>
          </View>

          <View
            style={s.sliderRow}
            onLayout={(e) => setSliderWidth(Math.max(1, e.nativeEvent.layout.width - 48))}
          >
            <TouchableOpacity onPress={() => changeZoom(zoom - 0.25)} hitSlop={HIT}>
              <Text style={s.zoomSign}>−</Text>
            </TouchableOpacity>
            <View style={s.track}>
              <View style={[s.fill, { width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }]} />
              <View
                style={[
                  s.knob,
                  { left: ((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * sliderWidth - 12 },
                ]}
              />
            </View>
            <TouchableOpacity onPress={() => changeZoom(zoom + 0.25)} hitSlop={HIT}>
              <Text style={s.zoomSign}>＋</Text>
            </TouchableOpacity>
          </View>

          <View style={s.preview}>
            <Text style={s.previewLabel}>預覽</Text>
            <View style={s.previewRow}>
              {[40, 22, 16].map((size, i) => (
                <View key={size} style={s.previewItem}>
                  <View
                    style={[
                      { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
                      i === 0 && s.previewRing,
                    ]}
                  >
                    {image && <Image source={{ uri: image.uri }} style={s.previewImg} />}
                  </View>
                  <Text style={s.previewCaption}>{['新增表單', '分類格', '圖例'][i]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoDot}>
              <Text style={s.infoDotText}>i</Text>
            </View>
            <Text style={s.info}>
              {`建議正方形、至少 ${RECOMMENDED} × ${RECOMMENDED} px。`}
              {image ? `你選的是 ${image.width} × ${image.height} px，會依圓圈範圍裁切並縮到 ${OUTPUT} × ${OUTPUT} 儲存。` : ''}
              {tooSmall ? '圖片偏小，分類格上可能會模糊，但仍然可以使用。' : ''}
            </Text>
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.repick} onPress={onRepick}>
              <Icon name="image" size={16} color={colors.primary} />
              <Text style={s.repickText}>重新選擇</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.confirm, busy && { opacity: 0.5 }]} onPress={() => void crop()} disabled={busy}>
              <Text style={s.confirmText}>{busy ? '處理中…' : '完成'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const MASK_BAND = (STAGE - CIRCLE) / 2;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,43,51,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cancel: { fontSize: 13, color: mutedSmall, paddingVertical: 4 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  done: { fontSize: 13, fontWeight: '700', color: colors.primary, paddingVertical: 4 },

  stage: {
    width: STAGE,
    height: STAGE,
    maxWidth: '100%',
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mask: { ...StyleSheet.absoluteFillObject },
  maskRow: { height: MASK_BAND, backgroundColor: 'rgba(61,43,51,0.62)' },
  maskMid: { flexDirection: 'row', height: CIRCLE },
  maskSide: { width: MASK_BAND, backgroundColor: 'rgba(61,43,51,0.62)' },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  gestureHint: {
    position: 'absolute',
    bottom: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 14, marginHorizontal: spacing.sm },
  zoomSign: { fontSize: 16, color: mutedSmall, width: 14, textAlign: 'center' },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  knob: {
    position: 'absolute',
    top: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  previewLabel: { fontSize: 12, fontWeight: '700', color: mutedSmall },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 14 },
  previewItem: { alignItems: 'center', gap: 3 },
  previewRing: { borderWidth: 2, borderColor: colors.primary },
  previewImg: { width: '100%', height: '100%' },
  previewCaption: { fontSize: 10, color: mutedSmall },

  infoRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  infoDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoDotText: { fontSize: 11, fontWeight: '800', color: colors.accent },
  info: { flex: 1, fontSize: 12, lineHeight: 18, color: mutedSmall },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  repick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
  },
  repickText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  confirm: {
    flex: 1.4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default ImageCropModal;
