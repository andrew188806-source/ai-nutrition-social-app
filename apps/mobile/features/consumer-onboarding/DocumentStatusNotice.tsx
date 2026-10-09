import { Pressable, Text, View } from "react-native";
import { pc2Copy as c } from "./copy";
import type { OnboardingSnapshot } from "./types";

export function DocumentStatusNotice({ snapshot, retry, disabled = false }: {
  snapshot: OnboardingSnapshot;
  retry?: () => void;
  disabled?: boolean;
}) {
  const status = snapshot.documentStatus;
  if (status === "available") return null;
  const loading = status === "idle" || status === "loading";
  const message = loading ? c.documentsLoading : status === "unavailable" ? c.unavailable : c.documentsReadFailed;
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole={status === "error" ? "alert" : undefined}>{message}</Text>
    {!loading && retry ? <Pressable accessibilityRole="button" disabled={disabled} onPress={retry}
      style={{ padding: 14, borderWidth: 1, borderRadius: 12, opacity: disabled ? 0.4 : 1 }}>
      <Text>{c.documentsRetry}</Text>
    </Pressable> : null}
  </View>;
}
