import { useState } from "react";
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import { resolveSocialCandidateMascot } from "../social-candidates/mascotAdapter";
import { getMascotSource } from "../../theme/components";
import { MEAL_BUDDY_CHAT_MAX_BODY_LENGTH, type MealBuddyChatMessage } from "./types";
import type { useMealBuddyChat } from "./useMealBuddyChat";

type Controller = ReturnType<typeof useMealBuddyChat>;
const copy = zhTW.mobile.mealBuddyChat;

export function MealBuddyChatScreen({ controller, onBack }: { controller: Controller; onBack: () => void }) {
  const state = controller.state;
  const [draft, setDraft] = useState("");

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} style={styles.back} onPress={onBack}>
          <Text style={styles.backText}>{copy.back}</Text>
        </Pressable>
        {state.phase === "ready" ? <CounterpartHeader
          displayName={state.counterpart.displayName}
          mascotAvatarKey={state.counterpart.mascotAvatarKey}
        /> : <Text style={styles.headerTitle}>{copy.screenTitle}</Text>}
        {/* SR-2K-B: presentation only. Chat stays fully usable through pull-to-refresh when new
            messages are not arriving on their own, so this never gates anything. */}
        {state.phase === "ready" ? (
          <Text style={styles.liveBadge}>{state.live ? copy.liveConnected : copy.liveUnavailable}</Text>
        ) : null}
      </View>

      {state.phase === "signed_out" ? null
        : state.phase === "opening" ? (
          <Card>
            <View style={styles.centered}><ActivityIndicator /><Text style={styles.muted}>{copy.opening}</Text></View>
          </Card>
        ) : state.phase === "open_failed" ? (
          <Card>
            <View style={styles.centered}>
              <Text style={styles.stateTitle}>{copy.openFailed}</Text>
              <ActionButton label={copy.retry} onPress={() => { void controller.retryOpen(); }} />
            </View>
          </Card>
        ) : state.phase === "unavailable" ? (
          // Fail-closed: no message history is rendered here, and there is no composer.
          <Card>
            <View style={styles.centered}>
              <Text style={styles.stateTitle}>{copy.unavailable}</Text>
              <Text style={styles.muted}>{copy.unavailableHint}</Text>
              {/* SR-2K-A: the only action on a fail-closed screen names where it returns to. */}
              <ActionButton label={copy.backToBuddies} secondary onPress={onBack} />
            </View>
          </Card>
        ) : (
          <>
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={state.refreshing} onRefresh={() => { void controller.refresh(); }} />
              }
            >
              {state.olderPhase === "exhausted" ? (
                <Text style={styles.seam}>{copy.historyStart}</Text>
              ) : state.olderPhase === "loading" ? (
                <View style={styles.centered}><ActivityIndicator /><Text style={styles.muted}>{copy.loadingOlder}</Text></View>
              ) : (
                <View style={styles.seamRow}>
                  {state.olderPhase === "failed" ? <Text style={styles.error}>{copy.olderFailed}</Text> : null}
                  <ActionButton
                    label={copy.loadOlder}
                    secondary
                    onPress={() => { void controller.loadOlder(); }}
                  />
                </View>
              )}
              {state.messages.length === 0 ? (
                <Text style={styles.empty}>{copy.emptyHistory}</Text>
              ) : state.messages.map((message) => (
                <MessageRow key={message.messageRef} message={message} />
              ))}
              {state.pendingSend ? (
                <View style={[styles.bubble, styles.mine, styles.pending]}>
                  <Text style={styles.mineText}>{state.pendingSend.body}</Text>
                  <Text style={styles.pendingLabel}>
                    {state.pendingSend.phase === "sending" ? copy.sending : copy.sendUncertain}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {state.pendingSend?.phase === "retryable" ? (
              <View style={styles.retryRow}>
                <ActionButton label={copy.sendRetry} onPress={() => { void controller.retrySend(); }} />
                <ActionButton label={copy.sendDiscard} secondary onPress={() => { controller.discardPendingSend(); }} />
              </View>
            ) : null}

            <View style={styles.composer}>
              {state.draftRejected ? (
                <Text style={styles.error}>
                  {draft.length > MEAL_BUDDY_CHAT_MAX_BODY_LENGTH ? copy.draftTooLong : copy.draftInvalid}
                </Text>
              ) : null}
              <View style={styles.composerRow}>
                <TextInput
                  accessibilityLabel={copy.composerPlaceholder}
                  style={styles.input}
                  multiline
                  value={draft}
                  placeholder={copy.composerPlaceholder}
                  placeholderTextColor={colors.muted}
                  onChangeText={(value) => { setDraft(value); controller.clearDraftRejection(); }}
                />
                <ActionButton
                  label={state.pendingSend?.phase === "sending" ? copy.sending : copy.send}
                  disabled={state.pendingSend !== null || draft.trim().length === 0}
                  onPress={() => {
                    const body = draft;
                    void controller.send(body).then((sent) => { if (sent) setDraft(""); });
                  }}
                />
              </View>
            </View>
          </>
        )}
    </View>
  );
}

