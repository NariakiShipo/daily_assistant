/**
 * 分類管理(設計稿 4f,含 1j 的 Emoji / 上傳圖片與 2a 的裁切)。
 *
 * 照「簡單記帳」的做法:支出 / 收入分開、點一下編輯、長按調整順序。
 * 預設分類只能隱藏不能刪除——刪掉的話舊帳目會失去分類,兩人回頭看帳就對不上。
 * 自訂分類可以刪,但刪除時一定要指定把舊帳目移到哪一個分類。
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { EXPENSE_CATEGORY_COLORS, ExpenseCategory, ExpenseKind } from '../types';
import { uid } from '../utils/date';
import { selectableCategories } from '../services/expenses';
import { confirmDialog, notify } from '../utils/dialog';
import CategoryIcon from '../components/CategoryIcon';
import Icon, { ICON_PREVIEW_COUNT, IconName, PICKABLE_ICONS } from '../components/Icon';
import ImageCropModal, { PickedImage } from '../components/ImageCropModal';
import { ScreenHeader, Segmented, mutedSmall } from '../components/expenseUi';

/** 名稱上限:超過這個長度在 4 欄的格子裡就會被截掉 */
const NAME_MAX = 8;

interface Props {
  onBack: () => void;
}

type Draft = {
  id?: string;
  name: string;
  icon?: string;
  emoji?: string;
  imageUri?: string;
  color: string;
  builtin: boolean;
};

