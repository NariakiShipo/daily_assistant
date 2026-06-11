import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CalendarEvent, EVENT_TAGS } from '../types';
import { colors, radius, spacing, tagColor } from '../theme';
import { formatDateZh, isValidTime, isWithin, uid } from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import MiniCalendar from './MiniCalendar';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有事件時傳入;新增時為 null */
  event: CalendarEvent | null;
  /** 新增時的預設日期 */
  defaultDate: string;
}

const EventModal: React.FC<Props> = ({ visible, onClose, event, defaultDate }) => {
  const { data, addEvent, updateEvent, deleteEvent, addCustomTag, removeCustomTag } = useApp();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(''); // 空字串 = 單日行程
  const [dateMode, setDateMode] = useState<'start' | 'end'>('start');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [ownerIds, setOwnerIds] = useState<string[]>([data.users[0]?.id ?? 'u1']);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [syncToGoogle, setSyncToGoogle] = useState(false);

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const customTags = data.settings.customTags ?? [];
  /** 可選標籤 = 預設 + 自訂 + 既有行程已使用的(共享模式下對方建立的也會出現) */
  const allTags = [
    ...new Set([
      ...EVENT_TAGS,
      ...customTags,
      ...data.events.flatMap((e) => e.tags ?? []),
      ...tags,
    ]),
  ];

  const addNewTag = () => {
    const name = newTag.trim();
    if (!name) return;
    if (name.length > 8) return notify('標籤名稱太長', '請用 8 個字以內。');
    if (!allTags.includes(name)) addCustomTag(name);
    if (!tags.includes(name)) setTags((cur) => [...cur, name]);
    setNewTag('');
  };

  const removeCustom = (t: string) => {
    confirmDialog(
      '移除自訂標籤',
      `「${t}」會從可選清單移除,已加在行程上的標籤不受影響。`,
      () => {
        removeCustomTag(t);
        setTags((cur) => cur.filter((x) => x !== t));
      },
      { confirmLabel: '移除', destructive: true }
    );
  };

  useEffect(() => {
    if (!visible) return;
    setDateMode('start');
    if (event) {
      setTitle(event.title);
      setDate(event.date);
      setEndDate(event.endDate ?? '');
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setOwnerIds(event.ownerIds?.length ? event.ownerIds : [event.ownerId]);
      setNotes(event.notes ?? '');
      setTags(event.tags ?? []);
      setSyncToGoogle(!!event.syncToGoogle);
    } else {
      setTitle('');
      setDate(defaultDate);
      setEndDate('');
      setStartTime('09:00');
      setEndTime('10:00');
      setOwnerIds([data.users[0]?.id ?? 'u1']);
      setNotes('');
      setTags([]);
      setNewTag('');
      setSyncToGoogle(false);
    }
  }, [visible, event, defaultDate, data.users]);

  const isMultiDay = !!endDate && endDate !== date;

  const toggleOwner = (id: string) =>
    setOwnerIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const pickDate = (key: string) => {
    if (dateMode === 'start') {
      if (endDate && key > endDate) {
        return notify('開始日期不能晚於結束日期', `目前結束日為 ${formatDateZh(endDate)}。`);
      }
      setDate(key);
    } else {
      if (key < date) {
        return notify('結束日期不能早於開始日期', `目前開始日為 ${formatDateZh(date)}。`);
      }
      setEndDate(key);
    }
  };

  const save = async () => {
    if (!title.trim()) return notify('請輸入標題');
    if (!isValidTime(startTime) || !isValidTime(endTime))
      return notify('時間格式錯誤', '請用 HH:MM(24 小時制)');
    // 跨日行程允許結束時刻早於開始時刻(因為在不同天)
    if (!isMultiDay && endTime <= startTime) return notify('結束時間需晚於開始時間');
    if (ownerIds.length === 0) return notify('請至少選擇一位成員');

    const ev: CalendarEvent = {
      id: event?.id ?? uid(),
      title: title.trim(),
      date,
      endDate: isMultiDay ? endDate : undefined,
      startTime,
      endTime,
      ownerId: ownerIds[0],
      ownerIds,
      createdBy: event?.createdBy ?? data.users[0]?.id ?? 'u1',
      notes: notes.trim() || undefined,
      tags: tags.length ? tags : undefined,
      syncToGoogle,
      googleEventId: event?.googleEventId,
    };
    if (event) await updateEvent(ev);
    else await addEvent(ev);
    onClose();
  };

  const remove = () => {
    if (!event) return;
    confirmDialog(
      '刪除行程',
      `確定刪除「${event.title}」?`,
      () => {
        void deleteEvent(event.id).then(onClose);
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{event ? '編輯行程' : '新增行程'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.label}>標題</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="例如:看牙醫"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>日期(點日曆選擇;長行程可設定結束日期)</Text>
            <View style={s.chips}>
              <Chip
                label={`開始:${formatDateZh(date)}`}
                active={dateMode === 'start'}
                onPress={() => setDateMode('start')}
              />
              <Chip
                label={`結束:${endDate ? formatDateZh(endDate) : '單日'}`}
                active={dateMode === 'end'}
                onPress={() => setDateMode('end')}
              />
              {isMultiDay && (
                <Chip label="改回單日" color={colors.textMuted} onPress={() => setEndDate('')} />
              )}
            </View>
            <MiniCalendar
              selected={dateMode === 'start' ? date : endDate || null}
              onSelect={pickDate}
              getMark={(key) => {
                if (key === date) return { bg: colors.primarySoft, border: colors.primary };
                if (endDate && isWithin(key, date, endDate)) return { bg: colors.primarySoft };
                return undefined;
              }}
            />

            <View style={s.row}>
              <View style={s.half}>
                <Text style={s.label}>開始(HH:MM)</Text>
                <TextInput style={s.input} value={startTime} onChangeText={setStartTime} />
              </View>
              <View style={s.half}>
                <Text style={s.label}>結束(HH:MM)</Text>
                <TextInput style={s.input} value={endTime} onChangeText={setEndTime} />
              </View>
            </View>

            <Text style={s.label}>這是誰的行程?(可複選)</Text>
            <View style={s.chips}>
              {data.users.map((u) => (
                <Chip
                  key={u.id}
                  label={u.name}
                  color={u.color}
                  active={ownerIds.includes(u.id)}
                  onPress={() => toggleOwner(u.id)}
                />
              ))}
            </View>

            <Text style={s.label}>標籤(可複選;長按自訂標籤可移除)</Text>
            <View style={s.chips}>
              {allTags.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  color={tagColor(t)}
                  active={tags.includes(t)}
                  onPress={() => toggleTag(t)}
                  onLongPress={customTags.includes(t) ? () => removeCustom(t) : undefined}
                />
              ))}
            </View>
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={newTag}
                onChangeText={setNewTag}
                placeholder="新增自訂標籤,例如:約會"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={addNewTag}
              />
              <TouchableOpacity style={s.addTagBtn} onPress={addNewTag}>
                <Text style={s.addTagBtnText}>＋ 新增</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>備註</Text>
            <TextInput
              style={[s.input, { height: 64 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <View style={s.switchRow}>
              <Text style={s.label}>同步到 Google 日曆</Text>
              <Switch
                value={syncToGoogle}
                onValueChange={(v) => {
                  if (v && !data.settings.googleConnected) {
                    notify('尚未連接', '請先到「設定」頁連接 Google Calendar。仍會標記此行程待同步。');
                  }
                  setSyncToGoogle(v);
                }}
                trackColor={{ true: colors.primary }}
              />
            </View>

            <Button label={event ? '儲存變更' : '新增行程'} onPress={() => void save()} />
            {event && <Button label="刪除行程" variant="danger" onPress={remove} />}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.textMuted, padding: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: spacing.sm },
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
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  addTagBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  addTagBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});

export default EventModal;
