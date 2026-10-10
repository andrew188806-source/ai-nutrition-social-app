import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { ConsumerEmailOtpController, DEVELOPMENT_EMAIL_OTP_LENGTH, type EmailOtpPurpose, type EmailOtpSnapshot } from "./emailOtpController";
const unavailable: EmailOtpSnapshot = Object.freeze({ status: "idle", email: "", purpose: "login", resendAt: 0, attempts: 0, error: null });
const noopSubscribe = () => () => undefined;
const messages: Record<string, string> = {
  invalid_email: "請輸入有效的電子郵件地址。",
  invalid_code: "請輸入郵件中的 8 位數驗證碼。",
  email_otp_invalid_or_expired: "驗證碼不正確、已過期或已使用。請確認最新郵件，或重新寄送。",
  email_otp_rate_limited: "寄送或驗證次數過多，請稍候再試。",
  email_otp_attempts_exhausted: "此輪嘗試已達上限，請稍候重新寄送驗證碼。",
  email_otp_send_failed: "驗證碼請求失敗，請稍候重試；既有帳號請使用原註冊信箱。",
  email_otp_transport_failed: "無法連線到驗證服務，請確認網路後重試。",
  email_otp_identity_mismatch: "驗證身分不一致，請重新登入。",
  operation_not_enabled: "目前無法寄送驗證碼；新帳號仍須等待必要文件開放。"
};
export function EmailOtpForm({ controller, purpose, disabled = false }: { controller: ConsumerEmailOtpController | null; purpose: EmailOtpPurpose; disabled?: boolean }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSnapshot ?? (() => unavailable), controller?.getSnapshot ?? (() => unavailable));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { controller?.changeEmail(); setCode(""); }, [controller, purpose]);
  const busy = disabled || snapshot.status === "sending" || snapshot.status === "verifying";
  const sent = snapshot.status === "code_sent" || snapshot.status === "verifying" || snapshot.status === "verified";
  const seconds = Math.max(0, Math.ceil((snapshot.resendAt - now) / 1000));
  async function verify() {
    const value = code; setCode("");
    if (controller && await controller.verify(value)) router.replace("/onboarding" as never);
  }
  return <View style={{ gap: 12 }}>
    <Text>輸入信箱、收取驗證碼，再在此畫面輸入；不需點擊郵件連結。</Text>
    <TextInput accessibilityLabel="電子郵件" autoCapitalize="none" autoComplete="email" inputMode="email" keyboardType="email-address" editable={!busy && !sent} value={email} onChangeText={setEmail} placeholder="電子郵件" style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
    {!sent ? <View style={{ gap: 12 }}><Pressable accessibilityRole="button" disabled={busy || !controller || seconds > 0} onPress={() => void controller?.send(email, purpose)}><Text>{snapshot.status === "sending" ? "正在寄送…" : seconds > 0 ? `請稍候 ${seconds} 秒` : "寄送驗證碼"}</Text></Pressable>{purpose === "login" ? <Pressable accessibilityRole="button" disabled={busy || !controller} onPress={() => { setCode(""); controller?.useReceivedCode(email); }}><Text>已收到最新驗證碼：直接輸入</Text></Pressable> : null}</View> : <View style={{ gap: 12 }}>
      <Text>請輸入寄至 {snapshot.email} 的最新郵件驗證碼。</Text>
      <TextInput accessibilityLabel="信箱驗證碼" autoComplete="one-time-code" inputMode="numeric" keyboardType="number-pad" secureTextEntry editable={!busy && snapshot.status !== "verified"} maxLength={DEVELOPMENT_EMAIL_OTP_LENGTH} value={code} onChangeText={setCode} onSubmitEditing={() => void verify()} placeholder="8 位數驗證碼" style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
      <Pressable accessibilityRole="button" disabled={busy || snapshot.status === "verified" || code.length !== DEVELOPMENT_EMAIL_OTP_LENGTH || snapshot.attempts >= 5} onPress={() => void verify()}><Text>{snapshot.status === "verifying" ? "正在驗證…" : "驗證並登入"}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || seconds > 0 || snapshot.status === "verified"} onPress={() => { setCode(""); void controller?.send(snapshot.email, snapshot.purpose); }}><Text>{seconds > 0 ? `重新寄送（${seconds} 秒）` : "重新寄送驗證碼"}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { if (controller?.changeEmail()) { setEmail(""); setCode(""); } }}><Text>更換信箱</Text></Pressable>
    </View>}
    {snapshot.error ? <Text accessibilityLiveRegion="polite">{messages[snapshot.error] ?? "驗證未完成，請稍候重試。"}</Text> : null}
    {snapshot.status === "verified" ? <Text accessibilityLiveRegion="polite">信箱驗證成功；正在查核帳號授權狀態。</Text> : null}
  </View>;
}
