import type { BranchMenuItem, Menu, MenuCategory, MenuItem, MenuItemAlias, MenuItemVariant } from "../../domain/restaurantDomain";

export const canonicalMenus: Menu[] = [
  { id: "menu-haochu-main", restaurantId: "restaurant-haochu-bowl", name: "主菜單", status: "active" },
  { id: "menu-mori-main", restaurantId: "restaurant-mori-veggie", name: "主菜單", status: "active" },
  { id: "menu-mountain-main", restaurantId: "restaurant-mountain-protein", name: "主菜單", status: "active" },
  { id: "menu-noodle-main", restaurantId: "restaurant-noodle-soup", name: "主菜單", status: "active" },
  { id: "menu-cafe-main", restaurantId: "restaurant-cafe-balance", name: "主菜單", status: "active" }
];

export const canonicalMenuCategories: MenuCategory[] = [
  { id: "category-bowl", menuId: "menu-haochu-main", name: "健康碗", sortOrder: 1 },
  { id: "category-light", menuId: "menu-haochu-main", name: "輕食", sortOrder: 2 },
  { id: "category-drink", menuId: "menu-haochu-main", name: "飲品", sortOrder: 3 },
  { id: "category-mori-main", menuId: "menu-mori-main", name: "主餐", sortOrder: 1 },
  { id: "category-mountain-main", menuId: "menu-mountain-main", name: "主餐", sortOrder: 1 },
  { id: "category-noodle-main", menuId: "menu-noodle-main", name: "主餐", sortOrder: 1 },
  { id: "category-cafe-main", menuId: "menu-cafe-main", name: "主餐", sortOrder: 1 }
];

