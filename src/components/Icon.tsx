/**
 * 線條圖示。
 *
 * 記帳全面改用線條圖示而不是 Emoji:Emoji 在 iOS / Android / 網頁各長一個樣,
 * 不能著色也對不齊(全 App 檢視清單第 05 條)。使用者仍然可以替自訂分類
 * 挑 Emoji 或上傳圖片,那是使用者的選擇,不是介面本身的圖示。
 *
 * 所有路徑都在 24×24 的 viewBox 上,描邊 currentColor 的概念改由 color prop 帶入。
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

export type IconName =
  // 預設支出分類
  | 'food'
  | 'transit'
  | 'shopping'
  | 'fun'
  | 'home'
  | 'health'
  | 'edu'
  | 'daily'
  | 'phone'
  | 'pet'
  // 預設收入分類
  | 'salary'
  | 'bonus'
  | 'invest'
  // 自訂分類可挑的圖示
  | 'gym'
  | 'coffee'
  | 'gift'
  | 'chart'
  | 'star'
  | 'clock'
  | 'card'
  | 'tool'
  // 介面
  | 'menu'
  | 'house'
  | 'calendar'
  | 'wallet'
  | 'period'
  | 'timetable'
  | 'settings'
  | 'report'
  | 'back'
  | 'close'
  | 'plus'
  | 'camera'
  | 'upload'
  | 'backspace'
  | 'image'
  | 'more';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** 線條粗細;小尺寸時設計稿用 1.8,強調時用 2 */
  strokeWidth?: number;
}

