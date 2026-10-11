import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
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
  operation_not_enabled: "目前無法設定產品密碼，請稍後重試。"
};
export default function AccountPasswordScreen() {
  const runtime = useConsumerRuntime(), router = useRouter();
  const { controller } = useConsumerOnboarding();
  const otp = controller?.emailOtp ?? null;
  const snapshot = useSyncExternalStore(otp?.subscribe ?? noSubscribe, otp?.getSnapshot ?? unavailable, otp?.getSnapshot ?? unavailable);
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const actor = useRef(runtime.state.actorKey); actor.current = runtime.state.actorKey;
  useEffect(() => { setPassword(""); setConfirmation(""); setSaved(false); setError(null); }, [runtime.state.actorKey]);
  const verified = runtime.state.authState.status === "signedIn" && (snapshot.status === "verified" || saving);
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
    {verified && !saved ? <>
      <TextInput accessibilityLabel="新產品密碼" autoCapitalize="none" autoComplete="new-password" secureTextEntry editable={!saving} value={password} onChangeText={setPassword} placeholder="至少 8 個字元" style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput accessibilityLabel="再次輸入新產品密碼" autoCapitalize="none" autoComplete="new-password" secureTextEntry editable={!saving} value={confirmation} onChangeText={setConfirmation} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()}><Text>{saving ? "正在保存…" : "保存產品密碼"}</Text></Pressable>
    </> : null}
    {error || snapshot.error ? <Text accessibilityRole="alert">{error ?? messages[snapshot.error ?? ""] ?? "設定未完成，請重新驗證後重試。"}</Text> : null}
    {(snapshot.error === "password_reauthentication_required" || snapshot.error === "password_update_uncertain") ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => { otp?.changeEmail(); setPassword(""); setConfirmation(""); }}><Text>重新驗證信箱</Text></Pressable> : null}
    {saved ? <Text accessibilityLiveRegion="polite">產品密碼已保存。下次可直接使用電子郵件與密碼登入。</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => router.replace(runtime.state.authState.status === "signedIn" ? "/" : "/login")}><Text>{runtime.state.authState.status === "signedIn" ? "返回 Demo" : "返回登入"}</Text></Pressable>
  </ScrollView>;
}
