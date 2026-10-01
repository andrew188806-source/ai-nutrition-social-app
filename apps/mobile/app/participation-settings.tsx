import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, Text } from "react-native";
import { useConsumerRuntime } from "../features/consumer-runtime/ConsumerRuntimeProvider";
import { useConsumerOnboarding } from "../features/consumer-onboarding/ConsumerOnboardingProvider";
import { Pc2Button, Pc2Check } from "../features/consumer-onboarding/OnboardingScreen";
import { pc2Copy as c } from "../features/consumer-onboarding/copy";
export default function ParticipationSettingsScreen() {
  const { controller, snapshot } = useConsumerOnboarding(); const router = useRouter(); const [adult, setAdult] = useState(false); const s = snapshot.state; const busy = snapshot.pending;
  const runtime = useConsumerRuntime();
  useEffect(() => { setAdult(false); }, [runtime.state.actorKey, runtime.state.actorGeneration]);
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}><Text style={{ fontSize: 24 }}>{c.social}</Text><Text>{c.disclosure}</Text>
    {s?.preparationCompatibility ? <Text>{c.legacy}</Text> : null}<Text>{s ? `伺服器參與狀態：${s.participation}` : c.uncertain}</Text>
    <Pc2Check label={c.adult} checked={adult} set={setAdult} disabled={busy} />
    <Pc2Button label="儲存明確 18+ 自我聲明" disabled={busy || !adult} onPress={() => void controller?.attest(true)} />
    <Pc2Button label={c.underage} disabled={busy} onPress={() => void controller?.attest(false)} />
    <Pc2Button label={c.optIn} disabled={busy || !s?.socialQualified || s.participation !== "not_participating"} onPress={() => void controller?.participation("opt_in")} />
    <Pc2Button label={c.notNow} disabled={busy} onPress={() => router.replace(s?.coreEligible ? "/" : "/onboarding" as never)} />
    <Pc2Button label={c.pause} disabled={busy || s?.participation !== "opted_in"} onPress={() => void controller?.participation("pause")} />
    <Pc2Button label={c.resume} disabled={busy || !s?.socialQualified || s.participation !== "paused"} onPress={() => void controller?.participation("resume")} />
    <Pc2Button label={c.optOut} disabled={busy || !s || s.participation === "not_participating"} onPress={() => void controller?.participation("opt_out")} />
    {s?.socialEligible ? <Pc2Button label="前往飯友" disabled={busy} onPress={() => router.replace("/meal-buddies")} /> : null}
    {snapshot.error ? <Text accessibilityRole="alert">{c.error}</Text> : null}{snapshot.uncertain ? <Text>{c.uncertain}</Text> : null}
    <Pc2Button label={c.reread} disabled={busy} onPress={() => void controller?.refresh()} /><Pc2Button label="帳號授權與撤回" onPress={() => router.push("/onboarding" as never)} />
  </ScrollView>;
}
