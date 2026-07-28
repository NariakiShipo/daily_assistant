# Daily Bear

伴侶/家人共用的生活助理 App(React Native + Expo,支援 iOS / Android / Web)。

## 功能

### 📅 日曆
- 月曆檢視,新增/編輯/刪除行程
- 兩人行程以顏色區分,可篩選「全部 / 個人」
- **搜尋**:比對標題、備註與標籤
- 三種檢視:**依時間**(選日期看當天行程)/ **依人**(每人本月行程分區)/
  **未來 7 天**(從今天起的逐日清單,會跨月份)
- **整天事項**:繳學費、買禮物這類沒有時段的事情不用硬塞時間,也不會被判定成撞課
- **重複行程**:每天 / 每週 / 每兩週 / 每月,可設結束日期或無限期
  - 資料庫只存第一次那一筆 + 規則,顯示時才展開,不會產生大量副本
  - 完成狀態、刪除都可以「只針對這一次」,不影響其他次數
  - 每月重複遇到沒有該日期的月份(如 1/31 的 2 月)會自動跳過,不會往前漂移
- 行程可標記「同步到 Google 日曆」(見下方接入說明)
- **雙向同步**:設定頁的「⬇ 從 Google 拉回變更」把 Google 上的行程(含別人寄來的邀請)
  拉進來。用 Google 的 `syncToken` 做增量同步,token 過期(410)時自動退回完整同步
  - 衝突規則:比較兩邊的修改時間,新的贏;本機較新時保留本機並回報筆數
  - 合併時保留 Google 沒有對應的本機欄位(標籤、提醒、優先順序、逐次完成狀態)
  - 重複行程交給 Google 展開成實例(`singleEvents=true`)再匯入,不自行解析 RRULE——
    Google 的 RRULE 涵蓋範圍遠大於本專案的 Recurrence 模型,硬對應會在邊角情況安靜出錯

### 🌸 經期紀錄
- 一鍵記錄經期開始/結束,可選「由誰記錄」(伴侶可協助)
- **經血量(少量/中等/大量)與症狀**:12 種預設症狀可複選,也能自訂並記住
- **統計**:歷次週期長度長條圖、最常記錄的症狀次數(僅客觀彙總,不做健康推論)
- 依過去週期(最近 6 次、自動過濾異常值)推算下次經期區間與排卵日,附信心程度
- 依目前週期階段(經期/濾泡/排卵/黃體/經前)給出飲食、行動建議
- 經期與預測區間顯示在**經期頁自己的日曆**上(不畫在主日曆,讓主日曆只呈現行程)

