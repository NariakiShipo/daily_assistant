import { Alert, Platform } from 'react-native';

/**
 * 跨平台對話框。
 * react-native-web 的 Alert 是 no-op,在網頁上不會顯示任何東西,
 * 因此需要改用瀏覽器原生的 alert/confirm。
 */

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export function confirmDialog(
  title: string,
  message: string | undefined,
  onConfirm: () => void,
  opts?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
): void {
  const confirmLabel = opts?.confirmLabel ?? '確定';
  const cancelLabel = opts?.cancelLabel ?? '取消';

  if (Platform.OS === 'web') {
    // window.confirm 的按鈕文字固定是「確定/取消」,改不了;
    // 選項有具體含義時(例如「用我的覆蓋 / 保留對方的」)必須寫進訊息裡,
    // 否則使用者看到的兩顆按鈕無從判斷各自代表什麼。
    const hint = opts?.cancelLabel ? `\n\n[確定] ${confirmLabel} / [取消] ${cancelLabel}` : '';
    const body = message ? `${title}\n\n${message}${hint}` : `${title}${hint}`;
    if (window.confirm(body)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel' },
      {
        text: confirmLabel,
        style: opts?.destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
}
