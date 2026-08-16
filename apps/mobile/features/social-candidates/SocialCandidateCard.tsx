import { Image, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { colors } from "../../components/DemoUi";
import { getMascotSource } from "../../theme/components";
import { resolveSocialCandidateMascot } from "./mascotAdapter";
import type { SocialCandidate } from "./types";

// SR-2E real Social candidate card. It renders exactly the four public SR-2C facts and nothing else:
// there is no premium badge, verification badge, distance, age, location, match percentage, match
// reason, Taste score, ranking state, tag row or restaurant/time preference, because none of those
// exist on the frozen DTO and none may be fabricated.
//
// Display-only by design: no press handler, no navigation, no invite/chat/friend affordance. The
// action and profile-detail authorities do not exist yet, and `candidateRef` is never passed to any
// existing demo action store.
export function SocialCandidateCard({ candidate }: { candidate: SocialCandidate }) {
  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);
  const mascotSource = getMascotSource(mascot.mascotId);
  const copy = zhTW.mobile.socialCandidates;

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        {mascotSource ? (
          <Image source={mascotSource} style={styles.avatarImage} resizeMode="contain" />
        ) : (
          <Text style={styles.avatarFallback}>{mascot.name.slice(0, 1)}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.displayName} numberOfLines={1}>{candidate.displayName}</Text>
        {/* A missing public bio stays missing. No placeholder sentence is invented for it. */}
        {candidate.publicBio === null ? null : (
          <Text style={styles.publicBio} numberOfLines={3}>{candidate.publicBio}</Text>
        )}
        {/* Presentation only. A candidate unwilling to chat still renders, in the same position. */}
        <Text style={candidate.willingToChat ? styles.chatOpen : styles.chatClosed}>
          {candidate.willingToChat ? copy.willingToChatOpen : copy.willingToChatClosed}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  avatarImage: { width: 48, height: 48 },
  avatarFallback: { fontSize: 20, fontWeight: "700", color: colors.ink },
  body: { flex: 1, gap: 4 },
  displayName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  publicBio: { fontSize: 13, lineHeight: 19, color: colors.muted },
  chatOpen: { fontSize: 12, color: colors.teal },
  chatClosed: { fontSize: 12, color: colors.muted }
});
