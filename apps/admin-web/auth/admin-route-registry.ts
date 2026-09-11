/**
 * Canonical Admin information architecture for RA-3-IA-P1.
 *
 * This module is metadata only. It creates no route, redirect, database role,
 * permission grant, session, API, or runtime fallback. IA-P2 may consume it to
 * render navigation; server-side authorization must still enforce exact,
 * database-backed permissions at every route and operation boundary.
 */

export const ADMIN_CANONICAL_ROOT = "/admin" as const;

export const ADMIN_AVAILABILITIES = ["LIVE", "DEMO", "NOT_ENABLED"] as const;
export type AdminAvailability = (typeof ADMIN_AVAILABILITIES)[number];

export const ADMIN_AVAILABILITY_ZH_TW = {
  LIVE: "正式資料",
  DEMO: "示範資料",
  NOT_ENABLED: "尚未啟用"
} as const satisfies Readonly<Record<AdminAvailability, string>>;

export const ADMIN_RUNTIME_ERROR_ZH_TW = "正式資料暫時無法使用" as const;

export const ADMIN_DATA_MODE_CONTRACT = {
  productionLiveFailureFallback: "PROHIBITED",
  demoRequiresExplicitMode: true,
  demoRequiresVisibleLabel: true,
  notEnabledImpliesAuthority: false,
  errorIsStoredAvailability: false
} as const;

export const ADMIN_DATA_CLASSES = [
  "PUBLIC",
  "RESTAURANT_OPERATIONAL",
  "RESTAURANT_PRIVATE",
  "MEMBER_ACCOUNT",
  "USER_PRIVATE",
  "HEALTH_PERSONAL_NUTRITION",
  "PRIVATE_SOCIAL",
  "SECURITY_AUTH",
  "AUDIT",
  "ENGINEERING_DIAGNOSTIC",
  "BREAK_GLASS_ONLY"
] as const;
export type AdminDataClass = (typeof ADMIN_DATA_CLASSES)[number];

export const ADMIN_STAFF_DOMAINS = [
  "PLATFORM_OPERATIONS",
  "RESTAURANT_OPERATIONS",
  "MEMBER_SUPPORT",
  "SOCIAL_OPERATIONS",
  "NUTRITION_OPERATIONS",
  "DATA_CONTENT_QUALITY",
  "AUDIT_SECURITY",
  "PLATFORM_MANAGEMENT",
  "ENGINEERING_MAINTAINER",
  "HIGHEST_PRIVILEGE_BREAK_GLASS"
] as const;
export type AdminStaffDomain = (typeof ADMIN_STAFF_DOMAINS)[number];

export const ADMIN_WORKSPACES = [
  "DASHBOARD",
  "PLATFORM_OPERATIONS",
  "RESTAURANT_OPERATIONS",
  "MEMBER_SUPPORT",
  "SOCIAL_SAFETY",
  "NUTRITION_CONTENT_QUALITY",
  "AUDIT_SECURITY",
  "PLATFORM_MANAGEMENT",
  "ENGINEERING_MAINTENANCE",
  "BREAK_GLASS"
] as const;
export type AdminWorkspace = (typeof ADMIN_WORKSPACES)[number];

export const ADMIN_WORKSPACE_ACCESS_LEVELS = [
  "FULL",
  "READ",
  "LIMITED",
  "NONE",
  "BREAK_GLASS"
] as const;
export type AdminWorkspaceAccessLevel = (typeof ADMIN_WORKSPACE_ACCESS_LEVELS)[number];

export const ADMIN_ROLE_WORKSPACE_MATRIX: Readonly<
  Record<AdminStaffDomain, Readonly<Record<AdminWorkspace, AdminWorkspaceAccessLevel>>>
> = {
  PLATFORM_OPERATIONS: {
    DASHBOARD: "FULL", PLATFORM_OPERATIONS: "FULL", RESTAURANT_OPERATIONS: "LIMITED",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_CONTENT_QUALITY: "READ",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  RESTAURANT_OPERATIONS: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "FULL",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_CONTENT_QUALITY: "LIMITED",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  MEMBER_SUPPORT: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "NONE",
    MEMBER_SUPPORT: "FULL", SOCIAL_SAFETY: "LIMITED", NUTRITION_CONTENT_QUALITY: "NONE",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  SOCIAL_OPERATIONS: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "NONE",
    MEMBER_SUPPORT: "LIMITED", SOCIAL_SAFETY: "FULL", NUTRITION_CONTENT_QUALITY: "NONE",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  NUTRITION_OPERATIONS: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_CONTENT_QUALITY: "FULL",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  DATA_CONTENT_QUALITY: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "LIMITED", RESTAURANT_OPERATIONS: "LIMITED",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_CONTENT_QUALITY: "FULL",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  AUDIT_SECURITY: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "READ", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "LIMITED", SOCIAL_SAFETY: "LIMITED", NUTRITION_CONTENT_QUALITY: "READ",
    AUDIT_SECURITY: "FULL", PLATFORM_MANAGEMENT: "LIMITED", ENGINEERING_MAINTENANCE: "READ",
    BREAK_GLASS: "NONE"
  },
  PLATFORM_MANAGEMENT: {
    DASHBOARD: "READ", PLATFORM_OPERATIONS: "READ", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_CONTENT_QUALITY: "READ",
    AUDIT_SECURITY: "READ", PLATFORM_MANAGEMENT: "FULL", ENGINEERING_MAINTENANCE: "READ",
    BREAK_GLASS: "NONE"
  },
  ENGINEERING_MAINTAINER: {
    DASHBOARD: "LIMITED", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "NONE",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_CONTENT_QUALITY: "NONE",
    AUDIT_SECURITY: "READ", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "FULL",
    BREAK_GLASS: "NONE"
  },
  HIGHEST_PRIVILEGE_BREAK_GLASS: {
    DASHBOARD: "NONE", PLATFORM_OPERATIONS: "BREAK_GLASS", RESTAURANT_OPERATIONS: "BREAK_GLASS",
    MEMBER_SUPPORT: "BREAK_GLASS", SOCIAL_SAFETY: "BREAK_GLASS",
    NUTRITION_CONTENT_QUALITY: "BREAK_GLASS", AUDIT_SECURITY: "BREAK_GLASS",
    PLATFORM_MANAGEMENT: "BREAK_GLASS", ENGINEERING_MAINTENANCE: "BREAK_GLASS",
    BREAK_GLASS: "BREAK_GLASS"
  }
};

