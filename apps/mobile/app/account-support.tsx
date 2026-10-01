import { ScrollView, Text } from "react-native";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { pc2Copy as c } from "../features/consumer-onboarding/copy";
import { Pc2Button } from "../features/consumer-onboarding/OnboardingScreen";
export default function AccountSupportScreen() { const runtime = useConsumerRuntime(); return <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}><Text>{c.support}</Text><Text>{c.supportBody}</Text><Text>{c.withdrawalLimit}</Text><Pc2Button label={c.logout} onPress={() => void runtime.signOut()} /></ScrollView>; }
