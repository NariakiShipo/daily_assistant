import React, { useEffect, useRef, useState } from 'react';
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
import {
  CalendarEvent,
  EVENT_TAGS,
  EventPriority,
  PRIORITY_OPTIONS,
  RECURRENCE_LABELS,
  RECURRENCE_OPTIONS,
  REMIND_OPTIONS,
  RecurrenceFreq,
} from '../types';
import { colors, priorityColors, radius, spacing, tagColor } from '../theme';
import {
  formatDateZh,
  isValidTime,
  isWithin,
  minutesToTime,
  timeToMinutes,
  uid,
} from '../utils/date';
import { confirmDialog, notify } from '../utils/dialog';
import { useApp } from '../store/AppContext';
import { findEventClashes } from '../services/conflicts';
import { EventInstance, excludeOccurrence, findSeries, isInstance } from '../services/recurrence';
import { detectConflict, stampFrom } from '../services/editConflict';
import { Button, Chip } from './ui';
import MiniCalendar from './MiniCalendar';
import TimeField from './TimeField';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有事件時傳入(可能是重複行程展開出的實例);新增時為 null */
  event: EventInstance | null;
  /** 新增時的預設日期 */
  defaultDate: string;
}

const EventModal: React.FC<Props> = ({ visible, onClose, event, defaultDate }) => {
  const { data, addEvent, updateEvent, deleteEvent, addCustomTag, removeCustomTag } = useApp();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(''); // 空字串 = 單日行程
  /** 日曆目前在挑哪個日期:開始日 / 跨日行程的結束日 / 重複的結束日 */
  const [dateMode, setDateMode] = useState<'start' | 'end' | 'until'>('start');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [ownerIds, setOwnerIds] = useState<string[]>([data.users[0]?.id ?? 'u1']);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<EventPriority | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [syncToGoogle, setSyncToGoogle] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFreq | null>(null);
  const [until, setUntil] = useState(''); // 空字串 = 無限期重複
  const [remind, setRemind] = useState<number | null>(null); // null = 不提醒
  const [allDay, setAllDay] = useState(false);

  /**
   * 傳進來的可能是展開出的實例;編輯一律針對原始行程(整個系列),
   * 只有「刪除這一次」才會用到 event.date 這個單次日期。
   */
  const series = event ? (findSeries(data.events, event) ?? event) : null;
  const editingOccurrence = !!event && isInstance(event);

  /**
   * 開啟編輯視窗那一刻的版本時間戳。存檔時拿它跟 store 裡的最新版比對,
   * 就知道對方有沒有在我編輯期間動過同一筆。用 ref 是因為它不該觸發重繪,
   * 而且必須是「開啟當下」的快照——Firestore 訂閱會即時更新 data.events。
   */
  const baselineUpdatedAt = useRef<number | undefined>(undefined);

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
    // 記下開啟當下的版本,之後才比對得出「編輯期間對方改了什麼」
    baselineUpdatedAt.current = series?.updatedAt;
    if (series) {
      setTitle(series.title);
      setDate(series.date);
      setEndDate(series.endDate ?? '');
      setStartTime(series.startTime);
      setEndTime(series.endTime);
      setOwnerIds(series.ownerIds?.length ? series.ownerIds : [series.ownerId]);
      setNotes(series.notes ?? '');
      setPriority(series.priority ?? null);
      setTags(series.tags ?? []);
      setSyncToGoogle(!!series.syncToGoogle);
      setFreq(series.recurrence?.freq ?? null);
      setUntil(series.recurrence?.until ?? '');
      setRemind(series.remindMinutesBefore ?? null);
      setAllDay(!!series.allDay);
    } else {
      setTitle('');
      setDate(defaultDate);
      setEndDate('');
      setStartTime('09:00');
      setEndTime('10:00');
      setOwnerIds([data.users[0]?.id ?? 'u1']);
      setNotes('');
      setPriority(null);
      setTags([]);
      setNewTag('');
      setSyncToGoogle(false);
      setFreq(null);
      setUntil('');
      setRemind(null);
      setAllDay(false);
    }
    // series 由 event 推導,依 event 變動即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, event, defaultDate, data.users]);

  const isMultiDay = !!endDate && endDate !== date;

  /** 改開始時間時,結束時間跟著平移、維持原本時長(預設一小時) */
  const changeStartTime = (t: string) => {
    setStartTime(t);
    if (isMultiDay) return; // 跨日行程的結束時刻在不同天,不聯動
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    setEndTime(minutesToTime(timeToMinutes(t) + (duration > 0 ? duration : 60)));
  };

  const toggleOwner = (id: string) =>
    setOwnerIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const pickDate = (key: string) => {
    if (dateMode === 'until') {
      if (key < date) {
        return notify('重複結束日不能早於開始日', `目前開始日為 ${formatDateZh(date)}。`);
      }
      return setUntil(key);
    }
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
    if (!allDay) {
      if (!isValidTime(startTime) || !isValidTime(endTime))
        return notify('時間格式錯誤', '請用 HH:MM(24 小時制)');
      // 跨日行程允許結束時刻早於開始時刻(因為在不同天)
      if (!isMultiDay && endTime <= startTime) return notify('結束時間需晚於開始時間');
    }
    if (ownerIds.length === 0) return notify('請至少選擇一位成員');

    if (until && until < date) {
      return notify('重複結束日不能早於開始日', `目前開始日為 ${formatDateZh(date)}。`);
    }

    const ev: CalendarEvent = {
      id: series?.id ?? uid(),
      title: title.trim(),
      date,
      endDate: isMultiDay ? endDate : undefined,
      // 整天事項固定存 00:00–23:59:排序時自然排在當天最前面,舊資料格式也不變
      startTime: allDay ? '00:00' : startTime,
      endTime: allDay ? '23:59' : endTime,
      allDay: allDay || undefined,
      ownerId: ownerIds[0],
      ownerIds,
      createdBy: series?.createdBy ?? data.users[0]?.id ?? 'u1',
      notes: notes.trim() || undefined,
      priority: priority ?? undefined,
      tags: tags.length ? tags : undefined,
      syncToGoogle,
      googleEventId: series?.googleEventId,
      recurrence: freq
        ? {
            freq,
            until: until || undefined,
            // 沿用既有的單次例外;改頻率時清掉(舊日期對新頻率沒有意義)
            exceptions:
              series?.recurrence?.freq === freq ? series.recurrence.exceptions : undefined,
          }
        : undefined,
      // 取消重複時,逐次完成狀態一併作廢
      doneDates: freq ? series?.doneDates : undefined,
      remindMinutesBefore: remind ?? undefined,
    };

    const nameOfUser = (id: string) => data.users.find((u) => u.id === id)?.name ?? '?';

    const write = async (toSave: CalendarEvent) => {
      if (series) await updateEvent(toSave);
      else await addEvent(toSave);
      onClose();
    };

    /**
     * 存檔前檢查對方有沒有在我編輯期間動過同一筆。
     * Firestore 是 last-write-wins,不檢查的話對方的修改會被靜默蓋掉。
     */
    const persist = async () => {
      const current = series ? data.events.find((e) => e.id === series.id) : undefined;
      const conflict = detectConflict(ev, baselineUpdatedAt.current, current, nameOfUser);

      if (conflict.kind === 'none') return write(ev);

      if (conflict.kind === 'deleted') {
        return confirmDialog(
          '對方已刪除這個行程',
          `你編輯的期間,「${ev.title}」已被刪除。\n\n要以你的版本重新建立嗎?`,
          () => void write(ev),
          { confirmLabel: '重新建立' }
        );
      }

      const lines = conflict.diffs
        .slice(0, 5)
        .map((d) => `・${d.label}:對方「${d.theirs}」/ 你「${d.mine}」`);
      const more = conflict.diffs.length > 5 ? `\n…共 ${conflict.diffs.length} 處不同` : '';
      const who = conflict.theirs?.updatedBy ? nameOfUser(conflict.theirs.updatedBy) : '對方';
      confirmDialog(
        '對方也改了這個行程',
        `${who}在你編輯期間改過「${ev.title}」:\n\n${lines.join('\n')}${more}\n\n` +
          '要用你的版本覆蓋嗎?選「保留對方的」則放棄你這次的修改。',
        // 覆蓋時帶上對方的時間戳,否則下次存檔又會被判定成衝突
        () => void write(stampFrom(ev, conflict.theirs)),
        { confirmLabel: '用我的覆蓋', cancelLabel: '保留對方的', destructive: true }
      );
    };

    // 與課表時段重疊 → 提醒(仍可堅持儲存)
    const clashes = findEventClashes(ev, data.courses, data.semesters);
    if (clashes.length) {
      const lines = clashes
        .slice(0, 3)
        .map(
          (c) =>
            `${formatDateZh(c.date)} 「${c.slot.course.title}」` +
            `${minutesToTime(c.slot.startMin)}–${minutesToTime(c.slot.endMin)}(${nameOfUser(c.ownerId)}的課)`
        );
      const more = clashes.length > 3 ? `\n…共 ${clashes.length} 處重疊` : '';
      confirmDialog(
        '與課表時間重疊',
        `${lines.join('\n')}${more}\n\n仍要儲存這個行程嗎?`,
        () => void persist(),
        { confirmLabel: '仍要儲存' }
      );
      return;
    }
    await persist();
  };

  /** 刪除整個行程(重複行程 = 所有次數) */
  const remove = () => {
    if (!series) return;
    confirmDialog(
      series.recurrence ? '刪除整個重複行程' : '刪除行程',
      series.recurrence
        ? `「${series.title}」的所有重複都會被刪除,確定嗎?`
        : `確定刪除「${series.title}」?`,
      () => {
        void deleteEvent(series.id).then(onClose);
      },
      { confirmLabel: '刪除', destructive: true }
    );
  };

  /** 只跳過重複行程的這一次(其餘照常發生) */
  const removeThisOccurrence = () => {
    if (!series || !event) return;
    confirmDialog(
      '只刪除這一次',
      `${formatDateZh(event.date)} 的「${series.title}」會被跳過,其他日期不受影響。`,
      () => {
        const updated = excludeOccurrence(series, event.date);
        if (updated) void updateEvent(updated).then(onClose);
      },
      { confirmLabel: '跳過這次', destructive: true }
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
            <Text style={s.headerTitle}>
              {series ? (series.recurrence ? '編輯重複行程' : '編輯行程') : '新增行程'}
            </Text>
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
              selected={
                dateMode === 'start' ? date : dateMode === 'until' ? until || null : endDate || null
              }
              onSelect={pickDate}
              getMark={(key) => {
                if (key === date) return { bg: colors.primarySoft, border: colors.primary };
                if (key === until) return { bg: colors.accentSoft, border: colors.accent };
                if (endDate && isWithin(key, date, endDate)) return { bg: colors.primarySoft };
                return undefined;
              }}
            />

            <View style={s.switchRow}>
              <Text style={s.label}>整天 / 無特定時間</Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ true: colors.primary }}
              />
            </View>
            {allDay ? (
              <Text style={s.hint}>
                📌 這是「繳學費」「買生日禮物」這類沒有時段的事情,不會與課表衝突。
              </Text>
            ) : (
              <View style={s.row}>
                <View style={s.half}>
                  <Text style={s.label}>開始時間</Text>
                  <TimeField value={startTime} onChange={changeStartTime} />
                </View>
                <View style={s.half}>
                  <Text style={s.label}>結束時間</Text>
                  <TimeField value={endTime} onChange={setEndTime} />
                </View>
              </View>
            )}

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

            <Text style={s.label}>重複(再點一下可取消)</Text>
            <View style={s.chips}>
              {RECURRENCE_OPTIONS.map((r) => (
                <Chip
                  key={r.value}
                  label={r.label}
                  color={colors.accent}
                  active={freq === r.value}
                  onPress={() => setFreq(freq === r.value ? null : r.value)}
                />
              ))}
            </View>
            {freq && (
              <>
                <Text style={s.hint}>
                  🔁 從 {formatDateZh(date)} 起{RECURRENCE_LABELS[freq]}重複
                  {until ? `,至 ${formatDateZh(until)} 止` : '(無限期)'}
                  {freq === 'monthly' ? '。沒有該日期的月份會自動跳過。' : ''}
                </Text>
                <View style={s.chips}>
                  <Chip
                    label={until ? `結束於 ${formatDateZh(until)}` : '設定結束日期'}
                    active={dateMode === 'until'}
                    onPress={() => setDateMode(dateMode === 'until' ? 'start' : 'until')}
                  />
                  {!!until && (
                    <Chip label="改為無限期" color={colors.textMuted} onPress={() => setUntil('')} />
                  )}
                </View>
              </>
            )}

            <Text style={s.label}>提醒(再點一下可取消)</Text>
            <View style={s.chips}>
              {REMIND_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  color={colors.warning}
                  active={remind === o.value}
                  onPress={() => setRemind(remind === o.value ? null : o.value)}
                />
              ))}
            </View>
            {remind !== null && !data.settings.notificationsEnabled && (
              <Text style={s.warn}>
                ⚠️ 通知目前是關閉的,請到「設定」頁開啟才會收到提醒。
              </Text>
            )}

            <Text style={s.label}>優先順序(再點一下可取消)</Text>
            <View style={s.chips}>
              {PRIORITY_OPTIONS.map((p) => (
                <Chip
                  key={p.value}
                  label={p.label}
                  color={priorityColors[p.value]}
                  active={priority === p.value}
                  onPress={() => setPriority(priority === p.value ? null : p.value)}
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

            <Button label={series ? '儲存變更' : '新增行程'} onPress={() => void save()} />
            {editingOccurrence && series?.recurrence && (
              <Button label="只刪除這一次" variant="outline" onPress={removeThisOccurrence} />
            )}
            {series && (
              <Button
                label={series.recurrence ? '刪除整個重複行程' : '刪除行程'}
                variant="danger"
                onPress={remove}
              />
            )}
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
  hint: { fontSize: 12, color: colors.accent, marginTop: spacing.xs, lineHeight: 18 },
  warn: { fontSize: 12, color: colors.warning, marginTop: spacing.xs, lineHeight: 18 },
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
