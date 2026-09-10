#!/usr/bin/env node
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260910010000_restaurant_owner_branch_public_phone_authority.sql", "utf8");
const appFiles = [
  "apps/restaurant-web/runtime/restaurant-owner-branch-public-phone.ts",
  "apps/restaurant-web/server/restaurant-owner-branch-public-phone-runtime.ts",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-branch-public-phone-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-branch-public-phone-client.ts",
  "apps/restaurant-web/components/branch/RestaurantOwnerBranchPublicPhoneControl.tsx",
  "apps/mobile/features/restaurants/catalog/rowContract.ts",
  "apps/mobile/features/restaurants/catalog/mapper.ts",
  "apps/mobile/app/restaurants.tsx"
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const checks = [];
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "KILLED" : "SURVIVED"} ${name}`); };

for (const required of [
  "branch.profile.public_phone.write",
  "restaurant_owner_branch_public_phone_write_authority",
  "update (public_phone)",
  "p_operation not in ('set', 'clear')",
  "is distinct from p_expected_public_phone",
  "public_phone_version <> p_expected_version",
  "char_length(v_canonical_next) > 32",
  "branch_public_phone_audit_log",
  "consumer_public_restaurant_catalog_v3",
  "rb.public_phone as branch_public_phone",
  "restaurant_internal_branches_v2"
]) check(`required ${required}`, migration.includes(required));

for (const forbidden of [
  "update (name)", "update (address)", "update (status)", "update (latitude)",
  "update (longitude)", "public.restaurants.public_phone", "website", "instagram",
  "facebook", "contact_email", "service_role_key"
]) check(`forbidden ${forbidden}`, !migration.toLowerCase().includes(forbidden.toLowerCase()));

for (const required of [
  "parsePublicPhoneInput", "Object.keys(value).sort()", "expectedPublicPhone",
  "nextPublicPhone", "expectedVersion", "parsePublicPhoneApiMutation", "getVerifiedRestaurantClaims",
  "loadRestaurantAccessContext", "credentials: \"same-origin\"", "系統不會自動重送",
  "branchPublicPhone", "branch_public_phone", "consumer_public_restaurant_catalog_v3"
]) check(`application seam ${required}`, appFiles.includes(required));

for (const forbidden of ["PATCH", "service_role", ".from(\"restaurant_branches\")", "tel:", "website", "instagram", "facebook", "contactEmail"]) {
  check(`application forbidden ${forbidden}`, !appFiles.includes(forbidden));
}

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "ra-2i-p1a-mutations", total: checks.length, killed: checks.length - failed.length, survivors: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
