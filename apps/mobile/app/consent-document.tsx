import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { useConsumerOnboarding } from "../features/consumer-onboarding/ConsumerOnboardingProvider";
import { pc2Copy as c } from "../features/consumer-onboarding/copy";
export default function ConsentDocumentScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>(); const { snapshot } = useConsumerOnboarding();
  const d = snapshot.bundle?.documents.find((item) => item.documentId === documentId);
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 12 }}>{d ? <><Text>{d.documentId} · {d.version} · {snapshot.bundle?.locale}</Text><Text selectable>{d.content}</Text></> : <Text>{c.unavailable}</Text>}</ScrollView>;
}
