# 手機打包指南(自用安裝,不上架)

原生專案(`ios/`、`android/`)是 `npx expo prebuild` 的產物,不進版控。
改了 `app.json` 後重新執行 prebuild 即可同步原生設定。

## Android:建置 APK

工具鏈(已安裝):Homebrew 的 `openjdk@17`、`android-commandlinetools`,
SDK 位於 `~/Library/Android/sdk`(路徑寫在 `android/local.properties`)。

```bash
# 1. 重新產生原生專案(第一次或 app.json 有改動時)
npx expo prebuild --platform android

# 2. 建置 release APK
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew assembleRelease

# 產出:android/app/build/outputs/apk/release/app-release.apk
```

把 APK 傳到 Android 手機(Google 雲端硬碟 / LINE / USB 均可),
手機允許「安裝未知的應用程式」後點開安裝。
用同一台 Mac 重建的 APK 簽名相同,直接安裝即可原地升級。

## iOS:Xcode 免費簽名(7 天效期)

免費 Apple ID 簽名限制:**安裝後 7 天過期**,到期須接 Mac 重新 Run 一次;
一個免費帳號最多 3 個 App ID。app 已透過 `plugins/withoutPushEntitlement.js`
移除推播 entitlement(免費帳號不支援),本機排程通知不受影響。

```bash
# 第一次或 app.json 有改動時
npx expo prebuild --platform ios
cd ios && LANG=en_US.UTF-8 pod install
open DailyAssistant.xcworkspace
```

Xcode 內(只需設定一次):
1. Xcode → Settings → Accounts → 「+」登入你的 Apple ID(免費)。
2. 左側點專案 → TARGETS「DailyAssistant」→ Signing & Capabilities:
   勾 Automatically manage signing,Team 選你的「(Personal Team)」。
3. iPhone 接線,手機上開啟 設定 → 隱私權與安全性 → 開發者模式。
4. 上方裝置選你的 iPhone,按 ▶ Run。
5. 手機上:設定 → 一般 → VPN 與裝置管理 → 信任你的開發者憑證。

之後重裝(7 天到期時)接上手機執行:

```bash
npx expo run:ios --device --configuration Release
```

## 注意事項

- `.env` 的 `EXPO_PUBLIC_*` 會在建置時打進 bundle;改了 `.env` 要重新建置才生效。
- Google 日曆同步在手機上需要另外建立 iOS / Android 的 OAuth client ID
  (Google Cloud Console;Android 需填 debug keystore 的 SHA-1:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`),
  填入 `.env` 後重建。沒設定也不影響其他功能。
- 網頁版部署不受影響:`npx expo export --platform web && firebase deploy --only hosting`。
