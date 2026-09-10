export const BASELINE = "90769e8e8264711c8da63f3dd0870491a457cbb3";
export const MIGRATION = "supabase/migrations/20260910020000_restaurant_owner_public_website_authority.sql";
export const SUBJECT = "Add restaurant public website authority";
export const PATHS = Object.freeze([
  "apps/mobile/app/restaurants.tsx",
  "apps/mobile/features/restaurants/catalog/mapper.ts",
  "apps/mobile/features/restaurants/catalog/mockRepository.ts",
  "apps/mobile/features/restaurants/catalog/rowContract.ts",
  "apps/mobile/features/restaurants/catalog/types.ts",
  "apps/restaurant-web/app/api/restaurant/settings/public-website/route.ts",
  "apps/restaurant-web/app/restaurant/settings/page.tsx",
  "apps/restaurant-web/components/settings/RestaurantOwnerPublicWebsiteControl.tsx",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-public-website-repository.ts",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-rpc-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-public-website-client.ts",
  "apps/restaurant-web/runtime/restaurant-owner-public-website.ts",
  "apps/restaurant-web/runtime/restaurant-rpc-contracts.ts",
  "apps/restaurant-web/runtime/restaurant-rpc-mappers.ts",
  "apps/restaurant-web/server/restaurant-owner-public-website-runtime.ts",
  "package.json",
  "scripts/consumer-public-restaurant-catalog-smoke.mjs",
  "scripts/restaurant-owner-public-website-ra-2i-p1b-contract.mjs",
  "scripts/restaurant-owner-public-website-ra-2i-p1b-guard.mjs",
  "scripts/restaurant-owner-public-website-ra-2i-p1b-mutations.mjs",
  "scripts/restaurant-owner-public-website-ra-2i-p1b-postgres-apply.mjs",
  "scripts/restaurant-owner-public-website-ra-2i-p1b-smoke.mjs",
  MIGRATION
]);
