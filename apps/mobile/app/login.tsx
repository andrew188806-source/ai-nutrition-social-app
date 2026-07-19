import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { fonts, radius, shadows, snowPalette as colors } from "../theme/tokens";

export default function LoginScreen() {
  const runtime = useConsumerRuntime();
  const copy = zhTW.mobile.consumerAuth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const busy = runtime.state.operation === "signingIn";
  const emailSignInAvailable = runtime.mode === "supabase";

  async function submitEmailSignIn() {
    if (!email.trim() || !password) {
      setValidationError(copy.fieldsRequired);
      return;
    }
    setValidationError(null);
    await runtime.signIn(email, password);
  }

  const runtimeError = runtime.state.errorCode === "operation_not_enabled"
    ? copy.operationNotEnabled
    : runtime.state.errorCode === "authentication_failed"
      ? copy.authFailed
      : null;

  return (
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{zhTW.mobile.loginTitle}</Text>
          <Text style={styles.subtitle}>{zhTW.mobile.loginSubtitle}</Text>
        </View>

        {runtime.mode === "mock" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{copy.demoTitle}</Text>
            <Text style={styles.cardBody}>{copy.demoBody}</Text>
            <Pressable disabled={busy} onPress={() => void runtime.signInDemo()} style={[styles.primaryButton, busy && styles.buttonDisabled]}>
              <Text style={styles.primaryButtonText}>{busy ? copy.signingIn : copy.demoSignIn}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.inputLabel}>{copy.emailLabel}</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              editable={!busy && emailSignInAvailable}
              inputMode="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder={copy.emailPlaceholder}
              placeholderTextColor={colors.faint}
              style={styles.input}
              value={email}
            />
            <Text style={styles.inputLabel}>{copy.passwordLabel}</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy && emailSignInAvailable}
              onChangeText={setPassword}
              onSubmitEditing={() => void submitEmailSignIn()}
              placeholder={copy.passwordPlaceholder}
              placeholderTextColor={colors.faint}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {runtime.mode === "disabled" ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>{copy.disabledTitle}</Text>
                <Text style={styles.cardBody}>{copy.disabledBody}</Text>
              </View>
            ) : null}
            {validationError || runtimeError ? <Text style={styles.errorText}>{validationError ?? runtimeError}</Text> : null}
            <Pressable
              disabled={busy || !emailSignInAvailable}
              onPress={() => void submitEmailSignIn()}
              style={[styles.primaryButton, (busy || !emailSignInAvailable) && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{busy ? copy.signingIn : copy.signIn}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: "center", gap: 22, padding: 20 },
  header: { gap: 8 },
  title: { color: colors.ink, fontFamily: fonts.black, fontSize: 32, fontWeight: "900" },
  subtitle: { color: colors.sub, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  card: {
    gap: 12,
    borderColor: colors.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 20,
    ...shadows.soft
  },
  cardTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18, fontWeight: "800" },
  cardBody: { color: colors.sub, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  inputLabel: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13, fontWeight: "800" },
  input: {
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDeep,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#ffffff", fontFamily: fonts.bold, fontSize: 14, fontWeight: "900" },
  errorText: { color: colors.primaryDeep, fontFamily: fonts.medium, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  notice: { gap: 5, borderRadius: radius.sm, backgroundColor: colors.bg2, padding: 12 },
  noticeTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14, fontWeight: "800" }
});
