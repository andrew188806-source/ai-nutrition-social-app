export const ORIGIN="d501dfab64ffe6654f5769da6225a3c01b780fd1";
export const PARENT="28174863d9652689c058aacec9fe6bc1e444cd64";
export const SUBJECT="Enforce canonical social URL storage";
export const MIGRATION="supabase/migrations/20260910030000_restaurant_owner_public_social_links_authority.sql";
export const MIGRATION_R1="supabase/migrations/20260910040000_restaurant_owner_public_social_links_canonical_storage_r1.sql";
export const PATHS=Object.freeze([
  "scripts/restaurant-owner-public-social-links-ra-2i-p2-contract.mjs",
  "scripts/restaurant-owner-public-social-links-ra-2i-p2-guard.mjs",
  "scripts/restaurant-owner-public-social-links-ra-2i-p2-mutations.mjs",
  "scripts/restaurant-owner-public-social-links-ra-2i-p2-postgres-apply.mjs",
  MIGRATION_R1
]);
