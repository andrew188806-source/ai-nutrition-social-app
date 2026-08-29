#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RECDP0_BASELINE,
  RECDP0_COMMIT_SUBJECT,
  RECDP0_MIGRATION,
  RECDP0_NPM_KEYS,
  RECDP0_PATHS,
  classifyRecdp0Lifecycle,
  createRecdp0Manifest
} from "./recommendation-rec-d-p0-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const bytesSha = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(root, file))).digest("hex");
const git = (args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = []; const failures = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
};

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const unstagedPaths = lines(git(["diff", "--name-only"]));
const untrackedPaths = lines(git(["ls-files", "--others", "--exclude-standard"]));
const worktreePaths = [...new Set([...unstagedPaths, ...untrackedPaths])].sort();
const deltaPaths = head === RECDP0_BASELINE ? []
  : lines(git(["diff", "--name-only", `${RECDP0_BASELINE}..HEAD`]));
const deleted = lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0;
const lifecycle = classifyRecdp0Lifecycle({
  head,
  parent: head === RECDP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  stagedPaths,
  worktreePaths,
  deltaPaths,
  deleted
});

const sql = read(RECDP0_MIGRATION);
const executableSql = sql.replace(/--.*$/gm, "").replace(/comment on[\s\S]*?;\s*/gi, "");
const structuralSql = executableSql.replace(/\x27[^\x27]*\x27/g, "");
const contract = read(
  "packages/shared/src/domain/candidate-ingredient-avoidance/candidateIngredientAvoidanceAuthority.ts"
);
const docs = read(
  "docs/recommendation/rec-d-p0-candidate-ingredient-avoidance-data-authority.md"
);
const packageJson = JSON.parse(read("package.json"));

check("lifecycle is exact REC-D-P0 candidate or freeze", lifecycle.valid, lifecycle.phase);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains exact REC-C baseline or exact pushed REC-D-P0 freeze",
  originHead === RECDP0_BASELINE || (lifecycle.phase === "frozen_pushed" && originHead === head),
  originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest is sorted, unique, and present",
  JSON.stringify(RECDP0_PATHS) === JSON.stringify([...RECDP0_PATHS].sort())
  && new Set(RECDP0_PATHS).size === RECDP0_PATHS.length
  && RECDP0_PATHS.every((file) => !/[?*]/.test(file) && fs.existsSync(path.join(root, file))));
check("round adds exactly one migration and changes no frozen migration",
  JSON.stringify((lifecycle.phase === "candidate" ? worktreePaths : deltaPaths)
    .filter((file) => file.startsWith("supabase/migrations/")))
  === JSON.stringify([RECDP0_MIGRATION]));
check("REC-C-P0 migration digest remains frozen",
  bytesSha("supabase/migrations/20260830010000_candidate_allergen_data_authority.sql")
  === "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a");
check("REC-C-P1 migration digest remains frozen",
  bytesSha("supabase/migrations/20260831010000_user_allergy_setting_authority.sql")
  === "117994481084313b8c5ef2d9483064a0ec893324589a14e6e286cd85f43171a0");

const keys = ["pork", "beef", "coriander"];
const valueBlock = sql.slice(sql.indexOf("insert into public.candidate_ingredient_avoidance_values"),
  sql.indexOf("insert into public.candidate_ingredient_avoidance_value_labels"));
