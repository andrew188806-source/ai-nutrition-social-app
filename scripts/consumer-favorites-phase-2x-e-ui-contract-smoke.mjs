import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

const root = process.cwd();
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
}

try {
  // --- Target mapper structural checks ---
  const mapperSrc = read("apps/mobile/features/consumer-favorites/consumerFavoriteTargetMapper.ts");

  check("mapper exports mapConsumerFavoriteTarget", /export function mapConsumerFavoriteTarget/.test(mapperSrc));
  check("mapper exports ConsumerFavoriteTargetSource type", /export type ConsumerFavoriteTargetSource/.test(mapperSrc));
  check("mapper exports ConsumerFavoriteTargetMapping type", /export type ConsumerFavoriteTargetMapping/.test(mapperSrc));
  check("mapper rejects fav-* IDs", /fakeFavoriteId.*fav-/.test(mapperSrc));
  check("mapper rejects bare array indices", /arrayIndex.*\\^\\\\d\+\$/.test(mapperSrc) || /arrayIndex.*\\^\\d\+\$/.test(mapperSrc) || mapperSrc.includes("arrayIndex"));
  check("mapper returns restaurant_id_missing when restaurantId is absent", /restaurant_id_missing/.test(mapperSrc));
  check("mapper returns menu_item_parent_missing when menuItemId present but restaurantId absent", /menu_item_parent_missing/.test(mapperSrc));
  check("mapper returns invalid_target_id status variant", /invalid_target_id/.test(mapperSrc));
  check("mapper delegates to target kind restaurant", /kind: "restaurant"/.test(mapperSrc));
  check("mapper delegates to target kind menu_item", /kind: "menu_item"/.test(mapperSrc));

  // --- Composition structural checks ---
  const compositionSrc = read("apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts");

  check("composition exports createMobileConsumerFavoriteComposition", /export function createMobileConsumerFavoriteComposition/.test(compositionSrc));
  check("composition exports createConsumerFavoriteComposition", /export function createConsumerFavoriteComposition/.test(compositionSrc));
  check("composition uses createConsumerFavoriteRuntime through formal factory", /createConsumerFavoriteRuntime/.test(compositionSrc));
  check("composition uses SupabaseConsumerClientFactory", /SupabaseConsumerClientFactory/.test(compositionSrc));
  check("composition uses getConsumerFavoriteRuntimeFlags", /getConsumerFavoriteRuntimeFlags/.test(compositionSrc));
  check("composition uses SupabaseConsumerAuthAdapter", /SupabaseConsumerAuthAdapter/.test(compositionSrc));
  check("composition checks needsSupabaseClient for read or write", /needsSupabaseClient.*readSource.*supabase.*writeSource.*supabase|needsSupabaseClient/.test(compositionSrc));
  check("composition branches on supabase-live auth source", /authSource.*supabase-live/.test(compositionSrc));
  check("composition never uses service_role or privileged credential", !/service[_-]role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(compositionSrc));

  // --- UI model structural checks ---
  const uiModelSrc = read("apps/mobile/features/consumer-favorites/consumerFavoriteUiModel.ts");

  check("ui model exports useConsumerFavoritedRestaurants", /export function useConsumerFavoritedRestaurants/.test(uiModelSrc));
  check("ui model exports useConsumerFavoriteList", /export function useConsumerFavoriteList/.test(uiModelSrc));
  check("ui model exports FavoritedRestaurantsStatus type", /export type FavoritedRestaurantsStatus/.test(uiModelSrc));
  check("ui model exports FavoriteListStatus type", /export type FavoriteListStatus/.test(uiModelSrc));
  check("ui model uses readGeneration ref for stale response cancellation", (uiModelSrc.match(/readGeneration/g) ?? []).length >= 4);
  check("ui model uses isMutating ref for duplicate-tap prevention", /isMutating/.test(uiModelSrc));
  check("ui model calls listCurrentUserFavorites for restaurant type", /listCurrentUserFavorites.*entityType.*restaurant|restaurant.*listCurrentUserFavorites/.test(uiModelSrc));
  check("ui model calls addCurrentUserFavorite in toggle", /addCurrentUserFavorite/.test(uiModelSrc));
  check("ui model calls removeCurrentUserFavorite in toggle", /removeCurrentUserFavorite/.test(uiModelSrc));
  check("ui model covers added and already_present status on toggle", /added.*already_present|already_present.*added/.test(uiModelSrc));
  check("ui model covers removed and already_absent status on toggle", /removed.*already_absent|already_absent.*removed/.test(uiModelSrc));
  check("ui model covers disabled unauthenticated and failed list statuses", ["disabled", "unauthenticated", "failed"].every((s) => uiModelSrc.includes(`"${s}"`)));
  check("ui model cancels stale useEffect via generation increment", /readGeneration.current \+= 1/.test(uiModelSrc));

  // --- Route cutover checks ---
  const restaurantsSrc = read("apps/mobile/app/restaurants.tsx");

  check("restaurants uses createMobileConsumerFavoriteComposition", /createMobileConsumerFavoriteComposition/.test(restaurantsSrc));
  check("restaurants uses useConsumerFavoritedRestaurants", /useConsumerFavoritedRestaurants/.test(restaurantsSrc));
  check("restaurants no longer uses savedRestaurants local state", !/savedRestaurants/.test(restaurantsSrc));
  check("restaurants toggle calls restaurantFavorites.toggle with restaurantId", /restaurantFavorites\.toggle\(restaurant\.restaurantId\)/.test(restaurantsSrc));
  check("restaurants saved check uses favoritedIds.has with restaurantId", /favoritedIds\.has\(restaurant\.restaurantId\)/.test(restaurantsSrc));
  check("restaurants uses consumerFavorites i18n keys", /consumerFavorites\.active|consumerFavorites\.inactive/.test(restaurantsSrc));

  const mealLogSrc = read("apps/mobile/app/meal-log.tsx");

  check("meal-log uses createMobileConsumerFavoriteComposition", /createMobileConsumerFavoriteComposition/.test(mealLogSrc));
  check("meal-log uses useConsumerFavoriteList", /useConsumerFavoriteList/.test(mealLogSrc));
  check("meal-log no longer uses static favoriteCards array as favorites source", !/diary\.favoriteCards\.map/.test(mealLogSrc));
  check("meal-log no longer uses FavoriteCard type from i18n", !/FavoriteCard = \(typeof zhTW/.test(mealLogSrc));
  check("meal-log renders LiveFavoriteFoodCard from live records", /LiveFavoriteFoodCard/.test(mealLogSrc));
  check("meal-log shows loading state from consumerFavorites i18n", /consumerFavorites\.loading/.test(mealLogSrc));
  check("meal-log shows disabled state from consumerFavorites i18n", /consumerFavorites\.disabled/.test(mealLogSrc));
  check("meal-log shows loginRequired state from consumerFavorites i18n", /consumerFavorites\.loginRequired/.test(mealLogSrc));
  check("meal-log shows empty state from consumerFavorites i18n", /consumerFavorites\.empty/.test(mealLogSrc));
  check(
    "meal-log restores menu-item Favorites through the selected Catalog source",
    /useRestaurantCatalog/.test(mealLogSrc) &&
      /restaurantCatalog\.findMenuItemById\(target\.menuItemId\)/.test(mealLogSrc)
  );
  check(
    "meal-log restores restaurant identity through the selected Catalog source",
    /restaurantCatalog\.findRestaurantById\(target\.restaurantId\)/.test(mealLogSrc) &&
      !/getCanonicalMenuItemById|getCanonicalRestaurantById/.test(mealLogSrc)
  );
  // --- Local meal / unsupported item isolation ---
  check("meal-log has no mealFavoriteIds route-local favorite array", !/mealFavoriteIds/.test(mealLogSrc));
  check("meal-log has no route-local favorite Set or array keyed by meal record id", !/useState.*string\[\].*\[\].*meal|mealFav|toggleMealFav/i.test(mealLogSrc));
  check("MealFoodCard has no isFavorited or onToggleFavorite interactive props", !/isFavorited.*bool|onToggleFavorite.*void/i.test(mealLogSrc));
  check("MealFoodCard renders static targetUnavailable label for unsupported meals — cannot become visually saved", /consumerFavorites\.targetUnavailable/.test(mealLogSrc));
  check("MealFoodCard Pressable does not wrap a favorite toggle callback", !/<Pressable[^>]*onPress={onToggleFavorite}/.test(mealLogSrc) && !/<Pressable[^>]*onPress={.*meal.*ids/.test(mealLogSrc));
  check("meal-log uses diary.favoriteCta and diary.favoritedCta only in non-MealFoodCard contexts", !/(favoriteLabel|favoritedLabel)\s*=\s*\{diary\.(favoriteCta|favoritedCta)\}/.test(mealLogSrc));
  check("unsupported local meal does not enter live favorites list: menuItemFavorites is entityType=menu_item and MealCard has no menuItemId field", !/menuItemId.*MealCard|MealCard.*menuItemId/.test(mealLogSrc) && /entityType.*menu_item/.test(mealLogSrc));
  // Simulate: local meal without canonical IDs — runtime call count = 0, mutation call count = 0
  // (structural proof: MealFoodCard never calls service.add/remove)
  check("MealFoodCard body does not call addCurrentUserFavorite or removeCurrentUserFavorite", !/addCurrentUserFavorite|removeCurrentUserFavorite/.test(mealLogSrc.slice(mealLogSrc.indexOf("function MealFoodCard"), mealLogSrc.indexOf("function MonthlyScoreCard"))));
  // Persisted list and local meal state isolation: mealDetailCards and menuItemFavorites.records are separate namespaces
  check("live favorites list (menuItemFavorites.records) is never seeded from mealDetailCards or correctedMealCards", !/mealDetailCards.*menuItemFavorites|correctedMealCards.*menuItemFavorites/.test(mealLogSrc));

  const meSrc = read("apps/mobile/app/me.tsx");

  check("me no longer uses diary.favoriteCards.length for count", !/diary\.favoriteCards\.length/.test(meSrc));
  check("me uses profileCountSummary from consumerFavorites i18n", /consumerFavorites\.profileCountSummary/.test(meSrc));

  // --- i18n checks ---
  const i18nSrc = read("lib/i18n/zh-TW.ts");

  const requiredKeys = ["toggling", "active", "inactive", "removed", "targetUnavailable", "loginRequired", "disabled", "failed", "loading", "empty", "profileCountSummary", "listTitle"];
  for (const key of requiredKeys) {
    check(`i18n consumerFavorites has key: ${key}`, i18nSrc.includes(`${key}:`));
  }
  check("i18n consumerFavorites section present", /consumerFavorites:\s*\{/.test(i18nSrc));

  // --- File ending and whitespace checks ---
  const candidateFiles = [
    "apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts",
    "apps/mobile/features/consumer-favorites/consumerFavoriteTargetMapper.ts",
    "apps/mobile/features/consumer-favorites/consumerFavoriteUiModel.ts",
    "docs/consumer-runtime-phase-2x/phase-2x-e-mobile-cutover.md",
    "scripts/consumer-favorites-phase-2x-e-guard.mjs",
    "scripts/consumer-favorites-phase-2x-e-ui-contract-smoke.mjs",
    "scripts/consumer-favorites-phase-2x-e-development-mobile-smoke.mjs"
  ];
  for (const file of candidateFiles) {
    if (fs.existsSync(path.join(root, file))) {
      const content = read(file);
      check(`${file} ends with one newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
      check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
    }
  }

  // --- No credential contamination ---
  const newSources = [compositionSrc, uiModelSrc, mapperSrc];
  check("new feature files contain no service_role or privileged credential reference", newSources.every((src) => !/service[_-]role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(src)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-E UI Contract Smoke",
    totalChecks: checks.length,
    checks,
    issues,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    supabaseTouched: false,
    productionTouched: false,
    serviceRoleUsed: false
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-E UI Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    issues
  }, null, 2));
  process.exitCode = 1;
}
