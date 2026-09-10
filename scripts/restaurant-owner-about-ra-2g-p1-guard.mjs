#!/usr/bin/env node
import fs from "node:fs";
import child from "node:child_process";

const BASELINE = "4d7369c46cd7ff9cb6b2640fc73e623a7acd5a56";
const MIGRATION = "supabase/migrations/20260910060000_restaurant_owner_about_authority.sql";
const SUBJECT = "Add restaurant about authority";
const PATHS = Object.freeze([
  "apps/mobile/app/restaurants.tsx",
  "apps/mobile/features/restaurants/about/composition.ts",
  "apps/mobile/features/restaurants/about/index.ts",
  "apps/mobile/features/restaurants/about/mapper.ts",
  "apps/mobile/features/restaurants/about/repository.ts",
  "apps/mobile/features/restaurants/about/rowContract.ts",
  "apps/mobile/features/restaurants/about/types.ts",
  "apps/mobile/features/restaurants/about/useRestaurantAbout.ts",
  "apps/restaurant-web/app/api/restaurant/settings/about/route.ts",
  "apps/restaurant-web/app/restaurant/settings/page.tsx",
  "apps/restaurant-web/components/settings/RestaurantOwnerAboutControl.tsx",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-about-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-about-client.ts",
  "apps/restaurant-web/runtime/restaurant-owner-about.ts",
  "apps/restaurant-web/server/restaurant-owner-about-runtime.ts",
  "package.json",
  "scripts/restaurant-owner-about-ra-2g-p1-guard.mjs",
  "scripts/restaurant-owner-about-ra-2g-p1-smoke.mjs",
  "scripts/restaurant-owner-about-ra-2g-p1-mutations.mjs",
  "scripts/restaurant-owner-about-ra-2g-p1-postgres-apply.mjs",
  MIGRATION
]);

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const git = (args) => child.execFileSync("git", args, { encoding: "utf8" }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean).sort() : [];
const head = git(["rev-parse", "HEAD"]);
const frozen = head !== BASELINE;
const manifest = frozen
  ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]))
  : [...new Set([...lines(git(["diff", "--name-only"])), ...lines(git(["ls-files", "--others", "--exclude-standard"]))])].sort();
const migration = read(MIGRATION);
const bare = migration.replace(/^\s*--.*$/gm, "");
const packageScripts = JSON.parse(read("package.json")).scripts;
const checks = [];
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };

check("baseline remains origin/main", git(["rev-parse", "origin/main"]) === BASELINE);
check("candidate or one bounded freeze commit", frozen
  ? git(["rev-parse", "HEAD^"]) === BASELINE && git(["log", "-1", "--pretty=%s"]) === SUBJECT
  : head === BASELINE);
check("exact authorised path manifest", JSON.stringify(manifest) === JSON.stringify([...PATHS].sort()));
check("one successor migration sorts last", fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().at(-1)
  === MIGRATION.split("/").at(-1));
check("four dedicated gates registered", [
  "test:restaurant-owner-about-ra-2g-p1",
  "test:restaurant-owner-about-ra-2g-p1-smoke",
  "test:restaurant-owner-about-ra-2g-p1-mutations",
  "test:restaurant-owner-about-ra-2g-p1-postgres"
].every((key) => typeof packageScripts[key] === "string"));

check("restaurant-global columns only, not branch/menu", migration.includes("add column restaurant_about text")
  && !/alter table public\.restaurant_branches[\s\S]*restaurant_about/i.test(bare)
  && !/alter table public\.branch_menu_items[\s\S]*restaurant_about/i.test(bare));
check("provenance invariant enforced", migration.includes("restaurants_about_provenance_check")
  && migration.includes("restaurant_about is null and restaurant_about_source is null")
  && migration.includes("restaurant_about_source = 'RESTAURANT_PROVIDED'"));
check("no browser-supplied source column in RPC signature", !bare.includes("p_source")
  && !bare.includes("p_restaurant_about_source") && !bare.includes("p_actor_auth_user_id"));
