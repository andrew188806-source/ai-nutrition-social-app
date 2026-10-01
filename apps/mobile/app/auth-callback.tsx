import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useConsumerRuntime } from "../features/consumer-runtime/ConsumerRuntimeProvider";
import { useConsumerOnboarding } from "../features/consumer-onboarding/ConsumerOnboardingProvider";
import { Pc2Button } from "../features/consumer-onboarding/OnboardingScreen";
import { pc2Copy as c } from "../features/consumer-onboarding/copy";
export default function AuthCallbackScreen() {
  const runtime = useConsumerRuntime();
  const { controller, snapshot } = useConsumerOnboarding(); const router = useRouter(); const started = useRef(false); const url = Linking.useURL();
  useEffect(() => {
    if (!controller || started.current || snapshot.pending) return;
    const handle = (value: string | null) => { if (value && !started.current) { started.current = true; void controller.completeCallback(value).then((ok) => { if (ok) router.replace("/onboarding" as never); }); } };
    handle(url); if (!started.current) void Linking.getInitialURL().then(handle);
  }, [controller, router, url, snapshot.pending]);
  // The SDK observer may settle the authenticated actor before the original callback returns.
  // Onboarding rereads the current actor; a stale callback result is never used as eligibility.
  useEffect(() => { if (runtime.state.authState.status === "signedIn") router.replace("/onboarding" as never); }, [router, runtime.state.actorKey, runtime.state.authState.status]);
  return <View style={{ padding: 22, gap: 16 }}><Text>{snapshot.pending ? c.pending : c.confirmation}</Text>{snapshot.error ? <Text>{c.error}</Text> : null}<Pc2Button label="返回登入" onPress={() => router.replace("/login")} /></View>;
}
