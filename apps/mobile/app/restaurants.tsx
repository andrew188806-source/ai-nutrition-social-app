import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { getRestaurantMealBuddyCard, upsertMealBuddyCardWithQuota } from "../features/meal-buddy-card";
import { useDemoUserPlan } from "../features/demo-user-plan";

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

  const selectedCityDistricts = Object.keys(locationTree[draftFilters.city]) as Array<District<typeof draftFilters.city>>;
  const selectedPlaces = locationTree[draftFilters.city][draftFilters.district as District<typeof draftFilters.city>] ?? [];

  const recommendedRestaurants = useMemo(() => {
    return [...zhTW.mobile.restaurants.list].sort((a, b) => restaurantScore(b, filters) - restaurantScore(a, filters));
  }, [filters]);

  function openRecommendationModal() {
    setDraftFilters(filters);
    setCustomLocationEditing(false);
    setOpenDropdown(null);
    setRecommendationModalVisible(true);
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
    const card = getRestaurantMealBuddyCard(restaurant.name, restaurantId, restaurant.tags[0] ?? "", filters.location, preferredTime);
    upsertMealBuddyCardWithQuota(card, demoMode);
    setPendingRestaurant(null);
    router.push({
      pathname: "/meal-buddies",
      params: {
        highlightCardCreatedAt: card.createdAt,
        section: "discover"
      }
    });
  }

  function openRestaurantTableFlow(action: "find" | "create") {
    // Integration entry: Restaurant -> existing Four-Person Table module.
    if (!pendingTableRestaurant) {
      return;
    }
    router.push({
      pathname: "/meal-buddies",
      params: {
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
      <Card tone="amber">
        <SectionTitle title="餐廳智慧推薦" subtitle="餐廳清單會依目前位置、今日營養缺口、歷史飲食習慣與附近社交機會排序。" />
        <Text style={styles.aiSummary}>AI 會綜合今日已吃內容、剩餘營養需求、熱門度、飯友機會與四人桌機會，先幫你排出適合今天的餐廳。</Text>
        <View style={styles.filterChipRow}>
          {getActiveFilterLabels(filters).map((label) => (
            <Text key={label} style={styles.filterChip}>{label}</Text>
          ))}
        </View>
        <Pressable accessibilityRole="button" style={styles.socialButton} onPress={openRecommendationModal}>
          <Text style={styles.socialButtonText}>調整推薦條件</Text>
        </Pressable>
      </Card>

      <View style={styles.cardList}>
        {recommendedRestaurants.map((restaurant) => {
          const reasons = getRecommendationReasons(restaurant, filters);
          return (
            <Card key={restaurant.name}>
              <View style={styles.restaurantTop}>
                <View style={styles.flex}>
                  <Text style={styles.restaurantName}>{restaurant.name}</Text>
                  <Text style={styles.meta}>{zhTW.common.verified}｜{restaurant.distance}</Text>
                </View>
                <View style={styles.scoreBlock}>
                  <Text style={styles.score}>{restaurant.score}</Text>
                  <Text style={styles.scoreLabel}>符合度</Text>
                </View>
              </View>
              <Text style={styles.reasonTitle}>推薦原因：</Text>
              <View style={styles.reasonList}>
                {reasons.map((reason) => (
                  <Text key={reason} style={styles.reasonItem}>• {reason}</Text>
                ))}
              </View>
              <Text style={styles.socialHint}>{getSocialHint(restaurant)}</Text>
              <TagRow tags={restaurant.tags} />
              <View style={styles.saveRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setSavedRestaurants((current) => (current.includes(restaurant.name) ? current.filter((name) => name !== restaurant.name) : [...current, restaurant.name]))
                  }
                >
                  <Text style={styles.save}>{savedRestaurants.includes(restaurant.name) ? "已收藏" : zhTW.common.save}</Text>
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" style={styles.socialButton} onPress={() => setPendingRestaurant(restaurant)}>
                <Text style={styles.socialButtonText}>{zhTW.mobile.refinedLogic.mealBuddyCard.createRestaurantCardCta}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[styles.socialButton, styles.secondarySocialButton]} onPress={() => setPendingTableRestaurant(restaurant)}>
                <Text style={styles.socialButtonText}>{zhTW.mobile.refinedLogic.mealBuddyCard.fourPersonTableCta}</Text>
              </Pressable>
            </Card>
          );
        })}
      </View>

      {pendingRestaurant ? (
        <Card tone="mint">
          <SectionTitle title={zhTW.mobile.refinedLogic.mealBuddyCard.diningTimeQuestion} subtitle={pendingRestaurant.name} />
          <View style={styles.optionRow}>
            {zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods.map((period) => (
              <Pressable accessibilityRole="button" key={period} style={styles.optionPill} onPress={() => startRestaurantMealBuddyCard(pendingRestaurant, period)}>
                <Text style={styles.optionPillText}>{period}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" style={styles.secondaryButtonWide} onPress={() => setPendingRestaurant(null)}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
        </Card>
      ) : null}

      <RestaurantTableChoiceModal
        restaurant={pendingTableRestaurant}
        onClose={() => setPendingTableRestaurant(null)}
        onCreate={() => openRestaurantTableFlow("create")}
        onFind={() => openRestaurantTableFlow("find")}
      />

      <Card tone="amber">
        <SectionTitle title={zhTW.mobile.restaurants.sponsoredTitle} subtitle={zhTW.mobile.restaurants.sponsoredBody} />
        <Text style={styles.sponsored}>{zhTW.common.sponsored}</Text>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.restaurants.socialMatchTitle} subtitle={zhTW.mobile.restaurants.socialMatchBody} />
        <Text style={styles.privacyNote}>{zhTW.mobile.restaurants.socialPrivacyNote}</Text>
        <Pressable accessibilityRole="button" style={styles.socialButton} onPress={() => router.push("/social")}>
          <Text style={styles.socialButtonText}>{zhTW.mobile.restaurants.socialMatchCta}</Text>
        </Pressable>
      </Card>

      <Card tone="premium">
        <PremiumBadge label={zhTW.mobile.premiumUi.premiumTables} />
        <SectionTitle title={zhTW.mobile.restaurants.groupTableTitle} subtitle={zhTW.mobile.restaurants.groupTableBody} />
        <Text style={styles.aaRule}>{zhTW.mobile.correctedFlow.aaTableRule}</Text>
        <Pressable accessibilityRole="button" style={styles.groupButton} onPress={() => router.push("/meal-buddies?section=tables")}>
          <Text style={styles.groupButtonText}>{zhTW.mobile.correctedFlow.createGroupTable}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[styles.groupButton, styles.secondaryGroupButton]} onPress={() => router.push("/meal-buddies?section=tables")}>
          <Text style={styles.groupButtonText}>{zhTW.mobile.correctedFlow.viewTonightTable}</Text>
        </Pressable>
      </Card>

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
  aaRule: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  aiModeCard: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    gap: 6,
    marginTop: 14,
    padding: 14
  },
  aiSummary: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 10
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
  cardList: {
    gap: 12
  },
  closeText: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: "900"
  },
  customFields: {
    gap: 4,
    marginTop: 4
  },
  customLocationPanel: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    marginTop: 10,
    padding: 12
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
  filterChip: {
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
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
  groupButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  groupButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  locationActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
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
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 520,
    padding: 18,
    width: "92%"
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
  optionPill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  optionPillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
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
  reasonList: {
    gap: 3,
    marginBottom: 10,
    marginTop: 4
  },
  reasonTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6
  },
  restaurantName: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900"
  },
  restaurantTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginBottom: 10
  },
  save: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900"
  },
  saveRow: {
    alignItems: "flex-end",
    marginTop: 12
  },
  score: {
    color: colors.teal,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "right"
  },
  scoreBlock: {
    alignItems: "flex-end"
  },
  scoreLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButtonWide: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryGroupButton: {
    backgroundColor: colors.ink,
    marginTop: 10
  },
  secondarySocialButton: {
    backgroundColor: colors.teal,
    marginTop: 10
  },
  socialButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.ink,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  socialButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  socialHint: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sponsored: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.coral,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  updateButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.ink,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  updateButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  }
});
