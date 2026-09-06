#!/usr/bin/env node
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
const base = "2e5be8ed064c636d1bb1ab772e47f8067caa36d9";
const p1 = "e18bebc68e067b3755cc53f4c139bce3200af529";
const subject = "Activate Restaurant branch temporal controls";
const migration = "supabase/migrations/20260906030000_restaurant_owner_branch_temporal_authority.sql";
const paths = [
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/route.ts",
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/weekly/route.ts",
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/special/route.ts",
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/closure/route.ts",
  "apps/restaurant-web/components/branch/RestaurantOwnerBranchTemporalControl.tsx",
  "apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-branch-temporal-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-branch-temporal-client.ts",
  "apps/restaurant-web/runtime/restaurant-owner-branch-temporal.ts",
  "apps/restaurant-web/server/restaurant-owner-branch-temporal-runtime.ts",
  "docs/restaurant-owner-branch-temporal-ra-2h-p2.md",
  "package.json",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p2-development-acceptance.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p2-guard.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p2-mutations.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p2-smoke.mjs"
].sort();
const git = args => child.execFileSync("git", args, { encoding: "utf8" }).trim();
const lines = value => value ? value.split(/\r?\n/).filter(Boolean) : [];
const hash = path => crypto.createHash("sha256").update(fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
const head = git(["rev-parse", "HEAD"]); const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
// Scoped to what THIS round could plausibly touch: apps/restaurant-web, docs/, scripts/, and
// package.json. The working tree also carries genuinely unrelated concurrent work (apps/mobile/*,
// an unrelated auth-scoped-client-state-isolation smoke test) that predates this round and must be
// left untouched per its own instructions -- a whole-repo diff would wrongly flag that as an
// authorization violation of THIS round rather than what it actually is.
const inScope = path => path.startsWith("apps/restaurant-web/") && path !== "apps/restaurant-web/tsconfig.tsbuildinfo"
  || (path.startsWith("docs/") && path.includes("ra-2h-p2"))
  || (path.startsWith("scripts/") && path.includes("ra-2h-p2"))
  || path === "package.json";
const changed = [...new Set([...lines(git(["diff", "--name-only", p1])), ...lines(git(["ls-files", "--others", "--exclude-standard"]))])]
  .filter(inScope).sort();
const authorityPaths = paths.filter(path => path.startsWith("apps/") && !path.endsWith("LiveRestaurantViews.tsx"));
const source = authorityPaths.map(path => fs.readFileSync(path, "utf8")).join("\n");
const rpcs = [
  "restaurant_owner_preview_branch_temporal_v1",
  "restaurant_owner_replace_branch_weekly_hours_v1",
  "restaurant_owner_set_branch_special_hours_v1",
  "restaurant_owner_close_branch_now_v1",
  "restaurant_owner_schedule_branch_closure_v1",
  "restaurant_owner_reopen_branch_now_v1",
  "restaurant_owner_cancel_future_branch_closure_v1"
];
const checks = [
  ["P1 is the exact parent", head === p1 || git(["rev-parse", "HEAD^"]) === p1],
  ["topology is candidate or one P2 commit", behind === 0 && ((head === p1 && ahead === 1) || (head !== p1 && ahead === 2 && git(["log", "-1", "--format=%s"]) === subject))],
  ["P1 normalized migration hash is pinned", hash(migration) === "a4cbdcad2f83bde7fa08b0496b48d55b95c4c228353705b3ed2decc2dbbcf151"],
  ["exact authorized P2 manifest", JSON.stringify(changed) === JSON.stringify(paths)],
  ["all 7 frozen P1 RPC names are referenced", rpcs.every(name => source.includes(name))],
  ["control is integrated with the branch surface", fs.readFileSync("apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx", "utf8").includes("RestaurantOwnerBranchTemporalControl")],
  ["no direct table access, privileged client, or raw RPC selector", !/\.from\(|service_role|restaurant_internal|supabaseUrl|supabaseKey|createClient\(/.test(source)],
  ["no generic temporal PATCH or arbitrary field selector", !/patch_temporal|p_patch\b|p_field\b|p_column\b/i.test(source)],
  ["timezone is never writable through this round (no p_timezone parameter anywhere)", !/p_timezone\b/.test(source)],
  ["no Admin lifecycle status value is ever assigned by this round's application code", !/status:\s*["'](active|inactive|temporary_closed|archived)["']/.test(source)],
  ["no RA-2A-F field is bundled into a temporal request/response", !/\bsoldOut\b|\bavailability\b(?!Version)|branchSpecificStatus|branch_specific_status|\bprice\b(?!Version)/.test(source)],
  ["no description field is present", !/description/i.test(source)],
  ["no consumer/GEO/REC integration touched", !/consumer_public|next_meal|geo_|recommendation/i.test(source)],
  ["diff has no whitespace errors", child.spawnSync("git", ["diff", "--check", p1], { encoding: "utf8" }).status === 0]
];
for (const [name, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, pass]) => !pass)) process.exitCode = 1;
