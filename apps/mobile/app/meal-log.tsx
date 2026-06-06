import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { getLatestCorrectedMealRecord } from "../features/analysis/analysisMealRecordStore";
import { useDemoUserPlan } from "../features/demo-user-plan";

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
};
type MonthlyCard = (typeof zhTW.mobile.mealLog.foodDiary.monthlyCards)[number];
type FavoriteCard = (typeof zhTW.mobile.mealLog.foodDiary.favoriteCards)[number];
type RankingCard = (typeof zhTW.mobile.mealLog.foodDiary.rankingCards)[number];

export default function MealLogScreen() {
  const diary = zhTW.mobile.mealLog.foodDiary;
  const savedMeal = getLatestCorrectedMealRecord();
  const correctedMealCard = savedMeal
    ? {
        id: "corrected-meal",
        slot: savedMeal.mealPeriod,
        name: savedMeal.mealName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField,
        source: `${zhTW.mobile.finalUx.restaurantNameLabel}｜${savedMeal.restaurantName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField}`,
        calories: `${savedMeal.calories} kcal`,
        macros: `${zhTW.mobile.analysis.protein} ${savedMeal.protein}g｜${zhTW.mobile.analysis.carbs} ${savedMeal.carbohydrates}g｜${zhTW.mobile.analysis.fat} ${savedMeal.fat}g`,
        rating: zhTW.mobile.mealLog.foodDiary.editRatingCta,
        review: `${savedMeal.ingredients}｜${savedMeal.portion}`,
        photoLabel: zhTW.mobile.mealLog.foodDiary.mealDetailTitle
      }
    : null;
  const [demoUserPlan, setDemoUserPlan] = useDemoUserPlan();
  const mode = demoUserPlan === "premium" ? "paid" : "free";
  const setMode = (nextMode: "free" | "paid") => setDemoUserPlan(nextMode === "paid" ? "premium" : "free");
  const [selectedDailyId, setSelectedDailyId] = useState<string | null>(null);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [selectedMonthId, setSelectedMonthId] = useState<string>(diary.monthlyCards[0]?.id ?? "");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([diary.favoriteCards[0]?.id ?? ""]);
  const [selectedRankingGroup, setSelectedRankingGroup] = useState<RankingGroupId | null>(null);
  const [selectedRankingOption, setSelectedRankingOption] = useState<string | null>(null);
  const [mockMessage, setMockMessage] = useState("");

  const selectedDaily = diary.dailyCards.find((card) => card.id === selectedDailyId);
  const selectedMonth = diary.monthlyCards.find((card) => card.id === selectedMonthId) ?? diary.monthlyCards[0];
  const isPaid = mode === "paid";

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
      <PlaceholderScreen title={selectedDaily.date} subtitle={diary.mealDetailBody} primaryAction={{ href: "/meal-photo", label: zhTW.mobile.primaryNav.analysis }}>
        <View nativeID="daily-detail-view" />
        <Pressable style={styles.backButton} onPress={() => setSelectedDailyId(null)}>
          <Text style={styles.backButtonText}>{diary.backToDailyRecords}</Text>
        </Pressable>

        <DailySummaryCard card={selectedDaily} />

        <Card tone="sky">
          <SectionTitle title={diary.mealDetailTitle} subtitle={diary.mealDetailBody} />
          <View style={styles.stack}>
            {[...(correctedMealCard ? [correctedMealCard] : []), ...diary.mealCards].map((meal) => (
              <MealFoodCard
                favoriteLabel={diary.favoriteCta}
                favoritedLabel={diary.favoritedCta}
                isFavorited={favoriteIds.includes(meal.id)}
                key={meal.id}
                meal={meal}
                onToggleFavorite={() => toggleFavorite(meal.id, favoriteIds, setFavoriteIds)}
                onMockAction={setMockMessage}
                shareCta={diary.shareCta}
                editRatingCta={diary.editRatingCta}
              />
            ))}
          </View>
        </Card>

        <Card>
          <SectionTitle title={diary.sharingTitle} subtitle={diary.sharingBody} />
          <View style={styles.actionRow}>
            <Pressable onPress={() => setMockMessage("已產生日記分享卡")}>
              <Text style={styles.linkButton}>{diary.shareDailyCta}</Text>
            </Pressable>
            {diary.sharingOptions.map((option) => (
              <Pressable key={option} onPress={() => setMockMessage(`${option} 已送出`)}>
                <Text style={styles.linkButton}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.note}>{diary.instagramUnlimited}</Text>
        </Card>
      </PlaceholderScreen>
    );
  }

  return (
    <PlaceholderScreen title={zhTW.mobile.mealLogTitle} subtitle={zhTW.mobile.mealLogSubtitle} primaryAction={{ href: "/meal-photo", label: zhTW.mobile.primaryNav.analysis }} secondaryAction={{ href: "/recommendation", label: zhTW.mobile.nextMealTitle }}>
        <Card tone="mint">
        <SectionTitle title={diary.unifiedTitle} subtitle={diary.overviewNote} />
        <Text style={styles.modeHint}>{diary.demoModeHint}</Text>
        <View style={styles.modeToggle}>
          <Pressable style={[styles.modeButton, mode === "free" && styles.modeButtonActive]} onPress={() => setMode("free")}>
            <Text style={[styles.modeButtonText, mode === "free" && styles.modeButtonTextActive]}>{diary.freeToggle}</Text>
          </Pressable>
          <Pressable style={[styles.modeButton, mode === "paid" && styles.modeButtonActive]} onPress={() => setMode("paid")}>
            <Text style={[styles.modeButtonText, mode === "paid" && styles.modeButtonTextActive]}>{diary.paidToggle}</Text>
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Text style={styles.searchText}>{diary.searchPlaceholder}</Text>
        </View>
      </Card>

      {savedMeal ? (
        <Card tone="amber">
          <SectionTitle title={zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord} subtitle={`${savedMeal.date} · ${savedMeal.mealPeriod}`} />
          <Text style={styles.cardTitle}>{savedMeal.mealName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField}</Text>
          <Text style={styles.cardMeta}>{savedMeal.restaurantName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField}</Text>
          <Text style={styles.bigValue}>{savedMeal.calories} kcal</Text>
          <Text style={styles.cardBody}>{zhTW.mobile.analysis.protein} {savedMeal.protein}g｜{zhTW.mobile.analysis.carbs} {savedMeal.carbohydrates}g｜{zhTW.mobile.analysis.fat} {savedMeal.fat}g</Text>
          <TagRow tags={[savedMeal.ingredients, savedMeal.portion]} />
        </Card>
      ) : null}

      <Card>
        <SectionTitle title={diary.dailyDiaryTitle} subtitle={diary.dailyDiaryBody} />
        <View nativeID="favorite-food-cards" style={styles.stack}>
          {diary.dailyCards.slice(0, 3).map((card) => (
            <DailyOverviewCard card={card} detailCta={diary.detailCta} key={card.id} onPress={() => selectDaily(card.id)} />
          ))}
        </View>
        <Pressable style={styles.primaryButton} onPress={() => setIsMonthlyModalOpen(true)}>
          <Text style={styles.primaryButtonText}>{diary.viewMonthlyRecordsCta}</Text>
        </Pressable>
      </Card>

      <Card tone="premium">
        <SectionTitle title={diary.monthlyScoreTitle} subtitle={diary.monthlyScoreBody} />
        <Text style={styles.filterTitle}>{diary.monthSelectorTitle}</Text>
        <View style={styles.chipRow}>
          {getAvailableMonths(diary.monthlyCards, isPaid).map((card) => (
            <Pressable
              key={card.id}
              style={[styles.chipButton, selectedMonthId === card.id && styles.chipButtonActive]}
              onPress={() => {
                setSelectedMonthId(card.id);
                focusMealLogElementAfterRender("monthly-score-card");
              }}
            >
              <Text style={[styles.chipText, selectedMonthId === card.id && styles.chipTextActive]}>{card.month}</Text>
            </Pressable>
          ))}
        </View>
        <View nativeID="monthly-score-card">{selectedMonth ? <MonthlyScoreCard card={selectedMonth} onMockAction={setMockMessage} shareCta={diary.shareCta} /> : null}</View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={diary.favoritesTitle} subtitle={isPaid ? diary.paidLimits[2] : diary.freeLimits[2]} />
        <View style={styles.stack}>
          {diary.favoriteCards.slice(0, 3).map((card) => (
            <FavoriteFoodCard
              card={card}
              favoriteLabel={diary.favoriteCta}
              favoritedLabel={diary.favoritedCta}
              isFavorited={favoriteIds.includes(card.id)}
              key={card.id}
              onToggleFavorite={() => toggleFavorite(card.id, favoriteIds, setFavoriteIds)}
              onMockAction={setMockMessage}
              shareCta={diary.shareCta}
            />
          ))}
        </View>
        {!isPaid ? <Text style={styles.note}>{diary.favoriteLimitReached}</Text> : null}
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            setMockMessage(diary.viewAllFavoritesCta);
            focusMealLogElementAfterRender("favorite-food-cards");
          }}
        >
          <Text style={styles.secondaryButtonText}>{diary.viewAllFavoritesCta}</Text>
        </Pressable>
      </Card>

      <Card>
        <SectionTitle title={diary.highestScoreTitle} subtitle={diary.highestScoreBody} />
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
      </Card>

      <Card>
        <SectionTitle title={diary.sharingTitle} subtitle={diary.sharingBody} />
        <TagRow tags={diary.sharingOptions} />
        <Text style={styles.note}>{diary.instagramUnlimited}</Text>
      </Card>
      {mockMessage ? (
        <Card tone="mint">
          <Text style={styles.noticeText}>{mockMessage}</Text>
        </Card>
      ) : null}

      <Card tone="premium">
        <PremiumBadge />
        <SectionTitle title={diary.membershipTitle} subtitle={diary.dataSeparationNote} />
        <PlanLimitCard title={isPaid ? diary.paidPlanTitle : diary.freePlanTitle} items={isPaid ? diary.paidLimits : diary.freeLimits} variant={isPaid ? "premium" : "free"} />
      </Card>

      <MonthlyRecordModal visible={isMonthlyModalOpen} onClose={() => setIsMonthlyModalOpen(false)} onSelectDaily={selectDaily} />
    </PlaceholderScreen>
  );
}

