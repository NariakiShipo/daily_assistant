/**
 * 固定視窗的呼叫次數限制(純函式,方便測試)。
 *
 * 用在「代為登入北科」這種會把帳密轉送給第三方的函式:北科的帳號連續輸錯密碼會被鎖住,
 * 沒有上限的話,這支函式就能被拿來替別人的學號亂試密碼、把對方鎖在入口網站外面。
 */

/**
 * @param {{windowStart?: unknown, count?: unknown} | null | undefined} prev  上次存下的狀態
 * @param {number} now
 * @param {{windowMs: number, max: number}} limit
 * @returns {{allowed: boolean, state: {windowStart: number, count: number}, retryAfterMs: number}}
 */
function nextRateWindow(prev, now, { windowMs, max }) {
  const start = prev && typeof prev.windowStart === 'number' ? prev.windowStart : null;
  // 沒有紀錄、視窗已過、或時鐘倒退(存的時間在未來)都重新開一個視窗
  if (start === null || now - start >= windowMs || now < start) {
    return { allowed: true, state: { windowStart: now, count: 1 }, retryAfterMs: 0 };
  }
  const count = typeof prev.count === 'number' ? prev.count : 0;
  if (count >= max) {
    return { allowed: false, state: { windowStart: start, count }, retryAfterMs: start + windowMs - now };
  }
  return { allowed: true, state: { windowStart: start, count: count + 1 }, retryAfterMs: 0 };
}

module.exports = { nextRateWindow };
