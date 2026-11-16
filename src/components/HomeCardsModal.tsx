/**
 * Home 顯示內容(設計稿 1e)。
 *
 * 開關 + 排序,存進 settings.homeCards。「今日課程」內嵌選擇要看誰的課表,
 * 沿用課表頁頭上那排成員膠囊的樣子。
 *
 * 排序用「↑ ↓」而不是拖曳:拖曳排序要 react-native-gesture-handler,
 * 為了一份六列的清單引入一整套手勢系統(還要重新 prebuild)並不值得。
 */
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { HomeCardPref } from '../types';
import { homeCardMeta, moveItem, normalizeHomeCards } from '../services/navigation';
import { mutedSmall } from './expenseUi';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const HomeCardsModal: React.FC<Props> = ({ visible, onClose }) => {
  const { data, setHomeCards, setHomeCourseOwner } = useApp();
  const defaultOwnerId =
    data.settings.homeCourseOwnerId ?? data.users.find((u) => u.isPrimary)?.id ?? data.users[0]?.id;

  const [cards, setCards] = useState<HomeCardPref[]>(() =>
    normalizeHomeCards(data.settings.homeCards)
  );
  const [courseOwnerId, setCourseOwnerId] = useState(defaultOwnerId);

  /*
   * 每次打開都以目前設定為準:上次關掉時若沒儲存,不該把舊草稿留著。
   * 只看 visible——把 settings 也列進相依會讓「開著的時候設定一變就洗掉草稿」。
   */
  useEffect(() => {
    if (!visible) return;
    setCards(normalizeHomeCards(data.settings.homeCards));
    setCourseOwnerId(defaultOwnerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 課表對象跟卡片一起在「完成」時才寫入,否則按 ✕ 取消時它會偷偷留下來
  const save = () => {
    setHomeCards(cards);
    if (courseOwnerId) setHomeCourseOwner(courseOwnerId);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.title}>Home 顯示內容</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="關閉">
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>用 ↑ ↓ 調整順序；關閉的卡片不會出現在 Home。</Text>

          <ScrollView style={s.list} contentContainerStyle={s.listInner}>
            {cards.map((c, i) => {
              const meta = homeCardMeta(c.key);
              return (
                <View key={c.key} style={[s.row, i > 0 && s.divider]}>
                  <View style={s.arrows}>
                    <TouchableOpacity
                      onPress={() => setCards((cur) => moveItem(cur, i, i - 1))}
                      disabled={i === 0}
                      hitSlop={HIT}
                      accessibilityLabel={`${meta.label} 往上移`}
                    >
                      <Text style={[s.arrow, i === 0 && s.arrowOff]}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setCards((cur) => moveItem(cur, i, i + 1))}
                      disabled={i === cards.length - 1}
                      hitSlop={HIT}
                      accessibilityLabel={`${meta.label} 往下移`}
                    >
                      <Text style={[s.arrow, i === cards.length - 1 && s.arrowOff]}>↓</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.mid}>
                    <Text style={[s.rowTitle, !c.on && s.rowTitleOff]}>{meta.label}</Text>
                    {c.key === 'course' && c.on ? (
                      <View style={s.owners}>
                        {data.users.map((u) => {
                          const on = u.id === courseOwnerId;
                          return (
                            <TouchableOpacity
                              key={u.id}
                              style={[
                                s.ownerChip,
                                { borderColor: u.color },
                                on && { backgroundColor: u.color },
                              ]}
                              onPress={() => setCourseOwnerId(u.id)}
                            >
                              <Text style={[s.ownerText, { color: on ? '#fff' : u.color }]}>
                                {u.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={s.rowDesc}>{meta.description}</Text>
                    )}
                  </View>

                  <Switch
                    value={c.on}
                    onValueChange={(on) =>
                      setCards((cur) => cur.map((x, xi) => (xi === i ? { ...x, on } : x)))
                    }
                    trackColor={{ true: colors.primary, false: '#E9E9EB' }}
                    thumbColor="#fff"
                  />
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={s.primaryBtn} onPress={save}>
            <Text style={s.primaryBtnText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const HIT = { top: 6, bottom: 6, left: 10, right: 10 };

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,43,51,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  hint: { fontSize: 12, lineHeight: 18, color: mutedSmall, marginTop: 6, marginBottom: 12 },

  list: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  listInner: { paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  arrows: { gap: 2 },
  arrow: { fontSize: 15, color: colors.primary, lineHeight: 19 },
  arrowOff: { color: '#C9B8C0' },
  mid: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowTitleOff: { color: mutedSmall },
  rowDesc: { fontSize: 12, color: mutedSmall, marginTop: 2, lineHeight: 17 },
  owners: { flexDirection: 'row', gap: 6, marginTop: 6 },
  ownerChip: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ownerText: { fontSize: 12, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default HomeCardsModal;
