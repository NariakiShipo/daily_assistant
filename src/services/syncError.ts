/**
 * Firestore 錯誤碼 → 看得懂的說明(純函式,不 import firebase SDK 以便測試)。
 *
 * 為什麼需要:同步失敗以前是靜默的(`void fb.xxx()` 把 promise 丟掉),
 * 使用者只會看到「刪掉的東西又自己回來」而完全無從得知原因。
 */
export function syncErrorMessage(action: string, e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';

  if (code.includes('permission-denied')) {
    return `${action}失敗:沒有這個共享空間的寫入權限。若空間已「鎖定為帳號存取」,請確認已登入被授權的帳號。`;
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return `${action}失敗:連不上雲端,請檢查網路後再試一次。`;
  }
  if (code.includes('not-found')) {
    return `${action}失敗:找不到這筆資料,可能已被對方刪除。`;
  }
  if (code.includes('unauthenticated')) {
    return `${action}失敗:登入狀態已過期,請重新登入。`;
  }

  const msg = (e as { message?: string })?.message;
  if (code) return `${action}失敗(${code})${msg ? `:${msg}` : ''}`;
  return msg ? `${action}失敗:${msg}` : `${action}失敗,請再試一次。`;
}
