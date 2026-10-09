import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { useConsumerOnboarding } from "../features/consumer-onboarding/ConsumerOnboardingProvider";
import { pc2Copy as c } from "../features/consumer-onboarding/copy";
import { DocumentStatusNotice } from "../features/consumer-onboarding/DocumentStatusNotice";
export default function ConsentDocumentScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>(); const { controller, snapshot } = useConsumerOnboarding();
  const d = snapshot.bundle?.documents.find((item) => item.documentId === documentId);
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 12 }}>{d ? <><Text>{d.documentId} · {d.version} · {snapshot.bundle?.locale}</Text><Text selectable>{d.content}</Text></> : <><DocumentStatusNotice snapshot={snapshot} retry={controller ? () => void controller.refresh() : undefined} disabled={snapshot.pending} />{snapshot.documentStatus === "available" ? <Text>{c.documentNotFound}</Text> : null}</>}</ScrollView>;
}
