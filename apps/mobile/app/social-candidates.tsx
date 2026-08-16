import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, colors } from "../components/DemoUi";
import {
  SocialCandidateCard,
  createSocialCandidateService,
  getSocialCandidateRuntimeDependencies,
  type SocialCandidate,
  type SocialCandidateClientErrorCode
} from "../features/social-candidates";
import { useConsumerRuntime } from "../features/consumer-runtime";

type ScreenState =
  | { phase: "loading" }
  | { phase: "ready"; candidates: readonly SocialCandidate[] }
  | { phase: "failed"; code: SocialCandidateClientErrorCode };

// SR-2E real Taste-based Social candidate list.
//
// Display-only V1: no candidate press handler, no navigation to a profile detail, and no invite,
// match, friend or chat affordance — those authorities do not exist yet. The server owns ranking,
// entitlement exposure and profile projection, so this screen renders the returned array in the
// exact order received and never sorts, filters, caps, refills or paginates it.
//
// Candidates live in screen memory only. `candidateRef` is opaque and actor-scoped with a 24 hour
// lifetime, so it is used solely as a list key for the current response and is never decoded,
// persisted or compared across refreshes.
export default function SocialCandidatesScreen() {
  const runtime = useConsumerRuntime();
  const [state, setState] = useState<ScreenState>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const copy = zhTW.mobile.socialCandidates;

  const load = useCallback(async () => {
    // Dependencies come from the app-composition binding, never from runtime internals. When the
    // binding is empty the factory returns the disabled repository, which fails closed rather than
    // pretending the actor simply has no candidates.
    const service = createSocialCandidateService(
      runtime.mode === "supabase" ? "supabase-live" : "mock",
      runtime.mode === "supabase",
      getSocialCandidateRuntimeDependencies()
    );
    const outcome = await service.listSocialCandidates();
    // A successful empty list is a real state, never an error, and never backfilled with demo rows.
    setState(outcome.ok
      ? { phase: "ready", candidates: outcome.value.candidates }
      : { phase: "failed", code: outcome.error.code });
  }, [runtime]);

  // Fetch once on mount, plus explicit pull-to-refresh and retry. No polling, no focus refetch, no
  // background refresh and no durable cache: a refresh replaces the whole list and its references.
  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card tone="mint">
        <SectionTitle title={copy.title} subtitle={copy.subtitle} />
        {state.phase === "loading" ? (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.muted}>{copy.loading}</Text>
          </View>
        ) : null}

        {state.phase === "failed" ? (
          <View style={styles.centered}>
            <Text style={styles.stateTitle}>
              {state.code === "authentication_required" ? copy.authTitle : copy.errorTitle}
            </Text>
            <Text style={styles.muted}>
              {state.code === "authentication_required" ? copy.authBody : copy.errorBody}
            </Text>
            <Pressable style={styles.retry} onPress={() => { void load(); }}>
              <Text style={styles.retryText}>{copy.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {state.phase === "ready" && state.candidates.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.stateTitle}>{copy.emptyTitle}</Text>
            <Text style={styles.muted}>{copy.emptyBody}</Text>
          </View>
        ) : null}

        {state.phase === "ready" && state.candidates.length > 0 ? (
          <View style={styles.list}>
            {state.candidates.map((candidate) => (
              <SocialCandidateCard key={candidate.candidateRef} candidate={candidate} />
            ))}
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, backgroundColor: colors.bg },
  list: { marginTop: 12 },
  centered: { alignItems: "center", gap: 8, paddingVertical: 28 },
  stateTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, textAlign: "center" },
  retry: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.teal
  },
  retryText: { color: "#FFFFFF", fontWeight: "700" }
});