function toggleFavorite(id: string, favoriteIds: string[], setFavoriteIds: (ids: string[]) => void) {
  setFavoriteIds(favoriteIds.includes(id) ? favoriteIds.filter((favoriteId) => favoriteId !== id) : [...favoriteIds, id]);
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

function DailyOverviewCard({ card, detailCta, onPress }: { card: DailyCard; detailCta: string; onPress: () => void }) {
  return (
    <Pressable style={styles.innerCard} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.cardTitle}>{card.date}</Text>
          <Text style={styles.cardMeta}>{card.score}</Text>
        </View>
        <Text style={styles.statusPill}>{card.status}</Text>
      </View>
      <Text style={styles.bigValue}>{card.calories}</Text>
      <Text style={styles.cardBody}>{card.macros}</Text>
      <TagRow tags={card.thumbnails} />
      <Text style={styles.linkButton}>{detailCta}</Text>
    </Pressable>
  );
}

function DailySummaryCard({ card }: { card: DailyCard }) {
  return (
    <Card>
      <SectionTitle title={card.date} subtitle={card.comment} />
      <View style={styles.summaryGrid}>
        <Text style={styles.summaryItem}>{card.score}</Text>
        <Text style={styles.summaryItem}>{card.calories}</Text>
        <Text style={styles.summaryItem}>{card.macros}</Text>
      </View>
      <TagRow tags={card.thumbnails} />
    </Card>
  );
}