export const ADMIN_PERMISSION_STATUSES = ["CURRENT", "PLANNED"] as const;
export type AdminPermissionStatus = (typeof ADMIN_PERMISSION_STATUSES)[number];

type AdminPermissionDefinition = Readonly<{
  key: string;
  status: AdminPermissionStatus;
  description: string;
}>;

export const ADMIN_PERMISSION_REGISTRY = [
  { key: "admin_context.read", status: "CURRENT", description: "Resolve the verified caller's bounded Admin context." },
  { key: "admin_audit.read", status: "CURRENT", description: "Read the bounded Platform Admin membership lifecycle audit." },
  { key: "admin_restaurant_branch.status.write", status: "CURRENT", description: "Preview and mutate one branch lifecycle status through the governed operation." },
  { key: "admin.operations.read", status: "PLANNED", description: "Enter the Platform Operations workspace." },
  { key: "admin.operations.ads.read", status: "PLANNED", description: "Read governed advertising review work." },
  { key: "admin.operations.sponsored.read", status: "PLANNED", description: "Read governed sponsored-content work." },
  { key: "admin.restaurants.read", status: "PLANNED", description: "Read bounded Restaurant Operations projections." },
  { key: "admin.restaurants.verification.read", status: "PLANNED", description: "Read restaurant identity and operator-legitimacy verification cases." },
  { key: "admin.restaurants.reviews.read", status: "PLANNED", description: "Read restaurant review queues." },
  { key: "admin.restaurants.about.read", status: "PLANNED", description: "Read restaurant-provided About content." },
  { key: "admin.restaurants.contact.read", status: "PLANNED", description: "Read bounded restaurant contact projections." },
  { key: "admin.restaurants.menus.read", status: "PLANNED", description: "Read bounded restaurant menu projections." },
  { key: "admin.restaurants.branches.read", status: "PLANNED", description: "Read bounded restaurant branch projections." },
  { key: "admin.restaurants.hours.read", status: "PLANNED", description: "Read branch hours and closures." },
  { key: "admin.restaurants.geo.read", status: "PLANNED", description: "Read restaurant operational GEO, excluding private user GEO." },
  { key: "admin.restaurants.menu_items.read", status: "PLANNED", description: "Read bounded branch-menu-item projections." },
  { key: "admin.members.read", status: "PLANNED", description: "Enter the case-scoped Member Support workspace." },
  { key: "admin.members.cases.read", status: "PLANNED", description: "Read assigned support cases." },
  { key: "admin.members.profile.read", status: "PLANNED", description: "Read a bounded member projection in an authorized case." },
  { key: "admin.members.consents.read", status: "PLANNED", description: "Read bounded consent facts in an authorized case." },
  { key: "admin.members.access_history.read", status: "PLANNED", description: "Read bounded access history in an authorized case." },
  { key: "admin.social.read", status: "PLANNED", description: "Enter the Social Safety workspace." },
  { key: "admin.social.reports.read", status: "PLANNED", description: "Read assigned social safety reports and minimum evidence." },
  { key: "admin.social.policies.read", status: "PLANNED", description: "Read Social policy metadata." },
  { key: "admin.nutrition.read", status: "PLANNED", description: "Enter the Nutrition Operations workspace." },
  { key: "admin.nutrition.review.read", status: "PLANNED", description: "Read governed nutrition review work." },
  { key: "admin.nutrition.identification_quality.read", status: "PLANNED", description: "Read scoped meal-identification quality cases." },
  { key: "admin.nutrition.self_cooked_quality.read", status: "PLANNED", description: "Read scoped self-cooked quality cases." },
  { key: "admin.nutrition.allergens.read", status: "PLANNED", description: "Read governed allergen content." },
  { key: "admin.nutrition.ingredients.read", status: "PLANNED", description: "Read governed ingredient content." },
  { key: "admin.data_quality.read", status: "PLANNED", description: "Enter the Data and Content Quality workspace." },
  { key: "admin.data_quality.pending_items.read", status: "PLANNED", description: "Read pending menu-item quality work." },
  { key: "admin.data_quality.duplicates.read", status: "PLANNED", description: "Read duplicate menu-item quality work." },
  { key: "admin.data_quality.aliases.read", status: "PLANNED", description: "Read alias quality work." },
  { key: "admin.data_quality.recommendations.read", status: "PLANNED", description: "Read recommendation-quality aggregates." },
  { key: "admin.data_quality.tags.read", status: "PLANNED", description: "Read governed content-tag work." },
  { key: "admin.audit.operations.read", status: "PLANNED", description: "Read bounded operational audit projections." },
  { key: "admin.audit.data_access.read", status: "PLANNED", description: "Read bounded data-access audit projections." },
  { key: "admin.security.read", status: "PLANNED", description: "Read approved security posture projections." },
  { key: "admin.management.read", status: "PLANNED", description: "Enter the Platform Management workspace." },
  { key: "admin.management.roles.read", status: "PLANNED", description: "Read a future governed role catalogue." },
  { key: "admin.management.permissions.read", status: "PLANNED", description: "Read a future governed permission catalogue." },
  { key: "admin.management.settings.read", status: "PLANNED", description: "Read future governed platform settings." },
  { key: "admin.engineering.read", status: "PLANNED", description: "Enter the sanitized Engineering workspace." },
  { key: "admin.engineering.health.read", status: "PLANNED", description: "Read sanitized service health." },
  { key: "admin.engineering.versions.read", status: "PLANNED", description: "Read version and migration/deployment posture." },
  { key: "admin.engineering.jobs.read", status: "PLANNED", description: "Read sanitized job and outbox posture." },
  { key: "admin.engineering.push.read", status: "PLANNED", description: "Read aggregate push-delivery diagnostics without tokens." },
  { key: "admin.engineering.geo.read", status: "PLANNED", description: "Read sanitized GEO diagnostics without precise user locations." },
  { key: "admin.engineering.feature_modes.read", status: "PLANNED", description: "Read feature-mode posture." },
  { key: "admin.engineering.repairs.read", status: "PLANNED", description: "Read future bounded repair previews; this grants no repair mutation." }
] as const satisfies readonly AdminPermissionDefinition[];

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_REGISTRY)[number]["key"];

