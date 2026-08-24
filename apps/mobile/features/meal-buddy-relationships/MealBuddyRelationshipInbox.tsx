import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import { resolveSocialCandidateMascot } from "../social-candidates/mascotAdapter";
import { MealBuddyUnfriendConfirm } from "./MealBuddyUnfriendConfirm";
import { getMascotSource } from "../../theme/components";
import type { MealBuddyRelationshipItem, MealBuddyRelationshipState } from "./types";
import type { useMealBuddyRelationships } from "./useMealBuddyRelationships";

type Controller = ReturnType<typeof useMealBuddyRelationships>;
const copy = zhTW.mobile.mealBuddyRelationships;

// SR-2K-A closes the real-mode relationship area.
//
// The canonical server list is still the ONLY source of truth and its order is preserved inside
// every band. What changes is that the three actor-relative states are no longer flattened into one
// undifferentiated history strip: an established buddy is a standing band of its own, so it reads as
// a lasting relationship rather than as a resolved invitation that happens to still be listed. Each
// band owns its own honest empty line, so "nothing waiting for you" and "no buddies yet" can never
// be confused with each other or with a load that has not finished.
//
// Nothing here performs a transport call of any kind. Re-reading canonical truth is the controller's
// single `retry` entry point, and the accepted band's action is a navigation callback.
type RelationshipBand = Readonly<{
  key: MealBuddyRelationshipState;
  title: string;
  subtitle: string | null;
  emptyLabel: string;
  items: readonly MealBuddyRelationshipItem[];
}>;

function bandsFor(relationships: readonly MealBuddyRelationshipItem[]): readonly RelationshipBand[] {
  // `filter` keeps the server's ordering inside each band. No sort, no cap and no re-ranking: the
  // list the server returned is the list the user sees.
  const withState = (state: MealBuddyRelationshipState) =>
    relationships.filter((relationship) => relationship.state === state);
  return Object.freeze([
    Object.freeze({
      key: "incoming_pending" as const,
      title: copy.incomingGroupTitle,
      subtitle: null,
      emptyLabel: copy.emptyIncoming,
      items: withState("incoming_pending")
    }),
    Object.freeze({
      key: "outgoing_pending" as const,
      title: copy.outgoingGroupTitle,
      subtitle: null,
      emptyLabel: copy.emptyOutgoing,
      items: withState("outgoing_pending")
    }),
    Object.freeze({
      key: "accepted" as const,
      title: copy.acceptedGroupTitle,
      subtitle: copy.acceptedGroupSubtitle,
      emptyLabel: copy.emptyAccepted,
      items: withState("accepted")
    })
  ]);
}

export function MealBuddyRelationshipInbox({ controller, onOpenChat }: {
  controller: Controller;
  onOpenChat?: (relationshipRef: string) => void;
}) {
  const state = controller.state;
  // The pair whose end has been requested but not yet confirmed. Holding it here rather than in the
  // row keeps exactly one confirmation sheet on screen no matter how many buddies are listed.
  const [endingRef, setEndingRef] = useState<string | null>(null);
  if (state.phase === "signed_out") return null;
  const pendingUnfriend = state.phase === "ready" && state.pendingAction === "unfriend";

  return (
    <Card>
      <Text style={styles.title}>{copy.inboxTitle}</Text>
      <Text style={styles.subtitle}>{copy.inboxSubtitle}</Text>
      {state.phase === "loading" ? (
        // A load in progress states only that it is in progress. It never renders an empty band, an
        // established buddy or an available action before canonical truth is known.
        <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>{copy.loading}</Text></View>
      ) : state.phase === "load_failed" ? (
        <View style={styles.stack}>
          <Text style={styles.muted}>{copy.loadFailed}</Text>
          <ActionButton label={copy.retry} onPress={() => { void controller.retry(); }} />
        </View>
      ) : (
        <View style={styles.stack}>
          <ActionButton
            disabled={state.pendingAction !== null}
            label={copy.reload}
            secondary
            onPress={() => { void controller.retry(); }}
          />
          {state.relationships.length === 0 ? (
            // An honestly empty real result, said once. Repeating it per band would only add noise,
            // and no demo row is ever substituted for it.
            <Text style={[styles.muted, styles.empty]}>{copy.emptyInbox}</Text>
          ) : bandsFor(state.relationships).map((band) => (
            <View key={band.key} style={styles.band}>
              <Text style={styles.bandTitle}>{band.title}</Text>
              {band.subtitle === null ? null : <Text style={styles.muted}>{band.subtitle}</Text>}
              {band.items.length === 0 ? (
                // This band alone is empty while others are not, so it says so in its own words.
                <Text style={styles.muted}>{band.emptyLabel}</Text>
              ) : (
                <View style={styles.list}>
                  {band.items.map((relationship) => (
                    <RelationshipRow
                      key={relationship.relationshipRef}
                      controller={controller}
                      relationship={relationship}
                      onOpenChat={onOpenChat}
                      onRequestEnd={setEndingRef}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
          {state.errorCode ? <Text style={styles.error}>{copy.actionFailed}</Text> : null}
        </View>
      )}
      <MealBuddyUnfriendConfirm
        visible={endingRef !== null}
        pending={pendingUnfriend}
        onCancel={() => setEndingRef(null)}
        onConfirm={() => {
          const target = endingRef;
          if (!target) return;
          // The canonical list is re-read by the controller, so the row disappears because the
          // server says the pair ended — never because this screen removed it optimistically.
          void controller.unfriend(target).then(() => setEndingRef(null));
        }}
      />
    </Card>
  );
}

function RelationshipRow({ controller, relationship, onOpenChat, onRequestEnd }: {
  controller: Controller;
  relationship: MealBuddyRelationshipItem;
  onOpenChat?: (relationshipRef: string) => void;
  onRequestEnd: (relationshipRef: string) => void;
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
        // Offered only for an established buddy, and only a tap navigates. Rendering this row
        // performs no transport call and creates nothing on the server. Ending the relationship sits
        // beside it as a secondary action and only opens a confirmation.
        <View style={styles.actions}>
          <ActionButton
            label={copy.openChat}
            onPress={() => { onOpenChat(relationship.relationshipRef); }}
          />
          <ActionButton
            disabled={state.pendingAction !== null}
            label={copy.unfriendAction}
            secondary
            onPress={() => { onRequestEnd(relationship.relationshipRef); }}
          />
        </View>
      ) : relationship.state === "accepted" ? (
        // An established buddy on a surface that offers no chat entry can still be ended.
        <ActionButton
          disabled={state.pendingAction !== null}
          label={copy.unfriendAction}
          secondary
          onPress={() => { onRequestEnd(relationship.relationshipRef); }}
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
  title: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  loading: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 16 },
  stack: { gap: 12, marginTop: 16 },
  empty: { marginTop: 2 },
  band: { borderTopColor: colors.line, borderTopWidth: 1, gap: 8, paddingTop: 14 },
  bandTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  list: { gap: 12, marginTop: 4 },
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
