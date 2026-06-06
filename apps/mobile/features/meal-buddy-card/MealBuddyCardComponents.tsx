import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type ImageSourcePropType } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, PremiumBadge, SectionTitle, TagRow, colors } from "../../components/DemoUi";
import { getCandidateDisplayProfile } from "./mealBuddyDisplayPolicy";
import type { MealBuddyCard, MealBuddyIntentionType, RankedMealBuddyCandidate } from "./types";

const profilePhotos: ImageSourcePropType[] = [
  require("../../assets/profiles/profile-01.png"),
  require("../../assets/profiles/profile-02.png"),
  require("../../assets/profiles/profile-03.png"),
  require("../../assets/profiles/profile-04.png"),
  require("../../assets/profiles/profile-05.png"),
  require("../../assets/profiles/profile-06.png")
];

export function IntentionSelector({ onSelect }: { onSelect: (intention: MealBuddyIntentionType) => void }) {
  return (
    <Card tone="mint">
      <SectionTitle title={zhTW.mobile.refinedLogic.mealBuddyCard.intentionQuestion} subtitle={zhTW.mobile.refinedLogic.mealBuddyCard.intentionBody} />
      <View style={styles.optionGrid}>
        <Pressable style={styles.intentOption} onPress={() => onSelect("chat_first")}>
          <Text style={styles.optionTitle}>{zhTW.mobile.refinedLogic.mealBuddyCard.chatFirstLabel}</Text>
          <Text style={styles.optionBody}>{zhTW.mobile.refinedLogic.mealBuddyCard.chatFirstDescription}</Text>
        </Pressable>
        <Pressable style={styles.intentOption} onPress={() => onSelect("eat_together")}>
          <Text style={styles.optionTitle}>{zhTW.mobile.refinedLogic.mealBuddyCard.eatTogetherLabel}</Text>
          <Text style={styles.optionBody}>{zhTW.mobile.refinedLogic.mealBuddyCard.eatTogetherDescription}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

export function MealBuddyCardSummary({ card }: { card: MealBuddyCard }) {
  const tags = [card.foodCategory, card.area, card.preferredTime, card.nutritionGoal].filter(Boolean);
  const cardTypeLabel = card.cardType === "restaurant" ? zhTW.mobile.refinedLogic.mealBuddyCard.restaurantCardTitle : zhTW.mobile.refinedLogic.mealBuddyCard.generalCardTitle;
  return (
    <Card tone="amber">
      <PremiumBadge label={cardTypeLabel} />
      <SectionTitle title={card.preferredFoodName || card.restaurantName || zhTW.mobile.refinedLogic.mealBuddyCard.manualCardTitle} subtitle={sourceLabel(card.sourceType)} />
      <View style={styles.summaryGrid}>
        <SummaryItem label={zhTW.mobile.refinedLogic.mealBuddyCard.restaurantNameLabel} value={card.restaurantName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField} />
        <SummaryItem label={zhTW.mobile.refinedLogic.mealBuddyCard.preferredTimeLabel} value={card.preferredTime || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField} />
        <SummaryItem label={zhTW.mobile.refinedLogic.mealBuddyCard.participantLabel} value={`${card.currentParticipants}/${card.maxParticipants}`} />
        <SummaryItem label={zhTW.mobile.refinedLogic.mealBuddyCard.intentionLabel} value={intentionLabel(card.intentionType)} />
      </View>
      <TagRow tags={tags.length ? tags : [zhTW.mobile.refinedLogic.mealBuddyCard.editableHint]} />
    </Card>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function RankedMealBuddyCard({
  candidate,
  isPremiumMode,
  onChat,
  onEatTogether,
  onInviteTable,
  onViewCard,
  pendingInviteType
}: {
  candidate: RankedMealBuddyCandidate;
  isPremiumMode: boolean;
  onChat?: () => void;
  onEatTogether?: () => void;
  onInviteTable?: () => void;
  onViewCard?: () => void;
  pendingInviteType?: "chat" | "meal" | "table" | null;
}) {
  const isChatFirst = candidate.intentionType === "chat_first";
  const displayProfile = getCandidateDisplayProfile(candidate, isPremiumMode ? "premium" : "free");
  const locationText = `${displayProfile.locationText} · ${candidate.preferredTime}`;
  function runAction(event: GestureResponderEvent, action?: () => void) {
    event.stopPropagation();
    action?.();
  }

  return (
    <Pressable style={styles.cardPressable} onPress={onViewCard}>
    <Card tone={isPremiumMode || candidate.isPremium ? "premium" : "default"}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, !isPremiumMode && styles.maskedAvatar]}>
          {isPremiumMode ? <Image source={profilePhotoFor(candidate.userId)} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{zhTW.mobile.refinedLogic.mealBuddyCard.anonymousAvatar}</Text>}
        </View>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
              <Text style={styles.name}>{displayProfile.displayName}</Text>
              <Text style={styles.score}>{candidate.rankScore}</Text>
            </View>
            <Text style={styles.meta}>{locationText}</Text>
          <Text style={styles.intent}>{candidate.preferredFoodName}</Text>
          <Text style={styles.meta}>{candidate.socialNote}</Text>
        </View>
      </View>
      <View style={styles.badgeRow}>
        <PremiumBadge label={isChatFirst ? zhTW.mobile.refinedLogic.mealBuddyCard.chatFirstBadge : zhTW.mobile.refinedLogic.mealBuddyCard.eatTogetherBadge} variant={isChatFirst ? "free" : "premium"} />
        {candidate.isVerified ? <PremiumBadge label={zhTW.mobile.refinedLogic.mealBuddyCard.verifiedBadge} variant="premium" /> : null}
      </View>
      <View style={styles.reasonBubble}>
        <Text style={styles.reasonTitle}>{zhTW.mobile.refinedLogic.mealBuddyCard.matchReasonTitle}</Text>
        <Text style={styles.message}>{candidate.matchReasons.join("、") || zhTW.mobile.refinedLogic.mealBuddyCard.defaultMatchReason}</Text>
      </View>
      <TagRow tags={displayProfile.tags} />
      {pendingInviteType ? <Text style={styles.sentHint}>已送出邀請，可到「我的飯友 &gt; 配對中」取消後再改邀請類型。</Text> : null}
      <View style={styles.actionRow}>
        <Pressable disabled={Boolean(pendingInviteType)} style={[styles.secondaryButton, pendingInviteType && styles.disabledButton]} onPress={(event) => runAction(event, onChat)}>
          <Text style={styles.secondaryButtonText}>{pendingInviteType === "chat" ? "已送出邀請" : "邀請先聊聊"}</Text>
        </Pressable>
        <Pressable disabled={Boolean(pendingInviteType)} style={[styles.primaryButton, pendingInviteType && styles.disabledButton]} onPress={(event) => runAction(event, onEatTogether)}>
          <Text style={styles.primaryButtonText}>{pendingInviteType === "meal" ? "已送出邀請" : "邀請吃飯"}</Text>
        </Pressable>
        <Pressable disabled={Boolean(pendingInviteType)} style={[styles.secondaryButton, pendingInviteType && styles.disabledButton]} onPress={(event) => runAction(event, onInviteTable)}>
          <Text style={styles.secondaryButtonText}>{pendingInviteType === "table" ? "已送出邀請" : "邀請加入4人桌"}</Text>
        </Pressable>
      </View>
    </Card>
    </Pressable>
  );
}

export function MealBuddyRecommendationList({
  card,
  isPremiumMode,
  onChat,
  onEatTogether,
  onInviteTable,
  onViewCard,
  pendingInviteForCandidate,
  items
}: {
  card: MealBuddyCard;
  isPremiumMode: boolean;
  onChat?: (candidate: RankedMealBuddyCandidate) => void;
  onEatTogether?: (candidate: RankedMealBuddyCandidate) => void;
  onInviteTable?: (candidate: RankedMealBuddyCandidate) => void;
  onViewCard?: (candidate: RankedMealBuddyCandidate) => void;
  pendingInviteForCandidate?: (candidate: RankedMealBuddyCandidate) => "chat" | "meal" | "table" | null;
  items: RankedMealBuddyCandidate[];
}) {
  return (
    <>
      <View style={styles.sectionSpace}>
        <Text style={styles.compactSourceText}>來源卡：{card.preferredFoodName || card.restaurantName || "飯友卡"} · {card.preferredTime || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField}</Text>
        {items.map((candidate) => (
          <RankedMealBuddyCard
            key={`recommendation-${candidate.userId}`}
            candidate={candidate}
            isPremiumMode={isPremiumMode}
            onChat={() => onChat?.(candidate)}
            onEatTogether={() => onEatTogether?.(candidate)}
            onInviteTable={() => onInviteTable?.(candidate)}
            onViewCard={() => onViewCard?.(candidate)}
            pendingInviteType={pendingInviteForCandidate?.(candidate) ?? null}
          />
        ))}
      </View>
    </>
  );
}

function intentionLabel(intention: MealBuddyIntentionType) {
  return intention === "chat_first" ? zhTW.mobile.refinedLogic.mealBuddyCard.chatFirstLabel : zhTW.mobile.refinedLogic.mealBuddyCard.eatTogetherLabel;
}

function sourceLabel(sourceType: MealBuddyCard["sourceType"]) {
  if (sourceType === "ai_recommendation") {
    return zhTW.mobile.refinedLogic.mealBuddyCard.sourceAiRecommendation;
  }
  if (sourceType === "restaurant_page") {
    return zhTW.mobile.refinedLogic.mealBuddyCard.sourceRestaurantPage;
  }
  return zhTW.mobile.refinedLogic.mealBuddyCard.sourceManual;
}

function profilePhotoFor(userId: string) {
  const seed = [...userId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return profilePhotos[seed % profilePhotos.length];
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 30,
    borderWidth: 3,
    backgroundColor: colors.teal,
    height: 62,
    width: 62
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900"
  },
  avatarImage: {
    borderRadius: 30,
    height: 56,
    width: 56
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  cardTop: {
    flexDirection: "row",
    gap: 13
  },
  cardPressable: {
    borderRadius: 26
  },
  compactSourceText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 2
  },
  disabledButton: {
    opacity: 0.48
  },
  flex: {
    flex: 1,
    gap: 5
  },
  intent: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  intentOption: {
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    flexGrow: 1,
    flexBasis: 150,
    padding: 14
  },
  maskedAvatar: {
    backgroundColor: "#c9bfb4"
  },
  message: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  name: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "900"
  },
  nameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  optionBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  optionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 13,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  reasonBubble: {
    borderColor: "#f0dcc2",
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#fff8ee",
    marginTop: 12,
    padding: 12
  },
  reasonTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  score: {
    color: colors.teal,
    fontSize: 17,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 13,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  sentHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 10
  },
  sectionSpace: {
    gap: 10
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
    marginTop: 14
  },
  summaryItem: {
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.42)",
    flexGrow: 1,
    flexBasis: 130,
    padding: 11
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5
  }
});


