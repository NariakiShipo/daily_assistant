export const colors = {
  background: '#FFF9FA',
  card: '#FFFFFF',
  border: '#F0E0E5',
  text: '#3D2B33',
  textMuted: '#9B8590',
  primary: '#E8638C',
  primarySoft: '#FDE8EF',
  accent: '#7C6BD6',
  accentSoft: '#EEEBFB',
  success: '#3FA37A',
  warning: '#E5A33D',
  danger: '#D9534F',
  periodDay: '#FAD0DD',
  predictedDay: '#FBE9EE',
  ovulation: '#EEEBFB',
};

/** 預設行程標籤顏色 */
export const tagColors: Record<string, string> = {
  重要: '#E5A33D',
  完成: '#3FA37A',
  工作: '#7C6BD6',
  家庭: '#E8638C',
};

/** 優先順序顏色(高/中/低) */
export const priorityColors: Record<string, string> = {
  high: '#D9534F',
  medium: '#E5A33D',
  low: '#4A90D9',
};

const tagPalette = [
  '#4A90D9', '#D9534F', '#2BAFA0', '#B85FA8', '#8A8F4A', '#D97B4A', '#5C7FD9', '#46A35E',
];

/** 標籤顏色:預設標籤用固定色,自訂標籤依名稱穩定配色 */
export const tagColor = (tag: string): string => {
  if (tagColors[tag]) return tagColors[tag];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return tagPalette[h % tagPalette.length];
};

export const userColorChoices = [
  '#E8638C', '#7C6BD6', '#3FA37A', '#E5A33D', '#4A90D9', '#D9534F',
];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
