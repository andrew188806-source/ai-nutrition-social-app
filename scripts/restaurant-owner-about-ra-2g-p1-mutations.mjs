#!/usr/bin/env node
import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");
const sql = read("supabase/migrations/20260910060000_restaurant_owner_about_authority.sql");
const app = [
  "apps/restaurant-web/runtime/restaurant-owner-about.ts",
  "apps/restaurant-web/server/restaurant-owner-about-runtime.ts",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-about-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-about-client.ts",
  "apps/restaurant-web/components/settings/RestaurantOwnerAboutControl.tsx",
  "apps/mobile/features/restaurants/about/rowContract.ts",
  "apps/mobile/features/restaurants/about/repository.ts",
  "apps/mobile/features/restaurants/about/mapper.ts"
].map(read).join("\n");
const tests = [];
const check = (n, p) => { tests.push([n, !!p]); console.log(`${p ? "KILLED" : "SURVIVED"} ${n}`); };

for (const x of [
  "restaurant.profile.about.write",
  "restaurant_owner_about_write_authority",
  "grant update (restaurant_about, restaurant_about_source)",
  "p_operation not in ('set', 'clear')",
  "v_target.restaurant_about is distinct from p_expected_restaurant_about",
  "v_target.restaurant_about_version <> p_expected_version",
  "restaurant_about_audit_log",
  "consumer_public_restaurant_about_v1",
  "between 1 and 800",
  "restaurants_about_provenance_check",
  "'RESTAURANT_PROVIDED'"
]) check(`required ${x}`, sql.includes(x));

for (const x of [
  "grant delete", "update (public_website_url)", "update (public_phone)",
  "update (name)", "update (city)", "update (category)", "update (status)",
  "create view public.consumer_public_restaurant_catalog_v4",
  "contact_email", "profile_json", "review_queue", "moderator", "approved_by",
  "to service_role"
]) check(`forbidden ${x}`, !sql.toLowerCase().includes(x.toLowerCase()));

for (const x of [
  "canonicalizeRestaurantAbout", "parseRestaurantAboutInput", "Object.keys(value).sort()",
  "expectedRestaurantAbout", "nextRestaurantAbout", "expectedVersion",
  "parseRestaurantAboutApiMutation", "getVerifiedRestaurantClaims", "loadRestaurantAccessContext",
  "credentials: \"same-origin\"", "系統不會自動重送", "consumer_public_restaurant_about_v1",
  "restaurant_id,restaurant_about", ".eq(\"restaurant_id\", restaurantId)",
  "RESTAURANT_ABOUT_MAX_CODE_POINTS"
]) check(`application seam ${x}`, app.includes(x));

for (const x of [
  "PATCH", "service_role_key", "demo@tastkind.app", "6f41d663-026a-469e-8163-521804b0aa22",
  "contactEmail", "審核", "送審", "退件", "平台認證", "reviewer", "approvalState"
]) check(`application forbidden ${x}`, !app.includes(x));

// RA-2G-P1-R1: public visibility universe closure.
const r1 = read("supabase/migrations/20260910070000_restaurant_owner_about_visibility_universe_r1.sql");
for (const x of [
  "create or replace view public.consumer_public_restaurant_about_v1",
  "select r.id as restaurant_id, r.restaurant_about",
  "exists (",
  "from public.consumer_public_restaurant_catalog_v4",
  "r.status = 'active'",
  "r.restaurant_about is not null",
  "security_barrier = true",
  "grant select on public.consumer_public_restaurant_about_v1 to anon, authenticated"
]) check(`r1 required ${x}`, r1.includes(x));
check("r1 forbidden join to catalogue (must use EXISTS, not JOIN, to avoid row multiplication)",
  !r1.toLowerCase().includes("join public.consumer_public_restaurant_catalog_v4"));
for (const x of [
  "create role", "create policy", "grant execute", "grant update", "grant insert",
  "drop table", "drop function", "alter table public.restaurants", "update public.restaurants",
  "public_website_url", "public_phone", "review_queue", "moderator"
]) check(`r1 forbidden ${x}`, !r1.toLowerCase().includes(x.toLowerCase()));

const failed = tests.filter(([, p]) => !p);
console.log(JSON.stringify({ suite: "ra-2g-p1-r1-mutations", total: tests.length, killed: tests.length - failed.length, survivors: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