export const CURRENT_ADMIN_PERMISSION_KEYS = [
  "admin_context.read",
  "admin_audit.read",
  "admin_restaurant_branch.status.write"
] as const satisfies readonly AdminPermissionKey[];

export const PLANNED_ADMIN_PERMISSION_KEYS = ADMIN_PERMISSION_REGISTRY
  .filter((permission) => permission.status === "PLANNED")
  .map((permission) => permission.key);

export const ADMIN_NAVIGATION_VISIBILITIES = ["ORDINARY", "CONTEXTUAL", "HIDDEN"] as const;
export type AdminNavigationVisibility = (typeof ADMIN_NAVIGATION_VISIBILITIES)[number];

export const ADMIN_LEGACY_ROUTE_SEMANTICS = ["ONE_TO_ONE", "SPLIT", "REPLACE", "DEFER"] as const;
export type AdminLegacyRouteSemantics = (typeof ADMIN_LEGACY_ROUTE_SEMANTICS)[number];

export type AdminLegacyRoute = Readonly<{
  route: string;
  semantics: AdminLegacyRouteSemantics;
}>;

export type AdminRouteDefinition = Readonly<{
  id: string;
  parentId: string | null;
  zhTWLabel: string;
  internalName: string;
  route: string;
  requiredPermissions: readonly AdminPermissionKey[];
  availability: AdminAvailability;
  dataClass: AdminDataClass;
  intendedStaffDomains: readonly AdminStaffDomain[];
  legacyRoutes: readonly AdminLegacyRoute[];
  navigationVisibility: AdminNavigationVisibility;
  order: number;
}>;

const defineRoute = <const T extends AdminRouteDefinition>(definition: T): T => definition;

