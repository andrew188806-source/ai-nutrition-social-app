import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import { MealBuddyUnfriendConfirm } from "./MealBuddyUnfriendConfirm";
import type { useMealBuddyRelationshipProfile } from "./useMealBuddyRelationshipProfile";

type Controller = ReturnType<typeof useMealBuddyRelationshipProfile>;
const copy = zhTW.mobile.mealBuddyRelationships;
// PC-1: states for an uncertain mutation result. Kept local to this panel.
const syncCopy = Object.freeze({
  reconciling: "正在確認最新狀態…",
  unknown: "無法確認邀請是否已送出，請重新整理狀態後再操作。",
  refresh: "重新整理狀態"
});

export function MealBuddyRelationshipPanel({ controller, onOpenChat }: {
  controller: Controller;
  onOpenChat?: (relationshipRef: string) => void;
}) {
  const state = controller.state;
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  if (state.phase === "signed_out") return null;
  const pendingUnfriend = state.phase === "ready" && state.pendingAction === "unfriend";

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
      ) : state.syncPhase === "reconciling" ? (
        // The action spinner is gone; one bounded canonical re-read decides what is shown next.
        <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>{syncCopy.reconciling}</Text></View>
      ) : state.syncPhase === "unknown_server_state" ? (
        // Neither the action nor the re-read settled. Resending blindly is disabled; only an
        // explicit canonical refresh is offered.
        <View style={styles.stack}>
          <Text style={styles.error}>{syncCopy.unknown}</Text>
          <ActionButton label={syncCopy.refresh} onPress={() => { void controller.retry(); }} />
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
            // Accepted only. Rendering this panel performs no chat call; the tap is the intent, and
            // ending the relationship is a secondary action behind its own confirmation.
            <View style={styles.actions}>
              <ActionButton
                label={copy.openChat}
                onPress={() => { onOpenChat(state.relationship.relationshipRef); }}
              />
              <ActionButton
                disabled={state.pendingAction !== null}
                label={copy.unfriendAction}
                secondary
                onPress={() => { setConfirmingEnd(true); }}
              />
            </View>
          ) : state.relationship.state === "accepted" && state.relationship.relationshipRef ? (
            <ActionButton
              disabled={state.pendingAction !== null}
              label={copy.unfriendAction}
              secondary
              onPress={() => { setConfirmingEnd(true); }}
            />
          ) : null}
        </View>
      )}
      <MealBuddyUnfriendConfirm
        visible={confirmingEnd}
        pending={pendingUnfriend}
        onCancel={() => setConfirmingEnd(false)}
        onConfirm={() => {
          // The panel re-reads canonical relationship state, so what is shown afterwards is the
          // server's answer rather than this screen's assumption.
          void controller.unfriend().then(() => setConfirmingEnd(false));
        }}
      />
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
      // SR-2K-A: the visible label is also the assistive label, and the disabled state is announced
      // rather than only drawn. A control that is mid-action reads as unavailable instead of silently
      // ignoring a second tap.
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
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
