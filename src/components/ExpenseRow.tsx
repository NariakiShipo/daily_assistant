/**
 * 明細清單裡的一列帳目,支援左滑露出「刪除」。
 *
 * 用 RN 內建的 PanResponder 而不是 react-native-gesture-handler:
 * 這個專案沒有那個依賴,而整個 App 只有這裡需要滑動手勢,
 * 為了一個列表項目引入一套手勢系統(還要 native rebuild)並不划算。
 */
import React, { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Expense, ExpenseCategory, PAYMENT_LABELS, UserProfile } from '../types';
import { formatAmount } from '../services/expenses';
import CategoryIcon from './CategoryIcon';
import { WhoTag, mutedSmall } from './expenseUi';

/** 露出刪除鈕的寬度 */
const ACTION_W = 52;
/** 超過這個距離才判定是「要刪除」而不是誤觸 */
const THRESHOLD = 24;

interface Props {
  expense: Expense;
  category: ExpenseCategory;
  users: UserProfile[];
  /** 依目前歸屬換算後的金額;各算一半時會是原金額的一半 */
  shownAmount: number;
  onPress: () => void;
  onDelete: () => void;
  /** 隱藏歸屬標記(日曆檢視的明細已經按人篩過了) */
  hideWho?: boolean;
}

const ExpenseRow: React.FC<Props> = ({
  expense,
  category,
  users,
  shownAmount,
  onPress,
  onDelete,
  hideWho,
}) => {
  const translate = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);

  const self = users.find((u) => u.isPrimary) ?? users[0];
  const partner = users.find((u) => u.id !== self?.id) ?? users[1];

  const slideTo = (v: number) => {
    setOpen(v !== 0);
    Animated.spring(translate, { toValue: v, useNativeDriver: true, bounciness: 0 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      // 只在明顯橫向移動時接管,否則整個清單就捲不動了
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => {
        const next = Math.min(0, Math.max(-ACTION_W, g.dx - (openRef.current ? ACTION_W : 0)));
        translate.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const shouldOpen = openRef.current ? g.dx < THRESHOLD : g.dx < -THRESHOLD;
        slideTo(shouldOpen ? -ACTION_W : 0);
      },
    })
  ).current;

  // PanResponder 只建立一次,閉包抓不到最新的 open,用 ref 補上
  const openRef = useRef(open);
  openRef.current = open;

  const sign = expense.kind === 'income' ? '+' : '−';

  return (
    <View style={s.wrap}>
      <TouchableOpacity
        style={s.action}
        onPress={() => {
          slideTo(0);
          onDelete();
        }}
        accessibilityLabel="刪除這筆"
      >
        <Text style={s.actionText}>刪除</Text>
      </TouchableOpacity>

      <Animated.View style={[s.row, { transform: [{ translateX: translate }] }]} {...pan.panHandlers}>
        <TouchableOpacity style={s.inner} onPress={() => (open ? slideTo(0) : onPress())} activeOpacity={0.7}>
          <View style={s.iconBox}>
            <CategoryIcon category={category} size={20} />
          </View>
          <View style={s.mid}>
            <View style={s.titleRow}>
              <Text style={s.title} numberOfLines={1}>
                {expense.note || category.name}
              </Text>
              {!!expense.recurringId && (
                <View style={s.fixedTag}>
                  <Text style={s.fixedTagText}>固定</Text>
                </View>
              )}
            </View>
            <View style={s.metaRow}>
              <Text style={s.meta}>{category.name}</Text>
              {!hideWho && (
                <>
                  <Text style={s.meta}> · </Text>
                  <WhoTag
                    who={expense.who}
                    selfName={self?.name ?? '自己'}
                    partnerName={partner?.name ?? '伴侶'}
                    selfColor={self?.color ?? colors.primary}
                    partnerColor={partner?.color ?? colors.accent}
                  />
                </>
              )}
              <Text style={s.meta}> · {PAYMENT_LABELS[expense.payment]}</Text>
            </View>
          </View>
          <Text style={[s.amount, expense.kind === 'income' && { color: colors.success }]}>
            {sign}
            {formatAmount(shownAmount)}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  action: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_W,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  row: { backgroundColor: colors.card },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  fixedTag: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fixedTagText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  meta: { fontSize: 12, color: mutedSmall },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text },
});

export default ExpenseRow;
