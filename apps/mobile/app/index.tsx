import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { resetMealRecords } from "../features/analysis/analysisMealRecordStore";
import { advanceDemoTimeByDays, getEffectiveDateKey, isDemoTestingEnabled, resetDemoTime } from "../features/demo-time";
import { resetAllMealBuddyDemoState, resetMealBuddySocialDemoState } from "../features/meal-buddy-card";
import { storage } from "../lib/storage";

const profilePhotos = [
  require("../assets/profiles/profile-01.png"),
  require("../assets/profiles/profile-02.png"),
  require("../assets/profiles/profile-03.png")
];

export default function LandingScreen() {
  const router = useRouter();
  const [demoDateKey, setDemoDateKey] = useState(getEffectiveDateKey());

  function advanceDemoDate(days: number) {
    advanceDemoTimeByDays(days);
    setDemoDateKey(getEffectiveDateKey());
  }

  function resetDemoData() {
    resetDemoTime();
    resetAllMealBuddyDemoState();
    resetMealBuddySocialDemoState();
    resetMealRecords();
    storage.removeItem("haocu.mealBuddy.recommendationGroups.v1");
    setDemoDateKey(getEffectiveDateKey());
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.landingTitle}
      subtitle={zhTW.mobile.home.summarySubtitle}
      eyebrow={zhTW.mobile.demoAccess.platformConsumer}
      primaryAction={{ href: "/meal-photo", label: zhTW.mobile.startDemo }}
      secondaryAction={{ href: "/meal-buddies", label: zhTW.mobile.refinedLogic.homeFocus.findMealPartners }}
    >
      <Card tone="mint">
        <View style={styles.liveHeader}>
          <Text style={styles.liveBadge}>{zhTW.mobile.refinedLogic.lifestyleWorld.liveBadge}</Text>
          <Text style={styles.liveText}>{zhTW.mobile.refinedLogic.lifestyleWorld.nearbySocialBody}</Text>
        </View>
        <SectionTitle title={zhTW.mobile.refinedLogic.lifestyleWorld.homeMoodTitle} subtitle={zhTW.mobile.refinedLogic.lifestyleWorld.homeMoodBody} />
        <View style={styles.heroPreview}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreText}>82</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.previewTitle}>{zhTW.mobile.landing.heroMetric}</Text>
            <TagRow tags={zhTW.mobile.analysis.mealTags} />
          </View>
        </View>
        <View style={styles.peopleRow}>
          <View style={styles.avatarStack}>
            {profilePhotos.map((photo, index) => (
              <Image key={index} source={photo} style={[styles.miniAvatar, { marginLeft: index === 0 ? 0 : -10 }]} />
            ))}
          </View>
          <Text style={styles.peopleText}>{zhTW.mobile.refinedLogic.lifestyleWorld.nearbySocialBody}</Text>
        </View>
        <View style={styles.tagSpace}>
          <TagRow tags={zhTW.mobile.refinedLogic.lifestyleWorld.nutritionMoodTags} />
        </View>
      </Card>

      <Card tone="amber">
        <PremiumBadge label={zhTW.mobile.home.journeyTitle} variant="free" />
        <View style={styles.ctaGrid}>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/meal-photo")}>
            <Text style={styles.primaryButtonText}>{zhTW.mobile.refinedLogic.homeFocus.photoAnalysis}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push("/recommendation")}>
            <Text style={styles.secondaryButtonText}>{zhTW.mobile.refinedLogic.homeFocus.findMealPartners}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push("/restaurants")}>
            <Text style={styles.secondaryButtonText}>{zhTW.mobile.refinedLogic.homeFocus.findRestaurant}</Text>
          </Pressable>
        </View>
      </Card>

      <Card tone="sky">
        <SectionTitle title={zhTW.mobile.refinedLogic.lifestyleWorld.nextMealTitle} subtitle={zhTW.mobile.refinedLogic.lifestyleWorld.nextMealBody} />
        <View style={styles.mealFocus}>
          <View style={styles.mealPlate}>
            <Text style={styles.mealPlateText}>AI</Text>
          </View>
          <View style={styles.mealFocusText}>
            <Text style={styles.mealFocusTitle}>{zhTW.mobile.home.nextMealValue}</Text>
            <Text style={styles.mealFocusBody}>{zhTW.mobile.home.nextMealNote}</Text>
          </View>
        </View>
        <View style={styles.socialRow}>
          <Pressable style={styles.socialPill} onPress={() => router.push("/recommendation")}>
            <Text style={styles.socialPillText}>{zhTW.mobile.refinedLogic.homeFocus.findRestaurant}</Text>
          </Pressable>
          <Pressable style={[styles.socialPill, styles.socialPillDark]} onPress={() => router.push("/meal-buddies")}>
            <Text style={styles.socialPillTextDark}>{zhTW.mobile.refinedLogic.homeFocus.findMealPartners}</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.refinedLogic.lifestyleWorld.todayTimelineTitle} subtitle={zhTW.mobile.refinedLogic.lifestyleWorld.todayTimelineBody} />
        <View style={styles.timelineList}>
          {zhTW.mobile.refinedLogic.lifestyleWorld.todayTimelineItems.map((item, index) => (
            <View key={item} style={styles.timelineItem}>
              <View style={[styles.timelineDot, index === 1 && styles.timelineDotActive]} />
              <Text style={styles.timelineText}>{item}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.refinedLogic.lifestyleWorld.homeActivityTitle} />
        <View style={styles.activityList}>
          {zhTW.mobile.refinedLogic.lifestyleWorld.homeActivities.map((activity, index) => (
            <View key={activity} style={styles.activityItem}>
              <View style={[styles.activityDot, index % 2 === 0 && styles.activityDotWarm]} />
              <Text style={styles.activityText}>{activity}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.refinedLogic.ratingReminder.title} subtitle={zhTW.mobile.refinedLogic.ratingReminder.body} />
        <View style={styles.ratingActions}>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/meal-log")}>
            <Text style={styles.primaryButtonText}>{zhTW.mobile.refinedLogic.ratingReminder.rateNow}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push("/")}>
            <Text style={styles.secondaryButtonText}>{zhTW.mobile.refinedLogic.ratingReminder.later}</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.home.journeyTitle} subtitle={zhTW.mobile.refinedLogic.homeFocus.journeyHint} />
      </Card>

      {isDemoTestingEnabled() ? (
        <Card tone="amber">
          <SectionTitle title="Demo 測試工具" subtitle={`DEMO ONLY，目前測試日期：${demoDateKey}。正式版請隱藏或移除。`} />
          <View style={styles.demoToolRow}>
            <Pressable style={styles.secondaryButton} onPress={() => advanceDemoDate(1)}>
              <Text style={styles.secondaryButtonText}>模擬明天</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => advanceDemoDate(7)}>
              <Text style={styles.secondaryButtonText}>模擬一週後</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={resetDemoData}>
              <Text style={styles.secondaryButtonText}>重置測試資料</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  heroPreview: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginTop: 16
  },
  liveHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 14
  },
  liveBadge: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.coral,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  liveText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  scoreCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 40,
    backgroundColor: colors.ink,
    height: 76,
    shadowColor: "#2d2823",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    width: 76
  },
  scoreText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900"
  },
  flex: {
    flex: 1,
    gap: 10
  },
  tagSpace: {
    marginTop: 14
  },
  peopleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.72)",
    marginTop: 16,
    padding: 12
  },
  avatarStack: {
    alignItems: "center",
    flexDirection: "row"
  },
  miniAvatar: {
    borderColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 2,
    height: 34,
    width: 34
  },
  peopleText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  previewTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "900"
  },
  ctaGrid: {
    gap: 10,
    marginTop: 14
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  mealFocus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    marginTop: 16,
    padding: 14
  },
  mealPlate: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#fff0c6",
    borderRadius: 28,
    borderWidth: 5,
    backgroundColor: colors.coral,
    height: 72,
    width: 72
  },
  mealPlateText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900"
  },
  mealFocusText: {
    flex: 1,
    gap: 4
  },
  mealFocusTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  mealFocusBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  socialPill: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  socialPillDark: {
    backgroundColor: colors.ink
  },
  socialPillText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  socialPillTextDark: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  activityList: {
    gap: 10,
    marginTop: 14
  },
  ratingActions: {
    gap: 10,
    marginTop: 14
  },
  demoToolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  activityItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#fff8ee",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  activityDot: {
    borderRadius: 999,
    backgroundColor: colors.teal,
    height: 9,
    width: 9
  },
  activityDotWarm: {
    backgroundColor: colors.coral
  },
  activityText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  timelineDot: {
    borderRadius: 999,
    backgroundColor: colors.amber,
    height: 10,
    width: 10
  },
  timelineDotActive: {
    backgroundColor: colors.teal
  },
  timelineItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  timelineList: {
    gap: 10,
    marginTop: 14
  },
  timelineText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  }
});
