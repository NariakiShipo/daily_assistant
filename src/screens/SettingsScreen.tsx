import React, { useState } from 'react';
import {
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing, userColorChoices } from '../theme';
import { Button, Card, SectionTitle } from '../components/ui';
import { sendTestNotification } from '../services/notifications';
import { useGoogleAuth, signOutGoogle } from '../services/googleAuth';
import { authErrorMessage, signInEmail, signOutUser, signUpEmail } from '../services/auth';
import { useGoogleLogin } from '../services/googleLogin';
import { confirmDialog, notify } from '../utils/dialog';

const SettingsScreen: React.FC = () => {
  const {
    data,
    shared,
    firebaseAvailable,
    authUser,
    updateUser,
    setNotificationsEnabled,
    setGoogleToken,
    setGoogleConnected,
    createSharedSpace,
    joinSharedSpace,
    leaveSharedSpace,
    resetAll,
  } = useApp();
  const [token, setToken] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [working, setWorking] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const doAuth = async (mode: 'in' | 'up') => {
    if (!email.trim() || !password) return notify('請輸入 Email 與密碼');
    setAuthBusy(true);
    try {
      if (mode === 'in') await signInEmail(email, password);
      else await signUpEmail(email, password);
      setPassword('');
      notify(mode === 'in' ? '登入成功' : '註冊成功', '本機資料會自動上傳雲端並開始同步。');
    } catch (e) {
      notify(mode === 'in' ? '登入失敗' : '註冊失敗', authErrorMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const google = useGoogleAuth((ok) => {
    setGoogleConnected(ok);
    notify(ok ? '已連接 Google' : '連接失敗', ok ? '行程可自動同步到 Google 日曆了。' : '請確認 config.ts 的用戶端 ID 與平台設定。');
  });

  const googleLogin = useGoogleLogin((ok, code) => {
    if (ok) notify('Google 登入成功', '本機資料會自動上傳雲端並開始同步。');
    else if (code) notify('Google 登入失敗', authErrorMessage({ code }));
  });

  const disconnectGoogle = () => {
    void signOutGoogle();
    setGoogleToken(null);
    setToken('');
  };

  const onCreateSpace = async () => {
    setWorking(true);
    try {
      const code = await createSharedSpace();
      notify('共享空間已建立', `配對碼:${code}\n\n請把配對碼傳給對方,在另一台裝置輸入即可同步。`);
    } catch (e) {
      notify('建立失敗', String(e));
    } finally {
      setWorking(false);
    }
  };

  const onJoinSpace = async () => {
    if (!joinCode.trim()) return;
    setWorking(true);
    try {
      const ok = await joinSharedSpace(joinCode);
      notify(ok ? '已加入' : '找不到此配對碼', ok ? '兩台裝置的資料會即時同步。' : '請確認配對碼是否正確。');
      if (ok) setJoinCode('');
    } catch (e) {
      notify('加入失敗', String(e));
    } finally {
      setWorking(false);
    }
  };

  const shareCode = () => {
    if (data.settings.spaceId) {
      void Share.share({ message: `Daily Assistant 配對碼:${data.settings.spaceId}` });
    }
  };

  const confirmReset = () => {
    confirmDialog('清除所有資料', '行程與經期紀錄都會刪除,確定嗎?', () => void resetAll(), {
      confirmLabel: '清除',
      destructive: true,
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
    >
      {/* 成員 */}
      <Card>
        <SectionTitle>成員設定</SectionTitle>
        <Text style={s.hint}>
          兩位成員共用日曆與經期紀錄,行程與紀錄都會標記是誰的/誰記的。
          {shared ? '名稱與顏色會同步到對方裝置。' : ''}
        </Text>
        {data.users.map((u) => (
          <View key={u.id} style={s.userRow}>
            <TextInput
              style={s.nameInput}
              value={u.name}
              onChangeText={(name) => updateUser({ ...u, name })}
            />
            <View style={s.colorRow}>
              {userColorChoices.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.swatch, { backgroundColor: c }, u.color === c && s.swatchActive]}
                  onPress={() => updateUser({ ...u, color: c })}
                />
              ))}
            </View>
            {u.isPrimary && <Text style={s.primaryTag}>經期紀錄對象</Text>}
          </View>
        ))}
      </Card>

      {/* 帳號(雲端同步) */}
      <Card>
        <SectionTitle>帳號(雲端同步)</SectionTitle>
        {!firebaseAvailable ? (
          <Text style={s.hint}>尚未設定 Firebase,無法使用帳號功能。</Text>
        ) : authUser ? (
          <>
            <Text style={s.hint}>已登入:{authUser.email}</Text>
            <Text style={s.hint}>
              本機的行程、經期與課表已上傳雲端;在其他裝置登入同一帳號即自動同步。
            </Text>
            <Button
              label="登出"
              variant="outline"
              onPress={() => {
                void signOutUser();
                notify('已登出', '資料保留在本機,仍會以下方配對碼模式繼續同步。');
              }}
            />
          </>
        ) : (
          <>
            <Text style={s.hint}>
              登入後,本機記錄會自動上傳雲端;換裝置或重灌只要登入同一帳號,資料就會回來。
              (也可以繼續用下方的配對碼與伴侶共享,登入會自動綁定同一個空間)
            </Text>
            <TextInput
              style={s.tokenInput}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[s.tokenInput, { marginTop: spacing.sm }]}
              value={password}
              onChangeText={setPassword}
              placeholder="密碼(至少 6 碼)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              secureTextEntry
            />
            <Button label={authBusy ? '處理中…' : '登入'} onPress={() => void doAuth('in')} disabled={authBusy} />
            <Button
              label="註冊新帳號"
              variant="outline"
              onPress={() => void doAuth('up')}
              disabled={authBusy}
            />
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>或</Text>
              <View style={s.dividerLine} />
            </View>
            <Button
              label={googleLogin.busy ? '登入中…' : '使用 Google 登入'}
              variant="outline"
              onPress={() => void googleLogin.signIn()}
              disabled={!googleLogin.ready || googleLogin.busy}
            />
          </>
        )}
      </Card>

      {/* 跨裝置共享 */}
      <Card>
        <SectionTitle>跨裝置共享(Firebase)</SectionTitle>
        {!firebaseAvailable ? (
          <Text style={s.hint}>
            尚未設定 Firebase。請依 README 步驟建立 Firebase 專案,把設定貼進 src/config.ts
            後重新啟動,即可與另一半即時同步。
          </Text>
        ) : shared ? (
          <>
            <Text style={s.codeLabel}>配對碼</Text>
            <Text style={s.code}>{data.settings.spaceId}</Text>
            <Button label="分享配對碼給對方" onPress={shareCode} />
            <Button label="離開共享空間" variant="outline" onPress={leaveSharedSpace} />
            <Text style={s.hint}>離開後資料保留在本機,不會刪除雲端資料。</Text>
          </>
        ) : (
          <>
            <Text style={s.hint}>
              建立共享空間後會得到一組配對碼,對方輸入後雙方即時同步行程、經期紀錄與成員設定;
              對方修改時你也會收到通知。
            </Text>
            <Button label="建立共享空間" onPress={() => void onCreateSpace()} disabled={working} />
            <Text style={[s.hint, { marginTop: spacing.md }]}>或輸入對方的配對碼:</Text>
            <TextInput
              style={s.tokenInput}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="例如:K7PQ2WX4MN"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
            />
            <Button label="加入共享空間" variant="outline" onPress={() => void onJoinSpace()} disabled={working} />
          </>
        )}
      </Card>

      {/* Google Calendar */}
      <Card>
        <SectionTitle>Google Calendar</SectionTitle>
        <Text style={s.hint}>
          狀態:{data.settings.googleConnected ? '✅ 已連接' : '尚未連接'}
        </Text>
        {!data.settings.googleConnected ? (
          <>
            {google.configured ? (
              <Button
                label={google.busy ? '連接中…' : '使用 Google 帳號登入'}
                onPress={() => void google.signIn()}
                disabled={!google.ready || google.busy}
              />
            ) : (
              <Text style={s.hint}>
                尚未設定 OAuth 用戶端 ID。請依 README 步驟到 Google Cloud Console 申請,
                填入 src/config.ts 後此處會出現登入按鈕。
              </Text>
            )}
            <Text style={[s.hint, { marginTop: spacing.md }]}>開發測試:手動貼 Access Token</Text>
            <TextInput
              style={s.tokenInput}
              value={token}
              onChangeText={setToken}
              placeholder="貼上 OAuth Playground 取得的 token"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            <Button
              label="使用測試 Token 連接"
              variant="outline"
              onPress={() => {
                if (token.trim()) setGoogleToken(token.trim());
              }}
            />
          </>
        ) : (
          <Button label="中斷連接" variant="outline" onPress={disconnectGoogle} />
        )}
        <Text style={s.hint}>
          連接後,行程開啟「同步到 Google 日曆」即自動同步;也可在 Google
          日曆建立共用日曆並將對方加為編輯者(見 README)。
        </Text>
      </Card>

      {/* 通知 */}
      <Card>
        <SectionTitle>通知</SectionTitle>
        <View style={s.switchRow}>
          <Text style={s.switchLabel}>啟用推播通知</Text>
          <Switch
            value={data.settings.notificationsEnabled}
            onValueChange={(v) => void setNotificationsEnabled(v)}
            trackColor={{ true: colors.primary }}
          />
        </View>
        <Text style={s.hint}>
          啟用後:經期前 {data.settings.remindDaysBefore} 天與預測開始日會收到提醒;
          {shared ? '對方' : '共同日曆'}修改行程時也會通知。
        </Text>
        <Button label="發送測試通知" variant="outline" onPress={() => void sendTestNotification()} />
      </Card>

      {/* 資料 */}
      <Card>
        <SectionTitle>資料</SectionTitle>
        <Text style={s.hint}>
          {shared
            ? '資料即時同步至 Firebase,本機保留快取。'
            : '資料目前儲存在本機。設定 Firebase 並配對後即可跨裝置共享。'}
        </Text>
        <Button label="清除所有資料" variant="danger" onPress={confirmReset} />
      </Card>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 18 },
  userRow: { marginBottom: spacing.md },
  nameInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  colorRow: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 26, height: 26, borderRadius: 13, marginRight: spacing.sm },
  swatchActive: { borderWidth: 3, borderColor: colors.text },
  primaryTag: { fontSize: 11, color: colors.primary, marginTop: 4, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  switchLabel: { fontSize: 14, color: colors.text, fontWeight: '600' },
  tokenInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.textMuted, marginHorizontal: spacing.sm },
  codeLabel: { fontSize: 12, color: colors.textMuted },
  code: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
    marginVertical: spacing.xs,
  },
});

export default SettingsScreen;