### 📚 課表
- **今天卡片**:上課中(含進度條)/ 下一堂是什麼、在哪間教室、還有多久,加上當天完整課表
- 每位成員一份課表,點格子新增、點色塊編輯
- **匯入北科課表**:從[北科課程好朋友](https://ntut-course.gnehs.net)匯出選課 JSON(選檔或貼上),自動抓課名/時間/教室/老師填入
- 課表按**學期**分頁保存(115-1、115-2⋯),可回顧歷學期;顯示課數/學分/班級統計
- 重複匯入時可選「只覆蓋課表(保留手動課程)」或「全部覆蓋」
- 匯入後自動掃描學期內與上課時間重疊的個人行程,可**截短讓出上課時間**、調整時間、刪除或略過
- 新增行程時若撞到課會即時提醒(課表本身不畫進主日曆,避免固定課程蓋掉當天真正要注意的事)

### 🔔 通知
- 經期前 N 天與預測開始日,本機推播提醒
- **行程提醒**:開始前 10 分鐘 / 30 分鐘 / 1 小時 / 前一天,重複行程的每一次都會排
- **上課提醒**:設定頁可選課前 10 / 20 / 30 分鐘(排未來一週)
- 行程新增/修改/刪除時發出通知
- 設定頁可開關並發送測試通知

- **跨裝置推播**(共享空間 + 網頁版):對方修改共用行程時,即使這邊 App 沒開也會通知

跨裝置推播由 Functions 的 `onEventWritten` 觸發器發送,設定步驟:
1. Firebase Console → 專案設定 → Cloud Messaging → 網頁推送憑證 → 產生金鑰組
2. 把公開金鑰填入 `.env` 的 `EXPO_PUBLIC_FIREBASE_VAPID_KEY`
3. 設定頁開啟「跨裝置推播」

刻意不推播的情況(邏輯在 `functions/pushMessage.js`,有單元測試):批次重寫
(登入/加入空間時的 uploadLocal,否則對方會被幾十則推播洗版)、內容沒有實際變更、
以及改動來源那台裝置自己。

手機版目前不支援跨裝置推播:Android 需要 `google-services.json`,
iOS 需要付費 Apple Developer 會員(免費 Apple ID 簽名不支援推播 entitlement,
見 `plugins/withoutPushEntitlement.js`)。

手機版用 expo-notifications 走系統排程,App 關掉也會響。
網頁版用 Web Notification API + 計時器,**只在分頁開著時有效**(設定頁有提示)。
iOS 對已排程的本機通知有 64 則上限,因此行程提醒只排未來 30 天內、最近的 40 則,
資料一變動就整批重算。

## 執行

```bash
npm install        # 若曾安裝失敗,先 rm -rf node_modules 再執行
npm start          # 掃 QR code 用 Expo Go 開啟
npm run web        # 瀏覽器執行(通知功能僅手機支援)
npm test           # 單元測試(純函式:日期、經期預測、課表衝突、重複展開)
npm run typecheck  # 型別檢查
```

測試用 Node 內建的 `node --test`,沒有額外框架依賴:先由 `tsconfig.test.json`
把測試檔與它們 import 到的模組編成 CommonJS(Node 會把 `.ts` 當 ESM,而專案的
import 不帶副檔名),再跑編譯後的 JS。

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

### 永久連接(伺服器代管 refresh token)

Google 登入順手拿到的日曆 token 約 1 小時就過期。要讓連線**永久有效**,需部署
Firebase Functions 後端(`functions/`):設定頁的「🔗 永久連接 Google 日曆」會走
authorization code + PKCE,由 Functions 用 client secret 換取 refresh token 並存到
Firestore `googleTokens/{uid}`(規則擋死前端存取),之後 access token 過期會自動向後端續期。

一次性部署步驟:

1. Firebase 專案升級 **Blaze 方案**(Functions 需要;有免費額度,輕量使用近乎 $0)
2. 在 Google Cloud Console 的 **Web OAuth 用戶端**:
   - 「已授權的重新導向 URI」需包含正式站網址(如 `https://xxx.web.app`)與 `http://localhost:8081`
   - 複製「用戶端密碼」(client secret)
3. 設定 secret(互動式輸入,貼上 client secret):
   ```bash
   npx firebase functions:secrets:set GOOGLE_CLIENT_SECRET
   ```
4. `functions/.env` 需含 `GOOGLE_CLIENT_ID=<Web 用戶端 ID>`(非機密;已由 .env 產生)
5. 部署:
   ```bash
   npm --prefix functions install
   npx firebase deploy --only functions
   ```

手機版不需要另外操作:登入同一帳號後,token 過期會自動沿用伺服器代管的授權。

注意:
- **Expo Go 無法跑 Google OAuth**(Google 不接受其 redirect)。手機請用
  development build(`npx expo run:ios` / `run:android`),或先用 `npm run web` 測試
- 未部署 Functions 時退回舊行為:登入順手連接的 token 約 1 小時過期,需重新授權
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

### 存取方式:配對碼 vs. 帳號白名單

空間有兩種存取模式,由 Firestore 根文件有沒有 `members` 欄位決定:

- **預設(無 `members`)**:知道 10 碼配對碼即可存取。配對碼是 31^10 ≈ 8×10^14
  的隨機字串,當 bearer token 強度足夠,而且不需要登入——免帳號共享是原本的設計。
- **鎖定(有 `members`)**:只有名單內的登入帳號能存取,配對碼不再是通行證。

**升級是手動的,不會自動發生**:設定頁登入後才會出現「🔒 鎖定為帳號存取」。
自動升級會把還沒有帳號的伴侶直接鎖在門外,所以刻意做成明確的選擇,並可隨時解除。

### 💾 備份

「清除所有資料」不可逆,雲端同步也只是另一份即時副本——兩者都不算備份。
設定頁可**匯出 JSON**(網頁下載 / 手機分享)與**從備份還原**。
匯入時逐筆驗證,壞掉的個別項目會跳過而非整份拒絕;備份**不含配對碼**,
還原時不會把裝置拉進備份來源的共享空間。

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
