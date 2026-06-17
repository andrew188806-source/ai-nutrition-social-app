import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, ComparisonPreview, LockNotice, PremiumBadge, SectionTitle, TagRow, UpgradePromptModal, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { useDemoUserPlan } from "../features/demo-user-plan";

export default function SocialScreen() {
  const router = useRouter();
  const [demoMode] = useDemoUserPlan();
  const [upgradePrompt, setUpgradePrompt] = useState<"profile" | "compatibility" | null>(null);
  const [hasGeneratedMatches, setHasGeneratedMatches] = useState(false);
  const isPremiumMode = demoMode === "premium";

  const upgradeCopy =
    upgradePrompt === "compatibility"
      ? {
          title: zhTW.mobile.premiumUi.upgradeCompatibilityTitle,
          body: zhTW.mobile.premiumUi.upgradeCompatibilityBody
        }
      : {
          title: zhTW.mobile.premiumUi.upgradeProfileTitle,
          body: zhTW.mobile.premiumUi.upgradeProfileBody
        };

  return (
    <PlaceholderScreen
      title={zhTW.mobile.nearby.title}
      subtitle={zhTW.mobile.nearby.subtitle}
    >
      <UpgradePromptModal visible={upgradePrompt !== null} title={upgradeCopy.title} body={upgradeCopy.body} actionLabel={zhTW.common.close} onClose={() => setUpgradePrompt(null)} />
      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.nearby.entryTitle} subtitle={zhTW.mobile.nearby.entryBody} />
        <View style={styles.tagSpace}>
          <TagRow tags={zhTW.mobile.social.sharedTags} />
        </View>
        {!hasGeneratedMatches ? (
          <View style={styles.emptyBlock}>
            <SectionTitle title={zhTW.mobile.correctedFlow.beforeAnalysisEmptyTitle} subtitle={zhTW.mobile.correctedFlow.beforeAnalysisEmptyBody} />
            <Text style={styles.reason}>{zhTW.mobile.correctedFlow.intentionalSearchBody}</Text>
          </View>
        ) : null}
        <Pressable style={styles.primaryButton} onPress={() => router.push("/meal-buddies")}>
          <Text style={styles.primaryButtonText}>{zhTW.mobile.communityCard.inviteButton}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setHasGeneratedMatches(true)}>
          <Text style={styles.secondaryButtonText}>{zhTW.mobile.correctedFlow.triggerMealBuddy}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/meal-buddies")}>
          <Text style={styles.secondaryButtonText}>{zhTW.mobile.nearby.friendListCta}</Text>
        </Pressable>
        <ComparisonPreview
          freeTitle={zhTW.mobile.premiumUi.freeSeesTitle}
          premiumTitle={zhTW.mobile.premiumUi.premiumUnlocksTitle}
          freeItems={zhTW.mobile.social.freePreview}
          premiumItems={zhTW.mobile.social.premiumPreview}
        />
      </Card>

      <View style={styles.limitGrid}>
        <Card tone={isPremiumMode ? "default" : "mint"}>
          <PremiumBadge label={zhTW.mobile.premiumUi.freeBadge} variant="free" />
          <SectionTitle title={zhTW.mobile.social.matchLimitTitle} subtitle={zhTW.mobile.social.freeLimit} />
          <Text style={styles.limitPill}>{zhTW.mobile.premiumUi.remainingMatches}</Text>
        </Card>
        <Card tone="premium">
          <PremiumBadge label={zhTW.mobile.premiumUi.premiumBadge} />
          <SectionTitle title={zhTW.common.premium} subtitle={zhTW.mobile.social.premiumLimit} />
          <Text style={styles.limitPill}>{zhTW.mobile.premiumUi.premiumRemainingMatches}</Text>
        </Card>
      </View>

      <Card tone="premium">
        <PremiumBadge label={zhTW.mobile.premiumUi.healthGoalMode} />
        <SectionTitle title={zhTW.mobile.social.healthGoalModeTitle} subtitle={zhTW.mobile.social.healthGoalModeBody} />
        {!isPremiumMode ? <LockNotice title={zhTW.mobile.premiumUi.lockedBadge} body={zhTW.mobile.social.lockedCompatibility} /> : null}
      </Card>

      {hasGeneratedMatches ? (
        <Card tone="amber">
          <SectionTitle title={zhTW.mobile.correctedFlow.generatedBuddyTitle} subtitle={zhTW.mobile.correctedFlow.generatedBuddyBody} />
        </Card>
      ) : null}

      {hasGeneratedMatches ? zhTW.mobile.social.profiles.map((profile) => {
        const showPremiumDetails = isPremiumMode || !profile.locked;
        const isLockedForFree = profile.locked && !isPremiumMode;
        const paymentPreference = zhTW.mobile.correctedFlow.paymentOptions[profile.name.length % zhTW.mobile.correctedFlow.paymentOptions.length];

        return (
          <Card key={profile.name} tone={isLockedForFree ? "default" : "premium"}>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, profile.locked && styles.lockedAvatar]}>
                <Text style={[styles.avatarText, isLockedForFree && styles.blurredAvatarText]}>{isLockedForFree ? "..." : profile.name.slice(0, 1)}</Text>
                {isLockedForFree ? <View style={styles.blurOverlay} /> : null}
              </View>
              <View style={styles.profileContent}>
                <View style={styles.profileTop}>
                  <Text style={styles.profileName}>{showPremiumDetails ? profile.name : zhTW.mobile.social.anonymousProfileName}</Text>
                  <Text style={styles.score}>{profile.score}</Text>
                </View>
                <View style={styles.badgeRow}>
                  <PremiumBadge label={showPremiumDetails ? zhTW.mobile.premiumUi.premiumBadge : zhTW.mobile.premiumUi.freeBadge} variant={showPremiumDetails ? "premium" : "free"} />
                  {isLockedForFree ? <PremiumBadge label={zhTW.mobile.premiumUi.profilePhotoLocked} variant="free" /> : null}
                </View>
                <Text style={styles.note}>{profile.note}</Text>
                <Text style={styles.reason}>{zhTW.mobile.correctedFlow.paymentPreferencePrefix}{paymentPreference}</Text>
                <TagRow tags={showPremiumDetails ? profile.premiumTags : profile.freeTags} />
                <Text style={styles.reason}>{showPremiumDetails ? profile.reason : zhTW.mobile.social.unlockBody}</Text>
                {isLockedForFree ? (
                  <>
                    <LockNotice title={zhTW.mobile.premiumUi.advancedCompatibility} body={zhTW.mobile.social.lockedCompatibility} />
                    <Pressable style={styles.secondaryButton} onPress={() => setUpgradePrompt("compatibility")}>
                      <Text style={styles.secondaryButtonText}>{zhTW.mobile.premiumUi.upgradeCompatibilityTitle}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          </Card>
        );
      }) : null}

      <Card tone={isPremiumMode ? "mint" : "premium"}>
        <PremiumBadge label={zhTW.mobile.premiumUi.fullProfileUnlock} />
        <SectionTitle title={zhTW.mobile.social.unlockTitle} subtitle={isPremiumMode ? zhTW.mobile.social.unlockedMessage : zhTW.mobile.social.unlockBody} />
        {!isPremiumMode ? (
          <Pressable style={styles.primaryButton} onPress={() => setUpgradePrompt("profile")}>
            <Text style={styles.primaryButtonText}>{zhTW.mobile.social.unlockButton}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.social.privacyTitle} subtitle={zhTW.mobile.social.privacyBody} />
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.social.relationshipSettingsTitle} subtitle={zhTW.mobile.social.relationshipSettingsBody} />
        <View style={styles.tagSpace}>
          <TagRow tags={zhTW.mobile.social.relationshipModes} />
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.social.privacyControlsTitle} />
        <View style={styles.valueList}>
          {zhTW.mobile.social.privacyControls.map((control) => (
            <Text key={control} style={styles.valueItem}>
              {control}
            </Text>
          ))}
        </View>
      </Card>

      <Card tone="amber">
        <SectionTitle title={zhTW.mobile.social.smartPromptsTitle} />
        <View style={styles.valueList}>
          {zhTW.mobile.social.smartPrompts.map((prompt) => (
            <Text key={prompt} style={styles.valueItem}>
              {prompt}
            </Text>
          ))}
        </View>
      </Card>

      <Card tone="premium">
        <PremiumBadge label={zhTW.mobile.premiumUi.premiumBadge} />
        <SectionTitle title={zhTW.mobile.social.upgradeTitle} />
        <View style={styles.valueList}>
          {zhTW.mobile.social.premiumValues.map((value) => (
            <Text key={value} style={styles.valueItem}>
              {value}
            </Text>
          ))}
        </View>
      </Card>

      <Card tone="amber">
        <SectionTitle title={zhTW.mobile.social.groupBranchTitle} subtitle={zhTW.mobile.social.groupBranchBody} />
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/meal-buddies")}>
          <Text style={styles.secondaryButtonText}>{zhTW.mobile.communityCard.nearbyButton}</Text>
        </Pressable>
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  tagSpace: {
    marginTop: 14
  },
  limitGrid: {
    gap: 12
  },
  emptyBlock: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 14,
    padding: 14
  },
  profileRow: {
    flexDirection: "row",
    gap: 14
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: colors.ink,
    height: 56,
    width: 56
  },
  lockedAvatar: {
    overflow: "hidden",
    borderColor: "#EEDAC2",
    borderWidth: 2,
    backgroundColor: "#AEA498"
  },
  blurOverlay: {
    position: "absolute",
    top: 7,
    right: 7,
    bottom: 7,
    left: 7,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.34)"
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900"
  },
  blurredAvatarText: {
    letterSpacing: 2,
    opacity: 0.45
  },
  profileContent: {
    flex: 1,
    gap: 9
  },
  profileTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  profileName: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "900"
  },
  score: {
    color: colors.teal,
    fontSize: 20,
    fontWeight: "900"
  },
  note: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  reason: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19
  },
  limitPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.coral,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#EEDAC2",
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#F9F2EA",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  valueList: {
    gap: 8,
    marginTop: 12
  },
  valueItem: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  }
});
