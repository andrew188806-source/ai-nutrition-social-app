import { useConsumerOnboarding } from "../features/consumer-onboarding/ConsumerOnboardingProvider";
import { pc2Copy as pc2 } from "../features/consumer-onboarding/copy";
import { DocumentStatusNotice } from "../features/consumer-onboarding/DocumentStatusNotice";
import { EmailOtpForm } from "../features/consumer-auth/EmailOtpForm";
import { useState, useSyncExternalStore } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { fonts, radius, shadows, snowPalette as colors } from "../theme/tokens";
const noopSubscribe = () => () => undefined;
const idleStatus = () => "idle";
export default function LoginScreen() {
  const runtime = useConsumerRuntime();
  const copy = zhTW.mobile.consumerAuth;
  const { controller: onboarding, snapshot } = useConsumerOnboarding();
  const [createAccount, setCreateAccount] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const otpStatus = useSyncExternalStore(onboarding?.emailOtp.subscribe ?? noopSubscribe, onboarding ? () => onboarding.emailOtp.getSnapshot().status : idleStatus, idleStatus);
  const busy = runtime.state.operation !== "idle" || snapshot.pending || otpStatus === "sending" || otpStatus === "verifying";
  const emailSignInAvailable = runtime.mode === "supabase";
  async function submitPasswordSignIn() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) { setValidationError(copy.fieldsRequired); return; }
    setValidationError(null);
    await runtime.signIn(email, password);
    setPassword("");
  }
  const runtimeError = runtime.state.errorCode === "authentication_timeout" ? pc2.uncertain : runtime.state.errorCode === "operation_not_enabled" ? copy.operationNotEnabled : runtime.state.errorCode === "authentication_failed" ? copy.authFailed : null;
  return <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text style={styles.title}>{zhTW.mobile.loginTitle}</Text><Text style={styles.subtitle}>{zhTW.mobile.loginSubtitle}</Text></View>
      {runtime.mode === "mock" ? <View style={styles.card}>
        <Text style={styles.cardTitle}>{copy.demoTitle}</Text><Text style={styles.cardBody}>{copy.demoBody}</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runtime.signInDemo()} style={[styles.primaryButton, busy && styles.buttonDisabled]}><Text style={styles.primaryButtonText}>{busy ? copy.signingIn : copy.demoSignIn}</Text></Pressable>
      </View> : <View style={styles.card}>
        <Pressable accessibilityRole="button" disabled={busy || !onboarding} onPress={() => { onboarding?.emailOtp.changeEmail(); setCreateAccount(!createAccount); setPasswordMode(false); setPassword(""); setValidationError(null); }}><Text>{createAccount ? "已有帳號：登入" : "建立新帳號"}</Text></Pressable>
        {createAccount && snapshot.demoEnvironment === true ? <View style={styles.notice}><Text>Development Demo 註冊。先以郵件驗證碼建立帳號；登入後才確認 Demo 草稿，不代表正式法律同意或訓練授權。</Text></View> : createAccount ? <View style={styles.notice}><Text>{pc2.required}</Text><DocumentStatusNotice snapshot={snapshot} retry={onboarding ? () => void onboarding.refresh() : undefined} disabled={busy} /><Text>驗證信箱後仍須完成必要文件授權，才能使用相關功能。</Text></View> : <Pressable accessibilityRole="button" disabled={busy} onPress={() => { onboarding?.emailOtp.changeEmail(); setPasswordMode(!passwordMode); setPassword(""); setValidationError(null); }}><Text>{passwordMode ? "改用信箱驗證碼登入" : "使用既有密碼登入"}</Text></Pressable>}
        {runtime.mode === "disabled" ? <View style={styles.notice}><Text>{copy.disabledTitle}</Text><Text>{copy.disabledBody}</Text></View> : null}
        {!passwordMode || createAccount ? <EmailOtpForm controller={onboarding?.emailOtp ?? null} purpose={createAccount ? "signup" : "login"} disabled={busy || !emailSignInAvailable || (createAccount && !snapshot.bundle && snapshot.demoEnvironment !== true)} /> : <View style={{ gap: 12 }}>
          <Text style={styles.inputLabel}>{copy.emailLabel}</Text><TextInput accessibilityLabel={copy.emailLabel} autoCapitalize="none" autoComplete="email" editable={!busy && emailSignInAvailable} inputMode="email" keyboardType="email-address" onChangeText={setEmail} placeholder={copy.emailPlaceholder} style={styles.input} value={email} />
          <Text style={styles.inputLabel}>{copy.passwordLabel}</Text><TextInput accessibilityLabel={copy.passwordLabel} autoCapitalize="none" autoComplete="current-password" editable={!busy && emailSignInAvailable} onChangeText={setPassword} onSubmitEditing={() => void submitPasswordSignIn()} secureTextEntry style={styles.input} value={password} />
          {validationError || runtimeError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{validationError ?? runtimeError}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy || !emailSignInAvailable} onPress={() => void submitPasswordSignIn()} style={[styles.primaryButton, busy && styles.buttonDisabled]}><Text style={styles.primaryButtonText}>{busy ? copy.signingIn : copy.signIn}</Text></Pressable>
        </View>}
      </View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: "center", gap: 22, padding: 20 },
  header: { gap: 8 }, title: { color: colors.ink, fontFamily: fonts.black, fontSize: 32, fontWeight: "900" },
  subtitle: { color: colors.sub, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  card: { gap: 12, borderColor: colors.line, borderRadius: radius.base, borderWidth: 1, backgroundColor: colors.card, padding: 20, ...shadows.soft },
  cardTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18, fontWeight: "800" },
  cardBody: { color: colors.sub, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  inputLabel: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13, fontWeight: "800" },
  input: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, backgroundColor: colors.bg, color: colors.ink, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButton: { alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.primaryDeep, marginTop: 4, paddingHorizontal: 18, paddingVertical: 13 },
  buttonDisabled: { opacity: 0.5 }, primaryButtonText: { color: "#ffffff", fontFamily: fonts.bold, fontSize: 14, fontWeight: "900" },
  errorText: { color: colors.primaryDeep, fontFamily: fonts.medium, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  notice: { gap: 5, borderRadius: radius.sm, backgroundColor: colors.bg2, padding: 12 }
});
