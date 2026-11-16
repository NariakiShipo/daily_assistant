/**
 * ☰ 側邊選單(設計稿 1d)— 取代原本佔一格分頁的「設定」。
 *
 * 解決兩件事:
 * - 檢視清單第 01 條:設定不該佔掉五分之一的導覽列,而且 6 張卡全塞一頁。
 * - 檢視清單第 10 條:兩人的配對狀態原本埋在設定頁第三張卡,這裡直接放最上面,
 *   一眼就能看出有沒有在同步。
 *
 * 「功能」列出全部模組並標示它在導覽列的位置——沒放進導覽列的功能仍然從這裡進,
 * 所以選常用功能那一步不會讓任何東西真的消失。
 */
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { ModuleKey } from '../types';
import { MODULES, navSlot, normalizeNavModules } from '../services/navigation';
import Icon, { IconName } from './Icon';
import { mutedSmall } from './expenseUi';
import { NavTarget } from './NavBar';
import { SettingsSection } from '../screens/SettingsScreen';

/** 側邊選單可以開的設定子頁 */
export type MenuDestination =
  | { kind: 'settings'; section?: SettingsSection; title: string }
  | { kind: 'expenseSettings' }
  | { kind: 'homeCards' }
  | { kind: 'pickModules' };

interface Props {
  visible: boolean;
  onClose: () => void;
  active: NavTarget;
  onNavigate: (target: NavTarget) => void;
  onOpen: (dest: MenuDestination) => void;
  onReplayTutorial: () => void;
}

const SETTINGS_ROWS: { title: string; hint?: string; dest: MenuDestination }[] = [
  // 第一列進總覽(設計稿 1o),其餘直接落在各自的子頁
  { title: '設定總覽', hint: '全部設定與目前狀態', dest: { kind: 'settings', title: '設定' } },
  { title: '成員與顏色', dest: { kind: 'settings', section: 'members', title: '成員與顏色' } },
  { title: '帳號與雲端同步', dest: { kind: 'settings', section: 'account', title: '帳號與雲端同步' } },
  { title: '共享空間與配對碼', dest: { kind: 'settings', section: 'sharing', title: '共享空間' } },
  { title: 'Google 日曆', dest: { kind: 'settings', section: 'google', title: 'Google 日曆' } },
  { title: '通知', dest: { kind: 'settings', section: 'notifications', title: '通知' } },
  {
    title: '記帳設定',
    hint: '上限・分類・固定支出',
    dest: { kind: 'expenseSettings' },
  },
  { title: 'Home 顯示內容', dest: { kind: 'homeCards' } },
  { title: '導覽列功能', hint: '重新選要放哪幾個', dest: { kind: 'pickModules' } },
  { title: '資料備份與還原', dest: { kind: 'settings', section: 'data', title: '資料備份與還原' } },
  { title: '開發者選項', dest: { kind: 'settings', section: 'developer', title: '開發者選項' } },
];

const SideMenu: React.FC<Props> = ({
  visible,
  onClose,
  active,
  onNavigate,
  onOpen,
  onReplayTutorial,
}) => {
  const { data, shared, authUser } = useApp();
  const modules = normalizeNavModules(data.settings.navModules);
  const spaceId = data.settings.spaceId;

  const go = (target: NavTarget) => {
    onClose();
    onNavigate(target);
  };

  const open = (dest: MenuDestination) => {
    onClose();
    onOpen(dest);
  };

  /** 同步狀態一行講完:有沒有在共享、配對碼是什麼、或還是本機模式 */
  const syncLine = shared && spaceId
    ? `共享空間已同步 · ${spaceId}`
    : authUser
      ? `已登入 ${authUser.email ?? ''}`.trim()
      : '本機模式 · 尚未與伴侶配對';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.root}>
        {/* 點遮罩關閉;用 Pressable 而不是 TouchableOpacity,才不會有淡出的閃動 */}
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="關閉選單" />
        <View style={s.panel}>
          <View style={s.headerBlock}>
            <View style={s.avatars}>
              {data.users.slice(0, 2).map((u, i) => (
                <View
                  key={u.id}
                  style={[s.avatar, { backgroundColor: u.color }, i > 0 && s.avatarOverlap]}
                >
                  <Text style={s.avatarText}>{u.name.slice(0, 1)}</Text>
                </View>
              ))}
            </View>
            <View style={s.flex}>
              <Text style={s.names} numberOfLines={1}>
                {data.users.map((u) => u.name).join(' & ')}
              </Text>
              <View style={s.syncRow}>
                <View style={[s.dot, { backgroundColor: shared ? colors.success : '#C9B8C0' }]} />
                <Text style={s.syncText} numberOfLines={1}>
                  {syncLine}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            <Text style={s.groupLabel}>功能</Text>

            <TouchableOpacity style={s.row} onPress={() => go('home')}>
              <Icon
                name="house"
                size={20}
                color={active === 'home' ? colors.primary : colors.text}
              />
              <Text style={[s.rowLabel, active === 'home' && s.rowLabelOn]}>Home</Text>
            </TouchableOpacity>

            {MODULES.map((m) => {
              const slot = navSlot(modules, m.key as ModuleKey);
              const on = active === m.key;
              return (
                <TouchableOpacity key={m.key} style={s.row} onPress={() => go(m.key)}>
                  <Icon
                    name={m.icon as IconName}
                    size={20}
                    color={on ? colors.primary : colors.text}
                  />
                  <Text style={[s.rowLabel, on && s.rowLabelOn]}>{m.label}</Text>
                  {slot > 0 ? (
                    <View style={s.slotTag}>
                      <Text style={s.slotTagText}>導覽列 {slot}</Text>
                    </View>
                  ) : (
                    <View style={[s.slotTag, s.slotTagOff]}>
                      <Text style={[s.slotTagText, s.slotTagTextOff]}>只在選單</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            <Text style={[s.groupLabel, s.groupLabelDivided]}>設定</Text>
            {SETTINGS_ROWS.map((r) => (
              <TouchableOpacity key={r.title} style={s.settingRow} onPress={() => open(r.dest)}>
                <Text style={s.settingText}>
                  {r.title}
                  {!!r.hint && <Text style={s.settingHint}> {r.hint}</Text>}
                </Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.footer}>
            <Text style={s.version}>Daily Bear</Text>
            <TouchableOpacity
              onPress={() => {
                onClose();
                onReplayTutorial();
              }}
            >
              <Text style={s.replay}>重看使用教學</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(61,43,51,0.38)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 304,
    maxWidth: '86%',
    backgroundColor: colors.background,
    paddingTop: 70,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 8, height: 0 },
    elevation: 16,
  },
  flex: { flex: 1 },

  headerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarOverlap: { marginLeft: -10 },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  names: { fontSize: 16, fontWeight: '700', color: colors.text },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  syncText: { fontSize: 12, color: mutedSmall, flex: 1 },

  scroll: { paddingBottom: spacing.md },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: mutedSmall,
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  groupLabelDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: 16,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 44 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  rowLabelOn: { color: colors.primary, fontWeight: '700' },
  slotTag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  slotTagOff: { borderStyle: 'dashed' },
  slotTagText: { fontSize: 10, fontWeight: '700', color: mutedSmall },
  slotTagTextOff: { color: '#C9B8C0' },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 42,
  },
  settingText: { flex: 1, fontSize: 15, color: colors.text },
  settingHint: { fontSize: 12, color: mutedSmall },
  chevron: { fontSize: 18, color: '#C9B8C0' },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  version: { fontSize: 12, color: mutedSmall },
  replay: { fontSize: 12, fontWeight: '600', color: colors.primary },
});

export default SideMenu;
