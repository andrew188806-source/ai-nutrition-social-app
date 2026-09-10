#!/usr/bin/env node
import fs from "node:fs";
import child from "node:child_process";

const ORIGIN = "4d7369c46cd7ff9cb6b2640fc73e623a7acd5a56";
const PARENT = "dd9305691ab2275f189caf51f78ef45c44fef002";
const MIGRATION = "supabase/migrations/20260910060000_restaurant_owner_about_authority.sql";
const MIGRATION_R1 = "supabase/migrations/20260910070000_restaurant_owner_about_visibility_universe_r1.sql";
const SUBJECT = "Constrain restaurant about public visibility";
const PATHS = Object.freeze([
  "scripts/restaurant-owner-about-ra-2g-p1-guard.mjs",
  "scripts/restaurant-owner-about-ra-2g-p1-mutations.mjs",
  "scripts/restaurant-owner-about-ra-2g-p1-postgres-apply.mjs",
  MIGRATION_R1
]);

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const git = (args) => child.execFileSync("git", args, { encoding: "utf8" }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean).sort() : [];
const head = git(["rev-parse", "HEAD"]);
const frozen = head !== PARENT;
const manifest = frozen
  ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]))
  : [...new Set([...lines(git(["diff", "--name-only"])), ...lines(git(["ls-files", "--others", "--exclude-standard"]))])].sort();
const migration = read(MIGRATION);
const bare = migration.replace(/^\s*--.*$/gm, "");
const r1Sql = read(MIGRATION_R1);
const r1Bare = r1Sql.replace(/^\s*--.*$/gm, "");
const packageScripts = JSON.parse(read("package.json")).scripts;
const checks = [];
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };

// --- Original P1 authority invariants (unchanged; read from the already-frozen P1 migration) ---
check("origin/main unchanged (P1 not yet pushed)", git(["rev-parse", "origin/main"]) === ORIGIN);
check("candidate or bounded R1 freeze commit", frozen
  ? git(["rev-parse", "HEAD^"]) === PARENT && git(["log", "-1", "--pretty=%s"]) === SUBJECT
  : head === PARENT);
check("exact R1 path manifest", JSON.stringify(manifest) === JSON.stringify([...PATHS].sort()));
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
check("explicit nullable SET/CLEAR and CAS", migration.includes("p_operation not in ('set', 'clear')")
  && migration.includes("v_target.restaurant_about is distinct from p_expected_restaurant_about")
  && migration.includes("v_target.restaurant_about_version <> p_expected_version"));
check("append-only private audit", migration.includes("create table restaurant_internal.restaurant_about_audit_log")
  && !/create policy[^;]+for (update|delete)/i.test(migration.slice(
      migration.indexOf("create table restaurant_internal.restaurant_about_audit_log"),
      migration.indexOf("grant select (id, auth_user_id, login_status)"))));
check("800 code point limit enforced with whitespace-only rejection",
  migration.includes("between 1 and 800") && migration.includes("restaurant_about_text_allowed_v1"));

// --- RA-2G-P1-R1: public visibility universe closure -------------------------------------------
check("R1 successor migration exists and sorts last", fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().at(-1)
  === MIGRATION_R1.split("/").at(-1));
check("R1 does not edit the already-applied P1 migration", !fs.existsSync(MIGRATION) || read(MIGRATION).includes("r.status = 'active' and r.restaurant_about is not null"));
check("R1 replaces the same view with the same two-column public contract (composition, not duplication)",
  r1Sql.includes("create or replace view public.consumer_public_restaurant_about_v1")
  && r1Sql.includes("select r.id as restaurant_id, r.restaurant_about"));
check("R1 gates publication on catalogue-v4 membership via EXISTS (no join, no row multiplication)",
  /exists \(\s*select 1\s*from public\.consumer_public_restaurant_catalog_v4/i.test(r1Sql)
  && !/join public\.consumer_public_restaurant_catalog_v4/i.test(r1Bare));
check("R1 retains status='active' and About IS NOT NULL as additional (not sole) gates",
  r1Sql.includes("r.status = 'active'") && r1Sql.includes("r.restaurant_about is not null"));
check("R1 preserves security_barrier and anon/authenticated SELECT grants", r1Sql.includes("security_barrier = true")
  && r1Sql.includes("grant select on public.consumer_public_restaurant_about_v1 to anon, authenticated"));
check("R1 introduces no provenance/audit exposure, no new role/permission, no moderation vocabulary",
  !/actor|membership|audit_log|version|source/i.test(r1Bare.slice(r1Bare.indexOf("create or replace view"), r1Bare.indexOf("do $$")))
  && !/create role|create policy|grant execute|grant update/i.test(r1Bare)
  && !/review_queue|pending_review|moderat|reviewer|approve_description|reject_description/i.test(r1Bare));
check("R1 does not touch P1A/P1B/P2/URL-R2/nutrition/GEO/temporal authority",
  !/public_phone|public_website_url|restaurant_public_social_links|restaurant_url_actor|ingredient|allergen|geocode|latitude|longitude|meal_buddy|temporal|weekly_hours/i.test(r1Bare));
check("R1 no credentials", !/service_role[^\n]{0,40}(key|secret)\s*[:=]|sbp_[a-f0-9]{40}|-----BEGIN PRIVATE KEY-----/i.test(
  PATHS.filter((path) => !path.endsWith("ra-2g-p1-guard.mjs")).map(read).join("\n")
));

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "ra-2g-p1-r1-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