export const canonicalMenuItems: MenuItem[] = [
  {
    id: "dish-haochu-1",
    restaurantId: "restaurant-haochu-bowl",
    menuCategoryId: "category-bowl",
    name: "舒肥雞胸均衡碗",
    description: "舒肥雞胸、糙米與季節蔬菜。",
    imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
    tagIds: ["tag-restaurant-high-protein", "tag-menu-disclosed", "tag-menu-health-goal-fit"],
    allergens: [],
    status: "active",
    nutritionId: "nutrition-haochu-chicken",
    nutritionBadgeStatus: "approved",
    badgeEnabled: true
  },
  {
    id: "dish-haochu-2",
    restaurantId: "restaurant-haochu-bowl",
    menuCategoryId: "category-bowl",
    name: "鮭魚酪梨糙米碗",
    description: "鮭魚、酪梨與糙米飯。",
    imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80",
    tagIds: ["tag-restaurant-high-protein", "tag-menu-ai-estimated"],
    allergens: ["fish"],
    status: "active",
    nutritionId: "nutrition-haochu-salmon",
    nutritionBadgeStatus: "ai_estimated",
    badgeEnabled: true
  },
  {
    id: "dish-haochu-3",
    restaurantId: "restaurant-haochu-bowl",
    menuCategoryId: "category-light",
    name: "豆腐藜麥沙拉",
    description: "豆腐、藜麥與堅果沙拉。",
    imageUrl: "https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=400&q=80",
    tagIds: ["tag-restaurant-vegetarian", "tag-restaurant-low-calorie"],
    allergens: ["soy", "nuts"],
    status: "active",
    nutritionId: "nutrition-haochu-tofu",
    nutritionBadgeStatus: "pending_review",
    badgeEnabled: false
  },
  {
    id: "dish-haochu-4",
    restaurantId: "restaurant-haochu-bowl",
    menuCategoryId: "category-drink",
    name: "無糖決明子紅茶",
    description: "無糖茶飲。",
    tagIds: ["tag-drink", "tag-low-sugar"],
    allergens: [],
    status: "active",
    nutritionId: "nutrition-haochu-tea",
    nutritionBadgeStatus: "missing",
    badgeEnabled: false
  },
  {
    id: "dish-haochu-5",
    restaurantId: "restaurant-haochu-bowl",
    menuCategoryId: "category-bowl",
    name: "蒜香牛肉能量碗",
    description: "蒜香牛肉、糙米與蔬菜。",
    imageUrl: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&q=80",
    tagIds: ["tag-high-protein", "tag-limited"],
    allergens: [],
    status: "active",
    nutritionId: "nutrition-haochu-beef",
    nutritionBadgeStatus: "approved",
    badgeEnabled: true
  },
  {
    id: "dish-mori-1",
    restaurantId: "restaurant-mori-veggie",
    menuCategoryId: "category-mori-main",
    name: "蔬食咖哩飯",
    description: "蔬食咖哩與糙米飯。",
    tagIds: ["tag-restaurant-vegetarian", "tag-menu-health-goal-fit"],
    allergens: [],
    status: "active",
    nutritionId: "nutrition-mori-curry",
    nutritionBadgeStatus: "ai_estimated",
    badgeEnabled: true
  },
  {
    id: "dish-mori-2",
    restaurantId: "restaurant-mori-veggie",
    menuCategoryId: "category-mori-main",
    name: "豆腐藜麥沙拉",
    description: "豆腐、藜麥與生菜沙拉。",
    tagIds: ["tag-restaurant-vegetarian", "tag-restaurant-low-calorie"],
    allergens: ["soy"],
    status: "active",
    nutritionId: "nutrition-mori-tofu-quinoa",
    nutritionBadgeStatus: "ai_estimated",
    badgeEnabled: true
  },
  {
    id: "dish-mori-3",
    restaurantId: "restaurant-mori-veggie",
    menuCategoryId: "category-mori-main",
    name: "蔬食歐姆蛋早餐盤",
    description: "蔬食早餐盤與歐姆蛋。",
    tagIds: ["tag-restaurant-vegetarian", "tag-restaurant-high-protein"],
    allergens: ["egg"],
    status: "active",
    nutritionId: "nutrition-mori-omelet",
    nutritionBadgeStatus: "pending_review",
    badgeEnabled: false
  },
  {
    id: "dish-mountain-1",
    restaurantId: "restaurant-mountain-protein",
    menuCategoryId: "category-mountain-main",
    name: "瘦蛋白便當",
    description: "雞胸、蔬菜與主食的高蛋白菜色。",
    tagIds: ["tag-restaurant-high-protein", "tag-menu-health-goal-fit"],
    allergens: [],
    status: "active",
    nutritionId: "nutrition-mountain-lean-box",
    nutritionBadgeStatus: "approved",
    badgeEnabled: true
  },
  {
    id: "dish-mountain-2",
    restaurantId: "restaurant-mountain-protein",
    menuCategoryId: "category-mountain-main",
    name: "雙重雞胸蛋白盤",
    description: "雙份雞胸與低脂配菜。",
    tagIds: ["tag-restaurant-high-protein"],
    allergens: [],
    status: "active",
    nutritionId: "nutrition-mountain-double-chicken",
    nutritionBadgeStatus: "approved",
    badgeEnabled: true
  },
  {
    id: "dish-noodle-1",
    restaurantId: "restaurant-noodle-soup",
    menuCategoryId: "category-noodle-main",
    name: "蚵仔麵線",
    description: "暖胃麵線與海鮮配料。",
    tagIds: ["tag-menu-ai-estimated"],
    allergens: ["shellfish"],
    status: "active",
    nutritionId: "nutrition-noodle-oyster",
    nutritionBadgeStatus: "approved",
    badgeEnabled: true
  },
  {
    id: "dish-noodle-2",
    restaurantId: "restaurant-noodle-soup",
    menuCategoryId: "category-noodle-main",
    name: "雞絲拌麵",
    description: "雞絲、麵條與清爽調味。",
    tagIds: ["tag-restaurant-high-protein", "tag-menu-health-goal-fit"],
    allergens: ["wheat"],
    status: "active",
    nutritionId: "nutrition-noodle-chicken",
    nutritionBadgeStatus: "ai_estimated",
    badgeEnabled: true
  },
  {
    id: "dish-cafe-1",
    restaurantId: "restaurant-cafe-balance",
    menuCategoryId: "category-cafe-main",
    name: "酪梨鮮蝦吐司",
    description: "酪梨、鮮蝦與吐司的早午餐餐點。",
    tagIds: ["tag-restaurant-low-calorie", "tag-menu-health-goal-fit"],
    allergens: ["shellfish", "wheat"],
    status: "active",
    nutritionId: "nutrition-cafe-avocado-shrimp",
    nutritionBadgeStatus: "approved",
    badgeEnabled: true
  }
];

