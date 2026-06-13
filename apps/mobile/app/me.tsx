import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { BottomNav, DemoModeToggle, PremiumBadge } from "../components/DemoUi";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { Card, Chip, CompactRow, PersonAvatar, SectionHeader, StatCard } from "../theme/components";
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
  const [demoUserPlan, setDemoUserPlan] = useDemoUserPlan();
  const isPremium = demoUserPlan === "premium";
  const profile = zhTW.mobile.profile;
  const diary = zhTW.mobile.mealLog.foodDiary;
  const settings = zhTW.mobile.communityCardSettings;
  const premiumUi = zhTW.mobile.premiumUi;
  const latestMonth = diary.monthlyCards[0];

  const diaryItems: ProfileRowItem[] = [
    { icon: "leaf", title: diary.dailyDiaryTitle, subtitle: diary.dailyDiaryBody, onPress: () => router.push("/meal-log") },
    { icon: "heart", title: diary.favoritesTitle, subtitle: diary.favoritesBody, onPress: () => router.push("/meal-log") },
    { icon: "bookmark", title: diary.highestScoreTitle, subtitle: diary.highestScoreBody, onPress: () => router.push("/meal-log") }
  ];

  const socialItems: ProfileRowItem[] = [
    { icon: "buddies", title: "我的飯友", subtitle: "已配對、配對中與聊天記錄", onPress: () => router.push("/meal-buddies?section=friends") },
    { icon: "table4", title: "四人餐桌", subtitle: "建立或加入的四人餐桌進度", onPress: () => router.push("/meal-buddies?section=tables") },
    { icon: "chat", title: "飯局紀錄", subtitle: "進行中、邀請中與已結束的飯局", onPress: () => router.push("/meal-buddies?section=gatherings") }
  ];

  const settingsItems: ProfileRowItem[] = [
    { icon: "target", title: profile.healthGoalTitle, subtitle: profile.healthGoalBody, onPress: () => router.push("/health-goal-plan") },
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

        <Card tone="primary">
          <View style={styles.profileRow}>
            <PersonAvatar type="real" initial={settings.nicknameValue.slice(0, 1)} size={56} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{settings.nicknameValue}</Text>
              <Text style={styles.profileIntro} numberOfLines={2}>
                {settings.introValue}
              </Text>
            </View>
          </View>
          <View style={styles.planRow}>
            <Chip label={isPremium ? premiumUi.premiumBadge : premiumUi.freeBadge} active={isPremium} tone="primary" />
            <Pressable onPress={() => router.push("/permissions")}>
              <Text style={styles.manageLink}>{zhTW.mobile.home.profileCta}</Text>
            </Pressable>
          </View>
        </Card>

        <Card tone="primary">
          <View style={styles.premiumBadgeRow}>
            <PremiumBadge label={isPremium ? premiumUi.premiumBadge : premiumUi.freeBadge} variant={isPremium ? "premium" : "free"} />
          </View>
          <SectionHeader title={profile.premiumTitle} subtitle={profile.premiumBody} />
          <View style={styles.rowList}>
            <CompactRow icon="buddies" iconTone="primary" title={isPremium ? premiumUi.premiumRemainingMatches : premiumUi.remainingMatches} />
            <CompactRow icon="table4" iconTone="primary" title={isPremium ? premiumUi.premiumRemainingTableJoins : premiumUi.remainingTableJoins} />
          </View>
          <View style={styles.demoToggleWrap}>
            <DemoModeToggle mode={demoUserPlan} onChange={setDemoUserPlan} />
          </View>
        </Card>

        <Card tone="blush">
          <SectionHeader title={diary.monthlyScoreTitle} subtitle={`${latestMonth.month} · ${diary.monthlyScoreBody}`} />
          <View style={styles.statGrid}>
            <StatCard icon="star" label="本月評分" value={latestMonth.score.replace("月評分：", "")} tone="primary" />
            <StatCard icon="flame" label="平均熱量" value={latestMonth.averageCalories.replace("平均每日 ", "")} />
            <StatCard icon="leaf" label="蛋白質達標" value={latestMonth.proteinDays.replace("蛋白質達標 ", "")} tone="ai" />
          </View>
          <View style={styles.scoreDetailList}>
            <Text style={styles.scoreDetailItem}>· {latestMonth.vegetableDays}</Text>
            <Text style={styles.scoreDetailItem}>· {latestMonth.highFrequency}</Text>
            <Text style={styles.scoreDetailItem}>· {latestMonth.suggestion}</Text>
          </View>
          <CompactRow icon="chart" iconTone="primary" title={diary.unifiedTitle} subtitle="查看每日紀錄卡、歷史月評分與收藏美食卡" onPress={() => router.push("/meal-log")} />
        </Card>

        <View style={styles.section}>
          <SectionHeader title={diary.unifiedTitle} subtitle={diary.unifiedBody} />
          <View style={styles.rowList}>
            {diaryItems.map((item) => (
              <CompactRow key={item.title} icon={item.icon} iconTone="primary" title={item.title} subtitle={item.subtitle} onPress={item.onPress} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="飯友與餐桌紀錄" subtitle="快速回到你的飯友配對、四人餐桌與飯局狀態。" />
          <View style={styles.rowList}>
            {socialItems.map((item) => (
              <CompactRow key={item.title} icon={item.icon} iconTone="ai" title={item.title} subtitle={item.subtitle} onPress={item.onPress} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title={profile.accountSettingsTitle} />
          <View style={styles.rowList}>
            {settingsItems.map((item) => (
              <CompactRow key={item.title} icon={item.icon} iconTone="primary" title={item.title} subtitle={item.subtitle} value={item.badge} onPress={item.onPress} />
            ))}
          </View>
        </View>

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
  profileInfo: {
    flex: 1,
    gap: 4
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
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14
  },
  manageLink: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "800"
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
  }
});
