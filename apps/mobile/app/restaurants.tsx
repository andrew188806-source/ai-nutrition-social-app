import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { PremiumBadge, colors } from "../components/DemoUi";
import { getRestaurantMealBuddyCard, upsertMealBuddyCardWithQuota } from "../features/meal-buddy-card";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { Card as SnowCard, Chip, PrimaryButton, SecondaryButton, SectionHeader as SnowSectionHeader } from "../theme/components";
import { Icon } from "../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as snow } from "../theme/tokens";

const diningGoals = ["都可以", "均衡餐", "高蛋白", "低熱量", "低碳水", "清爽型", "飽足型", "蔬食", "放縱餐"];
const cuisineTypes = ["都可以", "日式", "中式", "韓式", "美式", "義式", "泰式", "港式", "火鍋", "燒肉", "咖啡廳", "早午餐"];
const diningSituations = ["都可以", "自己吃", "找飯友", "四人桌", "約會", "家庭聚餐", "商務聚餐", "深夜宵夜", "運動後補充", "放鬆聊天"];
const locationScopes = ["附近", "全部", "自訂地點"];

const locationTree = {
  台北市: {
    信義區: ["市府商圈", "象山周邊", "信義百貨圈"],
    大安區: ["東區", "科技大樓周邊", "師大生活圈"],
    中山區: ["中山站商圈", "南京松山線", "行天宮周邊"]
  },
  台中市: {
    西屯區: ["逢甲商圈", "市政路周邊", "秋紅谷周邊"],
    南屯區: ["大業路商圈", "公益路餐飲圈", "文心森林公園"]
  }
} as const;

type City = keyof typeof locationTree;
type District<C extends City = City> = keyof (typeof locationTree)[C];
type Restaurant = (typeof zhTW.mobile.restaurants.list)[number];

// RestaurantDish / restaurantDishes hold ONLY restaurant-owned menu items (source
// "restaurant_menu" or "ai_user_uploaded" attached to this restaurant's restaurantId).
// A user's own homemade / manually logged dishes ("我做的料理") are a separate concept
// tracked in apps/mobile/features/self-made-dishes (SelfMadeDish, keyed by userId) and
// must never be added to restaurantDishes or shown in a restaurant's "均衡推薦" list.
type DishSource = "restaurant_menu" | "ai_user_uploaded";
type DishVerificationStatus = "restaurant_verified" | "ai_estimated" | "pending_review";
type RestaurantDish = {
  id: string;
  restaurantId: string;
  name: string;
  calories: number;
  nutritionTags: string[];
  mealType?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  source: DishSource;
  verificationStatus: DishVerificationStatus;
};
type RecommendationMode = "ai" | "custom";
type DropdownKey = "locationScope" | "city" | "district" | "place" | "diningGoal" | "cuisineType" | "diningSituation" | null;

type RestaurantFilters = {
  city: City;
  cuisineType: string;
  diningGoal: string;
  diningSituation: string;
  district: string;
  location: string;
  locationScope: string;
  mode: RecommendationMode;
  place: string;
};

const defaultFilters: RestaurantFilters = {
  city: "台北市",
  cuisineType: "都可以",
  diningGoal: "都可以",
  diningSituation: "都可以",
  district: "信義區",
  location: "附近",
  locationScope: "附近",
  mode: "ai",
  place: "市府商圈"
};

// Mock restaurant-owned menu data. Each dish belongs to exactly one restaurant via restaurantId
// ("restaurant-<name>", matching the id format used for Meal Buddy Card / four-person table flows).
const restaurantDishes: RestaurantDish[] = [
  {
    id: "dish-haochu-1",
    restaurantId: "restaurant-好初健康碗",
    name: "雞胸高蛋白碗",
    calories: 620,
    nutritionTags: ["高蛋白", "熱量管理"],
    mealType: "午餐",
    protein: 38,
    carbs: 55,
    fat: 14,
    fiber: 5,
    source: "restaurant_menu",
    verificationStatus: "restaurant_verified"
  },
  {
    id: "dish-haochu-2",
    restaurantId: "restaurant-好初健康碗",
    name: "高纖蔬食碗",
    calories: 480,
    nutritionTags: ["高纖飲食", "蔬食選項", "低卡選項"],
    mealType: "午餐",
    protein: 16,
    carbs: 64,
    fat: 12,
    fiber: 11,
    source: "restaurant_menu",
    verificationStatus: "restaurant_verified"
  },
  {
    id: "dish-haochu-3",
    restaurantId: "restaurant-好初健康碗",
    name: "雞胸溫沙拉早餐盒",
    calories: 390,
    nutritionTags: ["高蛋白", "低卡選項"],
    mealType: "早餐",
    protein: 24,
    carbs: 30,
    fat: 14,
    fiber: 6,
    source: "ai_user_uploaded",
    verificationStatus: "pending_review"
  },
  {
    id: "dish-mori-1",
    restaurantId: "restaurant-森日蔬食廚房",
    name: "蔬食咖哩飯",
    calories: 540,
    nutritionTags: ["蔬食選項", "高纖飲食"],
    mealType: "午餐",
    protein: 14,
    carbs: 78,
    fat: 16,
    fiber: 9,
    source: "restaurant_menu",
    verificationStatus: "ai_estimated"
  },
  {
    id: "dish-mori-2",
    restaurantId: "restaurant-森日蔬食廚房",
    name: "豆腐蕈菇湯麵",
    calories: 460,
    nutritionTags: ["低卡選項", "蔬食選項"],
    mealType: "晚餐",
    protein: 17,
    carbs: 58,
    fat: 12,
    fiber: 8,
    source: "restaurant_menu",
    verificationStatus: "ai_estimated"
  },
  {
    id: "dish-mori-3",
    restaurantId: "restaurant-森日蔬食廚房",
    name: "蔬食歐姆蛋早餐盤",
    calories: 410,
    nutritionTags: ["蔬食選項", "高蛋白"],
    mealType: "早餐",
    protein: 19,
    carbs: 34,
    fat: 18,
    fiber: 6,
    source: "ai_user_uploaded",
    verificationStatus: "ai_estimated"
  },
  {
    id: "dish-mountain-1",
    restaurantId: "restaurant-山線蛋白餐盒",
    name: "瘦蛋白便當",
    calories: 560,
    nutritionTags: ["高蛋白菜單", "適合增肌"],
    mealType: "晚餐",
    protein: 46,
    carbs: 52,
    fat: 11,
    fiber: 6,
    source: "restaurant_menu",
    verificationStatus: "ai_estimated"
  },
  {
    id: "dish-mountain-2",
    restaurantId: "restaurant-山線蛋白餐盒",
    name: "雙重雞胸蛋白盤",
    calories: 590,
    nutritionTags: ["高蛋白菜單", "熱量管理"],
    mealType: "午餐",
    protein: 52,
    carbs: 40,
    fat: 12,
    fiber: 5,
    source: "restaurant_menu",
    verificationStatus: "ai_estimated"
  },
  {
    id: "dish-mountain-3",
    restaurantId: "restaurant-山線蛋白餐盒",
    name: "蛋白魚塊餐盒",
    calories: 530,
    nutritionTags: ["高蛋白菜單", "適合減脂"],
    mealType: "晚餐",
    protein: 44,
    carbs: 45,
    fat: 13,
    fiber: 5,
    source: "ai_user_uploaded",
    verificationStatus: "pending_review"
  }
];

