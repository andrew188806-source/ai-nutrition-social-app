import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import type { useMealBuddyRelationshipProfile } from "./useMealBuddyRelationshipProfile";

type Controller = ReturnType<typeof useMealBuddyRelationshipProfile>;
const copy = zhTW.mobile.mealBuddyRelationships;

export function MealBuddyRelationshipPanel({ controller, onOpenChat }: {
  controller: Controller;
  onOpenChat?: (relationshipRef: string) => void;
}) {
  const state = controller.state;
  if (state.phase === "signed_out") return null;

  return (
    <Card>
      <Text style={styles.title}>{copy.profileTitle}</Text>
      {state.phase === "loading" ? (
        <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>{copy.loading}</Text></View>
      ) : state.phase === "load_failed" ? (
        <View style={styles.stack}>
          <Text style={styles.muted}>{copy.loadFailed}</Text>
          <ActionButton label={copy.retry} onPress={() => { void controller.retry(); }} />
        </View>
      ) : (
        <View style={styles.stack}>
          <Text style={styles.body}>{profileStateCopy(state.relationship.state)}</Text>
          {state.errorCode ? <Text style={styles.error}>{copy.actionFailed}</Text> : null}
          {state.relationship.state === "none" ? (
            <ActionButton
              disabled={state.pendingAction !== null}
              label={state.pendingAction === "send" ? copy.sending : copy.send}
              onPress={() => { void controller.send(); }}
            />
          ) : state.relationship.state === "outgoing_pending" ? (
            <ActionButton
              disabled={state.pendingAction !== null}
              label={state.pendingAction === "cancel" ? copy.cancelling : copy.cancel}
              secondary
              onPress={() => { void controller.cancel(); }}
            />
          ) : state.relationship.state === "incoming_pending" ? (
            <View style={styles.actions}>
              <ActionButton
                disabled={state.pendingAction !== null}
                label={state.pendingAction === "accept" ? copy.accepting : copy.accept}
                onPress={() => { void controller.accept(); }}
              />
              <ActionButton
                disabled={state.pendingAction !== null}
                label={state.pendingAction === "decline" ? copy.declining : copy.decline}
                secondary
                onPress={() => { void controller.decline(); }}
              />
            </View>
          ) : state.relationship.state === "accepted" && onOpenChat && state.relationship.relationshipRef ? (
            // Accepted only. Rendering this panel performs no chat call; the tap is the intent.
            <ActionButton
              label={copy.openChat}
              onPress={() => { onOpenChat(state.relationship.relationshipRef); }}
            />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function profileStateCopy(state: "none" | "outgoing_pending" | "incoming_pending" | "accepted") {
  if (state === "outgoing_pending") return copy.outgoingProfile;
  if (state === "incoming_pending") return copy.incomingProfile;
  if (state === "accepted") return copy.acceptedProfile;
  return copy.noneProfile;
}

function ActionButton({ disabled = false, label, onPress, secondary = false }: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  loading: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 14 },
  stack: { gap: 12, marginTop: 12 },
  body: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: "#A83B3B", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  secondaryButton: { backgroundColor: "#fff", borderColor: colors.line, borderWidth: 1 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  secondaryButtonText: { color: colors.ink }
});
