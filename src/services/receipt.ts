/**
 * 收據照片的大小與同步規則(純函式,不 import 任何需要執行環境的模組以便測試)。
 *
 * 為什麼需要:收據跟著帳目存在 `Expense.receiptUri`,而帳目會整筆寫進
 * Firestore 的 `spaces/{code}/expenses/{id}`。網頁版選到的照片是 `data:` URI
 * (整張圖的 base64),手機拍的原圖動輒數 MB,超過 Firestore 單一文件 1MB 的上限,
 * 寫入會被伺服器退回——那筆帳目就永遠到不了伴侶的裝置。
 * 手機版存的是 `file://` 路徑,寫上雲端也沒有意義:別台裝置打不開。
 *
 * 所以分兩道:
 *   1. 存檔前把照片縮小(見 receiptImage.ts,這裡只算該縮成多大)。
 *   2. 寫上雲端前把「只在這台裝置有意義」或「太大」的收據拿掉,帳目本身照常同步;
 *      雲端推回來時再把本機那份補回去,既有的大張收據不會因此消失。
 */
import { Expense } from '../types';

/** 一次壓縮嘗試:長邊上限(px)與 JPEG 品質(0–1) */
export interface ReceiptStep {
  maxSide: number;
  compress: number;
}

/**
 * 由大到小的壓縮階梯。第一階(長邊 1280)對一般收據已經夠看清楚字,
 * 絕大多數照片在這一階就低於目標大小;後面幾階是給雜訊很多、壓不下去的照片用的。
 */
export const RECEIPT_STEPS: readonly ReceiptStep[] = [
  { maxSide: 1280, compress: 0.6 },
  { maxSide: 1024, compress: 0.5 },
  { maxSide: 800, compress: 0.45 },
  { maxSide: 640, compress: 0.4 },
];

/**
 * 新收據的目標大小(data URI 的字元數,因為全是 ASCII 所以等於位元組數)。
 * 抓得比 Firestore 的上限小很多:網頁版整份資料還會存進 localStorage(約 5MB 配額),
 * 每張收據越小,能放的張數越多。
 */
export const RECEIPT_TARGET_BYTES = 300_000;

/**
 * 可以寫上雲端的收據上限。Firestore 單一文件上限是 1,048,576 位元組,
 * 留一點給帳目的其他欄位。比目標大小寬鬆是刻意的:這次修改前就已經成功同步的
 * 收據(幾百 KB)不該在下次編輯時被拿掉。
 */
export const RECEIPT_SYNC_LIMIT_BYTES = 900_000;

/**
 * 把長邊縮到 maxSide 以內時,要交給影像處理的 resize 參數。
 * 只指定長的那一邊,另一邊由影像處理依比例算,免得四捨五入把比例拉歪。
 * 已經夠小、或不知道原圖尺寸(0)時回傳 null,代表不用縮。
 */
export function receiptResize(
  width: number,
  height: number,
  maxSide: number
): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0) || !(maxSide > 0)) return null;
  if (Math.max(width, height) <= maxSide) return null;
  return width >= height ? { width: maxSide } : { height: maxSide };
}

/** base64 內容組成 JPEG 的 data URI */
export function jpegDataUri(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * 這一階的結果能不能收下:夠小就收;已經是最後一階也收(沒有更小的可試了)。
 * 最後一階仍超過同步上限的極端情況交給 syncableReceipt 處理——照片留在本機、不上雲端。
 */
export function acceptReceiptStep(dataUri: string, stepIndex: number): boolean {
  return dataUri.length <= RECEIPT_TARGET_BYTES || stepIndex >= RECEIPT_STEPS.length - 1;
}

/**
 * 這個收據 URI 能不能寫上雲端;可以就原樣回傳,不行回傳 undefined。
 *
 *   data:      大小在上限內才行
 *   http(s):   別台裝置也打得開
 *   其他       file://、content://、ph://、blob: 都只在產生它的那台裝置(或那個分頁)有效
 */
export function syncableReceipt(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  if (/^data:/i.test(uri)) return uri.length <= RECEIPT_SYNC_LIMIT_BYTES ? uri : undefined;
  if (/^https?:\/\//i.test(uri)) return uri;
  return undefined;
}

/** 要寫上雲端的帳目:收據不能同步時整個欄位拿掉,其餘原封不動 */
export function expenseForSync(e: Expense): Expense {
  if (e.receiptUri === undefined || syncableReceipt(e.receiptUri) !== undefined) return e;
  const { receiptUri: _localOnly, ...rest } = e;
  return rest;
}

/**
 * 雲端推回來的帳目清單,補上本機才有的收據。
 *
 * 訂閱收到的清單會整份取代本機的帳目;不補的話,沒被寫上雲端的收據
 * (手機的 file://、這次修改前留下的超大 data URI)會在下一次同步時被洗掉。
 *
 * 只在「雲端那筆沒有收據、本機那筆的收據本來就上不了雲端」時才補:
 * 雲端有收據就以雲端為準(對方換了一張);本機的收據若是可以同步的,
 * 雲端卻沒有,代表它是被拿掉的,不該復活。
 */
export function keepLocalReceipts(remote: Expense[], local: Expense[]): Expense[] {
  const localOnly = new Map<string, string>();
  for (const e of local) {
    if (e.receiptUri && syncableReceipt(e.receiptUri) === undefined) {
      localOnly.set(e.id, e.receiptUri);
    }
  }
  if (!localOnly.size) return remote;
  return remote.map((e) => {
    const kept = e.receiptUri ? undefined : localOnly.get(e.id);
    return kept ? { ...e, receiptUri: kept } : e;
  });
}
