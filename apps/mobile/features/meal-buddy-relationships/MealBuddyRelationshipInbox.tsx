import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import { resolveSocialCandidateMascot } from "../social-candidates/mascotAdapter";
import { getMascotSource } from "../../theme/components";
import type { MealBuddyRelationshipItem } from "./types";
import type { useMealBuddyRelationships } from "./useMealBuddyRelationships";

type Controller = ReturnType<typeof useMealBuddyRelationships>;
const copy = zhTW.mobile.mealBuddyRelationships;

export function MealBuddyRelationshipInbox({ controller, onOpenChat }: {
  controller: Controller;
  onOpenChat?: (relationshipRef: string) => void;
}) {
  const state = controller.state;
  if (state.phase === "signed_out") return null;

  return (
    <Card>
      <Text style={styles.title}>{copy.inboxTitle}</Text>
      <Text style={styles.subtitle}>{copy.inboxSubtitle}</Text>
      {state.phase === "loading" ? (
        <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>{copy.loading}</Text></View>
      ) : state.phase === "load_failed" ? (
        <View style={styles.stack}>
          <Text style={styles.muted}>{copy.loadFailed}</Text>
          <ActionButton label={copy.retry} onPress={() => { void controller.retry(); }} />
        </View>
      ) : state.relationships.length === 0 ? (
        <Text style={[styles.muted, styles.empty]}>{copy.emptyInbox}</Text>
      ) : (
        <View style={styles.list}>
          {state.relationships.map((relationship) => (
            <RelationshipRow
              key={relationship.relationshipRef}
              controller={controller}
              relationship={relationship}
              onOpenChat={onOpenChat}
            />
          ))}
          {state.errorCode ? <Text style={styles.error}>{copy.actionFailed}</Text> : null}
        </View>
      )}
    </Card>
  );
}

function RelationshipRow({ controller, relationship, onOpenChat }: {
  controller: Controller;
  relationship: MealBuddyRelationshipItem;
  onOpenChat?: (relationshipRef: string) => void;
}) {
  const state = controller.state;
  if (state.phase !== "ready") return null;
  const pending = state.pendingRelationshipRef === relationship.relationshipRef;
  const mascot = resolveSocialCandidateMascot(relationship.counterpart.mascotAvatarKey);
  const mascotSource = getMascotSource(mascot.mascotId);
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {mascotSource ? <Image source={mascotSource} style={styles.avatarImage} resizeMode="contain" /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{relationship.counterpart.displayName}</Text>
        <Text style={styles.muted}>{inboxStateCopy(relationship.state)}</Text>
      </View>
      {relationship.state === "incoming_pending" ? (
        <View style={styles.actions}>
          <ActionButton
            disabled={state.pendingAction !== null}
            label={pending && state.pendingAction === "accept" ? copy.accepting : copy.accept}
            onPress={() => { void controller.accept(relationship.relationshipRef); }}
          />
          <ActionButton
            disabled={state.pendingAction !== null}
            label={pending && state.pendingAction === "decline" ? copy.declining : copy.decline}
            secondary
            onPress={() => { void controller.decline(relationship.relationshipRef); }}
          />
        </View>
      ) : relationship.state === "outgoing_pending" ? (
        <ActionButton
          disabled={state.pendingAction !== null}
          label={pending && state.pendingAction === "cancel" ? copy.cancelling : copy.cancel}
          secondary
          onPress={() => { void controller.cancel(relationship.relationshipRef); }}
        />
      ) : relationship.state === "accepted" && onOpenChat ? (
        // Chat is offered only for an accepted buddy, and only a tap navigates. Rendering this row
        // performs no chat transport call and creates no conversation.
        <ActionButton
          label={copy.openChat}
          onPress={() => { onOpenChat(relationship.relationshipRef); }}
        />
      ) : null}
    </View>
  );
}

function inboxStateCopy(state: MealBuddyRelationshipItem["state"]) {
  if (state === "incoming_pending") return copy.incomingInbox;
  if (state === "outgoing_pending") return copy.outgoingInbox;
  return copy.acceptedInbox;
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
  title: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  loading: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 16 },
  stack: { gap: 12, marginTop: 16 },
  empty: { marginTop: 18 },
  list: { gap: 12, marginTop: 16 },
  row: { alignItems: "center", borderColor: colors.line, borderRadius: 14, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 14 },
  avatar: { alignItems: "center", backgroundColor: colors.mint, borderRadius: 24, height: 48, justifyContent: "center", overflow: "hidden", width: 48 },
  avatarImage: { height: 42, width: 42 },
  flex: { flex: 1, gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: "#A83B3B", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9 },
  secondaryButton: { backgroundColor: "#fff", borderColor: colors.line, borderWidth: 1 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  secondaryButtonText: { color: colors.ink }
});
