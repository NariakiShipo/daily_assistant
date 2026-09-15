/**
 * 登入頁(設計稿 1a)— 更新後第一次進入 App 的第一屏。
 *
 * 動作本身沿用設定頁既有的登入 / 註冊 / Google 三個入口,只是拉到獨立首屏,
 * 讓「先登入把資料接上雲端」變成預設路徑而不是藏在設定最深處。
 *
 * 底部「先不登入,用本機模式」是刻意留的出口:現有使用者本來就能不開帳號、
 * 靠配對碼跟伴侶同步,強制登入會把他們擋在自己的資料外面。要改成強制登入,
 * 把那一行拿掉即可。
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing } from '../theme';
import { authErrorMessage, signInEmail, signUpEmail } from '../services/auth';
import { useGoogleLogin } from '../services/googleLogin';
import { notify } from '../utils/dialog';
import Icon from '../components/Icon';
import { mutedSmall } from '../components/expenseUi';

interface Props {
  /** 登入成功或選擇本機模式後,往下一步(選常用功能) */
  onDone: () => void;
}

const LoginScreen: React.FC<Props> = ({ onDone }) => {
  const { firebaseAvailable, setGoogleConnected } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const doAuth = async (mode: 'in' | 'up') => {
    if (!email.trim() || !password) {
      notify('請輸入 Email 與密碼');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') await signInEmail(email, password);
      else await signUpEmail(email, password);
      setPassword('');
      onDone();
    } catch (e) {
      notify(mode === 'in' ? '登入失敗' : '註冊失敗', authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = useGoogleLogin((ok, error, calendarConnected) => {
    if (ok) {
      if (calendarConnected) setGoogleConnected(true);
      onDone();
    } else if (error) {
      notify('Google 登入失敗', authErrorMessage(error));
    }
  });

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <View style={s.logo}>
            <Icon name="period" size={44} color={colors.primary} strokeWidth={1.6} />
          </View>
          <Text style={s.title}>Daily Bear</Text>
          <Text style={s.subtitle}>伴侶共用的生活助理</Text>
        </View>

        <View style={s.card}>
          {firebaseAvailable ? (
            <>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="密碼（至少 6 碼）"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                secureTextEntry
              />
              <TouchableOpacity
                style={[s.primaryBtn, busy && s.disabled]}
                onPress={() => void doAuth('in')}
                disabled={busy}
              >
                <Text style={s.primaryBtnText}>{busy ? '處理中…' : '登入'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.outlineBtn, busy && s.disabled]}
                onPress={() => void doAuth('up')}
                disabled={busy}
              >
                <Text style={s.outlineBtnText}>註冊新帳號</Text>
              </TouchableOpacity>

              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>或</Text>
                <View style={s.dividerLine} />
              </View>

              <TouchableOpacity
                style={[s.outlineBtn, (!googleLogin.ready || googleLogin.busy) && s.disabled]}
                onPress={() => void googleLogin.signIn()}
                disabled={!googleLogin.ready || googleLogin.busy}
              >
                <Text style={s.outlineBtnText}>
                  {googleLogin.busy ? '登入中…' : '使用 Google 登入'}
                </Text>
              </TouchableOpacity>

              <Text style={s.note}>
                登入後本機的行程、經期、課表與帳目會自動上傳雲端;換裝置登入同一帳號就會回來。Google
                登入會一併連接 Google 日曆。
              </Text>
            </>
          ) : (
            /*
             * 沒設定 Firebase 時不要擺一排按不動的按鈕——那只會讓人以為壞了。
             * 直接說明狀況,並把本機模式當成正常路徑。
             */
            <Text style={s.note}>
              這個安裝還沒設定 Firebase,所以沒有帳號功能。以本機模式繼續使用即可,
              資料存在這台裝置上,之後仍可用配對碼與伴侶共享。
            </Text>
          )}
        </View>

        <TouchableOpacity style={s.localMode} onPress={onDone}>
          <Text style={s.localModeText}>先不登入，用本機模式 ›</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },

  brand: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, marginTop: 6 },
  subtitle: { fontSize: 14, color: mutedSmall },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  outlineBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: mutedSmall },

  note: { fontSize: 12, lineHeight: 18, color: mutedSmall, marginTop: 4 },

  localMode: { marginTop: 'auto', paddingVertical: 44, alignItems: 'center' },
  localModeText: { fontSize: 13, color: mutedSmall },
});

export default LoginScreen;
