import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../components/DemoUi";
import { getMascotSource } from "../../theme/components";
import { resolveSocialCandidateMascot } from "../social-candidates/mascotAdapter";
import { buildCompactInterestLine, type InterestCategoryLabels } from "./interestCatalog";
import type { MealBuddyCandidate } from "./types";

// SR-2G-E2 real Meal Buddy candidate card. It renders exactly the frozen SR-2G-D public DTO and
// nothing else: no premium badge, verification badge, distance, activity score, match percentage,
// match reason, Taste score, ranking state or tag row, because none of those exist on the DTO and
// none may be fabricated.
//
// ORDERING IS NOT THIS COMPONENT'S BUSINESS. It renders one candidate; the section above renders the
// server array in the order it arrived. Nothing here sorts, scores or highlights.

const MEAL_PERIOD_LABELS: Readonly<Record<MealBuddyCandidate["card"]["mealPeriod"], string>> = Object.freeze({
  breakfast: "早餐", lunch: "午餐", dinner: "晚餐", late_night: "宵夜"
});
const INTENTION_LABELS: Readonly<Record<MealBuddyCandidate["card"]["intentionType"], string>> = Object.freeze({
  chat_first: "先聊聊", eat_together: "直接約飯"
});

// One visual line: at most three category chips plus at most one overflow chip. `flexWrap` is
// deliberately absent and every chip clips its own text, so a long label truncates INSIDE the row
// rather than pushing the remainder onto an uncontrolled second row. The "+N" chip is the product's
// answer to "there are more", and it is built for display only — never persisted or sent back.
function CompactInterestLine({
  heading, categoryKeys, overflowCount, labels
}: {
  heading: string;
  categoryKeys: readonly string[];
  overflowCount: number;
  labels: InterestCategoryLabels;
}) {
  // Zero declared categories renders nothing at all: an empty rail would be a fabricated statement
  // about someone who simply has not filled this in.
  if (categoryKeys.length === 0) return null;
  const line = buildCompactInterestLine(categoryKeys, overflowCount, labels);
  return (
    <View style={styles.interestRow}>
      <Text style={styles.interestHeading}>{heading}</Text>
      {line.chips.map((chip, index) => (
        <View key={`${heading}-${categoryKeys[index]}`} style={styles.chip}>
          <Text style={styles.chipText} numberOfLines={1}>{chip}</Text>
        </View>
      ))}
      {line.overflowLabel === null ? null : (
        <View style={styles.overflowChip}>
          <Text style={styles.overflowText} numberOfLines={1}>{line.overflowLabel}</Text>
        </View>
      )}
    </View>
  );
}

export function MealBuddyCandidateCard({
  candidate, labels, onPress
}: {
  candidate: MealBuddyCandidate;
  labels: InterestCategoryLabels;
  // The whole-card tap seam. It receives the opaque PERSON reference only; the full profile
  // authority does not exist yet, so an unbound handler simply leaves the card inert.
  onPress?: (candidateRef: string) => void;
}) {
  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);
  const mascotSource = getMascotSource(mascot.mascotId);
  const { card } = candidate;

  const body = (
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

        {/* The dining occasion, exactly as the server sent it. The date string is never re-parsed. */}
        <Text style={styles.occasion} numberOfLines={1}>
          {card.diningDate} · {MEAL_PERIOD_LABELS[card.mealPeriod]} · {INTENTION_LABELS[card.intentionType]}
        </Text>

        {/* A general card genuinely has no restaurant. Nothing is rendered for it — no placeholder,
            no "null", and never the raw identifier. */}
        {card.restaurant === null || card.restaurant.name === null ? null : (
          <Text style={styles.restaurant} numberOfLines={1}>🍽 {card.restaurant.name}</Text>
        )}

        {/* A missing public bio stays missing. No placeholder sentence is invented for it. */}
        {candidate.publicBio === null ? null : (
          <Text style={styles.publicBio} numberOfLines={2}>{candidate.publicBio}</Text>
        )}

        <CompactInterestLine
          heading="興趣"
          categoryKeys={candidate.interests.generalCategoryKeys}
          overflowCount={candidate.interests.generalOverflowCount}
          labels={labels}
        />
        <CompactInterestLine
          heading="愛吃"
          categoryKeys={candidate.interests.foodCategoryKeys}
          overflowCount={candidate.interests.foodOverflowCount}
          labels={labels}
        />
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(candidate.candidateRef)}>
      {body}
    </Pressable>
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
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.mint,
    alignItems: "center", justifyContent: "center", overflow: "hidden"
  },
  avatarImage: { width: 44, height: 44 },
  avatarFallback: { fontSize: 18, fontWeight: "700", color: colors.ink },
  body: { flex: 1, gap: 4 },
  displayName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  occasion: { fontSize: 12, color: colors.muted },
  restaurant: { fontSize: 12, color: colors.teal },
  publicBio: { fontSize: 13, lineHeight: 18, color: colors.muted },
  // No flexWrap: the row is one line by construction, so an overlong label can never spill onto a
  // second chip row.
  interestRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  interestHeading: { fontSize: 12, color: colors.muted, flexShrink: 0 },
  chip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.mint, flexShrink: 1
  },
  chipText: { fontSize: 11, color: colors.ink },
  overflowChip: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.line, flexShrink: 0
  },
  overflowText: { fontSize: 11, color: colors.muted, fontWeight: "700" }
});
