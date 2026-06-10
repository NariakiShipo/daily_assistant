# Daily Assistant

伴侶/家人共用的生活助理 App(React Native + Expo,支援 iOS / Android / Web)。

## 功能

### 📅 日曆
- 月曆檢視,新增/編輯/刪除行程
- 兩人行程以顏色區分,可篩選「全部 / 個人」
- 兩種檢視:**依時間**(選日期看當天行程)/ **依人**(每人本月行程分區)
- 行程可標記「同步到 Google 日曆」(見下方接入說明)

### 🌸 經期紀錄
- 一鍵記錄經期開始/結束,可選「由誰記錄」(伴侶可協助)
- 依過去週期(最近 6 次、自動過濾異常值)推算下次經期區間與排卵日,附信心程度
- 依目前週期階段(經期/濾泡/排卵/黃體/經前)給出飲食、行動建議
- 經期與預測區間直接顯示在日曆上

### 🔔 通知
- 經期前 N 天與預測開始日,本機推播提醒
- 行程新增/修改/刪除時發出通知
- 設定頁可開關並發送測試通知

## 執行

```bash
npm install        # 若曾安裝失敗,先 rm -rf node_modules 再執行
npm start          # 掃 QR code 用 Expo Go 開啟
npm run web        # 瀏覽器執行(通知功能僅手機支援)
```

## 後續接入(目前為 MVP 本機版)

### Google Calendar(`src/services/googleCalendar.ts`)
REST 呼叫已寫好,只差 OAuth:
1. Google Cloud Console 建專案 → 啟用 Calendar API → 建立 OAuth 用戶端
2. 安裝 `expo-auth-session`,scope 用 `https://www.googleapis.com/auth/calendar`
3. 登入後呼叫 `setAccessToken(token)` 即可同步
4. 共同編輯:`createSharedCalendar()` 建共用日曆 → `shareCalendarWith(對方email)` 加為編輯者

開發測試:可在 [OAuth Playground](https://developers.google.com/oauthplayground) 取得 token,貼到 App 設定頁。

### Firebase(跨裝置即時共享)
目前資料存本機(AsyncStorage)。正式版:
- Firebase Auth 登入、Firestore 存 `couples/{id}/events` 與 `couples/{id}/periods`
- 把 `src/services/storage.ts` 換成 Firestore 讀寫即可(資料結構不變)
- Cloud Functions 監聽變更 → FCM 推播給另一半(取代目前的本機通知)

## 結構

```
App.tsx                    # 入口 + 分頁導航
src/
  types.ts                 # 資料模型
  theme.ts                 # 配色
  utils/date.ts            # 日期工具
  store/AppContext.tsx     # 全域狀態 + 自動持久化
  services/
    storage.ts             # 本機儲存(未來換 Firestore)
    periodPrediction.ts    # 週期推算演算法
    recommendations.ts     # 階段建議內容
    notifications.ts       # 推播排程
    googleCalendar.ts      # Google Calendar REST
  screens/                 # 日曆 / 經期 / 設定
  components/              # 共用 UI、行程編輯視窗
```
