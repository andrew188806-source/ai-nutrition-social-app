import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { TOTP_CODE_LENGTH } from "../features/consumer-auth/emailOtpController";
import { EmailOtpForm } from "../features/consumer-auth/EmailOtpForm";
import { useConsumerOnboarding } from "../features/consumer-onboarding/ConsumerOnboardingProvider";
import { useConsumerRuntime } from "../features/consumer-runtime";
const noSubscribe = () => () => undefined;
const empty: import("../features/consumer-auth/emailOtpController").EmailOtpSnapshot = Object.freeze({ status: "idle", email: "", purpose: "login", resendAt: 0, attempts: 0, error: null });
const unavailable = () => empty;
const messages: Record<string, string> = {
  password_reauthentication_required: "請重新以最新郵件驗證碼驗證自己的帳號，再設定密碼。",
  password_invalid: "密碼至少需要 8 個字元。",
  password_weak: "密碼強度不足，請使用更長且不易猜測的密碼。",
  password_unchanged: "請使用與目前不同的新密碼。",
  password_update_uncertain: "保存結果尚無法確認。請以新密碼嘗試正常登入，或重新驗證信箱後查核；不會顯示為成功。",
  password_update_failed: "密碼尚未成功保存，請重試；不會顯示為成功。",
  password_mfa_required: "此帳號已啟用兩步驟驗證。請先輸入驗證器 App 目前顯示的 6 位數驗證碼，再設定新密碼；密碼尚未變更。",
  totp_invalid_code: "兩步驟驗證碼不正確或已過期，密碼尚未變更。請輸入驗證器 App 目前顯示的 6 位數驗證碼。",
  totp_attempts_exhausted: "兩步驟驗證嘗試次數已達上限，密碼尚未變更。請重新以郵件驗證碼驗證信箱後再試。",
  totp_unavailable: "目前無法完成兩步驟驗證，密碼尚未變更。請稍後重試，或重新驗證信箱。",
  password_recovery_unavailable: "目前無法在此流程設定這個帳號的密碼，密碼尚未變更。請稍後再試；若持續發生，請聯絡 TastKind 支援。",
  operation_not_enabled: "目前無法設定產品密碼，請稍後重試。"
};
export default function AccountPasswordScreen() {
  const runtime = useConsumerRuntime(), router = useRouter();
  const { controller } = useConsumerOnboarding();
  const otp = controller?.emailOtp ?? null;
  const snapshot = useSyncExternalStore(otp?.subscribe ?? noSubscribe, otp?.getSnapshot ?? unavailable, otp?.getSnapshot ?? unavailable);
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const actor = useRef(runtime.state.actorKey); actor.current = runtime.state.actorKey;
  useEffect(() => { setPassword(""); setConfirmation(""); setTotpCode(""); setSaved(false); setError(null); }, [runtime.state.actorKey]);
  const verified = runtime.state.authState.status === "signedIn" && (snapshot.status === "verified" || saving);
  // The consumer path is for consumers only: the form stays closed until the database authority has cleared this account.
  const eligible = snapshot.recovery === "eligible";
  useEffect(() => { if (verified && !saved && snapshot.recovery === "unchecked") void otp?.checkRecovery(); }, [verified, saved, snapshot.recovery, otp]);
  const totpPending = verified && !saved && eligible && (snapshot.totp === "required" || snapshot.totp === "verifying");
  async function submitTotp() {
    if (!totpPending || !otp || snapshot.totp === "verifying" || saving) return;
    const value = totpCode; setTotpCode(""); setError(null);
    const expectedActor = actor.current;
    await otp.verifyTotp(value);
    if (actor.current !== expectedActor) setTotpCode("");
  }
  async function submit() {
    if (!verified || !otp || saving || saved) return;
    if (password.length < 8 || password !== confirmation) { setError(password.length < 8 ? messages.password_invalid : "兩次輸入的密碼不同。"); return; }
    setSaving(true); setError(null);
    const value = password; setPassword(""); setConfirmation("");
    const expectedActor = actor.current;
    try { const ok = await otp.setOwnPassword(value); if (actor.current === expectedActor) setSaved(ok); } finally { setSaving(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Text accessibilityRole="header">設定 TastKind 產品密碼</Text>
    <Text>先驗證自己的信箱，再自行輸入新密碼。此操作只更新目前已驗證帳號的產品密碼，不改寫 Demo 草稿確認或正式同意紀錄。</Text>
    {!verified && !saved ? <EmailOtpForm controller={otp} purpose="login" afterVerify="/account-password" disabled={saving} /> : null}
    {totpPending ? <>
      <Text>此帳號已啟用兩步驟驗證。請輸入驗證器 App 目前顯示的 6 位數驗證碼，通過後才能設定新密碼。</Text>
      <TextInput accessibilityLabel="兩步驟驗證碼" autoComplete="one-time-code" inputMode="numeric" keyboardType="number-pad" secureTextEntry editable={snapshot.totp !== "verifying"} maxLength={TOTP_CODE_LENGTH} value={totpCode} onChangeText={setTotpCode} onSubmitEditing={() => void submitTotp()} placeholder="6 位數驗證碼" style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Pressable accessibilityRole="button" disabled={snapshot.totp === "verifying" || totpCode.length !== TOTP_CODE_LENGTH} onPress={() => void submitTotp()}><Text>{snapshot.totp === "verifying" ? "正在驗證…" : "驗證兩步驟驗證碼"}</Text></Pressable>
    </> : null}
    {verified && !saved && snapshot.recovery === "checking" ? <Text accessibilityLiveRegion="polite">正在確認帳號…</Text> : null}
    {verified && !saved && eligible && !totpPending ? <>
      <TextInput accessibilityLabel="新產品密碼" autoCapitalize="none" autoComplete="new-password" secureTextEntry editable={!saving} value={password} onChangeText={setPassword} placeholder="至少 8 個字元" style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput accessibilityLabel="再次輸入新產品密碼" autoCapitalize="none" autoComplete="new-password" secureTextEntry editable={!saving} value={confirmation} onChangeText={setConfirmation} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()}><Text>{saving ? "正在保存…" : "保存產品密碼"}</Text></Pressable>
    </> : null}
    {error || snapshot.error ? <Text accessibilityRole="alert">{error ?? messages[snapshot.error ?? ""] ?? "設定未完成，請重新驗證後重試。"}</Text> : null}
    {(snapshot.error === "password_reauthentication_required" || snapshot.error === "password_update_uncertain" || snapshot.error === "totp_attempts_exhausted") ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => { otp?.changeEmail(); setPassword(""); setConfirmation(""); }}><Text>重新驗證信箱</Text></Pressable> : null}
    {saved ? <Text accessibilityLiveRegion="polite">產品密碼已保存。下次可直接使用電子郵件與密碼登入。</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => router.replace(runtime.state.authState.status === "signedIn" ? "/" : "/login")}><Text>{runtime.state.authState.status === "signedIn" ? "返回 Demo" : "返回登入"}</Text></Pressable>
  </ScrollView>;
}
