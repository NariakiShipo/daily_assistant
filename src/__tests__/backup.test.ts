import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_VERSION, backupFileName, buildBackup, parseBackup } from '../services/backup';
import { defaultData } from '../services/storage';
import { AppData } from '../types';

const sample: AppData = {
  ...defaultData,
  events: [
    {
      id: 'e1',
      title: '看牙醫',
      date: '2026-07-29',
      startTime: '14:00',
      endTime: '15:00',
      ownerId: 'u1',
      createdBy: 'u1',
    },
  ],
  periods: [{ id: 'p1', startDate: '2026-07-01', recordedBy: 'u1' }],
  courses: [
    {
      id: 'c1',
      title: '演算法',
      weekday: 1,
      startPeriod: 0,
      endPeriod: 1,
      ownerId: 'u1',
    },
  ],
  semesters: [{ id: '115-1', startDate: '2026-09-01', endDate: '2027-01-31' }],
};

test('buildBackup 產生帶版本與時間的 JSON', () => {
  const json = buildBackup(sample, new Date(2026, 6, 28, 10, 0));
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, BACKUP_VERSION);
  assert.equal(typeof parsed.exportedAt, 'string');
  assert.equal(parsed.data.events.length, 1);
});

test('備份可以原樣還原', () => {
  const result = parseBackup(buildBackup(sample));
  assert.equal(result.ok, true);
  assert.equal(result.data?.events.length, 1);
  assert.equal(result.data?.events[0].title, '看牙醫');
  assert.equal(result.data?.periods.length, 1);
  assert.equal(result.data?.courses.length, 1);
  assert.equal(result.data?.semesters.length, 1);
});

test('backupFileName 帶上日期', () => {
  assert.equal(backupFileName(new Date(2026, 6, 5)), 'daily-assistant-2026-07-05.json');
});

test('拒絕不是 JSON 的內容', () => {
  const r = parseBackup('這不是 json');
  assert.equal(r.ok, false);
  assert.match(r.message, /JSON/);
});

test('拒絕沒有版本資訊的檔案', () => {
  const r = parseBackup(JSON.stringify({ data: { events: [] } }));
  assert.equal(r.ok, false);
  assert.match(r.message, /版本/);
});

test('拒絕來自較新版本的備份', () => {
  const r = parseBackup(JSON.stringify({ version: 999, data: {} }));
  assert.equal(r.ok, false);
  assert.match(r.message, /較新/);
});

test('拒絕沒有資料內容的檔案', () => {
  const r = parseBackup(JSON.stringify({ version: 1 }));
  assert.equal(r.ok, false);
});

test('跳過欄位殘缺的個別項目而非整份拒絕', () => {
  const r = parseBackup(
    JSON.stringify({
      version: 1,
      data: {
        events: [
          { id: 'good', title: '好的', date: '2026-07-01', startTime: '09:00', endTime: '10:00' },
          { id: 'bad', title: '缺日期' },
          null,
          '不是物件',
        ],
      },
    })
  );
  assert.equal(r.ok, true);
  assert.equal(r.data?.events.length, 1);
  assert.equal(r.data?.events[0].id, 'good');
});

test('缺少的區塊補成空陣列', () => {
  const r = parseBackup(JSON.stringify({ version: 1, data: { events: [] } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data?.periods, []);
  assert.deepEqual(r.data?.courses, []);
  assert.deepEqual(r.data?.semesters, []);
});

test('沒有成員資料時退回預設成員', () => {
  const r = parseBackup(JSON.stringify({ version: 1, data: {} }));
  assert.equal(r.data?.users.length, defaultData.users.length);
  assert.equal(r.data?.users[0].id, 'u1');
});

test('設定沿用預設值再覆蓋備份裡的欄位', () => {
  // 舊備份沒有 courseRemindMinutes,不該變成 undefined
  const r = parseBackup(
    JSON.stringify({ version: 1, data: { settings: { remindDaysBefore: 5 } } })
  );
  assert.equal(r.data?.settings.remindDaysBefore, 5);
  assert.equal(r.data?.settings.notificationsEnabled, false);
  assert.deepEqual(r.data?.settings.customTags, []);
});

test('不還原共享空間配對碼', () => {
  // 把備份匯到另一台裝置時,不該把它一併拉進別人的空間
  const r = parseBackup(
    JSON.stringify({ version: 1, data: { settings: { spaceId: 'ABCD123456' } } })
  );
  assert.equal(r.data?.settings.spaceId, null);
});

test('保留行程的重複與提醒設定', () => {
  const withExtras: AppData = {
    ...sample,
    events: [
      {
        ...sample.events[0],
        recurrence: { freq: 'weekly' },
        remindMinutesBefore: 30,
        allDay: true,
      },
    ],
  };
  const r = parseBackup(buildBackup(withExtras));
  assert.equal(r.data?.events[0].recurrence?.freq, 'weekly');
  assert.equal(r.data?.events[0].remindMinutesBefore, 30);
  assert.equal(r.data?.events[0].allDay, true);
});

test('保留經期的經血量與症狀', () => {
  const withSymptoms: AppData = {
    ...sample,
    periods: [{ id: 'p1', startDate: '2026-07-01', recordedBy: 'u1', flow: 'heavy', symptoms: ['經痛'] }],
  };
  const r = parseBackup(buildBackup(withSymptoms));
  assert.equal(r.data?.periods[0].flow, 'heavy');
  assert.deepEqual(r.data?.periods[0].symptoms, ['經痛']);
});

test('成功時的訊息帶出各類筆數', () => {
  const r = parseBackup(buildBackup(sample));
  assert.match(r.message, /行程 1 筆/);
  assert.match(r.message, /經期 1 筆/);
  assert.match(r.message, /課程 1 筆/);
});
