/**
 * 把選到的收據照片縮到可以跟著帳目存檔的大小。
 *
 * 該縮成多大、縮完夠不夠小,都在 receipt.ts(純函式,有單元測試);
 * 這裡只負責呼叫 expo-image-manipulator。
 *
 * 兩個平台存的東西不一樣:
 *   網頁  data: URI。瀏覽器沒有檔案系統可放,只能把圖直接存進資料裡;
 *         縮小後幾百 KB,寫得進 Firestore,伴侶的裝置也看得到。
 *         注意 manipulateAsync 在網頁回傳的 uri 是 blob: 網址,重新整理就失效,
 *         不能拿來存——要另外要 base64 自己組成 data: URI。
 *   手機  縮小後的 file:// 檔案。整份資料存在 AsyncStorage 的單一筆紀錄裡
 *         (Android 單筆上限約 2MB),塞不下 base64;這個路徑只留在本機,
 *         同步時由 expenseForSync 拿掉。
 */
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { RECEIPT_STEPS, acceptReceiptStep, jpegDataUri, receiptResize } from './receipt';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export async function shrinkReceipt(image: PickedImage): Promise<string> {
  const web = Platform.OS === 'web';
  for (let i = 0; i < RECEIPT_STEPS.length; i++) {
    const step = RECEIPT_STEPS[i];
    const resize = receiptResize(image.width, image.height, step.maxSide);
    const result = await ImageManipulator.manipulateAsync(
      image.uri,
      resize ? [{ resize }] : [],
      { compress: step.compress, format: ImageManipulator.SaveFormat.JPEG, base64: web }
    );
    if (!web) return result.uri;

    // 用不到的 blob: 網址要自己釋放,否則整張圖會留在記憶體直到分頁關閉
    if (result.uri.startsWith('blob:')) URL.revokeObjectURL(result.uri);
    if (!result.base64) break;
    const dataUri = jpegDataUri(result.base64);
    if (acceptReceiptStep(dataUri, i)) return dataUri;
  }
  throw new Error('收據照片處理失敗');
}
