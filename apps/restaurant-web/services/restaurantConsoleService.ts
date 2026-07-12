import { listMenus, listMenuCategories } from "../repositories/menu-repository";
import { listMenuItemNutrition } from "../repositories/nutrition-repository";
import { getDashboardAnalyticsSummary, getExposureBreakdown, getMenuItemPerformance, getNutritionBadgePerformance } from "./analytics-service";
import { getAssistantConsoleData } from "./assistant-service";
import { getStaffConsoleData, roleLabels } from "./employee-service";
import { getMenuCatalog, nutritionBadgeStatusLabels } from "./menu-service";
import { getPendingMenuItems, pendingStatusLabels } from "./pending-item-service";
import { getPrimaryRestaurant, getRestaurantBranchSummary } from "./restaurant-service";
import { getNutritionStatus } from "./nutrition-service";
import { getPendingNutritionItems } from "./nutrition-service";
import { listAnalyticsEvents } from "../repositories/analytics-repository";

export { nutritionBadgeStatusLabels, pendingStatusLabels, roleLabels, getPendingMenuItems, getStaffConsoleData, getAssistantConsoleData };

export function getConsoleOverview() {
  const analytics = getDashboardAnalyticsSummary();
  const menuItems = getMenuItemPerformance();
  const pendingItems = getPendingMenuItems().filter((item) => item.status === "pending" || item.status === "needs_more_information");
  const topPending = [...getPendingMenuItems()].sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
  const pendingNutrition = menuItems.filter((item) => getNutritionStatus(item.id) !== "complete");

  return {
    restaurant: getPrimaryRestaurant(),
    branches: getRestaurantBranchSummary(),
    cards: {
      cityExposure: {
        title: "我的城市額外曝光",
        value: analytics.myCityExposure.toLocaleString("zh-TW"),
        growth: "+28%",
        people: `${analytics.myCityClicks.toLocaleString("zh-TW")} 次點擊`,
        body: `我的城市本月為你增加 ${analytics.myCityExposure.toLocaleString("zh-TW")} 次曝光`
      },
      nutritionBadge: {
        title: "營養標誌成效",
        enabledCount: menuItems.filter((item) => item.badgeEnabled).length,
        viewGrowth: `+${analytics.averageViewGrowth}%`,
        addToCartGrowth: `+${analytics.averageAddToCartGrowth}%`
      },
      pendingMenuItems: {
        title: "待確認餐點",
        count: pendingItems.length,
        weeklyNew: pendingItems.reduce((sum, item) => sum + (item.occurrenceCount >= 9 ? 1 : 0), 0),
        topName: topPending?.userInputName ?? "尚無資料"
      },
      pendingNutrition: {
        title: "待處理營養資料",
        review: menuItems.filter((item) => item.nutritionBadgeStatus === "pending_review").length,
        missingIngredients: pendingNutrition.filter((item) => getNutritionStatus(item.id) === "missing_ingredients").length,
        missingPortion: pendingNutrition.filter((item) => getNutritionStatus(item.id) === "missing_portion").length,
        aiOutlier: pendingNutrition.filter((item) => getNutritionStatus(item.id) === "ai_outlier").length
      }
    },
    recentPerformance: analytics.recentPerformance,
    recentTasks: [
      ...pendingItems.map((item) => ({ id: item.id, title: item.userInputName, meta: `${item.branchName} · ${pendingStatusLabels[item.status]}` })),
      ...pendingNutrition.map((item) => ({ id: item.id, title: item.name, meta: "營養資料待補齊" }))
    ].slice(0, 5),
    branchSummary: getRestaurantBranchSummary(),
    assistantSuggestions: getAssistantConsoleData().suggestions.slice(0, 4)
  };
}

export function getExposureAnalytics(branchId = "all", dateRange = "30d") {
  return getExposureBreakdown(branchId, dateRange);
}

export function getNutritionBadgeComparison() {
  return getNutritionBadgePerformance();
}

export function getMenuPerformance() {
  return getMenuItemPerformance();
}

export function getMenuConsoleData() {
  const catalog = getMenuCatalog();
  return {
    menus: listMenus(),
    categories: listMenuCategories(),
    branches: catalog.branches,
    items: getMenuPerformance(),
    nutrition: listMenuItemNutrition()
  };
}

export function getNutritionQueue() {
  return getPendingNutritionItems();
}

export function getFutureEvents() {
  return listAnalyticsEvents();
}
