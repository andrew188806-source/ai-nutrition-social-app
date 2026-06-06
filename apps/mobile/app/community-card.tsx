import { useState } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, DemoModeToggle, LockNotice, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { getAvatarDisplayLabel, getCommunityCardSettings, getSelectedMascot } from "../features/community-card-settings";
import { useDemoUserPlan } from "../features/demo-user-plan";

type CommunityCardVisibility = (typeof zhTW.mobile.communityCard.visibilityOptions)[number];
type CommunityCardIntent = (typeof zhTW.mobile.communityCard.intents)[number];
type PaymentPreference = (typeof zhTW.mobile.correctedFlow.paymentOptions)[number];

const profilePhotos = [
  require("../assets/profiles/profile-01.png"),
  require("../assets/profiles/profile-02.png")
];

export default function CommunityCardScreen() {
  const router = useRouter();
  const [demoMode, setDemoMode] = useDemoUserPlan();
  const [visibility, setVisibility] = useState<CommunityCardVisibility>(zhTW.mobile.communityCard.visibilityOptions[0]);
  const [intent, setIntent] = useState<CommunityCardIntent>(zhTW.mobile.communityCard.intents[0]);
  const [paymentPreference, setPaymentPreference] = useState<PaymentPreference>(zhTW.mobile.correctedFlow.paymentOptions[0]);
  const [isPublished, setIsPublished] = useState(false);
  const isPremiumMode = demoMode === "premium";
  const savedSettings = getCommunityCardSettings();
  const selectedMascot = getSelectedMascot(savedSettings);
  const avatarLabel = getAvatarDisplayLabel({ context: isPremiumMode ? "normal" : "free", mascot: selectedMascot, settings: savedSettings });
  const socialDetail = zhTW.mobile.refinedLogic.lifestyleWorld.communityDetails[0];

  return (
    <PlaceholderScreen
      title={zhTW.mobile.communityCard.title}
      subtitle={zhTW.mobile.mainSections.communityCardSubtitle}
      primaryAction={{ href: "/meal-buddies", label: zhTW.mobile.mealBuddies.viewList }}
      secondaryAction={{ href: "/meal-log", label: zhTW.common.backHome }}
    >
      <DemoModeToggle mode={demoMode} onChange={setDemoMode} />

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.communityCard.entryTitle} subtitle={zhTW.mobile.communityCard.entryBody} />
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.communityCard.selectedMealTitle} subtitle={zhTW.mobile.communityCard.selectedMealBody} />
        <Text style={styles.mealName}>{zhTW.mobile.communityCard.selectedMeal}</Text>
        <View style={styles.tagSpace}>
          <TagRow tags={zhTW.mobile.analysis.mealTags} />
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.communityCard.visibilityTitle} />
        <View style={styles.optionRow}>
          {zhTW.mobile.communityCard.visibilityOptions.map((option) => (
            <Pressable key={option} style={[styles.option, visibility === option && styles.optionActive]} onPress={() => setVisibility(option)}>
              <Text style={[styles.optionText, visibility === option && styles.optionTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.communityCard.captionTitle} subtitle={zhTW.mobile.communityCard.caption} />
        <SectionTitle title={zhTW.mobile.communityCard.intentTitle} />
        <View style={styles.optionRow}>
          {zhTW.mobile.communityCard.intents.map((item) => (
            <Pressable key={item} style={[styles.intentPill, intent === item && styles.intentPillActive]} onPress={() => setIntent(item)}>
              <Text style={[styles.intentText, intent === item && styles.intentTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.correctedFlow.paymentPreferenceTitle} subtitle={zhTW.mobile.correctedFlow.paymentReminder} />
        <View style={styles.optionRow}>
          {zhTW.mobile.correctedFlow.paymentOptions.map((option) => (
            <Pressable key={option} style={[styles.intentPill, paymentPreference === option && styles.intentPillActive]} onPress={() => setPaymentPreference(option)}>
              <Text style={[styles.intentText, paymentPreference === option && styles.intentTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card tone={isPremiumMode ? "premium" : "default"}>
        <PremiumBadge label={isPremiumMode ? zhTW.mobile.premiumUi.premiumBadge : zhTW.mobile.premiumUi.freeBadge} variant={isPremiumMode ? "premium" : "free"} />
        <SectionTitle title={zhTW.mobile.communityCard.previewTitle} subtitle={zhTW.mobile.communityCard.matchReason} />
        <View style={[styles.previewShell, isPremiumMode && styles.previewShellPremium]}>
          <View style={[styles.avatar, !isPremiumMode && styles.lockedAvatar]}>
            {isPremiumMode ? <Image source={profilePhotos[0]} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{avatarLabel}</Text>}
          </View>
          <View style={styles.profileContent}>
            <Text style={styles.profileName}>{isPremiumMode ? zhTW.mobile.communityCard.premiumName : zhTW.mobile.communityCard.anonymousName}</Text>
            <Text style={styles.meta}>{isPremiumMode ? savedSettings.nickname : selectedMascot.name}</Text>
            <Text style={styles.meta}>{zhTW.mobile.communityCard.nearbyStatus}</Text>
            <Text style={styles.meta}>{zhTW.mobile.refinedLogic.lifestyleWorld.wantsToEat}{socialDetail.meal}</Text>
            <Text style={styles.meta}>{zhTW.mobile.refinedLogic.lifestyleWorld.todayMood}{socialDetail.mood}</Text>
            <Text style={styles.meta}>{zhTW.mobile.correctedFlow.paymentPreferencePrefix}{paymentPreference}</Text>
            <Text style={styles.score}>{zhTW.mobile.communityCard.compatibility}</Text>
          </View>
        </View>
        <View style={styles.tagSpace}>
          <TagRow tags={[intent, ...savedSettings.selectedEatingTags.slice(0, isPremiumMode ? 4 : 2), ...selectedMascot.tags.slice(0, 1)]} />
        </View>
        {!isPremiumMode ? <LockNotice title={zhTW.mobile.premiumUi.fullProfileUnlock} body={zhTW.mobile.communityCard.unlockButton} /> : null}
      </Card>

      <Card tone="amber">
        <Pressable style={styles.publishButton} onPress={() => router.push("/meal-buddies")}>
          <Text style={styles.publishButtonText}>{zhTW.mobile.mealBuddies.viewList}</Text>
        </Pressable>
        {isPublished ? <Text style={styles.successText}>{zhTW.mobile.communityCard.publishedState}</Text> : <Text style={styles.emptyText}>{zhTW.mobile.communityCard.emptyState}</Text>}
        <Pressable style={[styles.publishButton, styles.secondaryPublishButton]} onPress={() => setIsPublished(true)}>
          <Text style={styles.publishButtonText}>{zhTW.mobile.mealBuddies.sendInvite}</Text>
        </Pressable>
        <Text style={styles.emptyText}>{zhTW.mobile.correctedFlow.paymentPreferencePrefix}{paymentPreference}</Text>
        <Pressable style={[styles.publishButton, styles.buddyButton]} onPress={() => router.push("/meal-buddies")}>
          <Text style={styles.publishButtonText}>{zhTW.mobile.mealBuddies.viewList}</Text>
        </Pressable>
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  mealName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12
  },
  tagSpace: {
    marginTop: 14
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  option: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  optionActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  optionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  optionTextActive: {
    color: colors.ink
  },
  intentPill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  intentPillActive: {
    borderColor: "#f4c56f",
    backgroundColor: "#fff3d9"
  },
  intentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  intentTextActive: {
    color: colors.ink
  },
  profileRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 14
  },
  previewShell: {
    flexDirection: "row",
    gap: 16,
    borderColor: "#efe0ce",
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "#fff8ee",
    marginTop: 14,
    padding: 16
  },
  previewShellPremium: {
    borderColor: "#efc378",
    backgroundColor: "#fff4d8"
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 34,
    borderWidth: 3,
    backgroundColor: colors.coral,
    height: 76,
    overflow: "hidden",
    width: 76,
    shadowColor: "#9a6b45",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
  lockedAvatar: {
    backgroundColor: "#b9b0a8"
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900"
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  profileContent: {
    flex: 1,
    gap: 5
  },
  profileName: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  score: {
    color: colors.teal,
    fontSize: 20,
    fontWeight: "900"
  },
  publishButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryPublishButton: {
    backgroundColor: colors.teal,
    marginTop: 10
  },
  buddyButton: {
    backgroundColor: colors.ink,
    marginTop: 10
  },
  publishButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  successText: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12
  }
});
