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
  opts?: { confirmLabel?: string; destructive?: boolean }
): void {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: opts?.confirmLabel ?? '確定',
        style: opts?.destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
}
