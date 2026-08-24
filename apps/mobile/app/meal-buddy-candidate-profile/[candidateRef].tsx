import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, colors } from "../../components/DemoUi";
import { useConsumerRuntime } from "../../features/consumer-runtime";
import { useMealBuddyCandidateProfile } from "../../features/meal-buddy-candidates/useMealBuddyCandidateProfile";
import { resolveSocialCandidateMascot } from "../../features/social-candidates/mascotAdapter";
import { MealBuddyRelationshipPanel } from "../../features/meal-buddy-relationships/MealBuddyRelationshipPanel";
import { useMealBuddyRelationshipProfile } from "../../features/meal-buddy-relationships/useMealBuddyRelationshipProfile";
import { readMealBuddyRouteRef } from "../../features/meal-buddy-relationships/refBoundary";
import { getMascotSource } from "../../theme/components";

export default function MealBuddyCandidateProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ candidateRef?: string }>();
  // SR-2K-A hardens this dynamic route at its boundary: the segment must be a well-formed candidate
  // reference of that family alone. A bare prefix, an oversized value, a reference belonging to a
  // different family and a raw database identifier all resolve to null, and null fails closed below
  // without any request being made.
  const candidateRef = readMealBuddyRouteRef(params.candidateRef, "candidate");
  const runtime = useConsumerRuntime();
  const controller = useMealBuddyCandidateProfile(
    runtime.mode === "supabase",
    runtime.state.actorGeneration,
    candidateRef
  );
  const relationshipController = useMealBuddyRelationshipProfile(
    runtime.mode === "supabase" ? runtime.state.actorKey : null,
    runtime.state.actorGeneration,
    candidateRef
  );

  // SR-2K-A: this route can be entered with nothing behind it, for example on a cold load straight
  // into a profile. Popping an empty stack would strand the user here, so the fallback returns to
  // the canonical Meal Buddy relationship area instead of a dead screen.
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: "/meal-buddies", params: { section: "friends" } });
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" style={styles.backButton} onPress={goBack}>
        <Text style={styles.backButtonText}>返回飯友列表</Text>
      </Pressable>
      {controller.state.phase === "loading" || controller.state.phase === "idle" ? (
        <Card>
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.muted}>正在載入飯友公開檔案…</Text>
          </View>
        </Card>
      ) : controller.state.phase === "failed" ? (
        <Card>
          <View style={styles.centered}>
            <Text style={styles.stateTitle}>
              {controller.state.code === "authentication_required" ? "請重新登入" : "無法顯示這位飯友"}
            </Text>
            <Text style={styles.muted}>
              {controller.state.code === "invalid_request"
                ? "這份公開檔案可能已過期、刪除或暫時不可用。"
                : "目前無法載入公開檔案，請稍後再試。"}
            </Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { void controller.retry(); }}>
              <Text style={styles.retryText}>重新載入</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <>
          <CandidatePublicProfile state={controller.state} />
          <MealBuddyRelationshipPanel
            controller={relationshipController}
            onOpenChat={(relationshipRef) => {
              router.push({ pathname: "/meal-buddy-chat/[relationshipRef]", params: { relationshipRef } });
            }}
          />
        </>
      )}
    </ScrollView>
  );
}

function CandidatePublicProfile({
  state
}: {
  state: Extract<ReturnType<typeof useMealBuddyCandidateProfile>["state"], { phase: "ready" }>;
}) {
  const mascot = resolveSocialCandidateMascot(state.profile.mascotAvatarKey);
  const mascotSource = getMascotSource(mascot.mascotId);
  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {mascotSource ? <Image source={mascotSource} style={styles.avatarImage} resizeMode="contain" /> : null}
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{state.profile.displayName}</Text>
          <Text style={styles.chatPreference}>
            {state.profile.willingToChat ? "願意先聊聊再約飯" : "偏好直接確認用餐安排"}
          </Text>
        </View>
      </View>
      {state.profile.publicBio === null ? null : <Text style={styles.bio}>{state.profile.publicBio}</Text>}
      <InterestSection title="興趣" labels={state.publicInterestLabels} emptyLabel="尚未公開一般興趣" />
      <InterestSection title="愛吃" labels={state.foodInterestLabels} emptyLabel="尚未公開飲食興趣" />
    </Card>
  );
}

function InterestSection({ title, labels, emptyLabel }: {
  title: string;
  labels: readonly string[];
  emptyLabel: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {labels.length === 0 ? <Text style={styles.muted}>{emptyLabel}</Text> : (
        <View style={styles.tags}>
          {labels.map((label) => (
            <View key={`${title}-${label}`} style={styles.tag}>
              <Text style={styles.tagText}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.bg, gap: 12, padding: 18, paddingBottom: 40 },
  backButton: { alignSelf: "flex-start", backgroundColor: "#fff", borderColor: colors.line, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  backButtonText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  centered: { alignItems: "center", gap: 10, paddingVertical: 32 },
  stateTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  retry: { backgroundColor: colors.teal, borderRadius: 999, marginTop: 8, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: "#fff", fontWeight: "800" },
  header: { alignItems: "center", flexDirection: "row", gap: 14 },
  avatar: { alignItems: "center", backgroundColor: colors.mint, borderRadius: 38, height: 76, justifyContent: "center", overflow: "hidden", width: 76 },
  avatarImage: { height: 66, width: 66 },
  flex: { flex: 1 },
  name: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  chatPreference: { color: colors.muted, fontSize: 13, marginTop: 5 },
  bio: { color: colors.ink, fontSize: 15, lineHeight: 23, marginTop: 18 },
  section: { borderTopColor: colors.line, borderTopWidth: 1, marginTop: 20, paddingTop: 16 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", marginBottom: 10 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: colors.mint, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  tagText: { color: colors.ink, fontSize: 13, fontWeight: "700" }
});