const seededKeys = [...valueBlock.matchAll(/\('tastkind-ingredient-avoidance-v1', 1, '([^']+)'\)/g)]
  .map((match) => match[1]);
check("taxonomy identity, version, and fact domain are exact",
  /'tastkind-ingredient-avoidance-v1', 1, 'ingredient_avoidance_content'/.test(sql)
  && /CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID =\s*\n?\s*"tastkind-ingredient-avoidance-v1"/.test(contract));
check("canonical vocabulary is exactly pork, beef, coriander with no fourth key",
  JSON.stringify(seededKeys) === JSON.stringify(keys)
  && JSON.stringify([...contract.matchAll(/Object\.freeze\(\{ key: "([^"]+)"/g)]
    .map((match) => match[1])) === JSON.stringify(keys));
check("zh-TW labels are exact presentation-only values",
  ["豬肉／豬來源成分", "牛肉／牛來源成分", "香菜"].every((label) =>
    sql.includes(`'zh-TW', '${label}'`) && contract.includes(`zhTWLabel: "${label}"`)));
check("future private vocabulary is exact versioned three-key authority",
  /'private-ingredient-avoidance-v1', 1, 'ingredient_avoidance'/.test(sql)
  && /PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION = 1/.test(contract));
check("normalization is exact NFC-trimmed stable-key-only with zero legacy aliases",
  /normalize\(pg_catalog\.btrim\(normalized_source_value\), NFC\)/.test(sql)
  && /value\.normalize\("NFC"\)\.trim\(\)/.test(contract)
  && /source\.source_value_key, 'stable_key'/.test(sql)
  && !/localized_label|governed_alias|legacy_candidate_ingredient/.test(sql)
  && !/toLowerCase|levenshtein|similarity|fuzzy|openai|anthropic/i.test(contract));

const factsBlock = sql.slice(sql.indexOf("create table public.candidate_ingredient_avoidance_facts"),
  sql.indexOf("create unique index cia_facts_active_fact_idx"));
check("facts are known-present exact branch-offer/menu identity",
  /foreign key \(candidate_id, menu_item_id\)\s+references public\.branch_menu_items \(id, menu_item_id\)/.test(factsBlock)
  && !/restaurant_id text/.test(factsBlock) && !/known_absent/.test(contract + structuralSql));
check("facts require approved provenance, audit reference, and established timestamp",
  /create type public\.candidate_ingredient_avoidance_provenance as enum \(\s*'restaurant_verified',\s*'admin_verified',\s*'provider_verified'\s*\)/.test(sql)
  && /provenance public\.candidate_ingredient_avoidance_provenance not null/.test(factsBlock)
  && /source_reference text not null/.test(factsBlock)
  && /established_at timestamptz not null/.test(factsBlock));
check("coverage states and domain are exact",
  /create type public\.candidate_ingredient_avoidance_coverage_state as enum \(\s*'unknown',\s*'partial',\s*'complete'\s*\)/.test(sql)
  && (sql.match(/fact_domain = 'ingredient_avoidance_content'/g) ?? []).length >= 3);
check("unknown and partial cannot prove absence",
  /coverage_state = 'unknown'[\s\S]{0,170}provenance is null[\s\S]{0,170}established_at is null/.test(sql)
  && /coverage_state = 'partial'[\s\S]{0,220}provenance is not null[\s\S]{0,220}established_at is not null/.test(sql)
  && /return state === "complete"/.test(contract));
check("complete is restaurant/admin-only and provider cannot declare it",
  /coverage_state = 'complete'[\s\S]{0,220}provenance in \('restaurant_verified', 'admin_verified'\)/.test(sql)
  && /return provenance === "restaurant_verified" \|\| provenance === "admin_verified"/.test(contract));
check("ingredient and allergen completeness stay orthogonal",
  !/candidate_allergen_(?:facts|coverage)/.test(executableSql)
  && /allergen_content = complete[\s\S]{0,180}says nothing/i.test(docs)
  && /REC-D complete says nothing about any allergen/.test(docs));

check("sealed role is NOLOGIN, NOINHERIT, NOBYPASSRLS",
  /create role candidate_ingredient_avoidance_write_authority\s+with nologin noinherit nobypassrls/.test(sql));
check("all ten authority tables have RLS and client/service mutation revoked",
  (sql.match(/enable row level security/g) ?? []).length === 10
  && (sql.match(/from public, anon, authenticated, authenticator, service_role/g) ?? []).length === 10);
check("no client/service role inherits sealed write authority",
  !/grant candidate_ingredient_avoidance_write_authority to (?:anon|authenticated|authenticator|service_role)/i.test(sql));
check("exactly two deterministic authenticated candidate projections exist",
  /consumer_authenticated_candidate_avoidance_facts_v1/.test(sql)
  && /consumer_authenticated_candidate_avoidance_coverage_v1/.test(sql)
  && /order by candidate\.candidate_id, fact\.ingredient_avoidance_key, fact\.fact_id/.test(sql)
  && /coalesce\(coverage\.coverage_state,\s*'unknown'/.test(sql)
  && (sql.match(/grant select on public\.consumer_authenticated_candidate_avoidance_[a-z_0-9]+ to authenticated/g) ?? []).length === 2);
check("anon receives no projection and projections leak no user/audit/compatibility output",
  !/grant select on public\.consumer_authenticated_candidate_avoidance_[a-z_0-9]+ to anon/.test(sql)
  && !/user_id|profile_id|reason|religion|source_reference|audit_reference|compatible_with|safe_for/i.test(
    sql.slice(sql.indexOf("create view public.consumer_authenticated_candidate_avoidance_facts_v1"),
      sql.indexOf("comment on view public.consumer_authenticated_candidate_avoidance_facts_v1"))));

check("manifest contains no recommendation or Mobile product/runtime path",
  !RECDP0_PATHS.some((file) => file.startsWith("apps/mobile/")
    || /recommendationCompositionPolicy|nextMealNutritionRanker|recommendationTasteRanking/.test(file)));
check("authority introduces no eligibility, rank, score, GEO, Meal Context, or Social behavior",
  !/compatibleWithUser|safeForUser|eligibilityPolicy|rankingScore|tasteScore|nutritionScore|latitude|longitude|meal_context|social_interest/i.test(contract + structuralSql));
check("authority contains no user reason, religion, halal, or dietary-mode field",
  !/userId|profileId|religion|religious_identity|halal|vegetarian|vegan/i.test(contract + structuralSql));
check("recon classifies no governed baseline source and freezes zero legacy aliases",
  /A — governed candidate fact source:\*\* none/.test(docs)
  && /zero aliases and zero canonical fact imports/.test(docs)
  && /structured menu-level\s+nutrition inputs/.test(docs));
check("all four dedicated commands are registered",
  RECDP0_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-d-p0")));
check("Development cleanup handoff and Production prohibition are explicit",
  /Claude Development acceptance handoff/.test(docs)
  && /zero residue/.test(docs)
  && /Production remains forbidden/.test(docs));

const secretPatterns = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}"].join("")),
  new RegExp(["sb", "_secret_[A-Za-z0-9_-]{10,}"].join("")),
  new RegExp(["postgres", "(?:ql)?://[^\\s\"']*:[^\\s\"']*@"].join("")),
  new RegExp(["-----BEGIN ", "[A-Z ]*PRIVATE KEY-----"].join(""))
];
check("manifest bytes contain no credential shape, CRLF, BOM, or NUL",
  RECDP0_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file)); const text = bytes.toString("utf8");
    return !secretPatterns.some((pattern) => pattern.test(text))
      && !bytes.includes(Buffer.from("\r\n")) && !bytes.includes(0)
      && !(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
  }));
if (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed") {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECDP0_COMMIT_SUBJECT);
}
const manifest = createRecdp0Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths",
  manifest.entries.length === RECDP0_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECDP0_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-d-p0-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: manifest.entries.find((entry) => entry.path === RECDP0_MIGRATION)?.sha256,
  p0MigrationSha256: "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a",
  p1MigrationSha256: "117994481084313b8c5ef2d9483064a0ec893324589a14e6e286cd85f43171a0",
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
