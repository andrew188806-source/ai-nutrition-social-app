#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  GEO1DP0_BASELINE, GEO1DP0_BASELINE_SUBJECT, GEO1DP0_COMMIT_SUBJECT,
  GEO1DP0_MIGRATION, GEO1DP0_NPM_KEYS, GEO1DP0_PATHS,
  auditGeo1dp0Sources, classifyGeo1dp0Lifecycle, createGeo1dp0Manifest
} from "./geo-meal-buddy-geo-1d-p0-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args, encoding = "utf8") => child.execFileSync("git", args, {
  cwd: root, encoding, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

const head = git(["rev-parse", "HEAD"]); const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const worktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const deltaPaths = head === GEO1DP0_BASELINE ? [] :
  lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const lifecycle = classifyGeo1dp0Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === GEO1DP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});

const sources = Object.fromEntries(GEO1DP0_PATHS.filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => [file, read(file)]));
const migration = sources[GEO1DP0_MIGRATION] ?? "";
const runtime = sources["supabase/functions/_shared/meal-buddy-card-api/runtime.ts"] ?? "";
const packageJson = JSON.parse(sources["package.json"] ?? "{}");
const violations = auditGeo1dp0Sources(sources);

check("lifecycle is exact GEO-1D-P0 candidate or freeze", lifecycle.valid, lifecycle.phase);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("baseline subject is exact", git(["show", "-s", "--format=%s", GEO1DP0_BASELINE]) === GEO1DP0_BASELINE_SUBJECT);
check("origin/main is the pushed baseline or exact pushed freeze",
  originHead === GEO1DP0_BASELINE || lifecycle.phase === "frozen_pushed", originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("manifest is sorted unique wildcard-free and present",
  JSON.stringify(GEO1DP0_PATHS) === JSON.stringify([...GEO1DP0_PATHS].sort())
  && new Set(GEO1DP0_PATHS).size === GEO1DP0_PATHS.length
  && GEO1DP0_PATHS.every((file) => !/[?*]/.test(file) && fs.existsSync(path.join(root, file))));
check("dirty or freeze delta equals exact manifest",
  JSON.stringify(lifecycle.manifest) === JSON.stringify(GEO1DP0_PATHS),
  { actual: lifecycle.manifest, expected: GEO1DP0_PATHS });
check("exactly one additive migration exists after the frozen chain",
  fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).length === 91
  && GEO1DP0_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1);
check("all frozen migration bytes match the pushed baseline",
  git(["diff", "--name-only", GEO1DP0_BASELINE, "--", "supabase/migrations"])
    .split(/\r?\n/).filter(Boolean).every((file) => file === GEO1DP0_MIGRATION));
check("migration is additive transactional and never replaces frozen objects",
  /^begin;/m.test(migration) && /^commit;/m.test(migration)
  && !/create or replace|drop table|drop function|truncate|update public\.meal_buddy_cards/i.test(migration));
check("private source audit has zero violations", violations.length === 0, violations);
check("one binding per card is database-enforced",
  /primary key \(card_id\)/.test(migration) && !/unique \(card_id, branch_id\)/.test(migration));
check("card and branch restaurants are both relationally enforced",
  /foreign key \(card_id, restaurant_id\)/.test(migration)
  && /foreign key \(branch_id, restaurant_id\)/.test(migration));
check("exact branch is never re-resolved or restaurant-inferred",
  /values \(v_card_id, p_recommendation_restaurant_id, p_branch_id\)/.test(migration)
  && !/from public\.restaurant_branches[\s\S]{0,160}?where restaurant_id/i.test(migration));
