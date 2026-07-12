import type { AnalyticsEvent, AnalyticsSource } from "@haocu/shared/domain/restaurantDomain";
import { listAnalyticsEvents, listMenuItemRatings, listRecommendationResults } from "../repositories/analytics-repository";
import { listBranchMenuItems, listMenuItems } from "../repositories/menu-repository";
import { listBranches } from "../repositories/branch-repository";
import { getBranchName, getBranchNamesForMenuItem, getMenuItemCategoryName, getMenuItemName, getPrimaryBranchMenuItem, isMenuItemAvailable, nutritionBadgeStatusLabels } from "./menu-service";

const sourceLabels: Record<AnalyticsSource, string> = {
  my_city: "我的城市曝光",
  ai_recommendation: "AI 餐廳推薦曝光",
  search: "搜尋結果曝光",
  meal_buddy: "飯友配對推薦曝光",
  favorite: "收藏或回訪曝光",
  direct: "店家頁直接瀏覽",
  restaurant_page: "店家頁直接瀏覽",
  manual_input: "使用者輸入",
  admin: "平台或店家操作"
};

function numberMeta(event: AnalyticsEvent, key: string, fallback = 0) {
  const value = event.metadata[key];
  return typeof value === "number" ? value : fallback;
}

function eventCount(event: AnalyticsEvent) {
  return numberMeta(event, "count", 1);
}

function percentChange(before: number, after: number) {
  if (before === 0) return 0;
  return Math.round(((after - before) / before) * 100);
}

function inRange(event: AnalyticsEvent, dateRange = "30d") {
  const date = event.occurredAt.slice(0, 10);
  const minDate = dateRange === "7d" ? "2026-07-01" : dateRange === "90d" ? "2026-05-01" : "2026-06-10";
  return date >= minDate;
}

function exposureEvents(branchId = "all", dateRange = "30d") {
  return listAnalyticsEvents().filter((event) => {
    const isExposure = ["menu_item_impression", "recommendation_impression", "restaurant_page_view", "menu_item_view"].includes(event.eventType);
    const hasExposureMetrics = typeof event.metadata.count === "number" && typeof event.metadata.clicks === "number";
    return isExposure && hasExposureMetrics && (branchId === "all" || event.branchId === branchId) && inRange(event, dateRange);
  });
}

function aggregateByPeriod(menuItemId: string, branchId: string | undefined, eventType: AnalyticsEvent["eventType"], period: "before_badge" | "after_badge") {
  return listAnalyticsEvents()
    .filter((event) => event.menuItemId === menuItemId && event.eventType === eventType && event.metadata.period === period && (!branchId || event.branchId === branchId))
    .reduce((sum, event) => sum + eventCount(event), 0);
}

export function getExposureBreakdown(branchId = "all", dateRange = "30d") {
  const records = exposureEvents(branchId, dateRange);
  const totals = records.reduce(
    (acc, event) => {
      acc.impressions += eventCount(event);
      acc.clicks += numberMeta(event, "clicks");
      acc.storePageViews += numberMeta(event, "storePageViews");
      acc.newUserReach += numberMeta(event, "newUserReach");
      return acc;
    },
    { impressions: 0, clicks: 0, storePageViews: 0, newUserReach: 0 }
  );

  const visibleSources: AnalyticsSource[] = ["my_city", "ai_recommendation", "search", "meal_buddy", "favorite", "direct"];
  const bySource = visibleSources.map((source) => {
    const sourceRecords = records.filter((event) => event.source === source || (source === "direct" && event.source === "restaurant_page"));
    const impressions = sourceRecords.reduce((sum, event) => sum + eventCount(event), 0);
    const clicks = sourceRecords.reduce((sum, event) => sum + numberMeta(event, "clicks"), 0);
    return {
      source,
      label: sourceLabels[source],
      impressions,
      clicks,
      percentage: totals.impressions ? Math.round((impressions / totals.impressions) * 100) : 0,
      ctr: impressions ? Number(((clicks / impressions) * 100).toFixed(1)) : 0
    };
  });

  return {
    branches: listBranches(),
    totals,
    bySource,
    records: records.map((event) => ({
      id: event.id,
      branchId: event.branchId,
      date: event.occurredAt.slice(0, 10),
      source: event.source,
      impressions: eventCount(event),
      clicks: numberMeta(event, "clicks"),
      storePageViews: numberMeta(event, "storePageViews"),
      newUserReach: numberMeta(event, "newUserReach")
    }))
  };
}

