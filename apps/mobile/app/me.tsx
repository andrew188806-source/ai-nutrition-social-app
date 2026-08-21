import { useRouter } from "expo-router";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { BottomNav, PremiumBadge } from "../components/DemoUi";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { getSelfMadeDishes } from "../features/self-made-dishes";
import { ConsumerProfileStateNotice, useConsumerRuntime } from "../features/consumer-runtime";
import { Card, CompactRow, PersonAvatar, SectionHeader, StatCard } from "../theme/components";
import type { IconName } from "../theme/icons";
import { fonts, snowPalette as colors } from "../theme/tokens";

type ProfileRowItem = {
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
};

export default function MeScreen() {
  const router = useRouter();
  const runtime = useConsumerRuntime();
  const [demoUserPlan] = useDemoUserPlan();
  const isPremium = demoUserPlan === "premium";
  const profile = zhTW.mobile.profile;
  const diary = zhTW.mobile.mealLog.foodDiary;
  const settings = zhTW.mobile.communityCardSettings;
  const premiumUi = zhTW.mobile.premiumUi;
  const todayNutrition = zhTW.mobile.todayNutritionSummary;
  const latestMonth = diary.monthlyCards[0];
  const selfMadeDishes = getSelfMadeDishes("demo-user");
  const canonicalProfile = runtime.state.profileState.status === "available" ? runtime.state.profileState.profile : null;
  const canonicalName = canonicalProfile?.displayName || canonicalProfile?.nickname || zhTW.mobile.consumerAuth.profileFallback;
  const loggingOut = runtime.state.operation === "signingOut";

  const diaryItems: ProfileRowItem[] = [
    { icon: "leaf", title: diary.dailyDiaryTitle, subtitle: diary.dailyDiaryBody, onPress: () => router.push("/meal-log") },
    { icon: "chart", title: todayNutrition.cardTitle, subtitle: todayNutrition.cardSubtitle, onPress: () => router.push("/today-intake") },
    { icon: "heart", title: diary.favoritesTitle, subtitle: diary.favoritesBody, onPress: () => router.push("/meal-log") },
    { icon: "bookmark", title: diary.highestScoreTitle, subtitle: diary.highestScoreBody, onPress: () => router.push("/meal-log") }
  ];

  const settingsItems: ProfileRowItem[] = [
    { icon: "target", title: profile.healthGoalTitle, subtitle: profile.healthGoalBody, onPress: () => router.push("/health-goal-plan") },
    {
      icon: "buddies",
      title: zhTW.mobile.socialInterestSettings.entryTitle,
      subtitle: zhTW.mobile.socialInterestSettings.entryBody,
      onPress: () => router.push("/social-interest-settings")
    },
    { icon: "edit", title: settings.openFromProfile, subtitle: settings.openFromProfileBody, onPress: () => router.push("/community-card-settings") },
    { icon: "shield", title: profile.privacyTitle, subtitle: profile.privacyBody, onPress: () => router.push("/permissions") },
    {
      icon: "spark",
      title: profile.onboardingReplayTitle,
      subtitle: profile.onboardingReplayBody,
      badge: zhTW.common.comingSoon,
      onPress: () => Alert.alert(profile.onboardingReplayTitle, profile.onboardingReplayBody)
    }
  ];

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{profile.title}</Text>
          <Text style={styles.subtitle}>{profile.subtitle}</Text>
        </View>

        <ConsumerProfileStateNotice profileState={runtime.state.profileState} onRetry={() => void runtime.retryProfile()} />

        {/* 1. Canonical profile summary card */}
        <Card tone="primary">
          <Text style={styles.canonicalLabel}>{zhTW.mobile.consumerAuth.canonicalProfileLabel}</Text>
          <View style={styles.profileRow}>
            {canonicalProfile?.avatarUrl ? (
              <Image source={{ uri: canonicalProfile.avatarUrl }} style={styles.profileAvatar} resizeMode="cover" />
            ) : (
              <PersonAvatar type="real" initial={canonicalName.slice(0, 1)} size={56} />
            )}
            <View style={styles.profileInfo}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName}>{canonicalName}</Text>
              </View>
              <Text style={styles.profileIntro} numberOfLines={2}>
                {canonicalProfile?.nickname || zhTW.mobile.consumerAuth.profileStatusActive}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <SectionHeader title={zhTW.mobile.consumerAuth.demoCardsTitle} subtitle={zhTW.mobile.consumerAuth.demoCardsBody} />
          <View style={styles.statGrid}>
            <StatCard icon="star" label="本月評分" value={latestMonth.score.replace("月評分：", "")} tone="primary" />
            <StatCard icon="heart" label="收藏餐點" value={zhTW.mobile.consumerFavorites.profileCountSummary} />
            <StatCard icon="leaf" label="蛋白質達標" value={latestMonth.proteinDays.replace("蛋白質達標 ", "")} tone="ai" />
          </View>
        </Card>

        {/* 2. Premium status card */}
        <Card tone="primary">
          <View style={styles.premiumBadgeRow}>
            <PremiumBadge label={isPremium ? premiumUi.premiumBadge : premiumUi.freeBadge} variant={isPremium ? "premium" : "free"} />
          </View>
          <SectionHeader title={profile.premiumTitle} subtitle={profile.premiumBody} />
          <View style={styles.rowList}>
            <CompactRow icon="buddies" iconTone="primary" title={isPremium ? premiumUi.premiumRemainingMatches : premiumUi.remainingMatches} />
            <CompactRow icon="table4" iconTone="primary" title={isPremium ? premiumUi.premiumRemainingTableJoins : premiumUi.remainingTableJoins} />
          </View>
        </Card>

        {/* 3. Food/nutrition record entries */}
        <Card tone="blush">
          <SectionHeader title={diary.monthlyScoreTitle} subtitle={`${latestMonth.month} · ${diary.monthlyScoreBody}`} />
          <View style={styles.scoreDetailList}>
            <Text style={styles.scoreDetailItem}>· {latestMonth.averageCalories}</Text>
            <Text style={styles.scoreDetailItem}>· {latestMonth.vegetableDays}</Text>
            <Text style={styles.scoreDetailItem}>· {latestMonth.highFrequency}</Text>
            <Text style={styles.scoreDetailItem}>· {latestMonth.suggestion}</Text>
          </View>
        </Card>

        <View style={styles.section}>
          <SectionHeader title={diary.unifiedTitle} subtitle={diary.unifiedBody} />
          <View style={styles.rowList}>
            {diaryItems.map((item) => (
              <CompactRow key={item.title} icon={item.icon} iconTone="primary" title={item.title} subtitle={item.subtitle} onPress={item.onPress} />
            ))}
          </View>
        </View>

        {/* 4. 我做的料理 — self-made dishes, kept separate from restaurant menu dishes */}
        <View style={styles.section}>
          <SectionHeader title="我做的料理" subtitle="自己煮的餐點與用 AI 拍照記錄的家常菜，與餐廳菜單分開保存。" />
          <CompactRow
            icon="plate"
            iconTone="primary"
            title="我做的料理"
            subtitle={selfMadeDishes.length > 0 ? `已記錄 ${selfMadeDishes.length} 道自煮料理` : "尚未新增自煮料理"}
            value={zhTW.common.comingSoon}
            onPress={() => Alert.alert("我做的料理", "完整的自煮料理收藏頁面即將推出，敬請期待。")}
          />
        </View>

        {/* 5. Settings/privacy entries */}
        <View style={styles.section}>
          <SectionHeader title={profile.accountSettingsTitle} />
          <View style={styles.rowList}>
            {settingsItems.map((item) => (
              <CompactRow key={item.title} icon={item.icon} iconTone="primary" title={item.title} subtitle={item.subtitle} value={item.badge} onPress={item.onPress} />
            ))}
          </View>
        </View>

        <Card>
          <Pressable disabled={loggingOut} onPress={() => void runtime.signOut()} style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}>
            <Text style={styles.logoutButtonText}>{loggingOut ? zhTW.mobile.consumerAuth.loggingOut : zhTW.mobile.consumerAuth.logout}</Text>
          </Pressable>
          {runtime.state.errorCode && runtime.state.authState.status === "signedIn" ? (
            <Text style={styles.logoutError}>{zhTW.mobile.consumerAuth.logoutFailed}</Text>
          ) : null}
        </Card>

        <BottomNav />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 22
  },
  header: {
    gap: 6,
    paddingTop: 8
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontFamily: fonts.black,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.sub,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.body
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  profileAvatar: {
    borderRadius: 28,
    height: 56,
    width: 56
  },
  canonicalLabel: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.card,
    color: colors.primaryDeep,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  profileInfo: {
    flex: 1,
    gap: 4
  },
  profileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  profileName: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  profileIntro: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  premiumBadgeRow: {
    marginBottom: 8
  },
  demoToggleWrap: {
    marginTop: 14
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  scoreDetailList: {
    gap: 4,
    marginTop: 12
  },
  scoreDetailItem: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 18
  },
  section: {
    gap: 12
  },
  rowList: {
    gap: 10
  },
  logoutButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.solid,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  logoutButtonDisabled: {
    opacity: 0.5
  },
  logoutButtonText: {
    color: colors.solidText,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: "900"
  },
  logoutError: {
    color: colors.primaryDeep,
    fontFamily: fonts.medium,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center"
  }
});