export const canonicalBranchMenuItems: BranchMenuItem[] = [
  { id: "branch-menu-nanjing-chicken", restaurantId: "restaurant-haochu-bowl", branchId: "branch-nanjing", menuItemId: "dish-haochu-1", price: 220, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-beitou-chicken", restaurantId: "restaurant-haochu-bowl", branchId: "branch-beitou", menuItemId: "dish-haochu-1", price: 215, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-xinyi-chicken", restaurantId: "restaurant-haochu-bowl", branchId: "branch-xinyi", menuItemId: "dish-haochu-1", price: 225, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-nanjing-salmon", restaurantId: "restaurant-haochu-bowl", branchId: "branch-nanjing", menuItemId: "dish-haochu-2", price: 280, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-xinyi-salmon", restaurantId: "restaurant-haochu-bowl", branchId: "branch-xinyi", menuItemId: "dish-haochu-2", price: 290, availability: "limited", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-nanjing-tofu", restaurantId: "restaurant-haochu-bowl", branchId: "branch-nanjing", menuItemId: "dish-haochu-3", price: 190, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-beitou-tofu", restaurantId: "restaurant-haochu-bowl", branchId: "branch-beitou", menuItemId: "dish-haochu-3", price: 185, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-nanjing-tea", restaurantId: "restaurant-haochu-bowl", branchId: "branch-nanjing", menuItemId: "dish-haochu-4", price: 65, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-beitou-tea", restaurantId: "restaurant-haochu-bowl", branchId: "branch-beitou", menuItemId: "dish-haochu-4", price: 60, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-xinyi-tea", restaurantId: "restaurant-haochu-bowl", branchId: "branch-xinyi", menuItemId: "dish-haochu-4", price: 70, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-xinyi-beef", restaurantId: "restaurant-haochu-bowl", branchId: "branch-xinyi", menuItemId: "dish-haochu-5", price: 260, availability: "unavailable", soldOut: true, branchSpecificStatus: "discontinued" },
  { id: "branch-menu-mori-curry", restaurantId: "restaurant-mori-veggie", branchId: "branch-mori-da-an", menuItemId: "dish-mori-1", price: 180, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-mori-tofu-quinoa", restaurantId: "restaurant-mori-veggie", branchId: "branch-mori-da-an", menuItemId: "dish-mori-2", price: 165, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-mori-omelet", restaurantId: "restaurant-mori-veggie", branchId: "branch-mori-da-an", menuItemId: "dish-mori-3", price: 150, availability: "limited", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-mountain-lean-box", restaurantId: "restaurant-mountain-protein", branchId: "branch-mountain-songshan", menuItemId: "dish-mountain-1", price: 195, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-mountain-double-chicken", restaurantId: "restaurant-mountain-protein", branchId: "branch-mountain-songshan", menuItemId: "dish-mountain-2", price: 230, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-noodle-oyster", restaurantId: "restaurant-noodle-soup", branchId: "branch-noodle-zhongshan", menuItemId: "dish-noodle-1", price: 90, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-noodle-chicken", restaurantId: "restaurant-noodle-soup", branchId: "branch-noodle-zhongshan", menuItemId: "dish-noodle-2", price: 120, availability: "available", soldOut: false, branchSpecificStatus: "available" },
  { id: "branch-menu-cafe-avocado-shrimp", restaurantId: "restaurant-cafe-balance", branchId: "branch-cafe-da-an", menuItemId: "dish-cafe-1", price: 180, availability: "available", soldOut: false, branchSpecificStatus: "available" }
];

export const canonicalMenuItemVariants: MenuItemVariant[] = [
  { id: "variant-chicken-large", menuItemId: "dish-haochu-1", name: "加大份量", priceDelta: 45, status: "active" },
  { id: "variant-salmon-extra-avocado", menuItemId: "dish-haochu-2", name: "加酪梨", priceDelta: 35, status: "active" }
];

