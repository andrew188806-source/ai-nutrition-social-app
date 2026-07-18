import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { BottomNav, PremiumBadge } from "../components/DemoUi";
import { TodayNutritionSummaryCard } from "../components/TodayNutritionSummaryCard";
import { getLatestCorrectedMealRecord, getMealRecords, getTodayMealRecords, updateMealRecordByMealId } from "../features/analysis/analysisMealRecordStore";
import { calculateTodayNutritionSummary, getEffectiveCalories } from "../features/analysis/nutritionSummary";
import type { SavedMealRecord } from "../features/analysis/types";
import { MealCompletionForm } from "../features/calorie-sharing";
import { createMobileConsumerFavoriteComposition } from "../features/consumer-favorites/consumerFavoriteComposition";
import { useConsumerFavoriteList } from "../features/consumer-favorites/consumerFavoriteUiModel";
import type { ConsumerFavoriteRecord, ConsumerMenuItemFavoriteTarget } from "../features/consumer-favorites/types";
import { createMobileConsumerRatingComposition } from "../features/consumer-ratings/consumerRatingComposition";
import { mapConsumerRatingTarget } from "../features/consumer-ratings/consumerRatingTargetMapper";
import { useConsumerRatingUiModel } from "../features/consumer-ratings/consumerRatingUiModel";
import { getCanonicalMenuItemById, getCanonicalRestaurantById } from "../features/restaurants";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { getSelfMadeDishes, type SelfMadeDish } from "../features/self-made-dishes";
import { Card, Chip, CompactRow, SecondaryButton, SectionHeader } from "../theme/components";
import { Icon } from "../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as colors } from "../theme/tokens";

type RankingGroupId = "category" | "location" | "restaurant";
type DailyCard = (typeof zhTW.mobile.mealLog.foodDiary.dailyCards)[number];
type MealCard = {
  id: string;
  slot: string;
  name: string;
  source: string;
  calories: string;
  macros: string;
  rating: string;
  review: string;
  photoLabel: string;
  mealId?: string;
  restaurantId?: string;
  estimatedCalories?: number;
  savedRating?: number;
  savedPortionFeeling?: SavedMealRecord["portionFeeling"];
  savedWouldEatAgain?: boolean;
};
type MonthlyCard = (typeof zhTW.mobile.mealLog.foodDiary.monthlyCards)[number];
type RankingCard = (typeof zhTW.mobile.mealLog.foodDiary.rankingCards)[number];

const emptyField = zhTW.mobile.refinedLogic.mealBuddyCard.emptyField;

