/**
 * 備份檔的存取(平台差異集中在這裡)。
 *
 * 網頁:用 Blob + <a download> 觸發下載,用 <input type="file"> 讀檔。
 * 手機:寫進暫存目錄後用系統分享面板送出,用 DocumentPicker 讀檔。
 */
import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

const isWeb = Platform.OS === 'web';

/** 匯出:網頁觸發下載,手機開系統分享 */
export async function saveBackup(content: string, fileName: string): Promise<void> {
  if (isWeb) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 立刻 revoke 會讓部分瀏覽器來不及開始下載
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const path = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, content);
  await Share.share({ url: path, message: `Daily Assistant 備份:${fileName}` });
}

/** 匯入:讓使用者選檔並讀出內容;取消時回傳 null */
export async function pickBackup(): Promise<string | null> {
  if (isWeb) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      // 使用者直接關掉選檔視窗時不會觸發 onchange,交給呼叫端的取消流程
      input.click();
    });
  }

  const res = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
  if (res.canceled || !res.assets?.length) return null;
  return FileSystem.readAsStringAsync(res.assets[0].uri);
}
