import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import type { useConsumerLocation } from "./useConsumerLocation";

type Controller = ReturnType<typeof useConsumerLocation>;
const copy = zhTW.mobile.consumerLocation;

// GEO-1B permission surface.
//
// It explains the product reason — finding nearby restaurants and meal companions — and never the
// mechanism. Nothing here blocks or gates any function: a refusal renders a short explanation and
// the surrounding screen keeps working. The controller allows at most one prompt per session, so
// this card cannot become a nag, and it offers a retry only where a retry can actually succeed.
export function ConsumerLocationPermissionCard({ controller }: { controller: Controller }) {
  const state = controller.state;
  // Signed out, unsupported and available all render nothing: there is no decision to make.
  if (state.phase === "signed_out" || state.phase === "unsupported" || state.phase === "available") {
    return null;
  }

  if (state.phase === "prompting" || state.phase === "acquiring") {
    return (
      <Card>
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={styles.body}>
            {state.phase === "acquiring" ? copy.acquiring : copy.title}
          </Text>
        </View>
      </Card>
    );
  }

  if (state.phase === "idle") {
    return (
      <Card>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.allow}
            style={styles.primary}
            onPress={() => { void controller.enable(); }}
          >
            <Text style={styles.primaryText}>{copy.allow}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  // A denial that can still be asked again gets a retry; a final one gets settings guidance instead,
  // because another in-app button would do nothing.
  if (state.phase === "denied") {
    return (
      <Card>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{state.canAskAgain ? copy.denied : copy.deniedForever}</Text>
        {state.canAskAgain ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.retry}
              style={styles.primary}
              onPress={() => { void controller.enable(); }}
            >
              <Text style={styles.primaryText}>{copy.retry}</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    );
  }

  if (state.phase === "services_disabled") {
    return (
      <Card>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.servicesDisabled}</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.failed}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retry}
          style={styles.primary}
          onPress={() => { void controller.refresh(); }}
        >
          <Text style={styles.primaryText}>{copy.retry}</Text>
        </Pressable>
      </View>
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
