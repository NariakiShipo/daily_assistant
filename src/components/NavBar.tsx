/**
 * 底部導覽列:左右各最多兩個模組,中間固定一顆突出的 Home。
 *
 * 選常用功能那一頁也用同一個元件當預覽(preview),所見即所得——
 * 預覽如果只是長得像,使用者選完之後看到真的導覽列還是會有落差。
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme';
import { ModuleKey } from '../types';
import Icon, { IconName } from './Icon';
import { moduleMeta, splitNav } from '../services/navigation';

/** 目前停在哪一格;'home' 是中央那顆 */
export type NavTarget = ModuleKey | 'home';

interface Props {
  modules: ModuleKey[];
  active: NavTarget;
  onSelect: (target: NavTarget) => void;
  /** 預覽模式:縮小、不可點,用在「選常用功能」那一頁 */
  preview?: boolean;
  /** 教學打光要知道 Home 鈕在螢幕上的位置 */
  onHomeLayout?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

const NavBar: React.FC<Props> = ({ modules, active, onSelect, preview, onHomeLayout }) => {
  const { left, right } = splitNav(modules);

  const item = (key: ModuleKey) => {
    const meta = moduleMeta(key);
    const on = active === key;
    return (
      <TouchableOpacity
        key={key}
        style={s.item}
        onPress={() => onSelect(key)}
        disabled={preview}
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: on }}
      >
        <Icon
          name={meta.icon as IconName}
          size={preview ? 20 : 22}
          color={on ? colors.primary : '#9B8590'}
          strokeWidth={on ? 2 : 1.8}
        />
        <Text style={[s.label, preview && s.labelSm, on && s.labelOn]}>{meta.label}</Text>
      </TouchableOpacity>
    );
  };

  const homeOn = active === 'home';
  const size = preview ? 40 : 56;

  return (
    <View style={[s.bar, preview && s.barPreview]}>
      {left.map(item)}
      <View style={[s.item, s.homeItem, { marginTop: preview ? -18 : -26 }]}>
        <TouchableOpacity
          style={[
            s.homeBtn,
            { width: size, height: size, borderRadius: size / 2 },
            homeOn ? s.homeBtnOn : s.homeBtnOff,
          ]}
          onPress={() => onSelect('home')}
          disabled={preview}
          accessibilityLabel="Home"
          accessibilityState={{ selected: homeOn }}
          onLayout={(e) => {
            if (!onHomeLayout) return;
            // measureInWindow 才拿得到螢幕絕對座標;onLayout 給的是相對於父層的
            e.currentTarget.measureInWindow((x, y, width, height) =>
              onHomeLayout({ x, y, width, height })
            );
          }}
        >
          <Icon
            name="house"
            size={preview ? 20 : 26}
            color={homeOn ? '#fff' : '#9B8590'}
            strokeWidth={2}
          />
        </TouchableOpacity>
        <Text style={[s.label, preview && s.labelSm, homeOn && s.labelOn]}>Home</Text>
      </View>
      {right.map(item)}
    </View>
  );
};

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
  },
  barPreview: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6 },
  homeItem: { gap: 4, paddingVertical: 0 },
  homeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  // 選中時是全 App 唯一的實心圓鈕,跟各頁右下的 ＋ FAB 不會搞混(那顆在右下角)
  homeBtnOn: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  homeBtnOff: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  label: { fontSize: 11, color: '#7A6570' },
  labelSm: { fontSize: 10 },
  labelOn: { color: colors.primary, fontWeight: '700' },
});

export default NavBar;
