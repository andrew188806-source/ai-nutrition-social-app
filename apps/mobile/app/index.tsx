import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { BottomNav } from "../components/DemoUi";
import { TodayMealGrid } from "../components/TodayMealGrid";
import { TodayNutritionSummaryCard } from "../components/TodayNutritionSummaryCard";
import { resetMealRecords } from "../features/analysis/analysisMealRecordStore";
import { useTodayIntakeUiModel } from "../features/consumer-meals";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { advanceDemoTimeByDays, getEffectiveDateKey, isDemoTestingEnabled, resetDemoTime } from "../features/demo-time";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { resetAllMealBuddyDemoState, resetMealBuddySocialDemoState } from "../features/meal-buddy-card";
import { storage } from "../lib/storage";
import { Card, CompactRow, PrimaryButton, SecondaryButton, SectionHeader } from "../theme/components";
import { Icon, type IconName } from "../theme/icons";
import { fonts, hexA, radius, snowPalette as colors } from "../theme/tokens";

export default function LandingScreen() {
  const router = useRouter();
  const [demoDateKey, setDemoDateKey] = useState(getEffectiveDateKey());
  const runtime = useConsumerRuntime();
  const [, setDemoUserPlan] = useDemoUserPlan();
  const intakeState = useTodayIntakeUiModel({
    date: demoDateKey,
    overviewService: runtime.overviewService,
    revision: runtime.mealDataRevision,
    actorKey: runtime.state.actorKey,
    actorGeneration: runtime.state.actorGeneration,
    enabled: runtime.state.authState.status === "signedIn"
  });
  const model = intakeState.model;

  const lifestyle = zhTW.mobile.refinedLogic.lifestyleWorld;
  const homeFocus = zhTW.mobile.refinedLogic.homeFocus;
  const todayIntake = lifestyle.todayIntake;
  const foodDiary = zhTW.mobile.mealLog.foodDiary;

  function shareDailySummary() {
    if (!model) return;
    const { summary } = model;
    const { calories, protein, carbs, fat } = summary.totals;
    Share.share({
      message: `${zhTW.mobile.todayNutritionSummary.cardTitle}：${calories} kcal（${zhTW.mobile.analysis.protein} ${protein}g · ${zhTW.mobile.analysis.carbs} ${carbs}g · ${zhTW.mobile.analysis.fat} ${fat}g）`
    }).catch(() => undefined);
  }

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
    intakeState.refresh();
  }

  function openTutorialPlaceholder() {
    Alert.alert("新手教學", "新手教學尚未設定");
  }

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.heroTopRow}>
            <Text style={styles.title}>{zhTW.common.appName}</Text>
            <Text style={styles.heroDate}>{demoDateKey}</Text>
          </View>
          <Text style={styles.subtitle}>{zhTW.mobile.landingSubtitle}</Text>
          <View style={styles.statusRow}>
            <Icon name="spark" size={14} color={colors.ai} />
            <Text style={styles.statusText}>{lifestyle.homeMoodBody}</Text>
          </View>
        </View>

        {!model ? (
          <Card>
            <SectionHeader
              title={zhTW.mobile.todayNutritionSummary.cardTitle}
              subtitle={intakeState.status === "error" ? intakeState.error : zhTW.mobile.todayNutritionSummary.cardSubtitle}
            />
          </Card>
        ) : (
          <>
            <TodayNutritionSummaryCard summary={model.summary} onShare={shareDailySummary} onViewDetail={() => router.push("/today-intake")} />

            <View style={styles.section}>
              <SectionHeader title={todayIntake.mealRecordsTitle} />
              <TodayMealGrid slots={model.mealSlots} />
            </View>
          </>
        )}

        <Card tone="primary" style={styles.primaryActionCard}>
          <SectionHeader title={homeFocus.photoAnalysis} subtitle={homeFocus.photoAnalysisBody} />
          <PrimaryButton icon="camera" label={homeFocus.startPhotoAnalysis} onPress={() => router.push({ pathname: "/meal-photo", params: { autoOpen: "true" } })} />
        </Card>

        <View style={styles.actionRow}>
          <HomeSecondaryAction icon="star" title={homeFocus.findNextMeal} body={homeFocus.findNextMealBody} onPress={() => router.push("/recommendation")} />
          <HomeSecondaryAction icon="buddies" title={homeFocus.findMealPartners} body={homeFocus.findMealPartnersBody} onPress={() => router.push({ pathname: "/meal-buddies", params: { section: "cards" } })} />
        </View>

        <View style={styles.compactStack}>
          <CompactRow
            icon="bookmark"
            title={foodDiary.unifiedTitle}
            subtitle={model && model.mealRecords.length > 0 ? `今天有 ${model.mealRecords.length} 則小紀錄` : foodDiary.unifiedBody}
            onPress={() => router.push("/meal-log")}
          />
        </View>

        {isDemoTestingEnabled() ? (
          <Card tone="primary">
            <SectionHeader title="Demo 測試工具" subtitle={`DEMO ONLY，目前測試日期：${demoDateKey}。正式版請隱藏或移除。`} />
            <View style={styles.demoToolRow}>
              <SecondaryButton label="模擬明天" onPress={() => advanceDemoDate(1)} />
              <SecondaryButton label="模擬一週後" onPress={() => advanceDemoDate(7)} />
              <SecondaryButton label="重置測試資料" onPress={resetDemoData} />
            </View>
            <View style={styles.demoToolRow}>
              <SecondaryButton label="新手教學" onPress={openTutorialPlaceholder} />
              <SecondaryButton label="免費版" onPress={() => setDemoUserPlan("free")} />
              <SecondaryButton label="Premium版" onPress={() => setDemoUserPlan("premium")} />
            </View>
          </Card>
        ) : null}

        <BottomNav />
      </ScrollView>
    </View>
  );
}

function HomeSecondaryAction({ body, icon, onPress, title }: { body: string; icon: IconName; onPress: () => void; title: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryActionCard, pressed && styles.secondaryActionCardPressed]}>
      <View style={styles.secondaryActionIcon}>
        <Icon name={icon} size={18} color={colors.primaryDeep} />
      </View>
      <Text style={styles.secondaryActionTitle}>{title}</Text>
      <Text style={styles.secondaryActionBody}>{body}</Text>
      <View style={styles.secondaryActionFooter}>
        <Text style={styles.secondaryActionLink}>{zhTW.common.open}</Text>
        <Icon name="chevron" size={15} color={colors.primaryDeep} />
      </View>
    </Pressable>
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
    gap: 10,
    paddingTop: 8
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontFamily: fonts.black,
    fontWeight: "900"
  },
  heroDate: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.sub,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.body
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: hexA(colors.ai, 0.18),
    backgroundColor: colors.aiSoft,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  statusText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  section: {
    gap: 12
  },
  actionRow: {
    flexDirection: "row",
    gap: 12
  },
  primaryActionCard: {
    gap: 16
  },
  secondaryActionCard: {
    flex: 1,
    minHeight: 176,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 9,
    padding: 14
  },
  secondaryActionCardPressed: {
    opacity: 0.78
  },
  secondaryActionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.base,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  secondaryActionTitle: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: "900"
  },
  secondaryActionBody: {
    color: colors.sub,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18
  },
  secondaryActionFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  secondaryActionLink: {
    color: colors.primaryDeep,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: "900"
  },
  compactStack: {
    gap: 10
  },
  demoToolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  }
});
