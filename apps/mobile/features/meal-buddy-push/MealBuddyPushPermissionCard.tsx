import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import type { useMealBuddyPush } from "./useMealBuddyPush";

type Controller = ReturnType<typeof useMealBuddyPush>;
const copy = zhTW.mobile.mealBuddyPush;

// SR-2K-B permission surface.
//
// It appears only where notifications are actually about to be useful — the real relationship area —
// and only while the decision is still open. A refusal is respected: the card states the consequence
// once and never re-prompts, because the controller allows at most one prompt per session. Nothing
// here blocks or gates any Social function.
export function MealBuddyPushPermissionCard({ controller }: { controller: Controller }) {
  const state = controller.state;
  // Registered, unsupported, signed out and idle all render nothing: there is no decision to make.
  if (state.phase !== "prompting" && state.phase !== "denied" && state.phase !== "failed"
    && state.phase !== "idle" && state.phase !== "registering") {
    return null;
  }
  if (state.phase === "idle") {
    return (
      <Card>
        <Text style={styles.title}>{copy.permissionTitle}</Text>
        <Text style={styles.body}>{copy.permissionBody}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.permissionAllow}
            style={styles.primary}
            onPress={() => { void controller.enable(); }}
          >
            <Text style={styles.primaryText}>{copy.permissionAllow}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }
  if (state.phase === "prompting" || state.phase === "registering") {
    return (
      <Card>
        <View style={styles.row}><ActivityIndicator /><Text style={styles.body}>{copy.permissionTitle}</Text></View>
      </Card>
    );
  }
  return (
    <Card>
      <Text style={styles.title}>{copy.permissionTitle}</Text>
      <Text style={styles.body}>
        {state.phase === "denied" ? copy.permissionDenied : copy.registerFailed}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 6 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  primary: { backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" }
});