function getRestaurantDishes(restaurant: Restaurant) {
  const restaurantId = `restaurant-${restaurant.name}`;
  return restaurantDishes.filter((dish) => dish.restaurantId === restaurantId);
}

function getDishStatusLabel(dish: RestaurantDish) {
  if (dish.source === "ai_user_uploaded") {
    return dish.verificationStatus === "pending_review" ? "使用者拍照上傳・待確認" : "使用者拍照上傳・AI 估算";
  }
  return dish.verificationStatus === "ai_estimated" ? "AI 估算營養值" : null;
}

export default function RestaurantsScreen() {
  const router = useRouter();
  const [demoMode] = useDemoUserPlan();
  const [filters, setFilters] = useState<RestaurantFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<RestaurantFilters>(filters);
  const [customLocationEditing, setCustomLocationEditing] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);
  const [recommendationModalVisible, setRecommendationModalVisible] = useState(false);
  const [pendingRestaurant, setPendingRestaurant] = useState<Restaurant | null>(null);
  const [pendingTableRestaurant, setPendingTableRestaurant] = useState<Restaurant | null>(null);
  const [savedRestaurants, setSavedRestaurants] = useState<string[]>([]);
  const [createdRestaurantNames, setCreatedRestaurantNames] = useState<string[]>([]);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);

  const selectedCityDistricts = Object.keys(locationTree[draftFilters.city]) as Array<District<typeof draftFilters.city>>;
  const selectedPlaces = (locationTree[draftFilters.city] as Record<string, readonly string[]>)[draftFilters.district] ?? [];

  const recommendedRestaurants = useMemo(() => {
    return [...zhTW.mobile.restaurants.list].sort((a, b) => restaurantScore(b, filters) - restaurantScore(a, filters));
  }, [filters]);

  function openRecommendationModal() {
    setDraftFilters(filters);
    setCustomLocationEditing(false);
    setOpenDropdown(null);
    setRecommendationModalVisible(true);
  }

  function updateQuickFilter(key: "diningGoal" | "cuisineType", value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateRecommendations() {
    const location = draftFilters.locationScope === "自訂地點" ? formatLocation(draftFilters) : draftFilters.locationScope;
    setFilters({ ...draftFilters, location });
    setRecommendationModalVisible(false);
    setCustomLocationEditing(false);
    setOpenDropdown(null);
  }

  function completeCustomLocationSelection() {
    setDraftFilters((current) => ({
      ...current,
      location: formatLocation(current)
    }));
    setCustomLocationEditing(false);
    setOpenDropdown(null);
  }

  function cancelCustomLocationSelection() {
    setDraftFilters((current) => ({
      ...current,
      location: "附近",
      locationScope: "附近"
    }));
    setCustomLocationEditing(false);
    setOpenDropdown(null);
  }

  function startRestaurantMealBuddyCard(restaurant: Restaurant, preferredTime: string) {
    // Integration entry: Restaurant -> shared Meal Buddy Card pool.
    const restaurantId = `restaurant-${restaurant.name}`;
    const card = getRestaurantMealBuddyCard(restaurant.name, restaurantId, restaurant.tags.join("、"), filters.location, preferredTime);
    upsertMealBuddyCardWithQuota(card, demoMode);
    setPendingRestaurant(null);
    setCreatedRestaurantNames((current) => (current.includes(restaurant.name) ? current : [...current, restaurant.name]));
    setDetailRestaurant(null);
    router.push({
      pathname: "/meal-buddies",
      params: {
        restaurantActionType: "createMealBuddyCard",
        highlightCardCreatedAt: card.createdAt,
        section: "discover"
      }
    });
  }

  function openRestaurantDetail(restaurant: Restaurant) {
    setDetailRestaurant(restaurant);
  }

  function closeRestaurantDetail() {
    setDetailRestaurant(null);
  }

  function startCreateFromDetail(restaurant: Restaurant) {
    setDetailRestaurant(null);
    setPendingRestaurant(restaurant);
  }

  function startTableFromDetail(restaurant: Restaurant) {
    setDetailRestaurant(null);
    setPendingTableRestaurant(restaurant);
  }

  function openRestaurantTableFlow(action: "find" | "create") {
    // Integration entry: Restaurant -> existing Four-Person Table module.
    if (!pendingTableRestaurant) {
      return;
    }
    router.push({
      pathname: "/meal-buddies",
      params: {
        restaurantActionType: action === "create" ? "createFourPersonTable" : "findFourPersonTable",
        restaurantId: `restaurant-${pendingTableRestaurant.name}`,
        restaurantLocation: filters.location,
        restaurantName: pendingTableRestaurant.name,
        restaurantTags: pendingTableRestaurant.tags.join("、"),
        section: "tables",
        tableAction: action,
        tableTime: "今晚 19:00"
      }
    });
    setPendingTableRestaurant(null);
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.mainSections.exploreTitle}
      subtitle="依據今日營養需求、飲食習慣與附近餐廳智慧推薦。"
      primaryAction={{ href: "/permissions", label: zhTW.mobile.home.profileCta }}
    >
      <Pressable accessibilityRole="button" style={styles.locationRow} onPress={openRecommendationModal}>
        <Icon name="pin" size={18} color={snow.primaryDeep} />
        <Text style={styles.locationRowText} numberOfLines={1}>
          {filters.mode === "ai" ? "AI 智慧推薦 · 目前位置" : filters.location}
        </Text>
        <View style={styles.locationRowAction}>
          <Icon name="search" size={15} color={snow.primary} />
          <Text style={styles.locationRowActionText}>搜尋</Text>
        </View>
      </Pressable>

      <SnowCard tone="primary">
        <SnowSectionHeader title="餐廳智慧推薦" subtitle="AI 會綜合今日已吃內容、剩餘營養需求、熱門度、飯友機會與四人桌機會，先幫你排出適合今天的餐廳。" />
        <View style={styles.snowChipRow}>
          {getActiveFilterLabels(filters).map((label) => (
            <Chip key={label} label={label} />
          ))}
        </View>
        <PrimaryButton icon="target" label="調整推薦條件" onPress={openRecommendationModal} />
      </SnowCard>

      <View style={styles.filterRow}>
        <Text style={styles.filterRowLabel}>目標</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowScroll}>
          {diningGoals.map((goal) => (
            <Chip key={goal} label={goal} active={filters.diningGoal === goal} onPress={() => updateQuickFilter("diningGoal", goal)} />
          ))}
        </ScrollView>
      </View>
      <View style={styles.filterRow}>
        <Text style={styles.filterRowLabel}>種類</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowScroll}>
          {cuisineTypes.map((type) => (
            <Chip key={type} label={type} tone="ai" active={filters.cuisineType === type} onPress={() => updateQuickFilter("cuisineType", type)} />
          ))}
        </ScrollView>
      </View>

      <SnowSectionHeader title="推薦餐廳" subtitle={`共 ${recommendedRestaurants.length} 間餐廳，依符合度排序`} />
      <View style={styles.cardList}>
        {recommendedRestaurants.map((restaurant) => {
          const reasons = getRecommendationReasons(restaurant, filters);
          const saved = savedRestaurants.includes(restaurant.name);
          const verified = isRestaurantVerified(restaurant);
          const created = createdRestaurantNames.includes(restaurant.name);
          return (
            <SnowCard key={restaurant.name} style={styles.restaurantCard}>
              <Pressable accessibilityRole="button" style={styles.restaurantCardTouchable} onPress={() => openRestaurantDetail(restaurant)}>
                <View style={styles.restaurantHero}>
                  <LinearGradient colors={[snow.heroFrom, snow.primarySoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Icon name="plate" size={30} color={hexA(snow.primaryDeep, 0.55)} />
                </View>
                <View style={styles.restaurantContent}>
                  <View style={styles.restaurantTitleRow}>
                    <View style={styles.restaurantNameGroup}>
                      <Text style={styles.restaurantNameSnow} numberOfLines={1}>{restaurant.name}</Text>
                      {verified ? <Icon name="check" size={13} color={snow.green} /> : null}
                    </View>
                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreBadgeValue}>{restaurant.score}</Text>
                      <Text style={styles.scoreBadgeLabel}>符合度</Text>
                    </View>
                  </View>
                  <Text style={styles.restaurantMetaSnow}>{inferCuisineType(restaurant)} · {restaurant.distance}</Text>
                  <View style={styles.restaurantTagsRow}>
                    {restaurant.tags.map((tag) => (
                      <View key={tag} style={styles.restaurantTagChip}>
                        <Text style={styles.restaurantTagChipText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Pressable>

              <View style={styles.restaurantFooter}>
                <View style={styles.cardReasonList}>
                  {reasons.map((reason) => (
                    <Text key={reason} style={styles.cardReasonItem}>· {reason}</Text>
                  ))}
                </View>

                <View style={styles.cardFooterRow}>
                  <Pressable accessibilityRole="button" style={styles.detailLink} onPress={() => openRestaurantDetail(restaurant)}>
                    <Icon name="leaf" size={14} color={snow.primary} />
                    <Text style={styles.detailLinkText}>營養詳情</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={created}
                    style={[styles.createCardPill, created && styles.createCardPillDone]}
                    onPress={() => setPendingRestaurant(restaurant)}
                  >
                    <Icon name={created ? "check" : "invite"} size={14} color={created ? snow.green : snow.primaryDeep} />
                    <Text style={[styles.createCardPillText, created && styles.createCardPillTextDone]}>
                      {created ? "已建立" : zhTW.mobile.refinedLogic.mealBuddyCard.createRestaurantCardCta}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.cardActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.saveButton}
                    onPress={() =>
                      setSavedRestaurants((current) => (current.includes(restaurant.name) ? current.filter((name) => name !== restaurant.name) : [...current, restaurant.name]))
                    }
                  >
                    <Icon name="bookmark" size={16} color={snow.primaryDeep} />
                    <Text style={styles.saveButtonText}>{saved ? "已收藏" : zhTW.common.save}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={styles.tablePill} onPress={() => setPendingTableRestaurant(restaurant)}>
                    <Icon name="table4" size={14} color={snow.sub} />
                    <Text style={styles.tablePillText}>{zhTW.mobile.refinedLogic.mealBuddyCard.fourPersonTableCta}</Text>
                  </Pressable>
                </View>
              </View>
            </SnowCard>
          );
        })}
      </View>

      {pendingRestaurant ? (
        <SnowCard tone="primary">
          <SnowSectionHeader title={zhTW.mobile.refinedLogic.mealBuddyCard.diningTimeQuestion} subtitle={pendingRestaurant.name} />
          <View style={styles.snowChipRow}>
            {zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods.map((period) => (
              <Chip key={period} label={period} onPress={() => startRestaurantMealBuddyCard(pendingRestaurant, period)} />
            ))}
          </View>
          <SecondaryButton label="取消" onPress={() => setPendingRestaurant(null)} />
        </SnowCard>
      ) : null}

      <RestaurantTableActionModal
        restaurant={pendingTableRestaurant}
        onClose={() => setPendingTableRestaurant(null)}
        onCreate={() => openRestaurantTableFlow("create")}
        onFind={() => openRestaurantTableFlow("find")}
      />

      <SnowCard tone="primary">
        <SnowSectionHeader title={zhTW.mobile.restaurants.sponsoredTitle} subtitle={zhTW.mobile.restaurants.sponsoredBody} />
        <View style={styles.snowChipRow}>
          <Chip label={zhTW.common.sponsored} />
        </View>
      </SnowCard>

      <SnowCard tone="ai">
        <SnowSectionHeader title={zhTW.mobile.restaurants.socialMatchTitle} subtitle={zhTW.mobile.restaurants.socialMatchBody} />
        <Text style={styles.privacyNote}>{zhTW.mobile.restaurants.socialPrivacyNote}</Text>
        <SecondaryButton icon="buddies" label={zhTW.mobile.restaurants.socialMatchCta} onPress={() => router.push("/social")} />
      </SnowCard>

      <SnowCard tone="primary">
        <PremiumBadge label={zhTW.mobile.premiumUi.premiumTables} />
        <SnowSectionHeader title={zhTW.mobile.restaurants.groupTableTitle} subtitle={zhTW.mobile.restaurants.groupTableBody} />
        <Text style={styles.privacyNote}>{zhTW.mobile.correctedFlow.aaTableRule}</Text>
        <View style={styles.ctaRow2}>
          <View style={styles.ctaItem}>
            <PrimaryButton icon="table4" label={zhTW.mobile.correctedFlow.createGroupTable} onPress={() => router.push("/meal-buddies?section=tables")} />
          </View>
          <View style={styles.ctaItem}>
            <SecondaryButton icon="table4" label={zhTW.mobile.correctedFlow.viewTonightTable} onPress={() => router.push("/meal-buddies?section=tables")} />
          </View>
        </View>
      </SnowCard>

      <RestaurantRecommendationModal
        customLocationEditing={customLocationEditing}
        draftFilters={draftFilters}
        onCancelCustomLocation={cancelCustomLocationSelection}
        onClose={() => setRecommendationModalVisible(false)}
        onCompleteCustomLocation={completeCustomLocationSelection}
        onOpenDropdown={setOpenDropdown}
        onUpdate={updateRecommendations}
        openDropdown={openDropdown}
        selectedCityDistricts={selectedCityDistricts.map(String)}
        selectedPlaces={selectedPlaces.map(String)}
        setCustomLocationEditing={setCustomLocationEditing}
        setDraftFilters={setDraftFilters}
        visible={recommendationModalVisible}
      />

      <RestaurantDetailModal
        created={detailRestaurant ? createdRestaurantNames.includes(detailRestaurant.name) : false}
        onClose={closeRestaurantDetail}
        onCreateCard={startCreateFromDetail}
        onCreateTable={startTableFromDetail}
        restaurant={detailRestaurant}
      />
    </PlaceholderScreen>
  );
}

function RestaurantRecommendationModal({
  customLocationEditing,
  draftFilters,
  onCancelCustomLocation,
  onClose,
  onCompleteCustomLocation,
  onOpenDropdown,
  onUpdate,
  openDropdown,
  selectedCityDistricts,
  selectedPlaces,
  setCustomLocationEditing,
  setDraftFilters,
  visible
}: {
  customLocationEditing: boolean;
  draftFilters: RestaurantFilters;
  onCancelCustomLocation: () => void;
  onClose: () => void;
  onCompleteCustomLocation: () => void;
  onOpenDropdown: (key: DropdownKey) => void;
  onUpdate: () => void;
  openDropdown: DropdownKey;
  selectedCityDistricts: string[];
  selectedPlaces: string[];
  setCustomLocationEditing: (editing: boolean) => void;
  setDraftFilters: (updater: RestaurantFilters | ((current: RestaurantFilters) => RestaurantFilters)) => void;
  visible: boolean;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>調整推薦條件</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.closeText}>取消</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator>
            <Text style={styles.formLabel}>推薦模式</Text>
            <View style={styles.radioGroup}>
              <RadioOption label="AI智慧推薦" selected={draftFilters.mode === "ai"} onPress={() => setDraftFilters((current) => ({ ...current, mode: "ai" }))} />
              <RadioOption label="自訂條件" selected={draftFilters.mode === "custom"} onPress={() => setDraftFilters((current) => ({ ...current, mode: "custom" }))} />
            </View>

            {draftFilters.mode === "ai" ? (
              <View style={styles.aiModeCard}>
                <Text style={styles.reasonTitle}>AI 將根據：</Text>
                {["今日營養缺口", "歷史飲食習慣", "目前位置", "距離與熱門度", "附近飯友機會", "附近四人桌機會"].map((item) => (
                  <Text key={item} style={styles.reasonItem}>✓ {item}</Text>
                ))}
                <Text style={styles.privacyNote}>進行推薦</Text>
              </View>
            ) : (
              <View style={styles.customFields}>
                <DropdownField
                  label="地點"
                  open={openDropdown === "locationScope"}
                  options={locationScopes}
                  value={draftFilters.locationScope === "自訂地點" && !customLocationEditing ? formatLocation(draftFilters) : draftFilters.locationScope}
                  onOpen={() => onOpenDropdown(openDropdown === "locationScope" ? null : "locationScope")}
                  onSelect={(locationScope) => {
                    setDraftFilters((current) => ({ ...current, locationScope }));
                    setCustomLocationEditing(locationScope === "自訂地點");
                    onOpenDropdown(null);
                  }}
                />
                {draftFilters.locationScope === "自訂地點" && customLocationEditing ? (
                  <View style={styles.customLocationPanel}>
                    <DropdownField
                      label="縣市"
                      open={openDropdown === "city"}
                      options={Object.keys(locationTree)}
                      value={draftFilters.city}
                      onOpen={() => onOpenDropdown(openDropdown === "city" ? null : "city")}
                      onSelect={(city) => {
                        const nextCity = city as City;
                        const nextDistrict = Object.keys(locationTree[nextCity])[0];
                        const nextPlace = locationTree[nextCity][nextDistrict as District<typeof nextCity>][0];
                        setDraftFilters((current) => ({ ...current, city: nextCity, district: nextDistrict, place: nextPlace }));
                        onOpenDropdown(null);
                      }}
                    />
                    <DropdownField
                      label="地區"
                      open={openDropdown === "district"}
                      options={selectedCityDistricts}
                      value={draftFilters.district}
                      onOpen={() => onOpenDropdown(openDropdown === "district" ? null : "district")}
                      onSelect={(district) => {
                        const nextPlace = locationTree[draftFilters.city][district as District<typeof draftFilters.city>][0];
                        setDraftFilters((current) => ({ ...current, district, place: nextPlace }));
                        onOpenDropdown(null);
                      }}
                    />
                    <DropdownField
                      label="商圈 / 街道"
                      open={openDropdown === "place"}
                      options={selectedPlaces}
                      value={draftFilters.place}
                      onOpen={() => onOpenDropdown(openDropdown === "place" ? null : "place")}
                      onSelect={(place) => {
                        setDraftFilters((current) => ({ ...current, place }));
                        onOpenDropdown(null);
                      }}
                    />
                    <Text style={styles.privacyNote}>目前使用 mock 地點資料，未來可串接 Google Maps / Places。</Text>
                    <View style={styles.locationActionRow}>
                      <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onCancelCustomLocation}>
                        <Text style={styles.cancelButtonText}>取消自訂</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" style={styles.updateButton} onPress={onCompleteCustomLocation}>
                        <Text style={styles.updateButtonText}>選擇完成</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                <DropdownField
                  label="飲食目標"
                  open={openDropdown === "diningGoal"}
                  options={diningGoals}
                  value={draftFilters.diningGoal}
                  onOpen={() => onOpenDropdown(openDropdown === "diningGoal" ? null : "diningGoal")}
                  onSelect={(diningGoal) => {
                    setDraftFilters((current) => ({ ...current, diningGoal }));
                    onOpenDropdown(null);
                  }}
                />
                <DropdownField
                  label="料理種類"
                  open={openDropdown === "cuisineType"}
                  options={cuisineTypes}
                  value={draftFilters.cuisineType}
                  onOpen={() => onOpenDropdown(openDropdown === "cuisineType" ? null : "cuisineType")}
                  onSelect={(cuisineType) => {
                    setDraftFilters((current) => ({ ...current, cuisineType }));
                    onOpenDropdown(null);
                  }}
                />
                <DropdownField
                  label="用餐情境"
                  open={openDropdown === "diningSituation"}
                  options={diningSituations}
                  value={draftFilters.diningSituation}
                  onOpen={() => onOpenDropdown(openDropdown === "diningSituation" ? null : "diningSituation")}
                  onSelect={(diningSituation) => {
                    setDraftFilters((current) => ({ ...current, diningSituation }));
                    onOpenDropdown(null);
                  }}
                />
              </View>
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>取消</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.updateButton} onPress={onUpdate}>
              <Text style={styles.updateButtonText}>更新推薦</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RestaurantTableChoiceModal({
  onClose,
  onCreate,
  onFind,
  restaurant
}: {
  onClose: () => void;
  onCreate: () => void;
  onFind: () => void;
  restaurant: Restaurant | null;
}) {
  return (
    <Modal transparent animationType="fade" visible={Boolean(restaurant)} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>四人餐桌</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.closeText}>取消</Text>
            </Pressable>
          </View>
          <Text style={styles.privacyNote}>{restaurant?.name}｜選擇想進行的方式</Text>
          <Pressable accessibilityRole="button" style={styles.socialButton} onPress={onFind}>
            <Text style={styles.socialButtonText}>尋找餐桌</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.socialButton, styles.secondarySocialButton]} onPress={onCreate}>
            <Text style={styles.socialButtonText}>建立餐桌</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RestaurantTableActionModal({
  onClose,
  onCreate,
  onFind,
  restaurant
}: {
  onClose: () => void;
  onCreate: () => void;
  onFind: () => void;
  restaurant: Restaurant | null;
}) {
  return (
    <Modal transparent animationType="fade" visible={Boolean(restaurant)} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>四人餐桌</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.closeText}>取消</Text>
            </Pressable>
          </View>
          <Text style={styles.privacyNote}>{restaurant?.name} 可以尋找現有四人桌，也可以用這間餐廳建立一桌。</Text>
          <Pressable accessibilityRole="button" style={styles.socialButton} onPress={onFind}>
            <Text style={styles.socialButtonText}>尋找餐桌</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.socialButton, styles.secondarySocialButton]} onPress={onCreate}>
            <Text style={styles.socialButtonText}>建立餐桌</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RestaurantDetailModal({
  created,
  onClose,
  onCreateCard,
  onCreateTable,
  restaurant
}: {
  created: boolean;
  onClose: () => void;
  onCreateCard: (restaurant: Restaurant) => void;
  onCreateTable: (restaurant: Restaurant) => void;
  restaurant: Restaurant | null;
}) {
  const verified = restaurant ? isRestaurantVerified(restaurant) : false;
  const dishes = restaurant ? getRestaurantDishes(restaurant) : [];

  return (
    <Modal transparent animationType="fade" visible={Boolean(restaurant)} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.detailModalCard}>
          {restaurant ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.detailHero}>
                <LinearGradient colors={[snow.heroFrom, snow.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Icon name="plate" size={36} color={hexA(snow.primaryDeep, 0.5)} />
                <View style={styles.detailHeroBadge}>
                  <Icon name="star" size={13} color={snow.primaryDeep} filled />
                  <Text style={styles.detailHeroBadgeText}>{restaurant.score}</Text>
                </View>
                <Pressable accessibilityRole="button" style={styles.detailCloseButton} onPress={onClose}>
                  <Text style={styles.detailCloseButtonText}>✕</Text>
                </Pressable>
              </View>
              <View style={styles.detailBody}>
                <View style={styles.detailNameRow}>
                  <Text style={styles.detailName}>{restaurant.name}</Text>
                  {verified ? (
                    <View style={styles.verifiedDot}>
                      <Icon name="check" size={11} color="#ffffff" />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.restaurantMetaSnow}>
                  {inferCuisineType(restaurant)} · {restaurant.distance} · 符合度 {restaurant.score}
                </Text>

                <View style={[styles.nutritionInfoBox, verified && styles.nutritionInfoBoxVerified]}>
                  <Icon name={verified ? "shield" : "leaf"} size={16} color={verified ? snow.green : snow.sub} />
                  <View style={styles.nutritionInfoTextGroup}>
                    <Text style={styles.nutritionInfoTitle}>{verified ? "營養標示已驗證" : "營養標示估算中"}</Text>
                    <Text style={styles.nutritionInfoBody}>
                      {verified ? "本店菜單熱量與營養已由豪食友核實，外食也能安心均衡。" : "尚未核實，數值為 AI 估算，僅供參考。"}
                    </Text>
                  </View>
                </View>

                <View style={styles.restaurantTagsRow}>
                  {restaurant.tags.map((tag) => (
                    <View key={tag} style={styles.restaurantTagChip}>
                      <Text style={styles.restaurantTagChipText}>{tag}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.detailSectionLabel}>均衡推薦</Text>
                {dishes.length > 0 ? (
                  <View style={styles.dishList}>
                    {dishes.map((dish) => {
                      const statusLabel = getDishStatusLabel(dish);
                      return (
                        <View key={dish.id} style={styles.dishRow}>
                          <View style={styles.dishIconBox}>
                            <Icon name="plate" size={16} color={snow.primaryDeep} />
                          </View>
                          <View style={styles.dishContent}>
                            <View style={styles.dishMainRow}>
                              <Text style={styles.dishName}>{dish.name}</Text>
                              {dish.nutritionTags[0] ? (
                                <View style={styles.dishTag}>
                                  <Text style={styles.dishTagText}>{dish.nutritionTags[0]}</Text>
                                </View>
                              ) : null}
                              <Text style={styles.dishCalories}>{dish.calories} kcal</Text>
                            </View>
                            {statusLabel ? <Text style={styles.dishStatusNote}>{statusLabel}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.dishEmptyState}>
                    <Text style={styles.dishEmptyTitle}>目前尚無可推薦菜色</Text>
                    <Text style={styles.dishEmptyBody}>等餐廳上架菜單或使用者拍照補充後會出現在這裡</Text>
                  </View>
                )}

                <View style={styles.detailCtaGroup}>
                  <PrimaryButton
                    icon={created ? "check" : "invite"}
                    label={created ? "已建立飯友卡" : zhTW.mobile.refinedLogic.mealBuddyCard.createRestaurantCardCta}
                    onPress={() => onCreateCard(restaurant)}
                  />
                  <View style={styles.detailSecondaryCta}>
                    <SecondaryButton icon="table4" label={zhTW.mobile.refinedLogic.mealBuddyCard.fourPersonTableCta} onPress={() => onCreateTable(restaurant)} />
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DropdownField({ label, onOpen, onSelect, open, options, value }: { label: string; onOpen: () => void; onSelect: (value: string) => void; open: boolean; options: string[]; value: string }) {
  return (
    <View style={styles.dropdownField}>
      <Text style={styles.formLabel}>{label}</Text>
      <Pressable accessibilityRole="button" style={styles.dropdownButton} onPress={onOpen}>
        <Text style={styles.dropdownValue}>{value}</Text>
        <Text style={styles.dropdownArrow}>{open ? "收起" : "展開"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.dropdownMenu}>
          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            {options.map((option) => (
              <Pressable accessibilityRole="button" key={option} style={[styles.dropdownOption, value === option && styles.dropdownOptionActive]} onPress={() => onSelect(option)}>
                <Text style={[styles.dropdownOptionText, value === option && styles.dropdownOptionTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function RadioOption({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} style={[styles.radioOption, selected && styles.radioOptionActive]} onPress={onPress}>
      <Text style={styles.radioDot}>{selected ? "●" : "○"}</Text>
      <Text style={[styles.radioText, selected && styles.radioTextActive]}>{label}</Text>
    </Pressable>
  );
}

function formatLocation(filters: RestaurantFilters) {
  return [filters.city, filters.district, filters.place].filter(Boolean).join("｜");
}

function restaurantScore(restaurant: Restaurant, filters: RestaurantFilters) {
  const distance = Number.parseFloat(restaurant.distance.replace("km", "").replace("m", ""));
  const distanceScore = restaurant.distance.includes("m") ? 45 : Math.max(10, 35 - distance * 8);
  const tags = restaurant.tags.join(" ");
  const aiBaseScore = filters.mode === "ai" ? 70 : 35;
  const nutritionScore = filters.mode === "ai" && tags.includes("高蛋白") ? 26 : 0;
  const goalScore = filters.diningGoal !== "都可以" && tags.includes(filters.diningGoal.replace("餐", "").replace("型", "")) ? 35 : 0;
  const cuisineScore = filters.cuisineType !== "都可以" && inferCuisineType(restaurant).includes(filters.cuisineType) ? 28 : 0;
  const situationScore = filters.diningSituation !== "都可以" ? getSituationBoost(restaurant, filters.diningSituation) : 0;
  const popularityScore = Number.parseInt(restaurant.score, 10) / 5;
  const socialScore = getSocialHint(restaurant).includes("飯友") ? 12 : 8;
  return aiBaseScore + distanceScore + nutritionScore + goalScore + cuisineScore + situationScore + popularityScore + socialScore;
}

function getActiveFilterLabels(filters: RestaurantFilters) {
  if (filters.mode === "ai") {
    return ["AI智慧推薦", "目前位置", "今日營養需求"];
  }
  const location = filters.locationScope === "自訂地點" ? filters.location : filters.locationScope;
  return [location, filters.diningGoal, filters.cuisineType, filters.diningSituation].filter((label) => label && label !== "都可以");
}

function getRecommendationReasons(restaurant: Restaurant, filters: RestaurantFilters) {
  const reasons = [`距離約 ${restaurant.distance}`];
  if (restaurant.tags.some((tag) => tag.includes("高蛋白"))) {
    reasons.unshift("今日蛋白質仍有補充空間");
  }
  if (restaurant.tags.some((tag) => tag.includes("有營養標示") || tag.includes("低卡") || tag.includes("蔬食"))) {
    reasons.push("符合剩餘營養需求");
  }
  if (filters.mode === "custom" && filters.diningGoal !== "都可以") {
    reasons.push(`符合「${filters.diningGoal}」偏好`);
  }
  reasons.push(getSocialHint(restaurant));
  return reasons.slice(0, 4);
}

function getSocialHint(restaurant: Restaurant) {
  if (restaurant.name === "好初健康碗") return "附近有 3 位飯友可能也想吃";
  if (restaurant.name === "森日蔬食廚房") return "有 1 個四人桌正在揪團";
  return "附近有人收藏過這家店";
}

function isRestaurantVerified(restaurant: Restaurant) {
  const tags: readonly string[] = restaurant.tags;
  return tags.includes(zhTW.common.verified);
}

function inferCuisineType(restaurant: Restaurant) {
  if (restaurant.name.includes("蔬食")) return "蔬食 咖啡廳";
  if (restaurant.name.includes("健康碗") || restaurant.name.includes("蛋白")) return "日式 早午餐";
  return "中式";
}

function getSituationBoost(restaurant: Restaurant, situation: string) {
  if (situation === "找飯友" && getSocialHint(restaurant).includes("飯友")) return 22;
  if (situation === "四人桌" && getSocialHint(restaurant).includes("四人桌")) return 24;
  if (situation === "運動後補充" && restaurant.tags.some((tag) => tag.includes("高蛋白") || tag.includes("增肌"))) return 20;
  if (situation === "自己吃" && restaurant.distance.includes("m")) return 12;
  return 0;
}

const styles = StyleSheet.create({
  aiModeCard: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    gap: 6,
    marginTop: 14,
    padding: 14
  },
  cancelButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  cancelButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  cardActionsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8
  },
  cardFooterRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10
  },
  cardList: {
    gap: 12
  },
  cardReasonItem: {
    color: snow.sub,
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 18
  },
  cardReasonList: {
    gap: 4,
    marginTop: 12
  },
  closeText: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: "900"
  },
  createCardPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: hexA(snow.primary, 0.2),
    backgroundColor: snow.primarySoft,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  createCardPillDone: {
    borderColor: snow.line,
    backgroundColor: snow.bg2
  },
  createCardPillText: {
    color: snow.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  createCardPillTextDone: {
    color: snow.green
  },
  ctaItem: {
    flex: 1
  },
  ctaRow2: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  customFields: {
    gap: 4,
    marginTop: 4
  },
  customLocationPanel: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    marginTop: 10,
    padding: 12
  },
  detailBody: {
    padding: 18
  },
  detailCloseButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    top: 14,
    width: 32
  },
  detailCloseButtonText: {
    color: snow.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  detailCtaGroup: {
    marginTop: 18
  },
  detailHero: {
    alignItems: "center",
    height: 128,
    justifyContent: "center"
  },
  detailHeroBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    flexDirection: "row",
    gap: 4,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: "absolute",
    top: 12
  },
  detailHeroBadgeText: {
    color: snow.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.numeralMedium,
    fontWeight: "800"
  },
  detailLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  detailLinkText: {
    color: snow.primary,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  detailModalCard: {
    backgroundColor: snow.card,
    borderRadius: radius.lg,
    maxHeight: "86%",
    maxWidth: 520,
    overflow: "hidden",
    width: "92%",
    ...shadows.lift
  },
  detailName: {
    color: snow.ink,
    flexShrink: 1,
    fontSize: 20,
    fontFamily: fonts.black,
    fontWeight: "800"
  },
  detailNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  detailSecondaryCta: {
    marginTop: 10
  },
  detailSectionLabel: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 14
  },
  dishCalories: {
    color: snow.primaryDeep,
    fontFamily: fonts.numeralMedium,
    fontSize: 12,
    fontWeight: "700"
  },
  dishContent: {
    flex: 1,
    gap: 4
  },
  dishEmptyBody: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: "center"
  },
  dishEmptyState: {
    alignItems: "center",
    backgroundColor: snow.bg2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: hexA(snow.line, 0.8),
    gap: 4,
    marginTop: 8,
    padding: 14
  },
  dishEmptyTitle: {
    color: snow.ink,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  dishIconBox: {
    alignItems: "center",
    backgroundColor: snow.primarySoft,
    borderRadius: 11,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  dishList: {
    gap: 8,
    marginTop: 8
  },
  dishMainRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  dishName: {
    color: snow.ink,
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  dishRow: {
    alignItems: "flex-start",
    backgroundColor: snow.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: hexA(snow.line, 0.8),
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  dishStatusNote: {
    color: snow.sub,
    fontFamily: fonts.body,
    fontSize: 11
  },
  dishTag: {
    backgroundColor: hexA(snow.green, 0.16),
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  dishTagText: {
    color: snow.green,
    fontFamily: fonts.medium,
    fontSize: 11,
    fontWeight: "700"
  },
  dropdownArrow: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  dropdownButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownField: {
    marginTop: 8
  },
  dropdownMenu: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 6,
    overflow: "hidden"
  },
  dropdownScroll: {
    maxHeight: 190
  },
  dropdownOption: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownOptionActive: {
    backgroundColor: colors.mint
  },
  dropdownOptionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  dropdownOptionTextActive: {
    color: colors.ink
  },
  dropdownValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  filterRow: {
    gap: 6,
    marginTop: 4
  },
  filterRowLabel: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  filterRowScroll: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4
  },
  flex: {
    flex: 1,
    gap: 5
  },
  formLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 14
  },
  locationActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  locationRow: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: snow.line,
    backgroundColor: snow.card,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadows.soft
  },
  locationRowAction: {
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  locationRowActionText: {
    color: snow.primaryDeep,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  locationRowText: {
    color: snow.ink,
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  modalBody: {
    maxHeight: 460
  },
  modalBodyContent: {
    paddingBottom: 6
  },
  modalCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 520,
    padding: 18,
    width: "92%",
    ...shadows.lift
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(33, 28, 22, 0.32)",
    flex: 1,
    justifyContent: "center",
    padding: 16
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  nutritionInfoBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: hexA(snow.line, 0.9),
    backgroundColor: snow.bg2,
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    padding: 13
  },
  nutritionInfoBoxVerified: {
    borderColor: hexA(snow.green, 0.3),
    backgroundColor: hexA(snow.green, 0.1)
  },
  nutritionInfoBody: {
    color: snow.sub,
    fontSize: 11.5,
    fontFamily: fonts.body,
    lineHeight: 17,
    marginTop: 2
  },
  nutritionInfoTextGroup: {
    flex: 1
  },
  nutritionInfoTitle: {
    color: snow.ink,
    fontSize: 12.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  privacyNote: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 8
  },
  radioDot: {
    color: colors.teal,
    fontSize: 16,
    fontWeight: "900"
  },
  radioGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10
  },
  radioOption: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  radioOptionActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  radioText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  radioTextActive: {
    color: colors.ink
  },
  reasonItem: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  reasonTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6
  },
  restaurantCard: {
    overflow: "hidden",
    padding: 0
  },
  restaurantCardTouchable: {},
  restaurantContent: {
    padding: 16
  },
  restaurantFooter: {
    paddingBottom: 16,
    paddingHorizontal: 16
  },
  restaurantHero: {
    alignItems: "center",
    height: 84,
    justifyContent: "center"
  },
  restaurantMetaSnow: {
    color: snow.sub,
    fontSize: 12.5,
    fontFamily: fonts.body,
    marginTop: 2
  },
  restaurantNameGroup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6
  },
  restaurantNameSnow: {
    color: snow.ink,
    flexShrink: 1,
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  restaurantTagChip: {
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  restaurantTagChipText: {
    color: snow.primaryDeep,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  restaurantTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8
  },
  restaurantTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  saveButtonText: {
    color: snow.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  scoreBadge: {
    alignItems: "center",
    borderRadius: radius.base,
    backgroundColor: snow.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 68
  },
  scoreBadgeLabel: {
    color: snow.sub,
    fontSize: 10.5,
    fontFamily: fonts.body,
    marginTop: 2
  },
  scoreBadgeValue: {
    color: snow.primaryDeep,
    fontSize: 18,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  secondarySocialButton: {
    backgroundColor: colors.teal,
    marginTop: 10
  },
  snowChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  socialButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.coral,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  socialButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  tablePill: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: snow.line,
    backgroundColor: snow.card,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  tablePillText: {
    color: snow.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  updateButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.coral,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  updateButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  verifiedDot: {
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: snow.green,
    height: 18,
    justifyContent: "center",
    width: 18
  }
});