function MealFoodCard({ editRatingCta, favoriteLabel, favoritedLabel, isFavorited, meal, onMockAction, onToggleFavorite, shareCta }: { editRatingCta: string; favoriteLabel: string; favoritedLabel: string; isFavorited: boolean; meal: MealCard; onMockAction: (message: string) => void; onToggleFavorite: () => void; shareCta: string }) {
  return (
    <View style={styles.mealCard}>
      <View style={styles.photoTile}>
        <Text style={styles.photoText}>{meal.photoLabel}</Text>
      </View>
      <View style={styles.mealContent}>
        <Text style={styles.slotLabel}>{meal.slot}</Text>
        <Text style={styles.cardTitle}>{meal.name}</Text>
        <Text style={styles.cardMeta}>{meal.source}</Text>
        <Text style={styles.bigValue}>{meal.calories}</Text>
        <Text style={styles.cardBody}>{meal.macros}</Text>
        <Text style={styles.cardBody}>{meal.rating}</Text>
        <Text style={styles.cardBody}>{meal.review}</Text>
        <View style={styles.actionRow}>
          <Pressable onPress={() => onMockAction("已開啟餐點評分編輯")}>
            <Text style={styles.linkButton}>{editRatingCta}</Text>
          </Pressable>
          <Pressable onPress={onToggleFavorite}>
            <Text style={styles.linkButton}>{isFavorited ? favoritedLabel : favoriteLabel}</Text>
          </Pressable>
          <Pressable onPress={() => onMockAction("已產生餐點分享卡")}>
            <Text style={styles.linkButton}>{shareCta}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MonthlyScoreCard({ card, onMockAction, shareCta }: { card: MonthlyCard; onMockAction: (message: string) => void; shareCta: string }) {
  return (
    <View style={styles.innerCard}>
      <Text style={styles.cardTitle}>{card.month}</Text>
      <Text style={styles.bigValue}>{card.score}</Text>
      <Text style={styles.cardBody}>{card.averageCalories}</Text>
      <Text style={styles.cardBody}>{card.proteinDays}</Text>
      <Text style={styles.cardBody}>{card.vegetableDays}</Text>
      <Text style={styles.cardBody}>{card.highFrequency}</Text>
      <Text style={styles.cardBody}>{card.commonTypes}</Text>
      <Text style={styles.cardBody}>{card.suggestion}</Text>
      <Pressable onPress={() => onMockAction("已產生月報分享卡")}>
        <Text style={styles.linkButton}>{shareCta}</Text>
      </Pressable>
    </View>
  );
}

function FavoriteFoodCard({ card, favoriteLabel, favoritedLabel, isFavorited, onMockAction, onToggleFavorite, shareCta }: { card: FavoriteCard; favoriteLabel: string; favoritedLabel: string; isFavorited: boolean; onMockAction: (message: string) => void; onToggleFavorite: () => void; shareCta: string }) {
  return (
    <View style={styles.innerCard}>
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardMeta}>{card.meta}</Text>
      <TagRow tags={card.tags} />
      <View style={styles.actionRow}>
        <Pressable onPress={onToggleFavorite}>
          <Text style={styles.linkButton}>{isFavorited ? favoritedLabel : favoriteLabel}</Text>
        </Pressable>
        <Pressable onPress={() => onMockAction("已產生收藏美食分享卡")}>
          <Text style={styles.linkButton}>{shareCta}</Text>
        </Pressable>
      </View>
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
            <Pressable key={group.id} style={styles.chipButton} onPress={() => onSelectGroup(group.id as RankingGroupId)}>
              <Text style={styles.chipText}>{group.label}</Text>
            </Pressable>
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
            <Pressable key={option} style={styles.chipButton} onPress={() => onSelectOption(option)}>
              <Text style={styles.chipText}>{option}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.secondaryButton} onPress={onCollapse}>
          <Text style={styles.secondaryButtonText}>{diary.collapseRankingCta}</Text>
        </Pressable>
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
            <Text style={styles.linkButton}>{diary.viewMoreCta}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable style={styles.secondaryButton} onPress={onCollapse}>
        <Text style={styles.secondaryButtonText}>{diary.collapseRankingCta}</Text>
      </Pressable>
    </View>
  );
}