export default function MealLogScreen() {
  const router = useRouter();
  const diary = zhTW.mobile.mealLog.foodDiary;
  const mealRecords = getMealRecords();
  const savedMeal = getLatestCorrectedMealRecord();
  const todaySummary = calculateTodayNutritionSummary(getTodayMealRecords());
  const selfMadeDishes = getSelfMadeDishes("demo-user");
  const mealRecordGroups = groupMealRecordsByDate(mealRecords);
  const correctedMealCards: MealCard[] = mealRecords.map((meal, index) => ({
    id: meal.mealId ?? `meal-record-${index}`,
    slot: meal.mealPeriod,
    name: meal.mealName || emptyField,
    source: `${zhTW.mobile.finalUx.restaurantNameLabel}｜${meal.restaurantName || emptyField}`,
    calories: `${getEffectiveCalories(meal)} kcal`,
    macros: `${zhTW.mobile.analysis.protein} ${meal.protein}g｜${zhTW.mobile.analysis.carbs} ${meal.carbohydrates}g｜${zhTW.mobile.analysis.fat} ${meal.fat}g`,
    rating: diary.editRatingCta,
    review: `${meal.ingredients}｜${meal.portion}`,
    photoLabel: diary.mealDetailTitle,
    mealId: meal.mealId,
    restaurantId: meal.restaurantId,
    estimatedCalories: meal.estimatedCalories ?? meal.calories,
    savedRating: meal.rating,
    savedPortionFeeling: meal.portionFeeling,
    savedWouldEatAgain: meal.wouldEatAgain
  }));
  const mealDetailCards: MealCard[] = correctedMealCards;

  const [demoUserPlan] = useDemoUserPlan();
  const isPaid = demoUserPlan === "premium";
  const [selectedDailyId, setSelectedDailyId] = useState<string | null>(null);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [selectedMonthId, setSelectedMonthId] = useState<string>(diary.monthlyCards[0]?.id ?? "");
  const [selectedRankingGroup, setSelectedRankingGroup] = useState<RankingGroupId | null>(null);
  const [selectedRankingOption, setSelectedRankingOption] = useState<string | null>(null);
  const [mockMessage, setMockMessage] = useState("");
  const [editingMeal, setEditingMeal] = useState<MealCard | null>(null);
  const favoriteComposition = useMemo(() => {
    try {
      return createMobileConsumerFavoriteComposition();
    } catch {
      return null;
    }
  }, []);
  const menuItemFavorites = useConsumerFavoriteList({
    service: favoriteComposition?.service ?? null,
    entityType: "menu_item",
    enabled: true
  });
  const ratingComposition = useMemo(() => {
    try {
      return createMobileConsumerRatingComposition();
    } catch {
      return null;
    }
  }, []);
  const ratingTarget = useMemo(
    () => mapConsumerRatingTarget({
      restaurantId: editingMeal?.restaurantId
    }),
    [editingMeal?.restaurantId]
  );
  const ratingFormIdentity = editingMeal?.mealId ?? editingMeal?.id ?? null;
  const ratingUi = useConsumerRatingUiModel({
    service: ratingComposition?.service ?? null,
    target: ratingTarget,
    uiIdentity: ratingFormIdentity,
    enabled: Boolean(editingMeal)
  });

  const selectedDaily = diary.dailyCards.find((card) => card.id === selectedDailyId);
  const selectedMonth = diary.monthlyCards.find((card) => card.id === selectedMonthId) ?? diary.monthlyCards[0];
  const latestDaily = diary.dailyCards[0];

  // Food Diary is the unified user-facing archive for nutrition records, meal cards,
  // monthly score cards, favorites, and highest-score cards.
  const selectDaily = (id: string) => {
    setSelectedDailyId(id);
    setIsMonthlyModalOpen(false);
    focusMealLogElementAfterRender("daily-detail-view");
  };

  useEffect(() => {
    if (selectedRankingGroup && !selectedRankingOption) {
      focusMealLogElementAfterRender("highest-score-options");
    }
    if (selectedRankingOption) {
      focusMealLogElementAfterRender("highest-score-ranking-list");
    }
  }, [selectedRankingGroup, selectedRankingOption]);

  if (selectedDaily) {
    return (
      <View style={styles.shell}>
        <ScrollView contentContainerStyle={styles.container}>
          <View nativeID="daily-detail-view" />
          <Pressable style={styles.backButton} onPress={() => setSelectedDailyId(null)}>
            <Text style={styles.backButtonText}>{diary.backToDailyRecords}</Text>
          </Pressable>

          <Card tone="primary">
            <SectionHeader title={selectedDaily.date} subtitle={selectedDaily.comment} />
            <View style={styles.summaryChipsRow}>
              <Chip label={selectedDaily.score} active />
              <Chip label={selectedDaily.calories} />
              <Chip label={selectedDaily.macros} />
            </View>
            <View style={styles.tagsRow}>
              {selectedDaily.thumbnails.map((tag) => (
                <Chip key={tag} label={tag} tone="ai" />
              ))}
            </View>
          </Card>

          <Card>
            <SectionHeader title={diary.mealDetailTitle} subtitle={diary.mealDetailBody} />
            <View style={styles.stack}>
              {mealDetailCards.map((meal) => (
                <MealFoodCard
                  key={meal.id}
                  meal={meal}
                  onMockAction={setMockMessage}
                  onEditRating={meal.mealId ? () => setEditingMeal(meal) : undefined}
                  shareCta={diary.shareCta}
                  editRatingCta={diary.editRatingCta}
                />
              ))}
            </View>
          </Card>

          {editingMeal ? (
            <MealCompletionForm
              visible={!!editingMeal}
              onClose={() => setEditingMeal(null)}
              onSubmit={async (result) => {
                if (!editingMeal.mealId) {
                  return;
                }
                const localRecord = updateMealRecordByMealId(editingMeal.mealId, {
                  rating: result.rating,
                  portionFeeling: result.portionFeeling,
                  wouldEatAgain: result.wouldEatAgain,
                  completionPercentage: result.completionPercentage,
                  unfinishedReason: result.unfinishedReason,
                  actualCalories: result.actualCalories
                });
                const localCompletionSaved = Boolean(localRecord);
                ratingUi.markLocalCompletionSaved(localCompletionSaved);
                await ratingUi.save({
                  rating: result.rating,
                  portionFeeling: result.portionFeeling,
                  wouldEatAgain: result.wouldEatAgain
                }, localCompletionSaved);
              }}
              estimatedCalories={editingMeal.estimatedCalories ?? 0}
              mealName={editingMeal.name}
              formIdentity={ratingFormIdentity ?? "meal-log-closed"}
              initialValues={{
                rating: editingMeal.savedRating,
                portionFeeling: editingMeal.savedPortionFeeling,
                wouldEatAgain: editingMeal.savedWouldEatAgain
              }}
              canonicalInitialValues={ratingUi.initialHydration}
              canonicalRatingState={ratingUi.state}
            />
          ) : null}

          <Card tone="blush">
            <SectionHeader title={diary.sharingTitle} subtitle={diary.sharingBody} />
            <View style={styles.shareButtonsRow}>
              <SecondaryButton icon="share" label={diary.shareDailyCta} onPress={() => setMockMessage("已產生日記分享卡")} />
              {diary.sharingOptions.map((option) => (
                <SecondaryButton key={option} label={option} onPress={() => setMockMessage(`${option} 已送出`)} />
              ))}
            </View>
            <Text style={styles.note}>{diary.instagramUnlimited}</Text>
            {mockMessage ? <Text style={styles.noticeText}>{mockMessage}</Text> : null}
          </Card>

          <BottomNav />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* 1. Screen header */}
        <View style={styles.header}>
          <Text style={styles.title}>{diary.unifiedTitle}</Text>
          <Text style={styles.subtitle}>{zhTW.mobile.mealLogSubtitle}</Text>
        </View>

        {/* Daily nutrition summary (part 1): diary-style daily score note */}
        {latestDaily ? (
          <Card tone="blush">
            <SectionHeader title={latestDaily.date} subtitle={latestDaily.comment} />
            <View style={styles.summaryChipsRow}>
              <Chip label={latestDaily.score} active />
              <Chip label={latestDaily.calories} />
              <Chip label={latestDaily.macros} />
            </View>
            <Text style={styles.note}>{latestDaily.status}</Text>
          </Card>
        ) : null}

        {/* Daily nutrition summary (part 2): shared meal-record totals vs today's goals */}
        <TodayNutritionSummaryCard summary={todaySummary} onViewDetail={() => router.push("/today-intake")} />

        {/* 2. Recent meal records — grouped by day, with source badges */}
        <View style={styles.section}>
          <SectionHeader title={diary.dailyDiaryTitle} subtitle={diary.dailyDiaryBody} />

          <CompactRow
            icon="search"
            title={diary.searchPlaceholder}
            subtitle={diary.demoModeHint}
            onPress={() => setMockMessage(diary.demoModeHint)}
          />

          {savedMeal ? (
            <View style={styles.latestMealHighlight}>
              <Text style={styles.latestMealLabel}>最新加入今日飲食</Text>
              <RecentMealCard meal={savedMeal} />
            </View>
          ) : null}

          {mealRecordGroups.length > 0 ? (
            <View style={styles.stack}>
              {mealRecordGroups.map((group) => (
                <View key={group.date} style={styles.dayGroup}>
                  <Text style={styles.dayGroupDate}>{group.date}</Text>
                  {group.meals.map((meal, index) => (
                    <RecentMealCard key={`${group.date}-${index}`} meal={meal} />
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.subSectionTitle}>最近 3 天飲食日記</Text>
          <View nativeID="recent-daily-records" style={styles.stack}>
            {diary.dailyCards.slice(0, 3).map((card) => (
              <DailyOverviewCard card={card} detailCta={diary.detailCta} key={card.id} onPress={() => selectDaily(card.id)} />
            ))}
          </View>
          <SecondaryButton label={diary.viewMonthlyRecordsCta} onPress={() => setIsMonthlyModalOpen(true)} />
        </View>

        {/* 3. Monthly score / 月評分 entry */}
        <Card tone="primary">
          <SectionHeader title={diary.monthlyScoreTitle} subtitle={`${selectedMonth?.month ?? ""} · ${diary.monthlyScoreBody}`} />
          <Text style={styles.filterTitle}>{diary.monthSelectorTitle}</Text>
          <View style={styles.chipRow}>
            {getAvailableMonths(diary.monthlyCards, isPaid).map((card) => (
              <Chip key={card.id} label={card.month} active={selectedMonthId === card.id} onPress={() => setSelectedMonthId(card.id)} />
            ))}
          </View>
          <View nativeID="monthly-score-card">
            {selectedMonth ? <MonthlyScoreCard card={selectedMonth} onMockAction={setMockMessage} shareCta={diary.shareCta} /> : null}
          </View>
        </Card>

        {/* 4. Favorites / 收藏餐點 entry */}
        <View style={styles.section}>
          <SectionHeader title={diary.favoritesTitle} subtitle={diary.favoritesBody} />
          <View nativeID="favorite-food-cards">
            {menuItemFavorites.status === "loading" ? (
              <Text style={styles.note}>{zhTW.mobile.consumerFavorites.loading}</Text>
            ) : menuItemFavorites.status === "disabled" ? (
              <Text style={styles.note}>{zhTW.mobile.consumerFavorites.disabled}</Text>
            ) : menuItemFavorites.status === "unauthenticated" ? (
              <Text style={styles.note}>{zhTW.mobile.consumerFavorites.loginRequired}</Text>
            ) : menuItemFavorites.status === "failed" ? (
              <Text style={styles.note}>{zhTW.mobile.consumerFavorites.failed}</Text>
            ) : menuItemFavorites.status === "empty" || (menuItemFavorites.status === "loaded" && menuItemFavorites.records.length === 0) ? (
              <Text style={styles.note}>{zhTW.mobile.consumerFavorites.empty}</Text>
            ) : menuItemFavorites.status === "loaded" ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritesRow}>
                {menuItemFavorites.records.map((record) => (
                  <LiveFavoriteFoodCard key={record.favoriteId} record={record} onMockAction={setMockMessage} shareCta={diary.shareCta} />
                ))}
              </ScrollView>
            ) : null}
          </View>
          {!isPaid ? <Text style={styles.note}>{diary.favoriteLimitReached}</Text> : null}
          <SecondaryButton label={diary.viewAllFavoritesCta} onPress={() => setMockMessage(diary.viewAllFavoritesCta)} />

          <View nativeID="highest-score-entry" style={styles.highestScoreBlock}>
            <SectionHeader title={diary.highestScoreTitle} subtitle={diary.highestScoreBody} />
            <HighestScoreExplorer
              isPaid={isPaid}
              selectedGroup={selectedRankingGroup}
              selectedOption={selectedRankingOption}
              onSelectGroup={(group) => {
                setSelectedRankingGroup(group);
                setSelectedRankingOption(null);
              }}
              onSelectOption={setSelectedRankingOption}
              onCollapse={() => {
                setSelectedRankingGroup(null);
                setSelectedRankingOption(null);
              }}
              onMockAction={setMockMessage}
            />
          </View>
        </View>

        {/* 5. 我做的料理 — self-made dishes, kept separate from restaurant meal records */}
        <View style={styles.section}>
          <SectionHeader title="我做的料理" subtitle="自己煮的餐點與用 AI 拍照記錄的家常菜，與餐廳菜單分開保存，但會在飲食日記中標示來源。" />
          <View style={styles.stack}>
            {selfMadeDishes.map((dish) => (
              <SelfMadeDishCard key={dish.id} dish={dish} />
            ))}
          </View>
        </View>

        {/* 6. Sharing entry */}
        <Card>
          <SectionHeader title={diary.sharingTitle} subtitle={diary.sharingBody} />
          <View style={styles.shareButtonsRow}>
            <SecondaryButton icon="share" label={diary.shareDailyCta} onPress={() => setMockMessage("已產生日記分享卡")} />
            {diary.sharingOptions.map((option) => (
              <SecondaryButton key={option} label={option} onPress={() => setMockMessage(`${option} 已送出`)} />
            ))}
          </View>
          <Text style={styles.note}>{diary.instagramUnlimited}</Text>
        </Card>

        {mockMessage ? (
          <Card tone="ai">
            <Text style={styles.noticeText}>{mockMessage}</Text>
          </Card>
        ) : null}

        {/* Membership / save-retention plan (preserved existing flow) */}
        <Card tone="primary">
          <View style={styles.premiumBadgeRow}>
            <PremiumBadge label={isPaid ? diary.paidPlanTitle : diary.freePlanTitle} variant={isPaid ? "premium" : "free"} />
          </View>
          <SectionHeader title={diary.membershipTitle} subtitle={diary.dataSeparationNote} />
          <View style={styles.rowList}>
            {(isPaid ? diary.paidLimits : diary.freeLimits).map((item) => (
              <Text key={item} style={styles.planItem}>
                · {item}
              </Text>
            ))}
          </View>
        </Card>

        <BottomNav />
      </ScrollView>

      <MonthlyRecordModal visible={isMonthlyModalOpen} onClose={() => setIsMonthlyModalOpen(false)} onSelectDaily={selectDaily} />
    </View>
  );
}

function groupMealRecordsByDate(records: SavedMealRecord[]): { date: string; meals: SavedMealRecord[] }[] {
  const groups: { date: string; meals: SavedMealRecord[] }[] = [];
  for (const record of records) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.date === record.date) {
      lastGroup.meals.push(record);
    } else {
      groups.push({ date: record.date, meals: [record] });
    }
  }
  return groups;
}

function isSelfMadeMeal(meal: SavedMealRecord): boolean {
  return meal.source === "self_made" || meal.source === "manual" || meal.source === "ai_estimated";
}

function getAvailableMonths(months: readonly MonthlyCard[], isPaid: boolean) {
  return isPaid ? months : months.slice(0, 6);
}

function getRankingLimit(group: RankingGroupId, isPaid: boolean) {
  if (group === "category") {
    return isPaid ? 10 : 3;
  }
  if (group === "location") {
    return isPaid ? 4 : 2;
  }
  return isPaid ? 10 : 10;
}

function getRankingOptions(group: RankingGroupId) {
  const diary = zhTW.mobile.mealLog.foodDiary;
  if (group === "category") {
    return diary.categoryOptions;
  }
  if (group === "location") {
    return diary.locationOptions;
  }
  return diary.restaurantOptions;
}

function getRankingUpgradeMessage(group: RankingGroupId) {
  const diary = zhTW.mobile.mealLog.foodDiary;
  if (group === "category") {
    return diary.freeCategoryUpgrade;
  }
  if (group === "location") {
    return diary.freeLocationUpgrade;
  }
  return diary.freeRestaurantUpgrade;
}

function focusMealLogElementAfterRender(elementId: string) {
  setTimeout(() => {
    const browserWindow = (globalThis as typeof globalThis & { window?: { document?: { getElementById?: (id: string) => { scrollIntoView?: (options?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition }) => void } | null } } }).window;
    const element = browserWindow?.document?.getElementById?.(elementId);
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, 120);
}

function RecentMealCard({ meal }: { meal: SavedMealRecord }) {
  const diary = zhTW.mobile.mealLog.foodDiary;
  const selfMade = isSelfMadeMeal(meal);
  const sourceLabel = selfMade ? "我做的料理 · 自煮" : `${zhTW.mobile.finalUx.restaurantNameLabel}｜${meal.restaurantName || emptyField}`;

  return (
    <View style={styles.recentMealCard}>
      <View style={styles.recentMealHeader}>
        <Text style={styles.recentMealSlot}>{meal.mealPeriod}</Text>
        <Text style={styles.recentMealCalories}>{getEffectiveCalories(meal)} kcal</Text>
      </View>
      <Text style={styles.recentMealName}>{meal.mealName || emptyField}</Text>
      <View style={styles.recentMealTagsRow}>
        <Chip label={sourceLabel} active={selfMade} tone={selfMade ? "primary" : "ai"} />
        <Chip label={`${zhTW.mobile.analysis.protein} ${meal.protein}g｜${zhTW.mobile.analysis.carbs} ${meal.carbohydrates}g｜${zhTW.mobile.analysis.fat} ${meal.fat}g`} />
      </View>
      <Text style={styles.cardMeta}>
        {meal.date} · {diary.editRatingCta}
      </Text>
    </View>
  );
}

function SelfMadeDishCard({ dish }: { dish: SelfMadeDish }) {
  const sourceLabel = dish.source === "ai_estimated" ? "AI 拍照估算" : dish.source === "manual" ? "手動記錄" : "我做的料理 · 自煮";

  return (
    <View style={styles.recentMealCard}>
      <View style={styles.recentMealHeader}>
        <Text style={styles.recentMealSlot}>{dish.mealType ?? "自煮料理"}</Text>
        {dish.calories ? <Text style={styles.recentMealCalories}>{dish.calories} kcal</Text> : null}
      </View>
      <Text style={styles.recentMealName}>{dish.name}</Text>
      <View style={styles.recentMealTagsRow}>
        <Chip label={sourceLabel} active tone="primary" />
        {(dish.nutritionTags ?? []).map((tag) => (
          <Chip key={tag} label={tag} />
        ))}
      </View>
    </View>
  );
}

function DailyOverviewCard({ card, detailCta, onPress }: { card: DailyCard; detailCta: string; onPress: () => void }) {
  return (
    <Pressable style={styles.dailyOverviewCard} onPress={onPress}>
      <View style={styles.dailyOverviewHeader}>
        <Text style={styles.dailyOverviewDate}>{card.date}</Text>
        <Chip label={card.score} active />
      </View>
      <Text style={styles.dailyOverviewCalories}>{card.calories}</Text>
      <Text style={styles.dailyOverviewMacros}>{card.macros}</Text>
      <View style={styles.recentMealTagsRow}>
        {card.thumbnails.map((tag) => (
          <Chip key={tag} label={tag} tone="ai" />
        ))}
      </View>
      <Text style={styles.linkText}>{detailCta} ›</Text>
    </Pressable>
  );
}

function MealFoodCard({ editRatingCta, meal, onEditRating, onMockAction, shareCta }: { editRatingCta: string; meal: MealCard; onEditRating?: () => void; onMockAction: (message: string) => void; shareCta: string }) {
  return (
    <View style={styles.innerCard}>
      <View style={styles.dailyOverviewHeader}>
        <Chip label={meal.slot} active />
        <Text style={styles.recentMealCalories}>{meal.calories}</Text>
      </View>
      <Text style={styles.cardTitle}>{meal.name}</Text>
      <Text style={styles.cardMeta}>{meal.source}</Text>
      <Text style={styles.cardBody}>{meal.macros}</Text>
      <Text style={styles.cardBody}>{meal.rating}</Text>
      <Text style={styles.cardBody}>{meal.review}</Text>
      <View style={styles.actionRow}>
        <Pressable onPress={onEditRating ?? (() => onMockAction("已開啟餐點評分編輯"))}>
          <Text style={styles.linkText}>{editRatingCta}</Text>
        </Pressable>
        <Text style={styles.cardMeta}>{zhTW.mobile.consumerFavorites.targetUnavailable}</Text>
        <Pressable onPress={() => onMockAction("已產生餐點分享卡")}>
          <Text style={styles.linkText}>{shareCta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MonthlyScoreCard({ card, onMockAction, shareCta }: { card: MonthlyCard; onMockAction: (message: string) => void; shareCta: string }) {
  return (
    <View style={styles.monthlyScoreCard}>
      <View style={styles.monthlyScoreBadge}>
        <Text style={styles.monthlyScoreBadgeText}>{card.score.replace("月評分：", "")}</Text>
      </View>
      <View style={styles.monthlyScoreInfo}>
        <Text style={styles.cardTitle}>{card.month}</Text>
        <Text style={styles.cardBody}>{card.averageCalories}</Text>
        <Text style={styles.cardBody}>{card.proteinDays}</Text>
        <Text style={styles.cardBody}>{card.vegetableDays}</Text>
        <Text style={styles.cardBody}>{card.highFrequency}</Text>
        <Text style={styles.cardBody}>{card.commonTypes}</Text>
        <Text style={styles.cardBody}>{card.suggestion}</Text>
        <Pressable onPress={() => onMockAction("已產生月報分享卡")}>
          <Text style={styles.linkText}>{shareCta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LiveFavoriteFoodCard({ record, onMockAction, shareCta }: { record: ConsumerFavoriteRecord; onMockAction: (message: string) => void; shareCta: string }) {
  const target = record.target as ConsumerMenuItemFavoriteTarget;
  const menuItem = getCanonicalMenuItemById(target.menuItemId);
  const restaurant = getCanonicalRestaurantById(target.restaurantId);
  const title = menuItem?.name ?? record.collectionLabel ?? zhTW.mobile.consumerFavorites.listTitle;
  const meta = restaurant?.name ? `收藏美食卡｜${restaurant.name}` : "收藏美食卡";
  return (
    <View style={styles.favoriteCard}>
      <View style={styles.favoriteHero}>
        <Icon name="plate" size={26} color={colors.primaryDeep} />
        <View style={styles.favoriteHeartBadge}>
          <Icon name="heart" size={14} color={colors.primary} filled />
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {meta}
      </Text>
      <Pressable onPress={() => onMockAction("已產生收藏美食分享卡")}>
        <Text style={styles.linkText}>{zhTW.mobile.consumerFavorites.active} · {shareCta}</Text>
      </Pressable>
    </View>
  );
}

function HighestScoreExplorer({ isPaid, onCollapse, onMockAction, onSelectGroup, onSelectOption, selectedGroup, selectedOption }: { isPaid: boolean; onCollapse: () => void; onMockAction: (message: string) => void; onSelectGroup: (group: RankingGroupId) => void; onSelectOption: (option: string) => void; selectedGroup: RankingGroupId | null; selectedOption: string | null }) {
  const diary = zhTW.mobile.mealLog.foodDiary;

  if (!selectedGroup) {
    return (
      <View style={styles.stack}>
        <Text style={styles.filterTitle}>{diary.rankGroupTitle}</Text>
        <View style={styles.chipRow}>
          {diary.rankingGroups.map((group) => (
            <Chip key={group.id} label={group.label} onPress={() => onSelectGroup(group.id as RankingGroupId)} />
          ))}
        </View>
      </View>
    );
  }

  const options = getRankingOptions(selectedGroup);

  if (!selectedOption) {
    return (
      <View nativeID="highest-score-options" style={styles.stack}>
        <Text style={styles.filterTitle}>{diary.rankOptionTitle}</Text>
        <View style={styles.chipRow}>
          {options.map((option) => (
            <Chip key={option} label={option} onPress={() => onSelectOption(option)} />
          ))}
        </View>
        <SecondaryButton label={diary.collapseRankingCta} onPress={onCollapse} />
      </View>
    );
  }

  const limit = getRankingLimit(selectedGroup, isPaid);
  const cards = diary.rankingCards.slice(0, limit);

  return (
    <View nativeID="highest-score-ranking-list" style={styles.stack}>
      <Text style={styles.cardTitle}>{selectedOption}</Text>
      {cards.map((card) => (
        <RankingFoodCard key={card.title} card={card} />
      ))}
      {!isPaid ? (
        <View style={styles.upgradeBox}>
          <Text style={styles.noticeText}>{getRankingUpgradeMessage(selectedGroup)}</Text>
          <Pressable onPress={() => onMockAction(getRankingUpgradeMessage(selectedGroup))}>
            <Text style={styles.linkText}>{diary.viewMoreCta}</Text>
          </Pressable>
        </View>
      ) : null}
      <SecondaryButton label={diary.collapseRankingCta} onPress={onCollapse} />
    </View>
  );
}

function RankingFoodCard({ card }: { card: RankingCard }) {
  return (
    <View style={styles.innerCard}>
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardMeta}>{card.meta}</Text>
      <View style={styles.recentMealTagsRow}>
        {card.tags.map((tag) => (
          <Chip key={tag} label={tag} />
        ))}
      </View>
    </View>
  );
}

function MonthlyRecordModal({ onClose, onSelectDaily, visible }: { onClose: () => void; onSelectDaily: (id: string) => void; visible: boolean }) {
  const diary = zhTW.mobile.mealLog.foodDiary;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <SectionHeader title={diary.monthlyListTitle} subtitle={diary.monthlyListBody} />
          <View style={styles.monthlyHeader}>
            {diary.monthlyListHeader.map((label) => (
              <Text key={label} style={styles.monthlyHeaderText}>
                {label}
              </Text>
            ))}
          </View>
          <ScrollView style={styles.monthlyList}>
            {diary.dailyCards.map((card) => (
              <Pressable key={card.id} style={styles.monthlyRow} onPress={() => onSelectDaily(card.id)}>
                <Text style={styles.monthlyCell}>{card.date}</Text>
                <Text style={styles.monthlyCell}>{card.score}</Text>
                <Text style={styles.monthlyCell}>{card.calories}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <SecondaryButton label={zhTW.common.close} onPress={onClose} />
        </View>
      </View>
    </Modal>
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
  section: {
    gap: 12
  },
  stack: {
    gap: 12
  },
  rowList: {
    gap: 6,
    marginTop: 10
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  summaryChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  filterTitle: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "800",
    marginTop: 14
  },
  note: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: fonts.body,
    marginTop: 10
  },
  noticeText: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: fonts.body
  },
  linkText: {
    color: colors.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  cardMeta: {
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: 2
  },
  cardBody: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: fonts.body,
    marginTop: 4
  },
  innerCard: {
    gap: 6,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 14,
    ...shadows.soft
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 8
  },
  dayGroup: {
    gap: 8
  },
  dayGroupDate: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recentMealCard: {
    gap: 6,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 12,
    ...shadows.soft
  },
  recentMealHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  recentMealSlot: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recentMealCalories: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  recentMealName: {
    color: colors.ink,
    fontSize: 14.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recentMealTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2
  },
  latestMealHighlight: {
    gap: 8
  },
  latestMealLabel: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  subSectionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800",
    marginTop: 4
  },
  dailyOverviewCard: {
    gap: 6,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 14,
    ...shadows.soft
  },
  dailyOverviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  dailyOverviewDate: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  dailyOverviewCalories: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.numeral,
    fontWeight: "800",
    marginTop: 2
  },
  dailyOverviewMacros: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  monthlyScoreCard: {
    flexDirection: "row",
    gap: 14,
    marginTop: 14
  },
  monthlyScoreBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  monthlyScoreBadgeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  monthlyScoreInfo: {
    flex: 1,
    gap: 2
  },
  favoritesRow: {
    gap: 12,
    paddingVertical: 4,
    paddingRight: 4
  },
  favoriteCard: {
    width: 160,
    gap: 6,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 12,
    ...shadows.soft
  },
  favoriteHero: {
    height: 64,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  },
  favoriteHeartBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  highestScoreBlock: {
    gap: 10,
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  upgradeBox: {
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: hexA(colors.amber, 0.35),
    backgroundColor: hexA(colors.amber, 0.12),
    padding: 12
  },
  premiumBadgeRow: {
    marginBottom: 8
  },
  demoToggleWrap: {
    marginTop: 14
  },
  planItem: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: fonts.body
  },
  shareButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  backButton: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  backButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(44,39,34,0.36)"
  },
  modalCard: {
    gap: 12,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.bg,
    padding: 20,
    maxHeight: "75%"
  },
  monthlyHeader: {
    flexDirection: "row",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 8
  },
  monthlyHeaderText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  monthlyList: {
    maxHeight: 320
  },
  monthlyRow: {
    flexDirection: "row",
    gap: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 12,
    marginTop: 8
  },
  monthlyCell: {
    flex: 1,
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  }
});
