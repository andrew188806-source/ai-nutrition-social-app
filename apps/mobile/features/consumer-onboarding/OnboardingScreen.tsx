import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useConsumerRuntime } from "../consumer-runtime/ConsumerRuntimeProvider";
import { useConsumerOnboarding } from "./ConsumerOnboardingProvider";
import { pc2Copy as c } from "./copy";
import { DocumentStatusNotice } from "./DocumentStatusNotice";
export function Pc2Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ padding: 14, borderWidth: 1, borderRadius: 12, opacity: disabled ? 0.4 : 1 }}><Text>{label}</Text></Pressable>; }
export function Pc2Check({ label, checked, set, disabled }: { label: string; checked: boolean; set: (v: boolean) => void; disabled: boolean }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => set(!checked)} style={{ padding: 12 }}><Text>{checked ? "☑" : "☐"} {label}</Text></Pressable>; }
export default function OnboardingScreen() {
  const { controller, snapshot } = useConsumerOnboarding(); const runtime = useConsumerRuntime(); const router = useRouter();
  const [name, setName] = useState(""); const [terms, setTerms] = useState(false); const [privacy, setPrivacy] = useState(false); const [training, setTraining] = useState(false);
  useEffect(() => { setName(""); setTerms(false); setPrivacy(false); setTraining(false); }, [runtime.state.actorKey, runtime.state.actorGeneration, snapshot.bundle?.bundleVersion]);
  const busy = snapshot.pending || runtime.state.operation !== "idle";
  useEffect(() => {
    if (runtime.state.authState.status === "signedIn" && snapshot.demoEnvironment === true && snapshot.demo?.confirmed && snapshot.state?.coreEligible && !snapshot.pending && !snapshot.uncertain) router.replace("/");
  }, [router, runtime.state.authState.status, snapshot.demoEnvironment, snapshot.demo?.confirmed, snapshot.state?.coreEligible, snapshot.pending, snapshot.uncertain]);
  if (runtime.state.authState.status !== "signedIn") return <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}><Text>請先登入帳號。</Text><Pc2Button label="前往登入" onPress={() => router.replace("/login")} /></ScrollView>;
  if (snapshot.demoStatus === "loading" || (snapshot.pending && snapshot.demoEnvironment !== false)) return <ScrollView contentContainerStyle={{ padding: 22 }}><Text>正在查核帳號狀態…</Text></ScrollView>;
  if (snapshot.demoEnvironment === true && snapshot.demo?.confirmed && !snapshot.uncertain) return <ScrollView contentContainerStyle={{ padding: 22 }}><Text>Demo 草稿已確認；正在進入 Demo…</Text></ScrollView>;
  if (snapshot.demoEnvironment === true || snapshot.demoStatus === "error") return <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
    <Text style={{ fontSize: 24 }}>TastKind Demo 草稿確認</Text>
    {snapshot.pending ? <Text>正在讀取帳號確認狀態…</Text> : null}
    {snapshot.demoEnvironment === true && snapshot.demo && !snapshot.demo.confirmed ? <View style={{ gap: 16 }}>
      <Text>目前文件仍在撰寫，此確認僅供 Demo 試用，不具法律同意效力，也不是 AI 訓練授權。正式文件生效後將另行徵求必要同意。</Text>
      <Pc2Button label="同意授權（目前撰寫中不具效力）" disabled={busy} onPress={() => void controller?.confirmDemo().then(ok => { if (ok) void runtime.retryProfile(); })} />
    </View> : null}
    {snapshot.error ? <Text accessibilityRole="alert">確認狀態尚未保存或無法查核。請重試；不會視為成功。</Text> : null}
    {!snapshot.pending && (snapshot.error || snapshot.uncertain || !snapshot.demo) ? <Pc2Button label="重試讀取確認狀態" disabled={busy} onPress={() => void controller?.refresh()} /> : null}
    {snapshot.demo?.confirmed && !snapshot.pending && !snapshot.uncertain ? <Text>Demo 草稿已確認；正在進入 Demo…</Text> : null}
    <Pc2Button label={c.logout} disabled={busy} onPress={() => void runtime.signOut()} />
  </ScrollView>;
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}><Text style={{ fontSize: 24 }}>{c.title}</Text>
    <Text>{c.required}</Text><Text>{c.trainingScope}</Text><Text>{c.nutrition}</Text>
    <DocumentStatusNotice snapshot={snapshot} retry={controller ? () => void controller.refresh() : undefined} disabled={busy} />
    {snapshot.documentStatus === "available" && snapshot.bundle ? <View style={{ gap: 12 }}>
      <Text>{c.name}</Text><TextInput accessibilityLabel={c.name} value={name} onChangeText={setName} editable={!busy} maxLength={40} style={{ borderWidth: 1, padding: 12 }} />
      {snapshot.bundle.documents.map((d) => <Pc2Button key={d.documentId} label={`${c.documents}：${d.documentId} ${d.version}`} disabled={busy} onPress={() => router.push({ pathname: "/consent-document" as never, params: { documentId: d.documentId } })} />)}
      <Pc2Check label={c.terms} checked={terms} set={setTerms} disabled={busy} /><Pc2Check label={c.privacy} checked={privacy} set={setPrivacy} disabled={busy} /><Pc2Check label={c.training} checked={training} set={setTraining} disabled={busy} />
      <Pc2Button label="明確完成帳號與必要授權" disabled={busy || !terms || !privacy || !training} onPress={() => void controller?.complete(name, terms, privacy, training).then((ok) => { if (ok) void runtime.retryProfile(); })} />
      <Pc2Button label={c.regrant} disabled={busy || !training} onPress={() => void controller?.regrant(training)} />
    </View> : null}
    {snapshot.state?.preparationCompatibility ? <Text>{c.legacy}</Text> : null}
    {snapshot.pending ? <Text>{c.pending}</Text> : null}{snapshot.uncertain ? <Text>{c.uncertain}</Text> : null}
    {snapshot.documentStatus === "available" && snapshot.error && snapshot.error !== "unavailable" ? <Text accessibilityRole="alert">{c.error}</Text> : null}
    <Text>{c.withdrawalLimit}</Text>
    <Pc2Button label={c.withdraw} disabled={busy || !snapshot.state?.trainingGranted} onPress={() => void controller?.withdraw()} />
    <Pc2Button label={c.reread} disabled={busy} onPress={() => void controller?.refresh()} />
    <Pc2Button label={c.support} onPress={() => router.push("/account-support" as never)} />
    {snapshot.state?.coreEligible ? <Pc2Button label="進入已完成正式授權的服務" disabled={busy} onPress={() => router.replace("/")} /> : null}
    <Pc2Button label={c.logout} disabled={busy} onPress={() => void runtime.signOut()} />
  </ScrollView>;
}
