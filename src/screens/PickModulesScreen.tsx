/**
 * 選擇常用功能(設計稿 1b)— 登入之後只出現一次。
 *
 * 目前剛好有 4 個模組,所以這一步實際上是在決定「左右順序」;
 * 之後新增模組時,這裡才會真的變成「哪 4 個要放進導覽列」。
 * 點選的先後 = 導覽列上由左到右的位置,取消再點就是排到最後。
 *
 * 沒放進導覽列的功能不會消失,都還在左上的 ☰ 側邊選單裡——
 * 這件事在畫面上直接寫出來,不然使用者不敢不選。
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { MAX_NAV_MODULES, ModuleKey } from '../types';
import { MODULES, normalizeNavModules } from '../services/navigation';
import Icon, { IconName } from '../components/Icon';
import NavBar from '../components/NavBar';
import { mutedSmall } from '../components/expenseUi';

interface Props {
  /** 目前的設定(重新設定時帶進來) */
  initial?: ModuleKey[];
  onDone: (modules: ModuleKey[]) => void;
  /** 從側邊選單進來重新設定時給返回鍵;首次設定時沒有 */
  onBack?: () => void;
}

const PickModulesScreen: React.FC<Props> = ({ initial, onDone, onBack }) => {
  const [picked, setPicked] = useState<ModuleKey[]>(() => normalizeNavModules(initial));

  const toggle = (key: ModuleKey) => {
    setPicked((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      // 已經滿了就不再加:靜默忽略比彈一個對話框打斷選擇來得好,
      // 畫面上的「已選 n / 4」會說明為什麼點不動
      if (cur.length >= MAX_NAV_MODULES) return cur;
      return [...cur, key];
    });
  };

  /* 一個都沒選時導覽列只剩 Home,等於把功能全藏進側邊選單——擋住這種情況 */
  const canContinue = picked.length > 0;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.head}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={s.backBtn} accessibilityLabel="返回">
              <Icon name="back" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <Text style={s.step}>步驟 2 / 2</Text>
          )}
          <Text style={s.title}>選 {MAX_NAV_MODULES} 個常用功能</Text>
          <Text style={s.lede}>
            放進底部導覽列，Home 固定在中間。之後可以在側邊選單更改。
          </Text>
        </View>

        <View style={s.grid}>
          {MODULES.map((m) => {
            const order = picked.indexOf(m.key) + 1;
            const on = order > 0;
            return (
              <TouchableOpacity
                key={m.key}
                style={[s.card, on && s.cardOn]}
                onPress={() => toggle(m.key)}
                accessibilityState={{ selected: on }}
              >
                {on && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{order}</Text>
                  </View>
                )}
                <View style={[s.cardIcon, on && s.cardIconOn]}>
                  <Icon
                    name={m.icon as IconName}
                    size={24}
                    color={on ? colors.primary : mutedSmall}
                  />
                </View>
                <View style={s.cardTitleRow}>
                  <Text style={s.cardTitle}>{m.label}</Text>
                  {m.isNew && (
                    <View style={s.newTag}>
                      <Text style={s.newTagText}>新</Text>
                    </View>
                  )}
                </View>
                <Text style={s.cardDesc}>{m.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.previewLabel}>導覽列預覽</Text>
        <View style={s.previewWrap}>
          <NavBar modules={picked} active="home" onSelect={() => undefined} preview />
        </View>

        <Text style={s.hint}>
          已選 {picked.length} / {MAX_NAV_MODULES}。點一下取消勾選；點選順序 = 左到右的位置。
          沒放進導覽列的功能仍然在左上的 ☰ 選單裡，不會不見。
        </Text>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.primaryBtn, !canContinue && s.disabled]}
          onPress={() => onDone(picked)}
          disabled={!canContinue}
        >
          <Text style={s.primaryBtnText}>{onBack ? '儲存' : '開始使用'}</Text>
        </TouchableOpacity>
        {!canContinue && <Text style={s.footerHint}>至少選一個功能。</Text>}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg + 4, paddingTop: spacing.xl },

  head: { paddingTop: 28, paddingBottom: 18 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  step: { fontSize: 12, fontWeight: '700', color: colors.primary, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 4 },
  lede: { fontSize: 14, lineHeight: 21, color: mutedSmall, marginTop: 6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 8,
  },
  cardOn: { borderWidth: 1.5, borderColor: colors.primary },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconOn: { backgroundColor: colors.primarySoft },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  newTag: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newTagText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  cardDesc: { fontSize: 12, lineHeight: 17, color: mutedSmall },

  previewLabel: { fontSize: 12, fontWeight: '700', color: mutedSmall, marginTop: 22 },
  previewWrap: { marginTop: 8 },
  hint: { fontSize: 12, lineHeight: 18, color: mutedSmall, marginTop: 10 },

  footer: { paddingHorizontal: spacing.lg + 4, paddingTop: spacing.md, paddingBottom: 44 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  footerHint: { fontSize: 12, color: mutedSmall, textAlign: 'center', marginTop: 6 },
});

export default PickModulesScreen;
