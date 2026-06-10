import React, { useEffect, useState } from 'react';
import {
  Alert,
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
import { CalendarEvent } from '../types';
import { colors, radius, spacing } from '../theme';
import { isValidDateKey, isValidTime, uid } from '../utils/date';
import { useApp } from '../store/AppContext';
import { Button, Chip } from './ui';
import * as gcal from '../services/googleCalendar';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 編輯既有事件時傳入;新增時為 null */
  event: CalendarEvent | null;
  /** 新增時的預設日期 */
  defaultDate: string;
}

const EventModal: React.FC<Props> = ({ visible, onClose, event, defaultDate }) => {
  const { data, addEvent, updateEvent, deleteEvent } = useApp();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [ownerId, setOwnerId] = useState(data.users[0]?.id ?? 'u1');
  const [notes, setNotes] = useState('');
  const [syncToGoogle, setSyncToGoogle] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (event) {
      setTitle(event.title);
      setDate(event.date);
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setOwnerId(event.ownerId);
      setNotes(event.notes ?? '');
      setSyncToGoogle(!!event.syncToGoogle);
    } else {
      setTitle('');
      setDate(defaultDate);
      setStartTime('09:00');
      setEndTime('10:00');
      setOwnerId(data.users[0]?.id ?? 'u1');
      setNotes('');
      setSyncToGoogle(false);
    }
  }, [visible, event, defaultDate, data.users]);

  const save = async () => {
    if (!title.trim()) return Alert.alert('請輸入標題');
    if (!isValidDateKey(date)) return Alert.alert('日期格式錯誤', '請用 YYYY-MM-DD');
    if (!isValidTime(startTime) || !isValidTime(endTime))
      return Alert.alert('時間格式錯誤', '請用 HH:MM(24 小時制)');
    if (endTime <= startTime) return Alert.alert('結束時間需晚於開始時間');

    const ev: CalendarEvent = {
      id: event?.id ?? uid(),
      title: title.trim(),
      date,
      startTime,
      endTime,
      ownerId,
      createdBy: event?.createdBy ?? data.users[0]?.id ?? 'u1',
      notes: notes.trim() || undefined,
      syncToGoogle,
      googleEventId: event?.googleEventId,
    };
    if (event) await updateEvent(ev);
    else await addEvent(ev);
    onClose();
  };

  const remove = () => {
    if (!event) return;
    Alert.alert('刪除行程', `確定刪除「${event.title}」?`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          await deleteEvent(event.id);
          onClose();
        },
      },
    ]);
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

            <Text style={s.label}>日期(YYYY-MM-DD)</Text>
            <TextInput style={s.input} value={date} onChangeText={setDate} />

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

            <Text style={s.label}>這是誰的行程?</Text>
            <View style={s.chips}>
              {data.users.map((u) => (
                <Chip
                  key={u.id}
                  label={u.name}
                  color={u.color}
                  active={ownerId === u.id}
                  onPress={() => setOwnerId(u.id)}
                />
              ))}
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
                  if (v && !gcal.isConnected()) {
                    Alert.alert('尚未連接', '請先到「設定」頁連接 Google Calendar。仍會標記此行程待同步。');
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
  row: { flexDirection: 'row', gap: spacing.md },
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
