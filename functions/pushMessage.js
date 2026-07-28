/**
 * 推播內容的判斷(純函式,方便測試)。
 *
 * 最重要的是「什麼時候不該推」:
 * 登入或加入空間時 uploadLocal 會整批重寫所有行程,若不擋掉,對方會被幾十則
 * 推播洗版。判斷方式是看 updatedAt 夠不夠新——批次重寫保留的是原本的時間戳,
 * 自然會被濾掉,不需要額外加旗標。
 */

/** 寫入時間與現在相差超過這個秒數就視為批次重寫,不推播 */
const FRESH_WINDOW_SECONDS = 120;

/** 從行程資料組出通知文字 */
function describe(ev) {
  const time = ev.allDay ? '整天' : `${ev.startTime ?? ''}`;
  return [ev.date, time, ev.title].filter(Boolean).join(' ');
}

/**
 * 決定要不要推播、推什麼。
 *
 * @param {object|null} before 變更前的行程(新增時為 null)
 * @param {object|null} after  變更後的行程(刪除時為 null)
 * @param {number} nowMs       現在時間
 * @returns {{send: boolean, reason?: string, title?: string, body?: string, tag?: string, fromDevice?: string}}
 */
function buildEventPush(before, after, nowMs) {
  // 刪除:一定是使用者操作,不會來自批次重寫
  if (!after) {
    if (!before) return { send: false, reason: 'no-data' };
    return {
      send: true,
      title: '行程已刪除',
      body: describe(before),
      tag: `event:${before.id ?? ''}`,
      fromDevice: before.updatedByDevice,
    };
  }

  // 沒有時間戳的舊資料無從判斷新舊,不推播以免批次重寫時洗版
  if (typeof after.updatedAt !== 'number') return { send: false, reason: 'no-timestamp' };

  const ageSeconds = (nowMs - after.updatedAt) / 1000;
  if (ageSeconds > FRESH_WINDOW_SECONDS) return { send: false, reason: 'stale-write' };
  // 時間戳在未來太多:裝置時鐘不準,保守不推
  if (ageSeconds < -FRESH_WINDOW_SECONDS) return { send: false, reason: 'clock-skew' };

  // 內容完全沒變(例如只重寫了同樣的資料)就不打擾
  if (before && isSameContent(before, after)) return { send: false, reason: 'no-change' };

  return {
    send: true,
    title: before ? '行程有更新' : '新增了行程',
    body: describe(after),
    tag: `event:${after.id ?? ''}`,
    fromDevice: after.updatedByDevice,
  };
}

/** 比對使用者看得見的欄位;updatedAt/updatedByDevice 這類中繼資料不算變更 */
function isSameContent(a, b) {
  const pick = (e) =>
    JSON.stringify([
      e.title,
      e.date,
      e.endDate ?? null,
      e.startTime,
      e.endTime,
      e.allDay ?? false,
      e.notes ?? '',
      e.ownerIds ?? [e.ownerId],
      e.tags ?? [],
      e.priority ?? null,
      e.recurrence ?? null,
      e.remindMinutesBefore ?? null,
      e.doneDates ?? [],
    ]);
  return pick(a) === pick(b);
}

/**
 * 挑出該送的裝置:排除改動來源那一台,並去掉重複的 token。
 *
 * @param {Array<{id: string, token?: string}>} devices
 * @param {string|undefined} fromDevice
 */
function targetTokens(devices, fromDevice) {
  const seen = new Set();
  const out = [];
  for (const d of devices) {
    if (!d.token) continue;
    if (fromDevice && d.id === fromDevice) continue;
    if (seen.has(d.token)) continue;
    seen.add(d.token);
    out.push(d.token);
  }
  return out;
}

module.exports = {
  FRESH_WINDOW_SECONDS,
  buildEventPush,
  isSameContent,
  targetTokens,
  describe,
};