function CounterpartHeader({ displayName, mascotAvatarKey }: { displayName: string; mascotAvatarKey: string }) {
  const mascot = resolveSocialCandidateMascot(mascotAvatarKey);
  const source = getMascotSource(mascot.mascotId);
  return (
    <View style={styles.counterpart}>
      <View style={styles.avatar}>
        {source ? <Image source={source} style={styles.avatarImage} resizeMode="contain" /> : null}
      </View>
      <Text style={styles.headerTitle}>{displayName}</Text>
    </View>
  );
}

function MessageRow({ message }: { message: MealBuddyChatMessage }) {
  return (
    <View style={[styles.bubble, message.mine ? styles.mine : styles.theirs]}>
      <Text style={message.mine ? styles.mineText : styles.theirsText}>{message.body}</Text>
      <Text style={message.mine ? styles.mineTime : styles.theirsTime}>{formatTime(message.createdAt)}</Text>
    </View>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function ActionButton({ disabled = false, label, onPress, secondary = false }: {
  disabled?: boolean; label: string; onPress: () => void; secondary?: boolean;
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
  page: { backgroundColor: colors.cream, flex: 1, gap: 12, padding: 16 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  back: { paddingRight: 4, paddingVertical: 6 },
  backText: { color: colors.teal, fontSize: 14, fontWeight: "800" },
  headerTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  liveBadge: { color: colors.muted, fontSize: 11, marginLeft: "auto" },
  counterpart: { alignItems: "center", flexDirection: "row", gap: 10 },
  avatar: { alignItems: "center", backgroundColor: colors.mint, borderRadius: 20, height: 40, justifyContent: "center", overflow: "hidden", width: 40 },
  avatarImage: { height: 34, width: 34 },
  list: { flex: 1 },
  listContent: { gap: 10, paddingVertical: 8 },
  seamRow: { alignItems: "center", gap: 8 },
  seam: { color: colors.muted, fontSize: 12, textAlign: "center" },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 24, textAlign: "center" },
  bubble: { borderRadius: 14, gap: 4, maxWidth: "82%", paddingHorizontal: 13, paddingVertical: 9 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.teal },
  theirs: { alignSelf: "flex-start", backgroundColor: "#fff", borderColor: colors.line, borderWidth: 1 },
  mineText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  theirsText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  mineTime: { color: "#E4F5F1", fontSize: 11 },
  theirsTime: { color: colors.muted, fontSize: 11 },
  pending: { opacity: 0.6 },
  pendingLabel: { color: "#E4F5F1", fontSize: 11 },
  retryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  composer: { gap: 6 },
  composerRow: { alignItems: "flex-end", flexDirection: "row", gap: 8 },
  input: { backgroundColor: "#fff", borderColor: colors.line, borderRadius: 14, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 14, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 9 },
  centered: { alignItems: "center", gap: 10, paddingVertical: 18 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  error: { color: "#A83B3B", fontSize: 13, lineHeight: 19 },
  button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9 },
  secondaryButton: { backgroundColor: "#fff", borderColor: colors.line, borderWidth: 1 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  secondaryButtonText: { color: colors.ink }
});