check("dedicated owner permission", migration.includes("restaurant.profile.about.write")
  && migration.includes("role.role_key = 'owner'")
  && migration.includes("permission.permission_scope = 'restaurant'"));
check("dedicated sealed role", migration.includes("create role restaurant_owner_about_write_authority")
  && /nologin[\s\S]*noinherit[\s\S]*nobypassrls/.test(migration));
check("column update is about+source only", migration.includes("grant update (restaurant_about, restaurant_about_source)")
  && !/grant update \((name|city|category|status|public_website_url)/i.test(bare));
check("restrictive tenant policies", /as restrictive[\s\S]*for select/.test(migration)
  && /as restrictive[\s\S]*for update/.test(migration));
check("preview and mutation are SECURITY DEFINER with pinned path", migration.includes("create function public.restaurant_owner_preview_about_v1")
  && migration.includes("create function public.restaurant_owner_set_about_v1")
  && (migration.match(/security definer\nset search_path = ''\nset row_security = 'on'/g) ?? []).length >= 2);
check("public execution revoked and authenticated execution exact (direct RPC boundary acceptable per RA-2G scope)",
  migration.includes("revoke all on function public.restaurant_owner_preview_about_v1")
  && migration.includes("grant execute on function public.restaurant_owner_preview_about_v1(text) to authenticated")
  && migration.includes("grant execute on function public.restaurant_owner_set_about_v1(text, text, text, text, bigint) to authenticated")
  && !bare.includes("to service_role"));
check("explicit nullable SET/CLEAR and CAS", migration.includes("p_operation not in ('set', 'clear')")
  && migration.includes("v_target.restaurant_about is distinct from p_expected_restaurant_about")
  && migration.includes("v_target.restaurant_about_version <> p_expected_version"));
check("append-only private audit", migration.includes("create table restaurant_internal.restaurant_about_audit_log")
  && migration.includes("from public, anon, authenticated, authenticator, service_role")
  && !/create policy[^;]+for (update|delete)/i.test(migration.slice(
      migration.indexOf("create table restaurant_internal.restaurant_about_audit_log"),
      migration.indexOf("grant select (id, auth_user_id, login_status)"))));
check("public projection adds about only, filtered to public restaurants, no PII/audit fields",
  migration.includes("create view public.consumer_public_restaurant_about_v1")
  && migration.includes("r.status = 'active'")
  && migration.includes("r.restaurant_about is not null")
  && !migration.slice(migration.indexOf("create view public.consumer_public_restaurant_about_v1"),
      migration.indexOf("revoke all on public.consumer_public_restaurant_about_v1"))
      .match(/actor|membership|audit|version|source/i));
check("catalog v4 never touched", !bare.includes("consumer_public_restaurant_catalog_v4"));
check("website and social and phone never assigned", !/set\s+(public_website_url|public_phone|public_url)\s*=/i.test(bare));
check("no moderation/review vocabulary", !/review_queue|pending_review|moderat|reviewer|review_state|approve_description|reject_description|claim_approval|content_moderator|platform.?certif/i.test(bare));
check("no generic profile/JSON model", !/profile_json|contact_json|jsonb\s+(not null|null)|\bpatch\b/i.test(bare));
check("800 code point limit enforced with whitespace-only rejection",
  migration.includes("between 1 and 800") && migration.includes("restaurant_about_text_allowed_v1"));
check("LF explicitly preserved (not in forbidden control class)", migration.includes("\\x0B-\\x1F")
  && !migration.includes("\\x0A-\\x1F"));
check("no credential material", !/service_role[^\n]{0,40}(key|secret)\s*[:=]|sbp_[a-f0-9]{40}|-----BEGIN PRIVATE KEY-----/i.test(
  PATHS.filter((path) => !path.endsWith("ra-2g-p1-guard.mjs")).map(read).join("\n")
));

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "ra-2g-p1-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
