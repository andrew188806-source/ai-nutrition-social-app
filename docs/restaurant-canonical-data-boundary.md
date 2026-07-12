# Restaurant Canonical Data Boundary

TastKind / 好廚 uses `packages/shared/src/domain/restaurantDomain.ts` as the canonical restaurant data model for restaurant, branch, menu, menu item, nutrition, recommendation, analytics, employee, assistant draft, and audit entities.

## Mobile App

Reads canonical:

- `Restaurant`
- `RestaurantBranch`
- `MenuItem`
- `BranchMenuItem`
- `MenuItemNutrition`
- `RecommendationResult`

Writes canonical-linked:

- `MealRecord`
- `MenuItemRating`
- favorite and behavior `AnalyticsEvent`
- user input that may become `PendingMenuItem`

Mobile display fields such as restaurant name or menu item name are derived from canonical IDs. They are compatibility fields only and must not become primary keys.

## Restaurant Console

Reads and maintains:

- restaurant and branch profile
- menu, category, formal menu items, branch menu item availability
- ingredients and official nutrition
- menu item aliases
- pending menu item resolution
- restaurant performance analytics
- employee assignment and role scope

Restaurant Console uses `apps/restaurant-web/adapters/mock/restaurant-console-mock-adapter.ts` today. The adapter reads shared mock data and can be replaced by a Supabase adapter without changing UI components.

## Admin Console

Reviews and governs:

- restaurant verification
- duplicate menu items
- nutrition quality
- aliases and pending menu items
- AI outliers
- platform policy and audit logs

Admin decisions should update canonical entities or review records by stable ID.

## Required ID Rules

- `MenuItem` is the formal dish identity.
- `BranchMenuItem` stores branch-specific price, availability, sold-out state, and local copy.
- `MenuItemAlias` maps user input, AI detected names, legacy names, and typos back to a formal `menuItemId`.
- `NutritionEstimate` is AI suggestion history and never overwrites `MenuItemNutrition` directly.
- Dashboard, analytics, and menu performance are derived from `AnalyticsEvent`.
- Recommendations reference `restaurantId`, `branchId`, and `menuItemId`; they do not copy dish objects.