const ExpenseCategoryScreen: React.FC<Props> = ({ onBack }) => {
  const { data, saveExpenseCategory, deleteExpenseCategory, setCategoryHidden, reorderExpenseCategories } =
    useApp();

  const [kind, setKind] = useState<ExpenseKind>('expense');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showAllIcons, setShowAllIcons] = useState(false);
  const [emojiInput, setEmojiInput] = useState('');
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [cropping, setCropping] = useState(false);

  /** 編輯模式要看得到已隱藏的分類,否則沒辦法把它們放回來 */
  const list = useMemo(
    () =>
      data.expenseCategories
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.order - b.order)
        .filter((c) => editing || !c.hidden),
    [data.expenseCategories, kind, editing]
  );

  const counts = useMemo(
    () => ({
      expense: selectableCategories(data.expenseCategories, 'expense').length,
      income: selectableCategories(data.expenseCategories, 'income').length,
    }),
    [data.expenseCategories]
  );

  const openNew = () => {
    setDraft({
      name: '',
      icon: 'gym',
      color: EXPENSE_CATEGORY_COLORS[Math.floor(Math.random() * EXPENSE_CATEGORY_COLORS.length)],
      builtin: false,
    });
    setEmojiInput('');
    setShowAllIcons(false);
  };

  const openEdit = (c: ExpenseCategory) => {
    setDraft({
      id: c.id,
      name: c.name,
      icon: c.icon,
      emoji: c.emoji,
      imageUri: c.imageUri,
      color: c.color,
      builtin: c.builtin,
    });
    setEmojiInput(c.emoji ?? '');
    setShowAllIcons(false);
  };

  /** 長按:跟前一個交換順序。真正的拖曳排序需要手勢庫,交換已經能重排且不需新依賴 */
  const moveEarlier = (c: ExpenseCategory) => {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(c.id);
    if (i <= 0) return;
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    reorderExpenseCategories(kind, ids);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('需要相簿權限', '要上傳分類圖片,請先在系統設定裡允許存取相簿。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 });
    setCropping(true);
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      notify('請先填分類名稱');
      return;
    }
    const existing = draft.id ? data.expenseCategories.find((c) => c.id === draft.id) : undefined;
    const maxOrder = Math.max(
      -1,
      ...data.expenseCategories.filter((c) => c.kind === kind).map((c) => c.order)
    );
    saveExpenseCategory({
      id: draft.id ?? uid(),
      name: name.slice(0, NAME_MAX),
      kind: existing?.kind ?? kind,
      // 三種圖示互斥:選了哪一種就把另外兩種清掉,否則顯示順序會變成隱藏規則
      icon: draft.imageUri || draft.emoji ? undefined : draft.icon ?? 'more',
      emoji: draft.imageUri ? undefined : draft.emoji,
      imageUri: draft.imageUri,
      color: draft.color,
      builtin: existing?.builtin ?? false,
      hidden: existing?.hidden,
      order: existing?.order ?? maxOrder + 1,
    });
    setDraft(null);
  };

  const remove = (c: ExpenseCategory) => {
    const fallback = selectableCategories(data.expenseCategories, c.kind).find((x) => x.id !== c.id);
    if (!fallback) {
      notify('不能刪除最後一個分類', '至少要留一個分類,帳目才有地方掛。');
      return;
    }
    confirmDialog(
      `刪除「${c.name}」?`,
      `這個分類底下的帳目會改掛到「${fallback.name}」,金額不會變。`,
      () => {
        deleteExpenseCategory(c.id, fallback.id);
        setDraft(null);
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  const icons = showAllIcons ? PICKABLE_ICONS : PICKABLE_ICONS.slice(0, ICON_PREVIEW_COUNT - 1);

  return (
    <View style={s.root}>
      <ScreenHeader
        title="分類"
        onBack={onBack}
        actionText={{ label: editing ? '完成' : '編輯', onPress: () => setEditing((v) => !v) }}
      />

      <Segmented<ExpenseKind>
        style={s.seg}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: `支出 · ${counts.expense}`, color: colors.primary },
          { value: 'income', label: `收入 · ${counts.income}`, color: colors.success },
        ]}
      />
      <Text style={s.hint}>{editing ? '點一下編輯 · 長按往前移一格' : '點一下編輯'}</Text>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.grid}>
          {list.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.cell, c.hidden && s.cellHidden]}
              onPress={() => openEdit(c)}
              onLongPress={() => moveEarlier(c)}
            >
              {editing && !c.builtin && (
                <TouchableOpacity style={s.removeBadge} onPress={() => remove(c)} accessibilityLabel={`刪除 ${c.name}`}>
                  <Text style={s.removeBadgeText}>✕</Text>
                </TouchableOpacity>
              )}
              {editing && c.builtin && (
                <TouchableOpacity
                  style={[s.removeBadge, s.hideBadge]}
                  onPress={() => setCategoryHidden(c.id, !c.hidden)}
                  accessibilityLabel={c.hidden ? `顯示 ${c.name}` : `隱藏 ${c.name}`}
                >
                  <Text style={s.removeBadgeText}>{c.hidden ? '＋' : '－'}</Text>
                </TouchableOpacity>
              )}
              <CategoryIcon category={c} size={24} />
              <Text style={s.cellText} numberOfLines={1}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.cell, s.cellNew]} onPress={openNew}>
            <Icon name="plus" size={22} color={colors.primary} />
            <Text style={[s.cellText, { color: colors.primary }]}>新增</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.footnote}>
          預設分類可隱藏、不可刪除,舊帳目才不會失去分類;自訂分類可改名、換圖、刪除。
        </Text>
      </ScrollView>

      {/* 新增 / 編輯分類 */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={s.backdrop}>
          <ScrollView style={s.sheet} contentContainerStyle={s.sheetInner}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{draft?.id ? '編輯分類' : '新增分類'}</Text>
              <TouchableOpacity onPress={() => setDraft(null)} accessibilityLabel="關閉">
                <Text style={s.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>名稱（{NAME_MAX} 字以內）</Text>
            <TextInput
              style={s.input}
              value={draft?.name ?? ''}
              onChangeText={(t) => setDraft((d) => (d ? { ...d, name: t.slice(0, NAME_MAX) } : d))}
              placeholder="例如 健身"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>圖示：選一個、用 Emoji，或上傳自己的圖片</Text>
            <View style={s.iconArea}>
              <View style={s.iconGrid}>
                {icons.map((n) => {
                  const on = draft?.icon === n && !draft?.emoji && !draft?.imageUri;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[s.iconCell, on && s.iconCellOn]}
                      onPress={() =>
                        setDraft((d) => (d ? { ...d, icon: n, emoji: undefined, imageUri: undefined } : d))
                      }
                    >
                      <Icon name={n as IconName} size={20} color={on ? colors.primary : colors.text} />
                    </TouchableOpacity>
                  );
                })}
                {!showAllIcons && (
                  <TouchableOpacity style={s.iconCell} onPress={() => setShowAllIcons(true)}>
                    <Text style={s.moreText}>更多</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[s.uploadCard, !!draft?.imageUri && s.uploadCardOn]}
                onPress={() => void pickImage()}
              >
                <View style={s.uploadSlot}>
                  {draft?.imageUri ? (
                    <CategoryIcon
                      category={{
                        id: 'preview',
                        name: '',
                        kind,
                        color: draft.color,
                        builtin: false,
                        order: 0,
                        imageUri: draft.imageUri,
                      }}
                      size={64}
                    />
                  ) : (
                    <Icon name="upload" size={26} color={colors.primary} />
                  )}
                </View>
                <Text style={s.uploadTitle}>{draft?.imageUri ? '換一張' : '上傳圖片'}</Text>
                <Text style={s.uploadHint}>正方形 ≥ 256 px{'\n'}可拖曳調整位置</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>或直接貼一個 Emoji</Text>
            <TextInput
              style={[s.input, s.emojiInput]}
              value={emojiInput}
              onChangeText={(t) => {
                // 只留第一個字元:貼進一整串會在格子裡擠成一團
                const e = [...t][0] ?? '';
                setEmojiInput(e);
                setDraft((d) => (d ? { ...d, emoji: e || undefined, imageUri: e ? undefined : d.imageUri } : d));
              }}
              placeholder="🏋️"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>顏色（圓餅與排行用）</Text>
            <View style={s.colorRow}>
              {EXPENSE_CATEGORY_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.swatch, { backgroundColor: c }, draft?.color === c && s.swatchOn]}
                  onPress={() => setDraft((d) => (d ? { ...d, color: c } : d))}
                  accessibilityLabel={`顏色 ${c}`}
                />
              ))}
            </View>

            <TouchableOpacity style={s.primaryBtn} onPress={save}>
              <Text style={s.primaryBtnText}>{draft?.id ? '儲存' : '建立分類'}</Text>
            </TouchableOpacity>

            {!!draft?.id && !draft.builtin && (
              <TouchableOpacity
                style={s.dangerBtn}
                onPress={() => {
                  const c = data.expenseCategories.find((x) => x.id === draft.id);
                  if (c) remove(c);
                }}
              >
                <Text style={s.dangerBtnText}>刪除這個分類</Text>
              </TouchableOpacity>
            )}
            {!!draft?.id && draft.builtin && (
              <Text style={s.builtinNote}>預設分類不能刪除,可以在「編輯」裡把它隱藏起來。</Text>
            )}
          </ScrollView>

          {/*
           * 裁切視窗放在這裡而不是跟「新增分類」並排:iOS 上同一層的第二個 Modal
           * 會被已經呈現的第一個擋住而不顯示,巢狀在裡面才會浮上來。
           */}
          <ImageCropModal
            visible={cropping}
            image={picked}
            onCancel={() => setCropping(false)}
            onRepick={() => {
              setCropping(false);
              void pickImage();
            }}
            onDone={(uri) => {
              setDraft((d) => (d ? { ...d, imageUri: uri, emoji: undefined, icon: undefined } : d));
              setCropping(false);
            }}
          />
        </View>
      </Modal>

    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  seg: { marginHorizontal: spacing.lg, marginBottom: 6 },
  hint: { textAlign: 'center', fontSize: 12, color: mutedSmall, paddingBottom: spacing.sm },
  scroll: { paddingBottom: spacing.xl },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg },
  cell: {
    width: '23%',
    height: 70,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  cellHidden: { opacity: 0.4 },
  cellNew: { backgroundColor: colors.background, borderStyle: 'dashed', borderColor: colors.primary },
  cellText: { fontSize: 12, fontWeight: '600', color: colors.text, paddingHorizontal: 2 },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  hideBadge: { backgroundColor: colors.textMuted },
  removeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    color: mutedSmall,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(61,43,51,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
  },
  sheetInner: { padding: spacing.lg, paddingBottom: 40 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  sheetClose: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },

  label: { fontSize: 13, fontWeight: '600', color: mutedSmall, marginTop: spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  emojiInput: { fontSize: 22, textAlign: 'center' },

  iconArea: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  iconGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    alignContent: 'flex-start',
  },
  iconCell: {
    width: '22%',
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellOn: { backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  moreText: { fontSize: 12, fontWeight: '700', color: mutedSmall },

  uploadCard: {
    width: 112,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 6,
  },
  uploadCardOn: { borderWidth: 1.5, borderColor: colors.primary },
  uploadSlot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadTitle: { fontSize: 12, fontWeight: '700', color: colors.primary },
  uploadHint: { fontSize: 10, lineHeight: 14, color: mutedSmall, textAlign: 'center' },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 2, borderColor: colors.text, transform: [{ scale: 1.12 }] },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerBtn: { alignItems: 'center', paddingVertical: spacing.md },
  dangerBtnText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  builtinNote: { fontSize: 12, color: mutedSmall, textAlign: 'center', paddingTop: spacing.md, lineHeight: 18 },
});

export default ExpenseCategoryScreen;
