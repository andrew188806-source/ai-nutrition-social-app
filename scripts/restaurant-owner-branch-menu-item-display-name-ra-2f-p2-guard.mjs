#!/usr/bin/env node
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
const base = "d5863e5a8e0dc67c28bea076407dac1c11324086";
const p1 = "58d8b18e420aa68f8424596bf97e2caf094659e5";
const subject = "Activate Restaurant Owner menu display-name control";
const migration = "supabase/migrations/20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql";
const paths = [
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/display-name/route.ts",
  "apps/restaurant-web/components/menu/RestaurantOwnerMenuItemDisplayNameControl.tsx",
  "apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-menu-item-display-name-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-menu-item-display-name-client.ts",
  "apps/restaurant-web/runtime/restaurant-owner-menu-item-display-name.ts",
  "apps/restaurant-web/server/restaurant-owner-menu-item-display-name-runtime.ts",
  "docs/restaurant-owner-branch-menu-item-display-name-ra-2f-p2.md",
  "package.json",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p2-development-acceptance.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p2-guard.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p2-mutations.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p2-smoke.mjs"
].sort();
const git = args => child.execFileSync("git", args, { encoding: "utf8" }).trim();
const lines = value => value ? value.split(/\r?\n/).filter(Boolean) : [];
const hash = path => crypto.createHash("sha256").update(fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
const head = git(["rev-parse", "HEAD"]); const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const changed = [...new Set([...lines(git(["diff", "--name-only", p1])), ...lines(git(["ls-files", "--others", "--exclude-standard"]))])].sort();
const authorityPaths = paths.filter(path => path.startsWith("apps/") && !path.endsWith("LiveRestaurantViews.tsx"));
const source = authorityPaths.map(path => fs.readFileSync(path, "utf8")).join("\n");
const checks = [
  ["P1 is the exact parent", head === p1 || git(["rev-parse", "HEAD^"]) === p1],
  ["topology is candidate or one P2 commit", behind === 0 && ((head === p1 && ahead === 1) || (head !== p1 && ahead === 2 && git(["log", "-1", "--format=%s"]) === subject))],
  ["P1 normalized migration hash is pinned", hash(migration) === "fbbd5a2c4955af3343af61ed00fd5c61686679ad1158a4b0986a789c8e4074f4"],
  ["exact authorized P2 manifest", JSON.stringify(changed) === JSON.stringify(paths)],
  ["only frozen display-name RPCs", source.includes("restaurant_owner_preview_branch_menu_item_display_name_v1") && source.includes("restaurant_owner_set_branch_menu_item_display_name_v1")],
  ["control is integrated with the menu surface", fs.readFileSync("apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx", "utf8").includes("RestaurantOwnerMenuItemDisplayNameControl")],
  ["no direct table or privileged fallback", !/\.from\(|service_role|restaurant_internal|supabaseUrl|supabaseKey/.test(source)],
  ["description is absent", !source.includes("branch_specific_description")],
  ["no generic patch or predecessor mutation", !/PATCH|sold_out|availability|branch_specific_status/.test(source)],
  ["diff has no whitespace errors", child.spawnSync("git", ["diff", "--check", p1], { encoding: "utf8" }).status === 0]
];
for (const [name, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, pass]) => !pass)) process.exitCode = 1;
