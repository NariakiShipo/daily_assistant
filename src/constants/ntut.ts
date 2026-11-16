/**
 * 北科課程系統的課程類別符號與畢業學分類別。
 *
 * 課程查詢系統在每門課前面標一個符號:
 *   ○ 部訂共同必修  △ 校訂共同必修  ☆ 共同選修
 *   ● 部訂專業必修  ▲ 校訂專業必修  ★ 專業選修
 * 課程標準(Cprog.jsp)的八欄學分門檻正好對應這六類,再加上「跨域及自由選修」與「最低畢業學分數」。
 *
 * 資料來源與課表匯入相同:gnehs/ntut-course-crawler-node 發布在 GitHub Pages 的 JSON。
 */
import { CreditCategory } from '../types';

export const NTUT_DATA_BASE_URL = 'https://gnehs.github.io/ntut-course-crawler-node';

/** 課程符號 → 顯示文字與預設歸類 */
export const NTUT_TYPE_INFO: Record<string, { label: string; short: string; category: CreditCategory }> = {
  '○': { label: '部訂共同必修', short: '共必', category: 'commonRequired' },
  '△': { label: '校訂共同必修', short: '共必', category: 'commonRequired' },
  '☆': { label: '共同選修', short: '共選', category: 'commonElective' },
  '●': { label: '部訂專業必修', short: '專必', category: 'proRequired' },
  '▲': { label: '校訂專業必修', short: '專必', category: 'proRequired' },
  '★': { label: '專業選修', short: '專選', category: 'proElective' },
};

export const CATEGORY_LABELS: Record<CreditCategory, string> = {
  commonRequired: '共同必修',
  generalEd: '通識博雅',
  commonElective: '共同選修',
  proRequired: '專業必修',
  proElective: '專業選修',
  free: '跨域及自由選修',
};

/** 類別顯示順序(與課程標準的欄位順序一致) */
export const CATEGORY_ORDER: CreditCategory[] = [
  'commonRequired',
  'generalEd',
  'commonElective',
  'proRequired',
  'proElective',
  'free',
];

/** 類別顏色(進度條用) */
export const CATEGORY_COLORS: Record<CreditCategory, string> = {
  commonRequired: '#4A90D9',
  generalEd: '#2BAFA0',
  commonElective: '#9B8590',
  proRequired: '#E8638C',
  proElective: '#7C6BD6',
  free: '#E5A33D',
};

/** 通識博雅課程的四大向度(課程備註會寫「人文與藝術向度」) */
export const GE_DIMENSIONS = ['人文與藝術', '社會與法治', '自然與科學', '創新與創業'] as const;
export type GeDimension = (typeof GE_DIMENSIONS)[number];

/**
 * 課程標準的學分欄名。
 * 112 學年度以前的課程標準用「跨系所選修上限學分」(上限),之後改為「跨域及自由選修學分」(應修)。
 */
export const CREDIT_KEYS = {
  ministryCommon: '部訂共同必修學分',
  schoolCommon: '校訂共同必修學分',
  commonElective: '共同選修學分',
  ministryPro: '部訂專業必修學分',
  schoolPro: '校訂專業必修學分',
  proElective: '專業選修學分',
  free: '跨域及自由選修學分',
  crossCap: '跨系所選修上限學分',
  total: '最低畢業學分數',
} as const;