function RankingFoodCard({ card }: { card: RankingCard }) {
  return (
    <View style={styles.innerCard}>
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardMeta}>{card.meta}</Text>
      <TagRow tags={card.tags} />
    </View>
  );
}

function PlanLimitCard({ items, title, variant }: { items: readonly string[]; title: string; variant: "free" | "premium" }) {
  return (
    <View style={[styles.planCard, variant === "premium" && styles.planPremium]}>
      <PremiumBadge label={title} variant={variant === "premium" ? "premium" : "free"} />
      {items.map((item) => (
        <Text key={item} style={styles.planItem}>
          {item}
        </Text>
      ))}
    </View>
  );
}

function MonthlyRecordModal({ onClose, onSelectDaily, visible }: { onClose: () => void; onSelectDaily: (id: string) => void; visible: boolean }) {
  const diary = zhTW.mobile.mealLog.foodDiary;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <SectionTitle title={diary.monthlyListTitle} subtitle={diary.monthlyListBody} />
          <View style={styles.monthlyHeader}>
            {diary.monthlyListHeader.map((label) => (
              <Text key={label} style={styles.monthlyHeaderText}>
                {label}
              </Text>
            ))}
          </View>
          {diary.dailyCards.map((card) => (
            <Pressable key={card.id} style={styles.monthlyRow} onPress={() => onSelectDaily(card.id)}>
              <Text style={styles.monthlyCell}>{card.date}</Text>
              <Text style={styles.monthlyCell}>{card.score}</Text>
              <Text style={styles.monthlyCell}>{card.calories}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{zhTW.common.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  backButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  searchBox: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  searchText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800"
  },
  modeHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 14
  },
  modeToggle: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  modeButton: {
    alignItems: "center",
    flex: 1,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingVertical: 11
  },
  modeButtonActive: {
    borderColor: "#f0c987",
    backgroundColor: "#fff3df"
  },
  modeButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  modeButtonTextActive: {
    color: colors.ink
  },
  filterTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 14
  },
  stack: {
    gap: 12,
    marginTop: 16
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  chipButton: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  chipButtonActive: {
    borderColor: "#f0c987",
    backgroundColor: "#fff3df"
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  chipTextActive: {
    color: colors.ink
  },
  innerCard: {
    gap: 9,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 16
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  cardTitleGroup: {
    flex: 1,
    gap: 4
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  statusPill: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  bigValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  cardBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20
  },
  summaryGrid: {
    gap: 8,
    marginTop: 14
  },
  summaryItem: {
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    padding: 12
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4
  },
  linkButton: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#fff3df",
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  mealCard: {
    flexDirection: "row",
    gap: 14,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 14
  },
  photoTile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.cream,
    minHeight: 96,
    width: 92
  },
  photoText: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  mealContent: {
    flex: 1,
    gap: 6
  },
  slotLabel: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  upgradeBox: {
    gap: 10,
    borderColor: "#f0c987",
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#fff8e6",
    padding: 12
  },
  noticeText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  planCard: {
    gap: 9,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 16,
    padding: 14
  },
  planPremium: {
    borderColor: "#f0c987",
    backgroundColor: "#fff8e6"
  },
  planItem: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  note: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.teal,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(32,26,20,0.36)"
  },
  modalCard: {
    gap: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.paper,
    padding: 20
  },
  monthlyHeader: {
    flexDirection: "row",
    gap: 8,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    paddingBottom: 8
  },
  monthlyHeaderText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  monthlyRow: {
    flexDirection: "row",
    gap: 8,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 12
  },
  monthlyCell: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  }
});