const Icon: React.FC<Props> = ({ name, size = 24, color = colors.text, strokeWidth = 1.8 }) => {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'food' && (
        <Path
          d="M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7"
          {...stroke}
        />
      )}
      {name === 'transit' && (
        <>
          <Rect x={3} y={3} width={18} height={15} rx={3} {...stroke} />
          <Path d="M3 10h18M7 21v-3M17 21v-3" {...stroke} />
          <Circle cx={7.5} cy={14.5} r={1} {...stroke} />
          <Circle cx={16.5} cy={14.5} r={1} {...stroke} />
        </>
      )}
      {name === 'shopping' && (
        <Path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" {...stroke} />
      )}
      {name === 'fun' && (
        <>
          <Rect x={3} y={8} width={18} height={12} rx={2} {...stroke} />
          <Path d="M3 8l2-4h14l2 4M8 4l2 4M13 4l2 4" {...stroke} />
        </>
      )}
      {name === 'home' && (
        <>
          <Rect x={4} y={2} width={16} height={20} rx={2} {...stroke} />
          <Path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M10 22v-4h4v4" {...stroke} />
        </>
      )}
      {name === 'health' && (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={3} {...stroke} />
          <Path d="M12 8v8M8 12h8" {...stroke} />
        </>
      )}
      {name === 'edu' && (
        <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" {...stroke} />
      )}
      {name === 'daily' && (
        <Path
          d="M2 11h20M5 11l4-7M19 11l-4-7M3.5 11l1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.6-7.4M9 11l1 9M15 11l-1 9"
          {...stroke}
        />
      )}
      {name === 'phone' && (
        <>
          <Rect x={5} y={2} width={14} height={20} rx={2.5} {...stroke} />
          <Path d="M11 18h2" {...stroke} />
        </>
      )}
      {name === 'pet' && (
        <>
          <Circle cx={11} cy={4} r={2} {...stroke} />
          <Circle cx={18} cy={8} r={2} {...stroke} />
          <Circle cx={20} cy={16} r={2} {...stroke} />
          <Path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1Q6.5 17.5 4.5 16.8A3.5 3.5 0 0 1 5.5 10z" {...stroke} />
        </>
      )}
      {name === 'salary' && (
        <>
          <Rect x={2} y={6} width={20} height={12} rx={2} {...stroke} />
          <Circle cx={12} cy={12} r={3} {...stroke} />
          <Path d="M6 10v4M18 10v4" {...stroke} />
        </>
      )}
      {name === 'bonus' && (
        <>
          <Rect x={3} y={8} width={18} height={4} rx={1} {...stroke} />
          <Path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5.5 12 8c1-2.5 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" {...stroke} />
        </>
      )}
      {name === 'invest' && <Path d="M3 17l6-6 4 4 8-8M15 7h6v6" {...stroke} />}
      {name === 'gym' && (
        <>
          <Rect x={2} y={9} width={3} height={6} rx={1} {...stroke} />
          <Rect x={19} y={9} width={3} height={6} rx={1} {...stroke} />
          <Rect x={6} y={7} width={3} height={10} rx={1} {...stroke} />
          <Rect x={15} y={7} width={3} height={10} rx={1} {...stroke} />
          <Path d="M9 12h6" {...stroke} />
        </>
      )}
      {name === 'coffee' && (
        <Path
          d="M10 2v2M14 2v2M6 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"
          {...stroke}
        />
      )}
      {name === 'gift' && (
        <>
          <Rect x={3} y={8} width={18} height={4} rx={1} {...stroke} />
          <Path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5.5 12 8c1-2.5 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" {...stroke} />
        </>
      )}
      {name === 'chart' && <Path d="M3 17l6-6 4 4 8-8M15 7h6v6" {...stroke} />}
      {name === 'star' && (
        <Path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" {...stroke} />
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 7v5l3 2" {...stroke} />
        </>
      )}
      {name === 'card' && (
        <>
          <Path d="M3 7a2 2 0 0 1 2-2h13v4" {...stroke} />
          <Rect x={3} y={7} width={18} height={13} rx={2} {...stroke} />
          <Circle cx={16} cy={13.5} r={1.2} {...stroke} />
        </>
      )}
      {name === 'tool' && <Path d="M2 21l1.5-5.5L14 5l5 5L8.5 20.5z M14 5l3-3 5 5-3 3" {...stroke} />}
      {name === 'menu' && <Path d="M3 6h18M3 12h18M3 18h18" {...stroke} strokeWidth={2} />}
      {name === 'house' && (
        <Path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" {...stroke} />
      )}
      {name === 'calendar' && (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={3} {...stroke} />
          <Path d="M3 10h18M8 3v4M16 3v4" {...stroke} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect x={2.5} y={6} width={19} height={13} rx={3} {...stroke} />
          <Path d="M2.5 10h19M16 14.5h1.5" {...stroke} />
        </>
      )}
      {name === 'period' && (
        <Path d="M12 3c3.5 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-7 6-11z" {...stroke} />
      )}
      {name === 'timetable' && (
        <Path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 21V5M9 8h7" {...stroke} />
      )}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...stroke} />
          <Path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            {...stroke}
          />
        </>
      )}
      {name === 'report' && <Path d="M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z" {...stroke} />}
      {name === 'back' && <Path d="M15 5l-7 7 7 7" {...stroke} strokeWidth={2} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...stroke} strokeWidth={2} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} strokeWidth={2} />}
      {name === 'camera' && (
        <>
          <Path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...stroke} />
          <Circle cx={12} cy={13} r={3.5} {...stroke} />
        </>
      )}
      {name === 'upload' && (
        <Path d="M12 16V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" {...stroke} />
      )}
      {name === 'backspace' && (
        <Path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM18 9l-6 6M12 9l6 6" {...stroke} strokeWidth={2} />
      )}
      {name === 'image' && (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={3} {...stroke} />
          <Path d="M3 15l5-5 4 4 3-3 6 6" {...stroke} />
          <Circle cx={16} cy={8} r={1.5} {...stroke} />
        </>
      )}
      {name === 'more' && <Path d="M5 12h.01M12 12h.01M19 12h.01" {...stroke} strokeWidth={2.5} />}
    </Svg>
  );
};

/** 建立自訂分類時可以挑的圖示(設計稿的「更多」開的就是這一份完整圖庫) */
export const PICKABLE_ICONS: IconName[] = [
  'gym', 'coffee', 'chart', 'star', 'clock', 'card', 'tool', 'gift',
  'food', 'transit', 'shopping', 'fun', 'home', 'health', 'edu', 'daily',
  'phone', 'pet', 'salary', 'bonus', 'invest', 'image', 'camera', 'more',
];

/** 新增分類時第一屏只露 8 個,按「更多」才展開全部 */
export const ICON_PREVIEW_COUNT = 8;

export default Icon;
