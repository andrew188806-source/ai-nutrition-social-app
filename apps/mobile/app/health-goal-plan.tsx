import { StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, LockNotice, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { useDemoUserPlan } from "../features/demo-user-plan";

export default function HealthGoalPlanScreen() {
  const [demoMode] = useDemoUserPlan();
  const isPremiumMode = demoMode === "premium";

  return (
    <PlaceholderScreen
      title={zhTW.mobile.healthGoalPlan.title}
      subtitle={zhTW.mobile.healthGoalPlan.subtitle}
    >
      <Card tone="amber">
        <Text style={styles.disclaimer}>{zhTW.mobile.healthGoalPlan.disclaimer}</Text>
      </Card>

      <Card tone={isPremiumMode ? "premium" : "default"}>
        <PremiumBadge label={isPremiumMode ? zhTW.mobile.healthGoalPlan.premiumTitle : zhTW.mobile.healthGoalPlan.freePreviewTitle} variant={isPremiumMode ? "premium" : "free"} />
        <SectionTitle title={zhTW.mobile.healthGoalPlan.settingsTitle} subtitle={isPremiumMode ? zhTW.mobile.healthGoalPlan.premiumBody : zhTW.mobile.healthGoalPlan.freePreviewBody} />
        <View style={styles.list}>
          {zhTW.mobile.healthGoalPlan.settings.map((item) => (
            <Text key={item} style={styles.listItem}>
              {item}
            </Text>
          ))}
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.healthGoalPlan.guidanceTitle} />
        <View style={styles.list}>
          {(isPremiumMode ? zhTW.mobile.healthGoalPlan.guidance : zhTW.mobile.healthGoalPlan.guidance.slice(0, 2)).map((item) => (
            <Text key={item} style={styles.listItem}>
              {item}
            </Text>
          ))}
        </View>
        {!isPremiumMode ? <LockNotice title={zhTW.mobile.premiumUi.lockedBadge} body={zhTW.mobile.healthGoalPlan.premiumBody} /> : null}
      </Card>

      <Card tone={isPremiumMode ? "premium" : "default"}>
        <PremiumBadge label={zhTW.mobile.healthGoalPlan.exerciseTitle} variant={isPremiumMode ? "premium" : "free"} />
        <Text style={styles.disclaimer}>{zhTW.mobile.healthGoalPlan.exerciseDisclaimer}</Text>
        <SectionTitle title={zhTW.mobile.healthGoalPlan.activitySettingsTitle} />
        <View style={styles.list}>
          {(isPremiumMode ? zhTW.mobile.healthGoalPlan.activitySettings : zhTW.mobile.healthGoalPlan.activitySettings.slice(0, 2)).map((item) => (
            <Text key={item} style={styles.listItem}>
              {item}
            </Text>
          ))}
        </View>
        <SectionTitle title={zhTW.mobile.healthGoalPlan.recoveryTitle} />
        <View style={styles.list}>
          {(isPremiumMode ? zhTW.mobile.healthGoalPlan.exerciseInsights : zhTW.mobile.healthGoalPlan.exerciseInsights.slice(0, 1)).map((item) => (
            <Text key={item} style={styles.listItem}>
              {item}
            </Text>
          ))}
        </View>
        <View style={styles.tags}>
          <TagRow tags={isPremiumMode ? zhTW.mobile.healthGoalPlan.recoveryMeals : zhTW.mobile.healthGoalPlan.recoveryMeals.slice(0, 1)} />
        </View>
        {!isPremiumMode ? <LockNotice title={zhTW.mobile.premiumUi.lockedBadge} body={zhTW.mobile.premiumUi.upgradeCompatibilityBody} /> : null}
      </Card>

      <Card tone="premium">
        <PremiumBadge label={zhTW.mobile.premiumUi.healthGoalMode} />
        <SectionTitle title={zhTW.mobile.healthGoalPlan.connectedTitle} />
        <View style={styles.tags}>
          <TagRow tags={isPremiumMode ? zhTW.mobile.healthGoalPlan.connected : zhTW.mobile.healthGoalPlan.connected.slice(0, 2)} />
        </View>
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  disclaimer: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20
  },
  list: {
    gap: 9,
    marginTop: 14
  },
  listItem: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20
  },
  tags: {
    marginTop: 14
  }
});