export const canonicalMenuItemAliases: MenuItemAlias[] = [
  { id: "alias-chicken-1", menuItemId: "dish-haochu-1", aliasName: "雞胸高蛋白碗", normalizedAliasName: "雞胸高蛋白碗", sourceType: "legacy", restaurantId: "restaurant-haochu-bowl", confidenceScore: 0.98, status: "approved", createdAt: "2026-06-01T09:00:00+08:00", updatedAt: "2026-06-01T09:00:00+08:00" },
  { id: "alias-chicken-2", menuItemId: "dish-haochu-1", aliasName: "味噌雞胸餐盒", normalizedAliasName: "味噌雞胸餐盒", sourceType: "user_input", restaurantId: "restaurant-haochu-bowl", branchId: "branch-xinyi", confidenceScore: 0.86, status: "pending", createdAt: "2026-07-09T12:05:00+08:00", updatedAt: "2026-07-09T12:05:00+08:00" },
  { id: "alias-tofu-1", menuItemId: "dish-haochu-3", aliasName: "豆腐沙拉", normalizedAliasName: "豆腐沙拉", sourceType: "restaurant", restaurantId: "restaurant-haochu-bowl", confidenceScore: 0.93, status: "approved", createdAt: "2026-06-02T09:00:00+08:00", updatedAt: "2026-06-02T09:00:00+08:00" },
  { id: "alias-beef-1", menuItemId: "dish-haochu-5", aliasName: "牛肉能量碗", normalizedAliasName: "牛肉能量碗", sourceType: "ai_detected", restaurantId: "restaurant-haochu-bowl", branchId: "branch-beitou", confidenceScore: 0.71, status: "pending", createdAt: "2026-07-08T21:15:00+08:00", updatedAt: "2026-07-08T21:15:00+08:00" },
  { id: "alias-mori-curry-1", menuItemId: "dish-mori-1", aliasName: "蔬食咖哩飯", normalizedAliasName: "蔬食咖哩飯", sourceType: "legacy", restaurantId: "restaurant-mori-veggie", branchId: "branch-mori-da-an", confidenceScore: 0.96, status: "approved", createdAt: "2026-06-01T09:00:00+08:00", updatedAt: "2026-06-01T09:00:00+08:00" },
  { id: "alias-mori-tofu-1", menuItemId: "dish-mori-2", aliasName: "豆腐藜麥沙拉", normalizedAliasName: "豆腐藜麥沙拉", sourceType: "legacy", restaurantId: "restaurant-mori-veggie", branchId: "branch-mori-da-an", confidenceScore: 0.95, status: "approved", createdAt: "2026-06-01T09:00:00+08:00", updatedAt: "2026-06-01T09:00:00+08:00" },
  { id: "alias-mountain-lean-1", menuItemId: "dish-mountain-1", aliasName: "瘦蛋白便當", normalizedAliasName: "瘦蛋白便當", sourceType: "legacy", restaurantId: "restaurant-mountain-protein", branchId: "branch-mountain-songshan", confidenceScore: 0.95, status: "approved", createdAt: "2026-06-01T09:00:00+08:00", updatedAt: "2026-06-01T09:00:00+08:00" },
  { id: "alias-noodle-oyster-1", menuItemId: "dish-noodle-1", aliasName: "蚵仔麵線", normalizedAliasName: "蚵仔麵線", sourceType: "legacy", restaurantId: "restaurant-noodle-soup", branchId: "branch-noodle-zhongshan", confidenceScore: 0.95, status: "approved", createdAt: "2026-06-01T09:00:00+08:00", updatedAt: "2026-06-01T09:00:00+08:00" },
  { id: "alias-cafe-shrimp-1", menuItemId: "dish-cafe-1", aliasName: "酪梨鮮蝦吐司", normalizedAliasName: "酪梨鮮蝦吐司", sourceType: "legacy", restaurantId: "restaurant-cafe-balance", branchId: "branch-cafe-da-an", confidenceScore: 0.95, status: "approved", createdAt: "2026-06-01T09:00:00+08:00", updatedAt: "2026-06-01T09:00:00+08:00" }
];
