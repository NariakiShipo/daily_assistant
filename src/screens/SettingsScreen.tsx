import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
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

const SettingsScreen: React.FC = () => {
  const { data, updateUser, setNotificationsEnabled, setGoogleToken, resetAll } = useApp();
  const [token, setToken] = useState('');

  const connectGoogle = () => {
    if (!token.trim()) {
      Alert.alert(
        '連接 Google Calendar',
        '正式版會走 OAuth 登入流程(expo-auth-session)。\n\n' +
          '開發測試:到 developers.google.com/oauthplayground 勾選 Calendar API v3 取得 Access Token,貼到上方欄位即可測試同步。'
      );
      return;
    }
    setGoogleToken(token.trim());
    Alert.alert('已連接', '行程開啟「同步到 Google 日曆」後會自動同步。');
  };

  const disconnectGoogle = () => {
    setGoogleToken(null);
    setToken('');
  };

  const confirmReset = () => {
    Alert.alert('清除所有資料', '行程與經期紀錄都會刪除,確定嗎?', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => void resetAll() },
    ]);
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
          兩位成員共用這份日曆與經期紀錄。行程與紀錄都會標記是誰的/誰記的。
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
                  style={[
                    s.swatch,
                    { backgroundColor: c },
                    u.color === c && s.swatchActive,
                  ]}
                  onPress={() => updateUser({ ...u, color: c })}
                />
              ))}
            </View>
            {u.isPrimary && <Text style={s.primaryTag}>經期紀錄對象</Text>}
          </View>
        ))}
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
          共同日曆有變動時也會通知。
        </Text>
        <Button label="發送測試通知" variant="outline" onPress={() => void sendTestNotification()} />
      </Card>

      {/* Google Calendar */}
      <Card>
        <SectionTitle>Google Calendar</SectionTitle>
        <Text style={s.hint}>
          狀態:{data.settings.googleConnected ? '✅ 已連接' : '尚未連接'}
        </Text>
        {!data.settings.googleConnected ? (
          <>
            <TextInput
              style={s.tokenInput}
              value={token}
              onChangeText={setToken}
              placeholder="貼上 Access Token(開發測試用)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            <Button label="連接 Google Calendar" onPress={connectGoogle} />
          </>
        ) : (
          <Button label="中斷連接" variant="outline" onPress={disconnectGoogle} />
        )}
        <Text style={s.hint}>
          共同編輯:連接後可在 Google 日曆建立共用日曆,將對方帳號加為編輯者,雙方都能讀寫同一份日曆。
        </Text>
      </Card>

      {/* 資料 */}
      <Card>
        <SectionTitle>資料</SectionTitle>
        <Text style={s.hint}>資料目前儲存在本機。正式版將同步至 Firebase,跨裝置即時共享。</Text>
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
});

export default SettingsScreen;
