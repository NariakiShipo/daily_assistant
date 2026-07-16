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

### 📚 課表
- 每位成員一份課表,點格子新增、點色塊編輯
- **匯入北科課表**:從[北科課程好朋友](https://ntut-course.gnehs.net)匯出選課 JSON(選檔或貼上),自動抓課名/時間/教室/老師填入
- 課表按**學期**分頁保存(115-1、115-2⋯),可回顧歷學期;顯示課數/學分/班級統計
- 重複匯入時可選「只覆蓋課表(保留手動課程)」或「全部覆蓋」
- 匯入後自動掃描學期內與上課時間重疊的個人行程,可**截短讓出上課時間**、調整時間、刪除或略過
- 新增行程時若撞到課會即時提醒;日曆的日預覽會顯示當天課程

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

## 啟用 Google Calendar 同步(OAuth 已內建)

程式碼已完成(`src/services/googleAuth.ts` + `googleCalendar.ts`),只需申請憑證:

1. 到 [Google Cloud Console](https://console.cloud.google.com) 建立專案
2. 「API 和服務」→「程式庫」→ 啟用 **Google Calendar API**
3. 「API 和服務」→「OAuth 同意畫面」→ 設定(External、加入自己與伴侶為測試使用者)
4. 「憑證」→「建立憑證」→「OAuth 用戶端 ID」:
   - **Web 應用程式**(跑 `npm run web` 用):「已授權的重新導向 URI」加 `http://localhost:8081`
   - **iOS**:Bundle ID 填 `com.nariaki.dailyassistant`
   - **Android**:Package name 填 `com.nariaki.dailyassistant` + 開發機 SHA-1
5. 把三組用戶端 ID 填入 `.env` 的 `EXPO_PUBLIC_GOOGLE_*`(範本見 `.env.example`)
6. `npx expo start -c` 重啟 → 設定頁出現「使用 Google 帳號登入」按鈕

注意:
- **Expo Go 無法跑 Google OAuth**(Google 不接受其 redirect)。手機請用
  development build(`npx expo run:ios` / `run:android`),或先用 `npm run web` 測試
- Web 為 implicit flow,token 1 小時後需重新登入;iOS/Android 有 refresh token 會自動續期
- 共同編輯同個日曆:`createSharedCalendar()` 建共用日曆 → `shareCalendarWith(對方email)` 加為編輯者
- 快速測試也可在 [OAuth Playground](https://developers.google.com/oauthplayground) 取 token 貼到設定頁

## 啟用 Firebase 跨裝置即時共享(已內建)

程式碼已完成(`src/services/firebaseSync.ts`),配對碼制、免帳號登入:

1. 到 [Firebase Console](https://console.firebase.google.com) 建立專案
2. 「建構」→「Firestore Database」→ 建立資料庫(正式模式)
3. 「規則」分頁 → 貼上專案根目錄 `firestore.rules` 的內容 → 發布
4. 專案設定 → 「你的應用程式」→ 新增 **Web 應用程式** → 複製 firebaseConfig
5. 填入 `.env` 的 `EXPO_PUBLIC_FIREBASE_*`(範本見 `.env.example`),`npx expo start -c` 重啟
6. 設定頁 →「建立共享空間」→ 把配對碼傳給對方 → 對方輸入「加入共享空間」

> `.env` 不進版控(已在 .gitignore);改完 .env 一定要用 `-c` 清快取重啟才會生效。

之後行程、經期紀錄、成員名稱/顏色都會即時雙向同步;對方修改行程時,
你的裝置會跳本機通知。離開共享空間後,資料保留在本機。

安全性:配對碼為 10 碼隨機字串、規則禁止列舉空間,知道碼才能存取。
若要更嚴格(帳號綁定、成員白名單),再加上 Firebase Auth 即可。

### 尚未涵蓋
- 跨裝置推播(對方手機鎖屏也收到):需 development build + FCM + Cloud
  Functions 監聽 Firestore 變更發送 Expo Push。目前 App 開著時會即時收到本機通知。

## 結構

```
.env                       # ⚙️ 憑證實際值(不進版控,範本見 .env.example)
firestore.rules            # Firestore 安全規則(貼到 Firebase Console)
App.tsx                    # 入口 + 分頁導航
src/
  types.ts                 # 資料模型
  theme.ts                 # 配色
  utils/date.ts            # 日期工具
  store/AppContext.tsx     # 全域狀態 + 自動持久化
  config.ts                # 讀取 .env 的憑證設定
  env.d.ts                 # EXPO_PUBLIC_* 環境變數型別
  services/
    storage.ts             # 本機儲存(共享模式下為快取)
    periodPrediction.ts    # 週期推算演算法
    recommendations.ts     # 階段建議內容
    notifications.ts       # 推播排程
    googleAuth.ts          # Google OAuth 登入 + token 自動刷新
    googleCalendar.ts      # Google Calendar REST
    firebaseSync.ts        # Firestore 即時同步(配對碼制)
  screens/                 # 日曆 / 經期 / 設定
  components/              # 共用 UI、行程編輯視窗
```
