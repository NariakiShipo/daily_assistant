import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, radius, spacing } from '../theme';

interface Props {
  /** 'HH:MM' */
  value: string;
  onChange: (time: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

const toDate = (t: string): Date => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

/** 時間欄位(原生):點欄位開系統時間選擇器,時/分分開、只能選數字 */
const TimeField: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const handleChange = (e: DateTimePickerEvent, d?: Date) => {
    // Android 是對話框,選定或取消後都要收起來
    if (Platform.OS === 'android') setOpen(false);
    if (e.type === 'set' && d) onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  return (
    <>
      <TouchableOpacity style={s.field} onPress={() => setOpen(true)}>
        <Text style={s.value}>{value}</Text>
      </TouchableOpacity>
      {open && (
        <>
          <DateTimePicker
            value={toDate(value)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={s.doneBtn} onPress={() => setOpen(false)}>
              <Text style={s.doneText}>完成</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </>
  );
};

const s = StyleSheet.create({
  field: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  value: { fontSize: 15, color: colors.text },
  doneBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  doneText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});

export default TimeField;
