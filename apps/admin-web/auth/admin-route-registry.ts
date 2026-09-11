import {
  CURRENT_ADMIN_PERMISSION_KEYS,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";

export { CURRENT_ADMIN_PERMISSION_KEYS };
export type { CurrentAdminPermissionKey };

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
  "BREAK_GLASS_ONLY",
  "NUTRITION_GOVERNANCE",
  "COMMERCIAL_RELATIONSHIP"
] as const;
export type AdminDataClass = (typeof ADMIN_DATA_CLASSES)[number];

export const ADMIN_STAFF_DOMAINS = [
  "BUSINESS_DEVELOPMENT",
  "PLATFORM_OPERATIONS",
  "RESTAURANT_OPERATIONS",
  "MEMBER_SUPPORT",
  "SOCIAL_OPERATIONS",
  "NUTRITION_OPERATIONS",
  "NUTRITION_OPERATIONS_LEAD",
  "DATA_CONTENT_QUALITY",
  "AUDIT_SECURITY",
  "PLATFORM_MANAGEMENT",
  "ENGINEERING_MAINTAINER",
  "HIGHEST_PRIVILEGE_BREAK_GLASS"
] as const;
export type AdminStaffDomain = (typeof ADMIN_STAFF_DOMAINS)[number];

export const ADMIN_WORKSPACES = [
  "DASHBOARD",
  "BUSINESS_DEVELOPMENT",
  "PLATFORM_OPERATIONS",
  "RESTAURANT_OPERATIONS",
  "MEMBER_SUPPORT",
  "SOCIAL_SAFETY",
  "NUTRITION_PROFESSIONAL_MANAGEMENT",
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
  BUSINESS_DEVELOPMENT: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "FULL", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "LIMITED",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "NONE",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  PLATFORM_OPERATIONS: {
    DASHBOARD: "FULL", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "FULL", RESTAURANT_OPERATIONS: "LIMITED",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "READ",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  RESTAURANT_OPERATIONS: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "FULL",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "LIMITED",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  MEMBER_SUPPORT: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "NONE",
    MEMBER_SUPPORT: "FULL", SOCIAL_SAFETY: "LIMITED", NUTRITION_PROFESSIONAL_MANAGEMENT: "NONE",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  SOCIAL_OPERATIONS: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "NONE",
    MEMBER_SUPPORT: "LIMITED", SOCIAL_SAFETY: "FULL", NUTRITION_PROFESSIONAL_MANAGEMENT: "NONE",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  NUTRITION_OPERATIONS: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "FULL",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  NUTRITION_OPERATIONS_LEAD: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "FULL",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  DATA_CONTENT_QUALITY: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "LIMITED", RESTAURANT_OPERATIONS: "LIMITED",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "FULL",
    AUDIT_SECURITY: "LIMITED", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "NONE",
    BREAK_GLASS: "NONE"
  },
  AUDIT_SECURITY: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "LIMITED", PLATFORM_OPERATIONS: "READ", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "LIMITED", SOCIAL_SAFETY: "LIMITED", NUTRITION_PROFESSIONAL_MANAGEMENT: "READ",
    AUDIT_SECURITY: "FULL", PLATFORM_MANAGEMENT: "LIMITED", ENGINEERING_MAINTENANCE: "READ",
    BREAK_GLASS: "NONE"
  },
  PLATFORM_MANAGEMENT: {
    DASHBOARD: "READ", BUSINESS_DEVELOPMENT: "READ", PLATFORM_OPERATIONS: "READ", RESTAURANT_OPERATIONS: "READ",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "READ",
    AUDIT_SECURITY: "READ", PLATFORM_MANAGEMENT: "FULL", ENGINEERING_MAINTENANCE: "READ",
    BREAK_GLASS: "NONE"
  },
  ENGINEERING_MAINTAINER: {
    DASHBOARD: "LIMITED", BUSINESS_DEVELOPMENT: "NONE", PLATFORM_OPERATIONS: "NONE", RESTAURANT_OPERATIONS: "NONE",
    MEMBER_SUPPORT: "NONE", SOCIAL_SAFETY: "NONE", NUTRITION_PROFESSIONAL_MANAGEMENT: "NONE",
    AUDIT_SECURITY: "READ", PLATFORM_MANAGEMENT: "NONE", ENGINEERING_MAINTENANCE: "FULL",
    BREAK_GLASS: "NONE"
  },
  HIGHEST_PRIVILEGE_BREAK_GLASS: {
    DASHBOARD: "NONE", BUSINESS_DEVELOPMENT: "BREAK_GLASS", PLATFORM_OPERATIONS: "BREAK_GLASS", RESTAURANT_OPERATIONS: "BREAK_GLASS",
    MEMBER_SUPPORT: "BREAK_GLASS", SOCIAL_SAFETY: "BREAK_GLASS",
    NUTRITION_PROFESSIONAL_MANAGEMENT: "BREAK_GLASS", AUDIT_SECURITY: "BREAK_GLASS",
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

  { key: "admin.business_development.read", status: "PLANNED", description: "Enter the Business Development workspace." },
  { key: "admin.business_development.prospects.read", status: "PLANNED", description: "Read prospective Restaurant leads; not the canonical Restaurant master record." },
  { key: "admin.business_development.pipeline.read", status: "PLANNED", description: "Read the commercial negotiation pipeline." },
  { key: "admin.business_development.followups.read", status: "PLANNED", description: "Read items requiring commercial follow-up." },
  { key: "admin.business_development.contacts.read", status: "PLANNED", description: "Read commercial contact history." },
  { key: "admin.business_development.contracts.read", status: "PLANNED", description: "Read contract lifecycle placeholders; grants no contract mutation." },
  { key: "admin.business_development.renewals.read", status: "PLANNED", description: "Read upcoming renewal placeholders; grants no renewal mutation." },
  { key: "admin.business_development.assignments.read", status: "PLANNED", description: "Read sales territory/ownership assignment placeholders; distinct from Nutrition assignment." },
  { key: "admin.business_development.history.read", status: "PLANNED", description: "Read a Restaurant's commercial partnership history." },

  { key: "admin.operations.read", status: "PLANNED", description: "Enter the Platform Operations / Marketing workspace." },
  { key: "admin.operations.campaigns.read", status: "PLANNED", description: "Read marketing campaign placeholders; grants no campaign execution." },
  { key: "admin.operations.promotions.read", status: "PLANNED", description: "Read platform promotion placeholders; grants no discount/coupon authority." },
  { key: "admin.operations.ads.read", status: "PLANNED", description: "Read governed advertising review work." },
  { key: "admin.operations.sponsored.read", status: "PLANNED", description: "Read governed sponsored-content work." },
  { key: "admin.operations.placements.read", status: "PLANNED", description: "Read platform exposure/placement placeholders." },
  { key: "admin.operations.communications.read", status: "PLANNED", description: "Read marketing communication/campaign schedule placeholders; grants no raw push-token access and no sending." },
  { key: "admin.operations.performance.read", status: "PLANNED", description: "Read governed aggregate marketing performance; excludes raw personal/health/Social data." },

  { key: "admin.restaurants.read", status: "PLANNED", description: "Read bounded Restaurant Operations projections." },
  { key: "admin.restaurants.verification.read", status: "PLANNED", description: "Read restaurant identity and operator-legitimacy verification cases." },
  { key: "admin.restaurants.reviews.read", status: "PLANNED", description: "Read restaurant review queues." },
  { key: "admin.restaurants.about.read", status: "PLANNED", description: "Read restaurant-provided About content." },
  { key: "admin.restaurants.contact.read", status: "PLANNED", description: "Read bounded restaurant contact projections." },
  { key: "admin.restaurants.menus.read", status: "PLANNED", description: "Read bounded restaurant menu projections." },
  { key: "admin.restaurants.menu.read", status: "PLANNED", description: "Read one Restaurant-scoped menu's detail." },
  { key: "admin.restaurants.menu_item.read", status: "PLANNED", description: "Read one Restaurant-scoped dish/item and its nutrition, ingredients, allergens and certification-status facts." },
  { key: "admin.restaurants.branches.read", status: "PLANNED", description: "Read bounded restaurant branch projections." },
  { key: "admin.restaurants.hours.read", status: "PLANNED", description: "Read branch hours and closures." },
  { key: "admin.restaurants.geo.read", status: "PLANNED", description: "Read restaurant operational GEO, excluding private user GEO." },
  { key: "admin.restaurants.menu_items.read", status: "PLANNED", description: "Read bounded branch-menu-item projections." },
  { key: "admin.restaurants.menu_management.read", status: "PLANNED", description: "Enter the cross-Restaurant menu queue/search workspace; not the canonical owner of Restaurant/Dish facts." },
  { key: "admin.restaurants.menu_management.pending.read", status: "PLANNED", description: "Read pending menu-item quality work." },
  { key: "admin.restaurants.menu_management.duplicates.read", status: "PLANNED", description: "Read suspected duplicate menu-item queue." },
  { key: "admin.restaurants.menu_management.aliases.read", status: "PLANNED", description: "Read menu-item alias/identification anomaly queue." },
  { key: "admin.restaurants.menu_management.nutrition_discrepancy.read", status: "PLANNED", description: "Read the operational nutrition-data-discrepancy triage queue; distinct from Nutrition's professional discrepancy review." },
  { key: "admin.restaurants.menu_management.data_quality.read", status: "PLANNED", description: "Read the missing/incomplete Restaurant data queue." },

  { key: "admin.members.read", status: "PLANNED", description: "Enter the case-scoped Member Support workspace." },
  { key: "admin.members.cases.read", status: "PLANNED", description: "Read assigned support cases." },
  { key: "admin.members.profile.read", status: "PLANNED", description: "Read a bounded member projection in an authorized case." },
  { key: "admin.members.consents.read", status: "PLANNED", description: "Read bounded consent facts in an authorized case." },
  { key: "admin.members.access_history.read", status: "PLANNED", description: "Read bounded access history in an authorized case." },

  { key: "admin.social.read", status: "PLANNED", description: "Enter the Social Safety workspace." },
  { key: "admin.social.reports.read", status: "PLANNED", description: "Read assigned social safety reports and minimum evidence." },
  { key: "admin.social.policies.read", status: "PLANNED", description: "Read Social policy metadata." },

  { key: "admin.nutrition.read", status: "PLANNED", description: "Enter the Nutrition Professional Management workspace." },
  { key: "admin.nutrition.self_cooked_quality.read", status: "PLANNED", description: "Read scoped self-cooked estimation-quality cases." },
  { key: "admin.nutrition.my_work.read", status: "PLANNED", description: "Enter the ordinary Nutritionist's own My Work area." },
  { key: "admin.nutrition.my_work.restaurants.read", status: "PLANNED", description: "Read Restaurants currently assigned to the caller." },
  { key: "admin.nutrition.my_work.cases.read", status: "PLANNED", description: "Read nutrition cases currently assigned to the caller." },
  { key: "admin.nutrition.my_work.members.read", status: "PLANNED", description: "Read members who have consented and assigned the caller as their Nutritionist." },
  { key: "admin.nutrition.standards.read", status: "PLANNED", description: "Enter the Nutrition Standards and Scoring area." },
  { key: "admin.nutrition.standards.scoring.read", status: "PLANNED", description: "Read the governed nutrition scoring basis; no editable settings in this phase." },
  { key: "admin.nutrition.standards.recommendation.read", status: "PLANNED", description: "Read the governed recommendation-determination criteria; no editable settings in this phase." },
  { key: "admin.nutrition.standards.parameters.read", status: "PLANNED", description: "Read the governed set of important nutrition parameters; no editable settings in this phase." },
  { key: "admin.nutrition.members.read", status: "PLANNED", description: "Enter the consent-scoped Member Nutrition Management area; lists only explicitly authorized members." },
  { key: "admin.nutrition.members.detail.read", status: "PLANNED", description: "Read one consent-authorized member's allowlisted nutrition fields; grants no field write in this phase." },
  { key: "admin.nutrition.certification.read", status: "PLANNED", description: "Enter the Restaurant Nutrition Certification workspace." },
  { key: "admin.nutrition.certification.pending.read", status: "PLANNED", description: "Read the queue of dishes awaiting professional nutrition certification." },
  { key: "admin.nutrition.certification.discrepancy_reports.read", status: "PLANNED", description: "Read reports of a materially different system-recommended dish nutrition value." },
  { key: "admin.nutrition.certification.remote_review.read", status: "PLANNED", description: "Read the future Restaurant-Nutritionist remote review workflow location; grants no live review session." },
  { key: "admin.nutrition.certification.history.read", status: "PLANNED", description: "Read the record of past certification outcomes." },
  { key: "admin.nutrition.certification.re_review.read", status: "PLANNED", description: "Read dishes whose prior certification now requires re-review." },
  { key: "admin.nutrition.assignments.read", status: "PLANNED", description: "Enter the Nutrition assignment-management workspace; intended for an authorized Nutrition Operations Lead, not every Nutritionist." },
  { key: "admin.nutrition.assignment.nutritionists.read", status: "PLANNED", description: "Read the Nutritionist roster." },
  { key: "admin.nutrition.assignment.region.read", status: "PLANNED", description: "Read region default-coverage assignments; the lowest-precedence routing hint." },
  { key: "admin.nutrition.assignment.restaurant.read", status: "PLANNED", description: "Read explicit Restaurant/Branch Nutritionist assignments; overrides region default." },
  { key: "admin.nutrition.assignment.case.read", status: "PLANNED", description: "Read case-specific Nutritionist assignment overrides; highest precedence." },
  { key: "admin.nutrition.assignment.workload.read", status: "PLANNED", description: "Read Nutritionist workload distribution." },

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
  defineRoute({ id: "dashboard", parentId: null, zhTWLabel: "總覽", internalName: "Dashboard", route: "/admin", requiredPermissions: ["admin_context.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["BUSINESS_DEVELOPMENT", "PLATFORM_OPERATIONS", "RESTAURANT_OPERATIONS", "MEMBER_SUPPORT", "SOCIAL_OPERATIONS", "NUTRITION_OPERATIONS", "NUTRITION_OPERATIONS_LEAD", "DATA_CONTENT_QUALITY", "AUDIT_SECURITY", "PLATFORM_MANAGEMENT", "ENGINEERING_MAINTAINER"], legacyRoutes: [{ route: "/", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "admin-login", parentId: null, zhTWLabel: "管理員登入", internalName: "Admin Login", route: "/admin/login", requiredPermissions: [], availability: "NOT_ENABLED", dataClass: "SECURITY_AUTH", intendedStaffDomains: [], legacyRoutes: [{ route: "/login", semantics: "ONE_TO_ONE" }], navigationVisibility: "HIDDEN", order: 1 }),

  // ---------------------------------------------------------------------
  // BUSINESS DEVELOPMENT -- Restaurant prospecting, negotiation, contracts
  // and renewals. Distinct from Platform Operations/Marketing (campaigns,
  // growth) and from Restaurant Operations (onboarded operational data).
  // ---------------------------------------------------------------------
  defineRoute({ id: "business-development", parentId: null, zhTWLabel: "商務拓展", internalName: "Business Development", route: "/admin/business-development", requiredPermissions: ["admin.business_development.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 15 }),
  defineRoute({ id: "business-development-prospects", parentId: "business-development", zhTWLabel: "潛在店家", internalName: "Prospects", route: "/admin/business-development/prospects", requiredPermissions: ["admin.business_development.prospects.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "business-development-pipeline", parentId: "business-development", zhTWLabel: "洽談 Pipeline", internalName: "Negotiation Pipeline", route: "/admin/business-development/pipeline", requiredPermissions: ["admin.business_development.pipeline.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "business-development-follow-ups", parentId: "business-development", zhTWLabel: "待跟進事項", internalName: "Follow-ups", route: "/admin/business-development/follow-ups", requiredPermissions: ["admin.business_development.followups.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "business-development-contacts", parentId: "business-development", zhTWLabel: "接觸紀錄", internalName: "Contact History", route: "/admin/business-development/contacts", requiredPermissions: ["admin.business_development.contacts.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "business-development-contracts", parentId: "business-development", zhTWLabel: "合約管理", internalName: "Contracts", route: "/admin/business-development/contracts", requiredPermissions: ["admin.business_development.contracts.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),
  defineRoute({ id: "business-development-renewals", parentId: "business-development", zhTWLabel: "即將到期／續約", internalName: "Renewals", route: "/admin/business-development/renewals", requiredPermissions: ["admin.business_development.renewals.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 60 }),
  defineRoute({ id: "business-development-assignments", parentId: "business-development", zhTWLabel: "區域／業務分派", internalName: "Sales Assignments", route: "/admin/business-development/assignments", requiredPermissions: ["admin.business_development.assignments.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 70 }),
  defineRoute({ id: "business-development-history", parentId: "business-development", zhTWLabel: "店家合作歷程", internalName: "Partnership History", route: "/admin/business-development/history", requiredPermissions: ["admin.business_development.history.read"], availability: "NOT_ENABLED", dataClass: "COMMERCIAL_RELATIONSHIP", intendedStaffDomains: ["BUSINESS_DEVELOPMENT"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 80 }),

  // ---------------------------------------------------------------------
  // PLATFORM OPERATIONS / MARKETING -- campaigns, promotions, advertising,
  // sponsored content, placements, marketing communications and aggregate
  // marketing performance. Distinct from Business Development (sales) and
  // Restaurant Operations (operational master data).
  // ---------------------------------------------------------------------
  defineRoute({ id: "operations", parentId: null, zhTWLabel: "平台營運", internalName: "Platform Operations / Marketing", route: "/admin/operations", requiredPermissions: ["admin.operations.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [{ route: "/esg", semantics: "DEFER" }], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "operations-campaigns", parentId: "operations", zhTWLabel: "行銷活動", internalName: "Campaigns", route: "/admin/operations/campaigns", requiredPermissions: ["admin.operations.campaigns.read"], availability: "NOT_ENABLED", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "operations-promotions", parentId: "operations", zhTWLabel: "推廣／優惠活動", internalName: "Promotions", route: "/admin/operations/promotions", requiredPermissions: ["admin.operations.promotions.read"], availability: "NOT_ENABLED", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "operations-ads", parentId: "operations", zhTWLabel: "廣告審查", internalName: "Advertising Review", route: "/admin/operations/ads", requiredPermissions: ["admin.operations.ads.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/ad-review", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "operations-sponsored", parentId: "operations", zhTWLabel: "贊助內容", internalName: "Sponsored Content", route: "/admin/operations/sponsored", requiredPermissions: ["admin.operations.sponsored.read"], availability: "DEMO", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/sponsored", semantics: "ONE_TO_ONE" }, { route: "/tags", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "operations-placements", parentId: "operations", zhTWLabel: "平台曝光版位", internalName: "Placements", route: "/admin/operations/placements", requiredPermissions: ["admin.operations.placements.read"], availability: "NOT_ENABLED", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),
  defineRoute({ id: "operations-communications", parentId: "operations", zhTWLabel: "行銷通知／訊息活動", internalName: "Marketing Communications", route: "/admin/operations/communications", requiredPermissions: ["admin.operations.communications.read"], availability: "NOT_ENABLED", dataClass: "PUBLIC", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 60 }),
  defineRoute({ id: "operations-performance", parentId: "operations", zhTWLabel: "行銷成效", internalName: "Marketing Performance", route: "/admin/operations/performance", requiredPermissions: ["admin.operations.performance.read"], availability: "NOT_ENABLED", dataClass: "AUDIT", intendedStaffDomains: ["PLATFORM_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 70 }),

  // ---------------------------------------------------------------------
  // RESTAURANT OPERATIONS -- Restaurant-centric: select a Restaurant, then
  // manage its branches/menus/dishes. Fine-grained facts (ingredients,
  // allergens, nutrition data, certification status) live under Dish/item
  // context, not as global canonical management pages. The cross-Restaurant
  // "menu-management" workspace is a queue/search/triage surface only.
  // ---------------------------------------------------------------------
  defineRoute({ id: "restaurants", parentId: null, zhTWLabel: "餐廳營運", internalName: "Restaurant Operations", route: "/admin/restaurants", requiredPermissions: ["admin.restaurants.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/menu-review", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "restaurant-verification", parentId: "restaurants", zhTWLabel: "餐廳身分驗證", internalName: "Restaurant Verification", route: "/admin/restaurants/verification", requiredPermissions: ["admin.restaurants.verification.read"], availability: "DEMO", dataClass: "RESTAURANT_PRIVATE", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "AUDIT_SECURITY"], legacyRoutes: [{ route: "/verification", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "restaurant-reviews", parentId: "restaurants", zhTWLabel: "餐廳審查", internalName: "Restaurant Reviews", route: "/admin/restaurants/reviews", requiredPermissions: ["admin.restaurants.reviews.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/restaurant-review", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 20 }),

  defineRoute({ id: "menu-management", parentId: "restaurants", zhTWLabel: "跨店菜單工作台", internalName: "Cross-Restaurant Menu Queue", route: "/admin/restaurants/menu-management", requiredPermissions: ["admin.restaurants.menu_management.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 25 }),
  defineRoute({ id: "menu-management-pending", parentId: "menu-management", zhTWLabel: "待新增餐點", internalName: "Pending Menu Items", route: "/admin/restaurants/menu-management/pending", requiredPermissions: ["admin.restaurants.menu_management.pending.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/pending-menu-items", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "menu-management-duplicates", parentId: "menu-management", zhTWLabel: "疑似重複餐點", internalName: "Suspected Duplicate Menu Items", route: "/admin/restaurants/menu-management/duplicates", requiredPermissions: ["admin.restaurants.menu_management.duplicates.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/duplicate-menu-items", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "menu-management-aliases", parentId: "menu-management", zhTWLabel: "別名／辨識異常", internalName: "Alias/Identification Anomalies", route: "/admin/restaurants/menu-management/aliases", requiredPermissions: ["admin.restaurants.menu_management.aliases.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/alias-review", semantics: "ONE_TO_ONE" }, { route: "/identification-audit", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "menu-management-nutrition-discrepancy", parentId: "menu-management", zhTWLabel: "營養差異異常", internalName: "Nutrition Discrepancy Triage", route: "/admin/restaurants/menu-management/nutrition-discrepancy", requiredPermissions: ["admin.restaurants.menu_management.nutrition_discrepancy.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "menu-management-data-quality", parentId: "menu-management", zhTWLabel: "待補資料", internalName: "Missing/Incomplete Data Queue", route: "/admin/restaurants/menu-management/data-quality", requiredPermissions: ["admin.restaurants.menu_management.data_quality.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [{ route: "/data-quality", semantics: "ONE_TO_ONE" }, { route: "/menu-review", semantics: "SPLIT" }, { route: "/tags", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 50 }),

  defineRoute({ id: "restaurant-detail", parentId: "restaurants", zhTWLabel: "餐廳詳情", internalName: "Restaurant Detail", route: "/admin/restaurants/[restaurantId]", requiredPermissions: ["admin.restaurants.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 30 }),
  defineRoute({ id: "restaurant-about", parentId: "restaurant-detail", zhTWLabel: "餐廳介紹", internalName: "Restaurant About", route: "/admin/restaurants/[restaurantId]/about", requiredPermissions: ["admin.restaurants.about.read"], availability: "NOT_ENABLED", dataClass: "PUBLIC", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-contact", parentId: "restaurant-detail", zhTWLabel: "餐廳聯絡資料", internalName: "Restaurant Contact", route: "/admin/restaurants/[restaurantId]/contact", requiredPermissions: ["admin.restaurants.contact.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 20 }),

  defineRoute({ id: "restaurant-menus", parentId: "restaurant-detail", zhTWLabel: "菜單", internalName: "Restaurant Menus", route: "/admin/restaurants/[restaurantId]/menus", requiredPermissions: ["admin.restaurants.menus.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 30 }),
  defineRoute({ id: "restaurant-menu-detail", parentId: "restaurant-menus", zhTWLabel: "菜單詳情", internalName: "Menu Detail", route: "/admin/restaurants/[restaurantId]/menus/[menuId]", requiredPermissions: ["admin.restaurants.menu.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-menu-items", parentId: "restaurant-menu-detail", zhTWLabel: "餐點", internalName: "Menu Items", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items", requiredPermissions: ["admin.restaurants.menu_items.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-menu-item-detail", parentId: "restaurant-menu-items", zhTWLabel: "餐點詳情", internalName: "Dish/Item Detail", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]", requiredPermissions: ["admin.restaurants.menu_item.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS", "DATA_CONTENT_QUALITY"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-item-nutrition", parentId: "restaurant-menu-item-detail", zhTWLabel: "營養資料", internalName: "Item Nutrition Data", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition", requiredPermissions: ["admin.restaurants.menu_item.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),
  defineRoute({ id: "restaurant-item-ingredients", parentId: "restaurant-menu-item-detail", zhTWLabel: "食材", internalName: "Item Ingredients", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/ingredients", requiredPermissions: ["admin.restaurants.menu_item.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 20 }),
  defineRoute({ id: "restaurant-item-allergens", parentId: "restaurant-menu-item-detail", zhTWLabel: "過敏原", internalName: "Item Allergens", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/allergens", requiredPermissions: ["admin.restaurants.menu_item.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 30 }),
  defineRoute({ id: "restaurant-item-certification", parentId: "restaurant-menu-item-detail", zhTWLabel: "營養認證狀態", internalName: "Item Certification Status", route: "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/certification", requiredPermissions: ["admin.restaurants.menu_item.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["RESTAURANT_OPERATIONS", "NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 40 }),

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

  // ---------------------------------------------------------------------
  // NUTRITION PROFESSIONAL MANAGEMENT -- professional Nutritionist work.
  // Landing priority: My Work, Restaurant Nutrition Certification, Member
  // Nutrition Management, Nutrition Standards and Scoring, Assignment
  // management. Restaurant menu data appears only as shortcuts/search.
  // ---------------------------------------------------------------------
  defineRoute({ id: "nutrition", parentId: null, zhTWLabel: "營養專業管理", internalName: "Nutrition Professional Management", route: "/admin/nutrition", requiredPermissions: ["admin.nutrition.read"], availability: "DEMO", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS", "NUTRITION_OPERATIONS_LEAD"], legacyRoutes: [{ route: "/exercise-governance", semantics: "DEFER" }], navigationVisibility: "ORDINARY", order: 35 }),

  defineRoute({ id: "nutrition-my-work", parentId: "nutrition", zhTWLabel: "我的工作", internalName: "My Work", route: "/admin/nutrition/my-work", requiredPermissions: ["admin.nutrition.my_work.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "nutrition-my-work-restaurants", parentId: "nutrition-my-work", zhTWLabel: "我的餐廳", internalName: "My Restaurants", route: "/admin/nutrition/my-work/restaurants", requiredPermissions: ["admin.nutrition.my_work.restaurants.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "nutrition-my-work-cases", parentId: "nutrition-my-work", zhTWLabel: "我的案件", internalName: "My Cases", route: "/admin/nutrition/my-work/cases", requiredPermissions: ["admin.nutrition.my_work.cases.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "nutrition-my-work-members", parentId: "nutrition-my-work", zhTWLabel: "已授權會員", internalName: "Authorized Members", route: "/admin/nutrition/my-work/members", requiredPermissions: ["admin.nutrition.my_work.members.read"], availability: "NOT_ENABLED", dataClass: "HEALTH_PERSONAL_NUTRITION", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),

  defineRoute({ id: "nutrition-certification", parentId: "nutrition", zhTWLabel: "餐廳營養認證", internalName: "Restaurant Nutrition Certification", route: "/admin/nutrition/certification", requiredPermissions: ["admin.nutrition.certification.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "nutrition-certification-pending", parentId: "nutrition-certification", zhTWLabel: "待認證餐點", internalName: "Pending Certification", route: "/admin/nutrition/certification/pending", requiredPermissions: ["admin.nutrition.certification.pending.read"], availability: "DEMO", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "RESTAURANT_OPERATIONS"], legacyRoutes: [{ route: "/nutrition-review", semantics: "ONE_TO_ONE" }, { route: "/menu-review", semantics: "SPLIT" }], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "nutrition-certification-discrepancy", parentId: "nutrition-certification", zhTWLabel: "營養差距申報", internalName: "Nutrition Discrepancy Reports", route: "/admin/nutrition/certification/discrepancy-reports", requiredPermissions: ["admin.nutrition.certification.discrepancy_reports.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "nutrition-certification-remote-review", parentId: "nutrition-certification", zhTWLabel: "遠端餐廳審核", internalName: "Remote Restaurant Review", route: "/admin/nutrition/certification/remote-review", requiredPermissions: ["admin.nutrition.certification.remote_review.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "nutrition-certification-history", parentId: "nutrition-certification", zhTWLabel: "認證紀錄", internalName: "Certification History", route: "/admin/nutrition/certification/history", requiredPermissions: ["admin.nutrition.certification.history.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "nutrition-certification-re-review", parentId: "nutrition-certification", zhTWLabel: "需重新審核", internalName: "Requires Re-Review", route: "/admin/nutrition/certification/re-review", requiredPermissions: ["admin.nutrition.certification.re_review.read"], availability: "NOT_ENABLED", dataClass: "RESTAURANT_OPERATIONAL", intendedStaffDomains: ["NUTRITION_OPERATIONS", "RESTAURANT_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),

  defineRoute({ id: "nutrition-members", parentId: "nutrition", zhTWLabel: "會員營養管理", internalName: "Member Nutrition Management", route: "/admin/nutrition/members", requiredPermissions: ["admin.nutrition.members.read"], availability: "NOT_ENABLED", dataClass: "HEALTH_PERSONAL_NUTRITION", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "nutrition-member-detail", parentId: "nutrition-members", zhTWLabel: "會員營養管理", internalName: "Member Nutrition Case Detail", route: "/admin/nutrition/members/[memberRef]", requiredPermissions: ["admin.nutrition.members.detail.read"], availability: "NOT_ENABLED", dataClass: "HEALTH_PERSONAL_NUTRITION", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "CONTEXTUAL", order: 10 }),

  defineRoute({ id: "nutrition-standards", parentId: "nutrition", zhTWLabel: "營養標準與評分", internalName: "Nutrition Standards and Scoring", route: "/admin/nutrition/standards", requiredPermissions: ["admin.nutrition.standards.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "nutrition-standards-scoring", parentId: "nutrition-standards", zhTWLabel: "營養評分依據", internalName: "Scoring Basis", route: "/admin/nutrition/standards/scoring", requiredPermissions: ["admin.nutrition.standards.scoring.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "nutrition-standards-recommendation", parentId: "nutrition-standards", zhTWLabel: "推薦判定規則", internalName: "Recommendation Criteria", route: "/admin/nutrition/standards/recommendation", requiredPermissions: ["admin.nutrition.standards.recommendation.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "nutrition-standards-parameters", parentId: "nutrition-standards", zhTWLabel: "重要營養參數", internalName: "Important Nutrition Parameters", route: "/admin/nutrition/standards/parameters", requiredPermissions: ["admin.nutrition.standards.parameters.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),

  defineRoute({ id: "nutrition-assignments", parentId: "nutrition", zhTWLabel: "分派管理", internalName: "Nutrition Assignment Management", route: "/admin/nutrition/assignments", requiredPermissions: ["admin.nutrition.assignments.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS_LEAD"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),
  defineRoute({ id: "nutrition-assignments-nutritionists", parentId: "nutrition-assignments", zhTWLabel: "營養師名單", internalName: "Nutritionist Roster", route: "/admin/nutrition/assignments/nutritionists", requiredPermissions: ["admin.nutrition.assignment.nutritionists.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS_LEAD", "NUTRITION_OPERATIONS"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 10 }),
  defineRoute({ id: "nutrition-assignments-regions", parentId: "nutrition-assignments", zhTWLabel: "區域覆蓋", internalName: "Region Default Coverage", route: "/admin/nutrition/assignments/regions", requiredPermissions: ["admin.nutrition.assignment.region.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS_LEAD"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 20 }),
  defineRoute({ id: "nutrition-assignments-restaurants", parentId: "nutrition-assignments", zhTWLabel: "餐廳分派", internalName: "Restaurant/Branch Assignment", route: "/admin/nutrition/assignments/restaurants", requiredPermissions: ["admin.nutrition.assignment.restaurant.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS_LEAD"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 30 }),
  defineRoute({ id: "nutrition-assignments-cases", parentId: "nutrition-assignments", zhTWLabel: "案件分派", internalName: "Case-Specific Override", route: "/admin/nutrition/assignments/cases", requiredPermissions: ["admin.nutrition.assignment.case.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS_LEAD"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 40 }),
  defineRoute({ id: "nutrition-assignments-workload", parentId: "nutrition-assignments", zhTWLabel: "工作量", internalName: "Workload", route: "/admin/nutrition/assignments/workload", requiredPermissions: ["admin.nutrition.assignment.workload.read"], availability: "NOT_ENABLED", dataClass: "NUTRITION_GOVERNANCE", intendedStaffDomains: ["NUTRITION_OPERATIONS_LEAD"], legacyRoutes: [], navigationVisibility: "ORDINARY", order: 50 }),

  defineRoute({ id: "nutrition-self-cooked-quality", parentId: "nutrition", zhTWLabel: "自煮辨識品質", internalName: "Self-Cooked Estimation Quality", route: "/admin/nutrition/self-cooked-quality", requiredPermissions: ["admin.nutrition.self_cooked_quality.read"], availability: "DEMO", dataClass: "HEALTH_PERSONAL_NUTRITION", intendedStaffDomains: ["NUTRITION_OPERATIONS"], legacyRoutes: [{ route: "/self-cooked-audit", semantics: "ONE_TO_ONE" }], navigationVisibility: "ORDINARY", order: 60 }),

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
  "business-development",
  "operations",
  "restaurants",
  "nutrition",
  "members",
  "social",
  "audit",
  "management",
  "engineering"
] as const satisfies readonly AdminRouteId[];

/**
 * Cross-workspace shortcuts. A shortcut is a typed pointer to an EXISTING
 * canonical route ID -- it never defines a new route, never duplicates a
 * page implementation, and never creates a second authority for the same
 * feature. `targetRouteId` is typed as `AdminRouteId`, so a shortcut can only
 * ever reference a route already declared in `ADMIN_ROUTE_REGISTRY`. Targets
 * must not point at obsolete global detail pages (e.g. a global Ingredients
 * or Allergens management page) -- those facts now live under Restaurant/
 * Dish context, and shortcuts point at the Restaurant list or the
 * cross-Restaurant queue/search surface instead.
 */
export type AdminWorkspaceShortcut = Readonly<{
  id: string;
  sourceWorkspaceId: AdminRouteId;
  targetRouteId: AdminRouteId;
  label: string;
  order: number;
}>;

export const ADMIN_WORKSPACE_SHORTCUTS: readonly AdminWorkspaceShortcut[] = [
  { id: "nutrition-shortcut-restaurant-list", sourceWorkspaceId: "nutrition", targetRouteId: "restaurants", label: "餐廳清單", order: 10 },
  { id: "nutrition-shortcut-menu-queue", sourceWorkspaceId: "nutrition", targetRouteId: "menu-management", label: "跨店菜單工作台", order: 20 },
  { id: "nutrition-shortcut-nutrition-discrepancy-queue", sourceWorkspaceId: "nutrition", targetRouteId: "menu-management-nutrition-discrepancy", label: "營養差異異常（跨店觸發）", order: 30 }
];

export const MENU_IDENTIFICATION_VS_NUTRITION_ESTIMATION_BOUNDARY = {
  menuItemIdentificationAndAliasQuality: "Restaurant/menu-item identity and alias quality is menu content, owned by Restaurant Operations -> Menu/Dish context (surfaced as a cross-Restaurant queue for triage).",
  selfCookedEstimationQuality: "Self-cooked meal identification and nutrition-estimation quality concerns professional nutrition-estimation accuracy, not restaurant menu content; it remains under Nutrition Professional Management.",
  rationale: "Similar naming ('identification quality' vs 'self-cooked quality') does not imply shared ownership. Ownership follows subject matter, not label similarity."
} as const;

export const FUTURE_MEMBER_NUTRITION_FIELD_ADJUSTMENT_PRINCIPLES = {
  requiresExplicitMemberConsent: true,
  requiresAssignedAuthorizedNutritionist: true,
  editableFieldsAreFixedAllowlist: true,
  noGenericProfileEditor: true,
  recordsOldAndNewValue: true,
  recordsReason: true,
  recordsNutritionistIdentity: true,
  recordsTimestamp: true,
  usesVersionOrCasWhereApplicable: true,
  writesArePrivatelyAudited: true,
  accessIsRevocable: true
} as const;

export const NUTRITION_CERTIFICATION_QUEUE_SEMANTICS = {
  dishExistenceAloneDoesNotImplyReview: true,
  entryTriggers: [
    "restaurant requests professional nutrition certification",
    "platform policy requires professional certification for a specific case",
    "a user/report indicates the system-recommended dish nutrition value may differ materially from expected reality",
    "an already-certified dish changes in a way requiring re-review"
  ],
  futureGovernedOutcomes: ["approve", "correct", "request more information", "require recalculation", "require re-review"],
  implementedInThisPhase: "workspace/placeholder semantics only; no certification mutation authority exists"
} as const;

export const REMOTE_RESTAURANT_REVIEW_BOUNDARY = {
  canonicalRoute: "/admin/nutrition/certification/remote-review",
  description: "Future professional Restaurant-Nutritionist remote review workflow.",
  notImplemented: ["video calling", "chat", "real-time collaboration", "restaurant access", "nutrition writes", "certification mutation"]
} as const;

/**
 * IA/domain vocabulary only for the future Restaurant commercial lifecycle.
 * No database enum exists yet; Business Development R2 is IA/UI only.
 */
export const BUSINESS_DEVELOPMENT_COMMERCIAL_LIFECYCLE = [
  { key: "UNCONTACTED", zhTW: "尚未接觸" },
  { key: "CONTACTED", zhTW: "已接觸" },
  { key: "INTERESTED", zhTW: "有興趣" },
  { key: "EVALUATING", zhTW: "評估中" },
  { key: "NEGOTIATING", zhTW: "洽談中" },
  { key: "PREPARING_CONTRACT", zhTW: "準備簽約" },
  { key: "SIGNED", zhTW: "已簽約" },
  { key: "ONBOARDING", zhTW: "導入中" },
  { key: "ACTIVE_PARTNER", zhTW: "正式合作" },
  { key: "PAUSED", zhTW: "暫停" },
  { key: "LOST", zhTW: "流失" }
] as const;

export const BUSINESS_DEVELOPMENT_FUTURE_DATA_PRINCIPLES = {
  futureRecordFields: [
    "responsible sales owner", "latest contact time", "next follow-up date", "interest level",
    "commercial notes", "contract start date", "contract end date", "renewal reminder",
    "escalation-needed flag", "commercial lifecycle status"
  ],
  writesImplementedInThisPhase: false
} as const;

/**
 * Before onboarding a business may exist only as a Prospect/Lead. After
 * conversion/onboarding, the commercial record links to the SAME canonical
 * `restaurant_id` -- Business Development never creates a second Restaurant
 * operational master record.
 */
export const PROSPECT_VS_CANONICAL_RESTAURANT_BOUNDARY = {
  beforeOnboarding: "Prospect / Lead record only; no canonical restaurant_id yet.",
  afterOnboarding: "Commercial record links to the canonical restaurant_id; commercial history remains linked.",
  conceptualFlow: ["Prospect", "conversion", "canonical Restaurant", "commercial history remains linked"],
  createsDuplicateRestaurantMasterRecord: false
} as const;

export const BUSINESS_DEVELOPMENT_RESTAURANT_OPERATIONS_BOUNDARY = {
  businessDevelopmentOwns: ["commercial relationship", "sales contact", "negotiation", "contract", "renewal", "sales ownership"],
  restaurantOperationsOwns: ["Restaurant operational master data", "branches", "menus", "hours", "contact", "GEO", "operational status"],
  sameCanonicalRestaurantReferencedByBoth: true,
  duplicateMasterRecord: false
} as const;

export const BUSINESS_DEVELOPMENT_VS_PLATFORM_OPERATIONS_BOUNDARY = {
  businessDevelopment: ["Restaurant prospecting", "negotiation", "contracts", "renewals"],
  platformOperationsMarketing: [
    "campaigns", "platform promotions", "advertising", "sponsored content", "platform placements",
    "marketing communications", "growth operations", "aggregate marketing reporting"
  ],
  salesAndMarketingMerged: false
} as const;

export const RESTAURANT_CAMPAIGN_PARTICIPATION_BOUNDARY = {
  campaignCanonicalOwner: "operations",
  restaurantMasterDataOwner: "restaurants",
  commercialRelationshipOwner: "business-development",
  referencesCanonicalRestaurantId: true,
  duplicateRestaurantRecord: false
} as const;

export const MARKETING_PRIVACY_BOUNDARY = {
  mayAccess: ["governed campaign/aggregate data"],
  mustNotRoutinelyAccess: [
    "raw member health data", "member meal history", "private Social content", "precise private GEO",
    "push tokens", "auth/session secrets", "Nutritionist consultation notes"
  ],
  pushDistinction: {
    platformOperations: "marketing Push campaign intent / schedule",
    engineering: "Push delivery diagnostics / failures / infrastructure",
    marketingHasRawPushTokenAccess: false
  }
} as const;

export const BUSINESS_DEVELOPMENT_PRIVACY_BOUNDARY = {
  mayAccess: ["commercial Restaurant contacts", "follow-up history", "contract lifecycle data"],
  mustNotRoutinelyAccess: [
    "member health data", "member meal history", "private Social", "auth secrets",
    "push tokens", "Nutritionist consultation records"
  ]
} as const;

export const BUSINESS_DEVELOPMENT_CONTRACT_PLACEHOLDER_BOUNDARY = {
  futureFields: ["contract start", "contract end", "renewal due", "responsible sales owner", "next follow-up"],
  notImplementedInR2: [
    "contract file upload", "signature", "billing", "invoice", "payment",
    "renewal mutation", "notification execution"
  ]
} as const;

export const CROSS_RESTAURANT_QUEUE_COPY_ZH_TW =
  "此區用於跨店待處理事項；實際資料維護請進入該餐廳／菜單／餐點。" as const;

/**
 * Frozen future Nutritionist assignment precedence (IA only; no DB
 * implementation, no mutation, no roster). Lower-level explicit assignment
 * always outranks a broader default -- never the reverse.
 */
export const NUTRITION_ASSIGNMENT_PRECEDENCE = [
  { rank: 1, key: "REGION_DEFAULT_COVERAGE", zhTW: "區域預設", description: "Broad routing/default; not permanent exclusive territorial ownership." },
  { rank: 2, key: "RESTAURANT_BRANCH_ASSIGNMENT", zhTW: "餐廳／分店指定", description: "Explicit Restaurant/Branch assignment; overrides Region default." },
  { rank: 3, key: "CASE_SPECIFIC_OVERRIDE", zhTW: "單一案件 override", description: "Highest precedence; overrides Restaurant/Branch assignment for one case." }
] as const;

export const NUTRITION_ASSIGNMENT_REASONS = {
  restaurantBranchAssignment: ["chain-brand continuity", "specialist expertise", "workload balance", "scheduling", "leave coverage", "contractual relationship", "operational continuity"],
  caseSpecificOverride: ["specialist review", "temporary cover", "workload balancing", "escalation", "second opinion"]
} as const;

export const NUTRITIONIST_VS_NUTRITION_LEAD_BOUNDARY = {
  ordinaryNutritionistSees: ["我的餐廳", "我的案件", "已授權會員"],
  ordinaryNutritionistManagesAssignments: false,
  nutritionOperationsLeadMayManage: ["區域覆蓋", "餐廳／分店分派", "案件分派", "工作量調整"],
  dbRoleCreatedInThisPhase: false,
  inputToP3: true
} as const;

/**
 * Sales ownership (Business Development) and Nutritionist professional
 * assignment are separate permission domains and must never be confused.
 */
export const SALES_OWNERSHIP_VS_NUTRITION_ASSIGNMENT_BOUNDARY = {
  businessDevelopment: ["responsible sales owner", "commercial follow-up", "contract renewal"],
  nutritionAssignment: ["region coverage", "Restaurant/Branch nutrition assignment", "nutrition case assignment"],
  samePermissionDomain: false
} as const;

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

  const shortcutIds = new Set<string>();
  const shortcutOrdersBySource = new Map<string, number[]>();
  for (const shortcut of ADMIN_WORKSPACE_SHORTCUTS) {
    if (shortcutIds.has(shortcut.id)) errors.push(`duplicate shortcut id: ${shortcut.id}`);
    shortcutIds.add(shortcut.id);
    if (!ids.has(shortcut.sourceWorkspaceId)) errors.push(`shortcut source route missing: ${shortcut.id}`);
    if (!ids.has(shortcut.targetRouteId)) errors.push(`shortcut target route missing: ${shortcut.id}`);
    if (shortcut.targetRouteId === shortcut.sourceWorkspaceId) errors.push(`shortcut self-cycle: ${shortcut.id}`);
    let ancestor: AdminRouteDefinition | undefined = routeById.get(shortcut.targetRouteId);
    while (ancestor && ancestor.parentId !== null) ancestor = routeById.get(ancestor.parentId);
    if (ancestor && ancestor.id === shortcut.sourceWorkspaceId) {
      errors.push(`shortcut does not cross workspaces (target already under source): ${shortcut.id}`);
    }
    const orders = shortcutOrdersBySource.get(shortcut.sourceWorkspaceId) ?? [];
    orders.push(shortcut.order);
    shortcutOrdersBySource.set(shortcut.sourceWorkspaceId, orders);
  }
  for (const [sourceWorkspaceId, orders] of shortcutOrdersBySource) {
    if (!orders.every((order, index) => index === 0 || order > orders[index - 1]!)) {
      errors.push(`shortcut ordering is not deterministic for source: ${sourceWorkspaceId}`);
    }
  }

  const actualCurrent = ADMIN_PERMISSION_REGISTRY.filter((permission) => permission.status === "CURRENT").map((permission) => permission.key).sort();
  const expectedCurrent = [...CURRENT_ADMIN_PERMISSION_KEYS].sort();
  if (JSON.stringify(actualCurrent) !== JSON.stringify(expectedCurrent)) errors.push("CURRENT permission vocabulary is broader than repository authority");

  const forbiddenEngineeringClasses = new Set<AdminDataClass>([
    "RESTAURANT_PRIVATE", "MEMBER_ACCOUNT", "USER_PRIVATE", "HEALTH_PERSONAL_NUTRITION",
    "PRIVATE_SOCIAL", "SECURITY_AUTH", "BREAK_GLASS_ONLY", "COMMERCIAL_RELATIONSHIP"
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

  const forbiddenGlobalDetailRouteIds = new Set([
    "menu-management-items", "menu-management-ingredients", "menu-management-allergens",
    "menu-management-nutrition-data", "menu-management-certification-status"
  ]);
  for (const id of forbiddenGlobalDetailRouteIds) {
    if (ids.has(id)) errors.push(`obsolete global canonical detail page must not exist: ${id}`);
  }

  return errors;
}
