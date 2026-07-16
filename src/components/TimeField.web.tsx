import React from 'react';
import { colors, radius, spacing } from '../theme';
import { isValidTime } from '../utils/date';

interface Props {
  /** 'HH:MM' */
  value: string;
  onChange: (time: string) => void;
}

/** 時間欄位(網頁):瀏覽器原生 time input,時/分分開、只接受數字(中文打不進去) */
const TimeField: React.FC<Props> = ({ value, onChange }) => (
  <input
    type="time"
    value={value}
    onChange={(e) => {
      const v = e.currentTarget.value;
      // 清空或輸入未完成時瀏覽器會給空字串,維持原值即可
      if (isValidTime(v)) onChange(v);
    }}
    style={inputStyle}
  />
);

const inputStyle: React.CSSProperties = {
  backgroundColor: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: `10px ${spacing.md}px`,
  fontSize: 15,
  color: colors.text,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  colorScheme: 'light',
};

export default TimeField;