check("atomic successor reuses frozen writer once",
  (migration.match(/v_payload := social_internal\.create_meal_buddy_card_from_recommendation\(/g) ?? []).length === 1
  && !/insert into public\.meal_buddy_cards/.test(migration));
check("runtime switches only to atomic successor with identical 15 parameters",
  /create_meal_buddy_card_from_recommendation_with_branch_context\(\$1::uuid[\s\S]*\$15::text\)/.test(runtime));
check("direct and historical cards stay unbound and valid",
  /p_branch_id is not null/.test(migration)
  && !/insert into social_internal\.meal_buddy_card_branch_context[\s\S]{0,220}?select/i.test(migration));
check("read seam is private bounded and executor-only",
  /read_meal_buddy_card_branch_context\(p_card_ids uuid\[\]\)/.test(migration)
  && /cardinality\(p_card_ids\) > 200/.test(migration)
  && /grant execute on function social_internal\.read_meal_buddy_card_branch_context\(uuid\[\]\)[\s\S]{0,80}?to social_runtime_executor/.test(migration));
check("anon authenticated and service role have no table or function authority",
  /revoke all on table[\s\S]{0,150}?anon, authenticated, authenticator, service_role/.test(migration)
  && (migration.match(/from public, anon, authenticated, authenticator, service_role, social_runtime_executor/g) ?? []).length === 3);
check("no Mobile public DTO or profile surface changes",
  git(["diff", "--name-only", GEO1DP0_BASELINE, "--", "apps/mobile", "packages/shared"]).length === 0);
const publicSurfaces = [
  "supabase/functions/_shared/meal-buddy-card-api/types.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/types.ts",
  "supabase/functions/_shared/social-profile/types.ts"
].filter((file) => fs.existsSync(path.join(root, file))).map(read).join("\n");
const ownedDto = (publicSurfaces.match(/export type OwnedMealBuddyCardDto = Readonly<\{([\s\S]*?)\}>;/) ?? ["", ""])[1];
const candidateDto = (publicSurfaces.match(/export type MealBuddyCandidateDto = Readonly<\{([\s\S]*?)\}>;/) ?? ["", ""])[1];
check("no public Meal Buddy or profile DTO contains branch context",
  ownedDto.length > 0 && candidateDto.length > 0
  && !/branchContext|branch_id|branchId/.test(ownedDto + candidateDto));
check("candidate person/card dedupe bytes remain frozen",
  git(["diff", "--name-only", GEO1DP0_BASELINE, "--",
    "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql",
    "supabase/functions/_shared/meal-buddy-candidate-api/compose.ts",
    "supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts"]).length === 0);
check("Meal Context authority bytes remain frozen",
  git(["diff", "--name-only", GEO1DP0_BASELINE, "--",
    "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql",
    "supabase/migrations/20260821010000_meal_buddy_recommendation_context_handoff.sql",
    "supabase/functions/_shared/meal-buddy-context"]).length === 0);
check("P0 activates no GEO narrowing or location UI",
  !/narrow_branch_candidates|within_radius|distance_meters|useConsumerLocation/.test(migration + runtime));
check("invite relationship chat and exposure bytes remain frozen",
  git(["diff", "--name-only", GEO1DP0_BASELINE, "--",
    "supabase/functions/_shared/meal-buddy-relationship-api",
    "supabase/functions/_shared/meal-buddy-chat-api",
    "supabase/functions/_shared/social-exposure"]).length === 0);
check("all dedicated commands are exact", GEO1DP0_NPM_KEYS.every((key) =>
  packageJson.scripts?.[key]?.includes("geo-meal-buddy-geo-1d-p0")));
check("manifest bytes contain no secrets CRLF BOM NUL or replacement character", GEO1DP0_PATHS.every((file) => {
  const bytes = fs.readFileSync(path.join(root, file)); const value = bytes.toString("utf8");
  const productSecretFree = ![GEO1DP0_MIGRATION, "supabase/functions/_shared/meal-buddy-card-api/runtime.ts"].includes(file)
    || !/(postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@|sb_secret_|BEGIN [A-Z ]*PRIVATE KEY)/.test(value);
  return productSecretFree && !bytes.includes(Buffer.from("\r\n")) && !bytes.includes(0)
    && !value.includes(String.fromCharCode(0xfffd))
    && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
}));
if (lifecycle.phase !== "candidate") {
  check("freeze commit subject is exact", git(["log", "-1", "--format=%s"]) === GEO1DP0_COMMIT_SUBJECT);
}
const manifest = createGeo1dp0Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact paths", manifest.entries.length === GEO1DP0_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === GEO1DP0_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "geo-meal-buddy-geo-1d-p0-guard", lifecycle: lifecycle.phase,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, GEO1DP0_MIGRATION))).digest("hex"),
  networkUsed: false, databaseUsed: false, developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