export const ADMIN_ROUTE_REGISTRY = [
  defineRoute({ id: "dashboard", parentId: null, zhTWLabel: "總覽", internalName: "Dashboard", route: "/admin", requiredPermissions: ["admin_context.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS", "RESTAURANT_OPERATIONS", "MEMBER_SUPPORT", "SOCIAL_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY", "AUDIT_SECURITY", "PLATFORM_MANAGEMENT", "ENGINEERING_MAINTAINER"], legacyRoutes: [{ route: "/", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "admin-login", parentId: null, zhTWLabel: "管理員登入", internalName: "Admin Login", route: "/admin/login", requiredPermissions: [], availability: "NOT_ENABLED", dataClass: "SECURITY_AUTH", intendedStaffDomains: [], legacyRoutes: [{ route: "/login", semantics: "ONE_TO_ONE" }], navigationVisibility: "HIDDEN", order: 1 }),

  defineRoute({ id: "operations", parentId: null, zhTWLabel: "平台營運", internalName: "Platform Operations", route: "/admin/operations", requiredPermissions: ["admin.operations.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [{ route: "/esg", semantics: "DEFER" }], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "operations-ads", parentId: "operations", zhTWLabel: "廣告審查", internalName: "Advertising Review", route: "/admin/operations/ads", requiredPermissions: ["admin.operations.ads.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/ad-review", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "operations-sponsored", parentId: "operations", zhTWLabel: "贊助內容", internalName: "Sponsored Content", route: "/admin/operations/sponsored", requiredPermissions: ["admin.operations.sponsored.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/sponsored", semantics: "ONE_TO_ONE" }, { route: "/tags", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 20 }),

  defineRoute({ id: "restaurants", parentId: null, zhTWLabel: "餐廳營運", internalName: "Restaurant Operations", route: "/admin/restaurants", requiredPermissions: ["admin.restaurants.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/menu-review", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "restaurant-verification", parentId: "restaurants", zhTWLabel: "餐廳身分驗證", internalName: "Restaurant Verification", route: "/admin/restaurants/verification", requiredPermissions: ["admin.restaurants.verification.read"], availability: "DEMO", dataClass: "RESTAURANT_PRIVATE", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "AUDIT_SECURITY"], legacyRoutes: [{ route: "/verification", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "restaurant-reviews", parentId: "restaurants", zhTWLabel: "餐廳審查", internalName: "Restaurant Reviews", route: "/admin/restaurants/reviews", requiredPermissions: ["admin.restaurants.reviews.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/restaurant-review", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "restaurant-detail", parentId: "restaurants", zhTWLabel: "餐廳詳情", internalName: "Restaurant Detail", route: "/admin/restaurants/[restaurantId]", requiredPermissions: ["admin.restaurants.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 30 }),
  defineRoute({ id: "restaurant-about", parentId: "restaurant-detail", zhTWLabel: "餐廳介紹", internalName: "Restaurant About", route: "/admin/restaurants/[restaurantId]/about", requiredPermissions: ["admin.restaurants.about.read"], availability: "NOT_ENABLED", dataClass: "PUBLIC", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-contact", parentId: "restaurant-detail", zhTWLabel: "餐廳聯絡資料", internalName: "Restaurant Contact", route: "/admin/restaurants/[restaurantId]/contact", requiredPermissions: ["admin.restaurants.contact.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 20 }),
  defineRoute({ id: "restaurant-menus", parentId: "restaurant-detail", zhTWLabel: "菜單", internalName: "Restaurant Menus", route: "/admin/restaurants/[restaurantId]/menus", requiredPermissions: ["admin.restaurants.menus.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 30 }),
  defineRoute({ id: "restaurant-menu-items", parentId: "restaurant-menus", zhTWLabel: "菜單品項", internalName: "Menu Items", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items", requiredPermissions: ["admin.restaurants.menu_items.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-branches", parentId: "restaurant-detail", zhTWLabel: "分店", internalName: "Restaurant Branches", route: "/admin/restaurants/[restaurantId]/branches", requiredPermissions: ["admin.restaurants.branches.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 40 }),
  defineRoute({ id: "restaurant-branch-detail", parentId: "restaurant-branches", zhTWLabel: "分店詳情", internalName: "Branch Detail", route: "/admin/restaurants/[restaurantId]/branches/[branchId]", requiredPermissions: ["admin.restaurants.branches.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 5 }),
  defineRoute({ id: "restaurant-branch-status", parentId: "restaurant-branches", zhTWLabel: "分店狀態", internalName: "Branch Status", route: "/admin/restaurants/[restaurantId]/branches/[branchId]/status", requiredPermissions: ["admin_restaurant_branch.status.write"], availability: "LIVE", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/restaurant-review", semantics: "SPLIT" }], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-branch-hours", parentId: "restaurant-branches", zhTWLabel: "營業時間與休業", internalName: "Branch Hours and Closures", route: "/admin/restaurants/[restaurantId]/branches/[branchId]/hours", requiredPermissions: ["admin.restaurants.hours.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 20 }),
  defineRoute({ id: "restaurant-branch-contact", parentId: "restaurant-branches", zhTWLabel: "分店聯絡資料", internalName: "Branch Contact", route: "/admin/restaurants/[restaurantId]/branches/[branchId]/contact", requiredPermissions: ["admin.restaurants.contact.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 30 }),
  defineRoute({ id: "restaurant-branch-geo", parentId: "restaurant-branches", zhTWLabel: "分店地理資料", internalName: "Branch GEO", route: "/admin/restaurants/[restaurantId]/branches/[branchId]/geo", requiredPermissions: ["admin.restaurants.geo.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 40 }),
  defineRoute({ id: "restaurant-branch-menu-items", parentId: "restaurant-branches", zhTWLabel: "分店菜單品項", internalName: "Branch Menu Items", route: "/admin/restaurants/[restaurantId]/branches/[branchId]/menu-items", requiredPermissions: ["admin.restaurants.menu_items.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 50 }),

  defineRoute({ id: "members", parentId: null, zhTWLabel: "會員支援", internalName: "Member Support", route: "/admin/members", requiredPermissions: ["admin.members.read"], availability: "NOT_ENABLED", dataClass: "MEMBER_ACCOUNT", intendedStaffDomains: ["MEMBER_SUPPORT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "member-cases", parentId: "members", zhTWLabel: "支援案件", internalName: "Support Cases", route: "/admin/members/cases", requiredPermissions: ["admin.members.cases.read"], availability: "NOT_ENABLED", dataClass: "MEMBER_ACCOUNT", intendedStaffDomains: ["MEMBER_SUPPORT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "member-detail", parentId: "members", zhTWLabel: "會員案件資料", internalName: "Member Case Detail", route: "/admin/members/[memberRef]", requiredPermissions: ["admin.members.profile.read"], availability: "NOT_ENABLED", dataClass: "MEMBER_ACCOUNT", intendedStaffDomains: ["MEMBER_SUPPORT"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 20 }),
  defineRoute({ id: "member-consents", parentId: "member-detail", zhTWLabel: "同意紀錄", internalName: "Member Consents", route: "/admin/members/[memberRef]/consents", requiredPermissions: ["admin.members.consents.read"], availability: "NOT_ENABLED", dataClass: "USER_PRIVATE", intendedStaffDomains: ["MEMBER_SUPPORT", "AUDIT_SECURITY"], legacyRoutes: [{ route: "/consents", semantics: "REPLACE" }], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "member-access-history", parentId: "member-detail", zhTWLabel: "存取紀錄", internalName: "Member Access History", route: "/admin/members/[memberRef]/access-history", requiredPermissions: ["admin.members.access_history.read"], availability: "NOT_ENABLED", dataClass: "AUDIT", intendedStaffDomains: ["MEMBER_SUPPORT", "AUDIT_SECURITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 20 }),

  defineRoute({ id: "social", parentId: null, zhTWLabel: "社交安全", internalName: "Social Safety", route: "/admin/social", requiredPermissions: ["admin.social.read"], availability: "DEMO", dataClass: "PRIVATE_SOCIAL", intendedStaffDomains: ["SOCIAL_OPERATIONS"], legacyRoutes: [{ route: "/social-governance", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 50 }),
  defineRoute({ id: "social-reports", parentId: "social", zhTWLabel: "檢舉案件", internalName: "Social Reports", route: "/admin/social/reports", requiredPermissions: ["admin.social.reports.read"], availability: "NOT_ENABLED", dataClass: "PRIVATE_SOCIAL", intendedStaffDomains: ["SOCIAL_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "social-policies", parentId: "social", zhTWLabel: "社交安全政策", internalName: "Social Safety Policies", route: "/admin/social/policies", requiredPermissions: ["admin.social.policies.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["SOCIAL_OPERATIONS", "AUDIT_SECURITY"], legacyRoutes: [{ route: "/tags", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 20 }),

  defineRoute({ id: "nutrition", parentId: null, zhTWLabel: "營養與內容品質", internalName: "Nutrition and Content Quality", route: "/admin/nutrition", requiredPermissions: ["admin.nutrition.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/menu-review", semantics: "SPLIT" }, { route: "/exercise-governance", semantics: "DEFER" }], navigationVisibility: "ORDINARY", order: 60 }),
  defineRoute({ id: "nutrition-review", parentId: "nutrition", zhTWLabel: "營養審查", internalName: "Nutrition Review", route: "/admin/nutrition/review", requiredPermissions: ["admin.nutrition.review.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [{ route: "/nutrition-review", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "nutrition-identification-quality", parentId: "nutrition", zhTWLabel: "辨識品質", internalName: "Identification Quality", route: "/admin/nutrition/identification-quality", requiredPermissions: ["admin.nutrition.identification_quality.read"], availability: "DEMO", dataClass: "HEALTH_PERSONAL_NUTRITION", intendedStaffDomains: ["NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/identification-audit", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "nutrition-self-cooked-quality", parentId: "nutrition", zhTWLabel: "自煮辨識品質", internalName: "Self-Cooked Quality", route: "/admin/nutrition/self-cooked-quality", requiredPermissions: ["admin.nutrition.self_cooked_quality.read"], availability: "DEMO", dataClass: "HEALTH_PERSONAL_NUTRITION", intendedStaffDomains: ["NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/self-cooked-audit", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "nutrition-allergens", parentId: "nutrition", zhTWLabel: "過敏原", internalName: "Allergens", route: "/admin/nutrition/allergens", requiredPermissions: ["admin.nutrition.allergens.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "nutrition-ingredients", parentId: "nutrition", zhTWLabel: "食材", internalName: "Ingredients", route: "/admin/nutrition/ingredients", requiredPermissions: ["admin.nutrition.ingredients.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),

  defineRoute({ id: "data-quality", parentId: "nutrition", zhTWLabel: "資料與內容品質", internalName: "Data and Content Quality", route: "/admin/data-quality", requiredPermissions: ["admin.data_quality.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["DATA_CONTENT_QUALITY", "NUTRITION_OPERATIONS"], legacyRoutes: [{ route: "/data-quality", semantics: "ONE_TO_ONE" }, { route: "/menu-review", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 60 }),
  defineRoute({ id: "data-quality-pending-items", parentId: "data-quality", zhTWLabel: "待處理菜單品項", internalName: "Pending Menu Items", route: "/admin/data-quality/menu-items/pending", requiredPermissions: ["admin.data_quality.pending_items.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["DATA_CONTENT_QUALITY", "RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/pending-menu-items", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "data-quality-duplicates", parentId: "data-quality", zhTWLabel: "重複菜單品項", internalName: "Duplicate Menu Items", route: "/admin/data-quality/menu-items/duplicates", requiredPermissions: ["admin.data_quality.duplicates.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/duplicate-menu-items", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "data-quality-aliases", parentId: "data-quality", zhTWLabel: "別名審查", internalName: "Menu Item Aliases", route: "/admin/data-quality/menu-items/aliases", requiredPermissions: ["admin.data_quality.aliases.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/alias-review", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "data-quality-recommendations", parentId: "data-quality", zhTWLabel: "推薦品質", internalName: "Recommendation Quality", route: "/admin/data-quality/recommendations", requiredPermissions: ["admin.data_quality.recommendations.read"], availability: "DEMO", dataClass: "AUDIT", intendedStaffDomains: ["DATA_CONTENT_QUALITY", "NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "data-quality-tags", parentId: "data-quality", zhTWLabel: "內容標籤", internalName: "Content Tags", route: "/admin/data-quality/tags", requiredPermissions: ["admin.data_quality.tags.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/tags", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 50 }),

  defineRoute({ id: "audit", parentId: null, zhTWLabel: "稽核與資安", internalName: "Audit and Security", route: "/admin/audit", requiredPermissions: ["admin_audit.read"], availability: "NOT_ENABLED", dataClass: "AUDIT", intendedStaffDomains: ["AUDIT_SECURITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 70 }),
  defineRoute({ id: "audit-platform-memberships", parentId: "audit", zhTWLabel: "平台管理員成員稽核", internalName: "Platform Admin Membership Audit", route: "/admin/audit/platform-memberships", requiredPermissions: ["admin_audit.read"], availability: "LIVE", dataClass: "AUDIT", intendedStaffDomains: ["AUDIT_SECURITY"], legacyRoutes: [{ route: "/audit-trail", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "audit-operations", parentId: "audit", zhTWLabel: "操作稽核", internalName: "Operations Audit", route: "/admin/audit/operations", requiredPermissions: ["admin.audit.operations.read"], availability: "NOT_ENABLED", dataClass: "AUDIT", intendedStaffDomains: ["AUDIT_SECURITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "audit-data-access", parentId: "audit", zhTWLabel: "資料存取稽核", internalName: "Data Access Audit", route: "/admin/audit/data-access", requiredPermissions: ["admin.audit.data_access.read"], availability: "NOT_ENABLED", dataClass: "AUDIT", intendedStaffDomains: ["AUDIT_SECURITY"], legacyRoutes: [{ route: "/data-access", semantics: "DEFER" }], navigationVisibility: "ORDINARY", order: 30 }),

  defineRoute({ id: "management", parentId: null, zhTWLabel: "平台管理", internalName: "Platform Management", route: "/admin/management", requiredPermissions: ["admin.management.read"], availability: "NOT_ENABLED", dataClass: "SECURITY_AUTH", intendedStaffDomains: ["PLATFORM_MANAGEMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 80 }),
  defineRoute({ id: "management-roles", parentId: "management", zhTWLabel: "角色", internalName: "Roles", route: "/admin/management/roles", requiredPermissions: ["admin.management.roles.read"], availability: "NOT_ENABLED", dataClass: "SECURITY_AUTH", intendedStaffDomains: ["PLATFORM_MANAGEMENT", "AUDIT_SECURITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "management-permissions", parentId: "management", zhTWLabel: "權限", internalName: "Permissions", route: "/admin/management/permissions", requiredPermissions: ["admin.management.permissions.read"], availability: "NOT_ENABLED", dataClass: "SECURITY_AUTH", intendedStaffDomains: ["PLATFORM_MANAGEMENT", "AUDIT_SECURITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "management-settings", parentId: "management", zhTWLabel: "設定", internalName: "Settings", route: "/admin/management/settings", requiredPermissions: ["admin.management.settings.read"], availability: "NOT_ENABLED", dataClass: "SECURITY_AUTH", intendedStaffDomains: ["PLATFORM_MANAGEMENT"], legacyRoutes: [{ route: "/settings", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 30 }),

  defineRoute({ id: "engineering", parentId: null, zhTWLabel: "工程維運", internalName: "Engineering and Maintenance", route: "/admin/engineering", requiredPermissions: ["admin.engineering.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 90 }),
  defineRoute({ id: "engineering-health", parentId: "engineering", zhTWLabel: "系統健康", internalName: "System Health", route: "/admin/engineering/health", requiredPermissions: ["admin.engineering.health.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "engineering-versions", parentId: "engineering", zhTWLabel: "版本與部署狀態", internalName: "Versions and Deployment Posture", route: "/admin/engineering/versions", requiredPermissions: ["admin.engineering.versions.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER", "AUDIT_SECURITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "engineering-jobs", parentId: "engineering", zhTWLabel: "工作與佇列", internalName: "Jobs and Outboxes", route: "/admin/engineering/jobs", requiredPermissions: ["admin.engineering.jobs.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "engineering-push", parentId: "engineering", zhTWLabel: "推播診斷", internalName: "Push Diagnostics", route: "/admin/engineering/push", requiredPermissions: ["admin.engineering.push.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "engineering-geo", parentId: "engineering", zhTWLabel: "地理診斷", internalName: "GEO Diagnostics", route: "/admin/engineering/geo", requiredPermissions: ["admin.engineering.geo.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),
  defineRoute({ id: "engineering-feature-modes", parentId: "engineering", zhTWLabel: "功能模式", internalName: "Feature Modes", route: "/admin/engineering/feature-modes", requiredPermissions: ["admin.engineering.feature_modes.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 60 }),
  defineRoute({ id: "engineering-repairs", parentId: "engineering", zhTWLabel: "修復工具", internalName: "Bounded Repairs", route: "/admin/engineering/repairs", requiredPermissions: ["admin.engineering.repairs.read"], availability: "NOT_ENABLED", dataClass: "ENGINEERING_DIAGNOSTIC", intendedStaffDomains: ["ENGINEERING_MAINTAINER"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 70 }),

  defineRoute({ id: "break-glass", parentId: null, zhTWLabel: "緊急權限", internalName: "Break-glass (Reserved)", route: "/admin/break-glass", requiredPermissions: [], availability: "NOT_ENABLED", dataClass: "BREAK_GLASS_ONLY", intendedStaffDomains: ["HIGHEST_PRIVILEGE_BREAK_GLASS"], legacyRoutes: [], navigationVisibility: "HIDDEN", order: 1000 })
] as const satisfies readonly AdminRouteDefinition[];

export type AdminRouteId = (typeof ADMIN_ROUTE_REGISTRY)[number]["id"];

export const ADMIN_TOP_LEVEL_WORKSPACE_IDS = [
  "dashboard",
  "operations",
  "restaurants",
  "members",
  "social",
  "nutrition",
  "audit",
  "management",
  "engineering"
] as const satisfies readonly AdminRouteId[];

export const RESTAURANT_VERIFICATION_BOUNDARY = {
  means: ["restaurant identity", "operator legitimacy"],
  doesNotMean: [
    "nutrition certification",
    "food safety certification",
    "platform recommendation",
    "quality badge",
    "allergen certification"
  ]
} as const;

export const NUTRITION_CERTIFICATION_BOUNDARY = {
  restaurantAbout: "Restaurant-provided prose; not platform certification.",
  nutritionCertification: "A separate future governed nutrition authority.",
  nutritionist: "A future separate identity/role with purpose- and consent-scoped personal-data access.",
  combinedWithRestaurantVerification: false
} as const;

export const ENGINEERING_WORKSPACE_BOUNDARY = {
  safeInitialAreas: [
    "health", "versions", "migration/deployment posture", "jobs/outboxes", "push diagnostics",
    "GEO diagnostics", "feature-mode posture", "sanitized errors", "future bounded repairs"
  ],
  prohibitedData: [
    "user meal photos", "health data", "private Social messages", "precise user GEO", "push tokens",
    "auth tokens", "passwords", "raw service-role credentials", "unrestricted SQL"
  ],
  grantsPrivateUserDataAccess: false
} as const;

export const MANAGEMENT_AND_BREAK_GLASS_BOUNDARY = {
  managementAuthorityExists: false,
  operatorGrantRevokeFunctionsAreUiAuthority: false,
  breakGlassRoute: "/admin/break-glass",
  breakGlassOrdinaryNavigation: false,
  breakGlassPermissionCreated: false,
  requiredFuturePhase: "separate approved activation, audit, and security phase"
} as const;

const permissionByKey: ReadonlyMap<string, AdminPermissionDefinition> = new Map(
  ADMIN_PERMISSION_REGISTRY.map((permission) => [permission.key, permission])
);
const routeById: ReadonlyMap<string, AdminRouteDefinition> = new Map(
  ADMIN_ROUTE_REGISTRY.map((route) => [route.id, route])
);

export function isCurrentAdminPermission(permissionKey: AdminPermissionKey): boolean {
  return permissionByKey.get(permissionKey)?.status === "CURRENT";
}

/**
 * Planned requirements are metadata, never current authority. Ancestors added by
 * `deriveCurrentAdminNavigationIds` are navigation containers only and are not
 * thereby authorized as routes.
 */
export function isAdminRouteCurrentlyAuthorized(
  route: AdminRouteDefinition,
  grantedCurrentPermissions: readonly AdminPermissionKey[]
): boolean {
  return route.requiredPermissions.length > 0
    && route.requiredPermissions.every((key) => isCurrentAdminPermission(key) && grantedCurrentPermissions.includes(key));
}

export function deriveCurrentAdminNavigationIds(
  grantedCurrentPermissions: readonly AdminPermissionKey[]
): readonly AdminRouteId[] {
  const visible = new Set<string>();
  for (const route of ADMIN_ROUTE_REGISTRY) {
    if (route.navigationVisibility === "HIDDEN" || route.availability === "NOT_ENABLED") continue;
    if (!isAdminRouteCurrentlyAuthorized(route, grantedCurrentPermissions)) continue;
    visible.add(route.id);
    let parentId: string | null = route.parentId;
    while (parentId !== null) {
      visible.add(parentId);
      parentId = routeById.get(parentId)?.parentId ?? null;
    }
  }
  return ADMIN_ROUTE_REGISTRY.filter((route) => visible.has(route.id)).map((route) => route.id);
}

export function validateAdminIaRegistry(): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const routes = new Set<string>();
  const declaredPermissions = new Set<string>();

  for (const permission of ADMIN_PERMISSION_REGISTRY) {
    if (declaredPermissions.has(permission.key)) errors.push(`duplicate permission: ${permission.key}`);
    declaredPermissions.add(permission.key);
  }

  for (const route of ADMIN_ROUTE_REGISTRY) {
    if (ids.has(route.id)) errors.push(`duplicate route id: ${route.id}`);
    if (routes.has(route.route)) errors.push(`duplicate route: ${route.route}`);
    ids.add(route.id);
    routes.add(route.route);
    if (!ADMIN_AVAILABILITIES.includes(route.availability)) errors.push(`invalid availability: ${route.id}`);
    if (!ADMIN_DATA_CLASSES.includes(route.dataClass)) errors.push(`invalid data class: ${route.id}`);
    for (const permission of route.requiredPermissions) {
      if (!declaredPermissions.has(permission)) errors.push(`undeclared permission ${permission}: ${route.id}`);
    }
  }

  for (const route of ADMIN_ROUTE_REGISTRY) {
    if (route.parentId !== null && !ids.has(route.parentId)) errors.push(`invalid parent ${route.parentId}: ${route.id}`);
    if (route.navigationVisibility !== "HIDDEN" && !ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes(route.id as typeof ADMIN_TOP_LEVEL_WORKSPACE_IDS[number]) && route.parentId === null) {
      errors.push(`navigable child has no parent: ${route.id}`);
    }
    const seen = new Set<string>([route.id]);
    let parentId: string | null = route.parentId;
    while (parentId !== null) {
      if (seen.has(parentId)) { errors.push(`route cycle at: ${route.id}`); break; }
      seen.add(parentId);
      parentId = routeById.get(parentId)?.parentId ?? null;
    }
  }

  const topLevelOrders = ADMIN_TOP_LEVEL_WORKSPACE_IDS.map((id) => routeById.get(id)?.order ?? -1);
  if (!topLevelOrders.every((order, index) => index === 0 || order > topLevelOrders[index - 1]!)) {
    errors.push("top-level workspace order is not deterministic");
  }

  const oneToOneLegacyRoutes = new Set<string>();
  for (const route of ADMIN_ROUTE_REGISTRY) {
    for (const legacy of route.legacyRoutes) {
      if (legacy.semantics !== "ONE_TO_ONE") continue;
      if (oneToOneLegacyRoutes.has(legacy.route)) errors.push(`duplicate one-to-one legacy route: ${legacy.route}`);
      oneToOneLegacyRoutes.add(legacy.route);
    }
  }

  const actualCurrent = ADMIN_PERMISSION_REGISTRY.filter((permission) => permission.status === "CURRENT").map((permission) => permission.key).sort();
  const expectedCurrent = [...CURRENT_ADMIN_PERMISSION_KEYS].sort();
  if (JSON.stringify(actualCurrent) !== JSON.stringify(expectedCurrent)) errors.push("CURRENT permission vocabulary is broader than repository authority");

  const forbiddenEngineeringClasses = new Set<AdminDataClass>([
    "RESTAURANT_PRIVATE", "MEMBER_ACCOUNT", "USER_PRIVATE", "HEALTH_PERSONAL_NUTRITION",
    "PRIVATE_SOCIAL", "SECURITY_AUTH", "BREAK_GLASS_ONLY"
  ]);
  for (const route of ADMIN_ROUTE_REGISTRY.filter((entry) => entry.id === "engineering" || entry.parentId === "engineering")) {
    if (forbiddenEngineeringClasses.has(route.dataClass)) errors.push(`engineering declares private data: ${route.id}`);
  }

  const breakGlass = routeById.get("break-glass");
  if (!breakGlass || breakGlass.navigationVisibility !== "HIDDEN" || breakGlass.requiredPermissions.length !== 0 || breakGlass.availability !== "NOT_ENABLED") {
    errors.push("break-glass must remain hidden, not enabled, and without a permission key");
  }

  for (const route of ADMIN_ROUTE_REGISTRY.filter((entry) => entry.id === "management" || entry.parentId === "management")) {
    if (route.availability !== "NOT_ENABLED") errors.push(`management authority incorrectly enabled: ${route.id}`);
  }

  return errors;
}
