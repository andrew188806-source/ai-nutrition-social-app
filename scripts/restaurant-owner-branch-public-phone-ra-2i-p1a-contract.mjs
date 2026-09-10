export const BASELINE = "e3f1fd8accde71562934bddc8169d60d147e6649";
export const MIGRATION = "supabase/migrations/20260910010000_restaurant_owner_branch_public_phone_authority.sql";
export const ROLE = "restaurant_owner_branch_public_phone_write_authority";
export const PERMISSION = "branch.profile.public_phone.write";
export const PREVIEW = "restaurant_owner_preview_branch_public_phone_v1";
export const MUTATION = "restaurant_owner_set_branch_public_phone_v1";
export const OWNER_READ = "restaurant_internal_branches_v2";
export const PUBLIC_VIEW = "consumer_public_restaurant_catalog_v3";
export const SUBJECT = "Add branch public phone authority";

export const PATHS = Object.freeze([
  "apps/mobile/app/restaurants.tsx",
  "apps/mobile/features/restaurants/catalog/mapper.ts",
  "apps/mobile/features/restaurants/catalog/mockRepository.ts",
  "apps/mobile/features/restaurants/catalog/rowContract.ts",
  "apps/mobile/features/restaurants/catalog/types.ts",
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/public-phone/route.ts",
  "apps/restaurant-web/components/branch/RestaurantOwnerBranchPublicPhoneControl.tsx",
  "apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-branch-public-phone-repository.ts",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-rpc-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-branch-public-phone-client.ts",
  "apps/restaurant-web/runtime/restaurant-owner-branch-public-phone.ts",
  "apps/restaurant-web/runtime/restaurant-rpc-contracts.ts",
  "apps/restaurant-web/runtime/restaurant-rpc-mappers.ts",
  "apps/restaurant-web/server/restaurant-owner-branch-public-phone-runtime.ts",
  "package.json",
  "scripts/consumer-public-restaurant-catalog-smoke.mjs",
  "scripts/restaurant-owner-branch-public-phone-ra-2i-p1a-contract.mjs",
  "scripts/restaurant-owner-branch-public-phone-ra-2i-p1a-guard.mjs",
  "scripts/restaurant-owner-branch-public-phone-ra-2i-p1a-mutations.mjs",
  "scripts/restaurant-owner-branch-public-phone-ra-2i-p1a-postgres-apply.mjs",
  "scripts/restaurant-owner-branch-public-phone-ra-2i-p1a-smoke.mjs",
  MIGRATION
]);