export function getNutritionBadgePerformance() {
  const rows = listBranchMenuItems()
    .filter((branchItem) => {
      const item = listMenuItems().find((menuItem) => menuItem.id === branchItem.menuItemId);
      return item?.badgeEnabled && aggregateByPeriod(branchItem.menuItemId, branchItem.branchId, "menu_item_view", "before_badge") > 0;
    })
    .map((branchItem) => {
      const beforeViews = aggregateByPeriod(branchItem.menuItemId, branchItem.branchId, "menu_item_view", "before_badge");
      const afterViews = aggregateByPeriod(branchItem.menuItemId, branchItem.branchId, "menu_item_view", "after_badge");
      const beforeAddToCart = aggregateByPeriod(branchItem.menuItemId, branchItem.branchId, "menu_item_add_to_cart", "before_badge");
      const afterAddToCart = aggregateByPeriod(branchItem.menuItemId, branchItem.branchId, "menu_item_add_to_cart", "after_badge");
      const favoriteDelta = listAnalyticsEvents()
        .filter((event) => event.menuItemId === branchItem.menuItemId && event.branchId === branchItem.branchId && event.eventType === "menu_item_favorite")
        .reduce((sum, event) => sum + numberMeta(event, "delta"), 0);
      const badgeEnabledEvent = listAnalyticsEvents().find((event) => event.menuItemId === branchItem.menuItemId && event.eventType === "nutrition_badge_enabled");
      const viewGrowth = percentChange(beforeViews, afterViews);
      const addToCartGrowth = percentChange(beforeAddToCart, afterAddToCart);
      return {
        id: `${branchItem.id}-badge-performance`,
        menuItemId: branchItem.menuItemId,
        branchId: branchItem.branchId,
        badgeEnabledAt: badgeEnabledEvent?.occurredAt.slice(0, 10) ?? "2026-06-01",
        beforeViews,
        afterViews,
        beforeAddToCart,
        afterAddToCart,
        favoriteDelta,
        conversionRateDelta: Number((((afterAddToCart / Math.max(afterViews, 1)) - (beforeAddToCart / Math.max(beforeViews, 1))) * 100).toFixed(1)),
        itemName: getMenuItemName(branchItem.menuItemId),
        branchName: getBranchName(branchItem.branchId),
        viewGrowth,
        addToCartGrowth,
        direction: viewGrowth >= 0 && addToCartGrowth >= 0 ? "growth" : "decline"
      };
    });

  const averageViewGrowth = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.viewGrowth, 0) / rows.length) : 0;
  const averageAddToCartGrowth = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.addToCartGrowth, 0) / rows.length) : 0;
  return { branches: listBranches(), menuItems: listMenuItems(), rows, averageViewGrowth, averageAddToCartGrowth };
}

export function getMenuItemPerformance() {
  const badgeRows = getNutritionBadgePerformance().rows;
  const ratings = listMenuItemRatings();
  const recommendations = listRecommendationResults();
  return listMenuItems().map((item) => {
    const primaryBranchItem = getPrimaryBranchMenuItem(item.id);
    const performance = badgeRows.find((row) => row.menuItemId === item.id);
    const itemRatings = ratings.filter((rating) => rating.menuItemId === item.id);
    const averageRating = itemRatings.length ? Number((itemRatings.reduce((sum, rating) => sum + rating.privateRating, 0) / itemRatings.length).toFixed(1)) : 4.2;
    return {
      ...item,
      categoryName: getMenuItemCategoryName(item),
      branchNames: getBranchNamesForMenuItem(item.id),
      photoUrl: item.imageUrl,
      price: primaryBranchItem?.price ?? 0,
      isAvailable: isMenuItemAvailable(item.id),
      views: performance?.afterViews ?? aggregateByPeriod(item.id, undefined, "menu_item_view", "after_badge"),
      favorites: itemRatings.filter((rating) => rating.isFavorite).length + Math.max(0, performance?.favoriteDelta ?? 0),
      addToCart: performance?.afterAddToCart ?? aggregateByPeriod(item.id, undefined, "menu_item_add_to_cart", "after_badge"),
      rating: averageRating,
      personalizedExposure: recommendations.filter((recommendation) => recommendation.menuItemId === item.id).length * 210,
      badgeLabel: nutritionBadgeStatusLabels[item.nutritionBadgeStatus],
      viewGrowth: performance?.viewGrowth,
      addToCartGrowth: performance?.addToCartGrowth
    };
  });
}

export function getDashboardAnalyticsSummary() {
  const exposure = getExposureBreakdown("all", "30d");
  const nutritionBadge = getNutritionBadgePerformance();
  const myCity = exposure.bySource.find((row) => row.source === "my_city");
  return {
    myCityExposure: myCity?.impressions ?? 0,
    myCityClicks: myCity?.clicks ?? 0,
    averageViewGrowth: nutritionBadge.averageViewGrowth,
    averageAddToCartGrowth: nutritionBadge.averageAddToCartGrowth,
    recentPerformance: nutritionBadge.rows
  };
}
