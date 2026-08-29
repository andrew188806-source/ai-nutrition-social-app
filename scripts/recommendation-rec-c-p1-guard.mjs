#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RECCP1_BASELINE,
  RECCP1_COMMIT_SUBJECT,
  RECCP1_MIGRATION,
  RECCP1_NPM_KEYS,
  RECCP1_PATHS,
  classifyReccp1Lifecycle,
  createReccp1Manifest
} from "./recommendation-rec-c-p1-successor-manifest.mjs";
import { classifyReccLifecycle } from "./recommendation-rec-c-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => child.execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = []; const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

const head = git(["rev-parse", "HEAD"]); const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const worktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const deltaPaths = head === RECCP1_BASELINE ? []
  : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const lifecycle = classifyReccp1Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recLifecycle = classifyReccLifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});

const sql = read(RECCP1_MIGRATION);
const repository = read("apps/mobile/features/consumer-allergy-settings/repository.ts");
const controller = read("apps/mobile/features/consumer-allergy-settings/controller.ts");
const contracts = read("apps/mobile/features/consumer-allergy-settings/supabaseContracts.ts");
const route = read("apps/mobile/app/allergy-settings.tsx");
const runtime = read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
const tasteRepository = read("apps/mobile/features/consumer-taste-profile/adapters/supabaseConsumerTasteFoundationRepository.ts");
const copy = read("lib/i18n/zh-TW.ts");
const docs = read("docs/recommendation/rec-c-p1-user-allergy-setting-authority.md");
const packageJson = JSON.parse(read("package.json"));

check("lifecycle is exact REC-C-P1 candidate/freeze or REC-C successor",
  lifecycle.valid || recLifecycle.valid,
  lifecycle.valid ? lifecycle.phase : recLifecycle.phase);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains the exact pushed P0/P1 authority or REC-C predecessor",
  originHead === RECCP1_BASELINE
  || (lifecycle.phase === "frozen_pushed" && originHead === head)
  || recLifecycle.valid);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("manifest is exact, sorted, unique, wildcard-free, and present",
  JSON.stringify(RECCP1_PATHS) === JSON.stringify([...RECCP1_PATHS].sort())
  && new Set(RECCP1_PATHS).size === RECCP1_PATHS.length
  && RECCP1_PATHS.every((file) => !/[?*]/.test(file) && fs.existsSync(path.join(root, file))));
check("P1 contributes exactly one additive migration",
  RECCP1_PATHS.filter((file) => file.startsWith("supabase/migrations/")).join("\n") === RECCP1_MIGRATION);
check("frozen P0 migration digest is unchanged",
  crypto.createHash("sha256").update(fs.readFileSync("supabase/migrations/20260830010000_candidate_allergen_data_authority.sql")).digest("hex")
    === "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a");

check("governed source tuple is exact and all-null or all-present",
  ["source_vocabulary_id text", "source_vocabulary_version integer", "source_value_key text"].every((value) => sql.includes(value))
  && /source_vocabulary_id is null and source_vocabulary_version is null and source_value_key is null/.test(sql)
  && /source_vocabulary_id is not null and source_vocabulary_version is not null and source_value_key is not null/.test(sql));
check("tuple has an exact composite FK into frozen P0 source values",
  /foreign key \(source_vocabulary_id, source_vocabulary_version, source_value_key\)[\s\S]{0,180}private_restriction_allergen_source_values/.test(sql));
check("migration performs no legacy backfill or heuristic rewrite",
  !/update public\.dietary_restrictions|restriction_type\s*=\s*'allergy'|where label\s*=|ilike|lower\(/i.test(sql));
check("legacy and governed uniqueness are independent",
  /dietary_restrictions_legacy_unique_label_idx[\s\S]{0,180}where source_vocabulary_id is null/.test(sql)
  && /dietary_restrictions_governed_source_unique_idx[\s\S]{0,220}source_value_key[\s\S]{0,100}where source_vocabulary_id is not null/.test(sql));

check("writer accepts stable keys only and derives actor from auth.uid",
  /replace_authenticated_allergy_settings_v1\(\s*p_source_value_keys text\[\]/.test(sql)
  && /v_user_id uuid := auth\.uid\(\)/.test(sql)
  && !/p_(?:user|actor|owner|vocabulary|version|domain)/i.test(sql));
check("writer fixes exact P0 vocabulary, policy, taxonomy, and allergy domain",
  ["private-restriction-allergen-v1", "private-restriction-allergen-normalization-v1", "tastkind-allergen-tw-v1", "source_domain = 'allergy'"].every((value) => sql.includes(value)));
check("writer rejects null, blank, duplicate, over-limit, inactive, and unknown keys before writes",
  /array_position\(v_keys, null::text\)/.test(sql) && /ALLERGY_SOURCE_KEY_INVALID/.test(sql)
  && /ALLERGY_SOURCE_KEY_DUPLICATE/.test(sql) && /v_key_count > 11/.test(sql)
  && /ALLERGY_SOURCE_KEY_NOT_ACTIVE/.test(sql)
  && sql.indexOf("ALLERGY_SOURCE_KEY_NOT_ACTIVE") < sql.indexOf("delete from public.dietary_restrictions"));
check("writer serializes per actor and atomically replaces only governed v1 rows",
  /pg_advisory_xact_lock/.test(sql) && /:allergy_settings:v1/.test(sql)
  && /delete from public\.dietary_restrictions[\s\S]{0,220}source_vocabulary_id = 'private-restriction-allergen-v1'/.test(sql)
  && /insert into public\.dietary_restrictions/.test(sql));
check("compatibility text is explicitly non-authoritative and has no medical severity",
  /'governed_allergy', candidate\.key, 'unclassified', 'private'/.test(sql)
  && !/'severe'|'medical'|'life_threatening'/.test(sql));

check("canonical reader returns only stable keys and a coarse unresolved count",
  /read_authenticated_allergy_settings_v1\(\)/.test(sql)
  && /'allergen_keys'/.test(sql) && /'unresolved_selection_count'/.test(sql)
  && !/'restriction_type'|'severity'|'label'/.test(sql.slice(sql.indexOf("return pg_catalog.jsonb_build_object"), sql.indexOf("end;\n$$;", sql.indexOf("return pg_catalog.jsonb_build_object")))));
check("retired vocabulary/value/mapping/policy/taxonomy/target becomes unresolved",
  (sql.match(/active and .*retired_at is null/g) ?? []).length >= 5
  && /not exists \([\s\S]{0,2600}target\.active and target\.retired_at is null/.test(sql));
check("legacy all-null rows are excluded from Allergy semantics",
  /restriction\.source_vocabulary_id is not null/.test(sql)
  && /Rows with a null tuple remain legacy\/unclassified/.test(docs));

check("direct writes and anonymous RPC execution are closed",
  /revoke insert, update, delete on table public\.dietary_restrictions from public, anon, authenticated/.test(sql)
  && (sql.match(/revoke all on function public\.(?:read|replace)_authenticated_allergy_settings_v1/g) ?? []).length === 4
  && (sql.match(/grant execute on function public\.(?:read|replace)_authenticated_allergy_settings_v1/g) ?? []).length === 2);
check("Social pair reads are structurally restricted away from governed Allergy rows",
  /as restrictive[\s\S]{0,100}to social_pair_read_authority[\s\S]{0,100}source_vocabulary_id is null/.test(sql));
check("Mobile Taste foundation reads only legacy null-source rows",
  /query\.is\("source_vocabulary_id", null\)/.test(tasteRepository));

check("Mobile repository sends only stable keys and never constructs source tuples",
  /p_source_value_keys: \[\.\.\.selectedAllergenKeys\]/.test(repository)
  && !/p_source_vocabulary|p_source_version|p_user_id/.test(repository + contracts));
check("Mobile reader verifies exact P0 identities and exactly eleven frozen options",
  /CANDIDATE_ALLERGEN_VALUES\.map/.test(repository)
  && /PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID/.test(repository)
  && /CANDIDATE_ALLERGEN_TAXONOMY_ID/.test(repository));
check("controller is actor-generation safe and supports exact select/deselect replacement",
  /requestSequence/.test(controller) && /actorGeneration/.test(controller)
  && /draft\.splice\(index, 1\)/.test(controller) && /replaceCurrentUser\(draft\)/.test(controller));
check("settings UI is a checklist with no free text or severity picker",
  /accessibilityRole="checkbox"/.test(route) && /state\.options\.map/.test(route)
  && !/TextInput|severity|diagnosis|free.?text/i.test(route));
check("settings copy is truthful and contains cross-contact caution without a safety guarantee",
  /交叉接觸/.test(copy) && /推薦時會依可確認的餐點資料進行篩選/.test(copy)
  && !/保證安全|完全不會過敏|過敏原零風險/.test(copy));
check("runtime binds the same canonical auth port and singleton client once",
  /bindConsumerAllergySettingsRuntimeDependencies\(\{\s*authPort,\s*client: client as unknown/.test(runtime)
  && /clearConsumerAllergySettingsRuntimeDependencies\(\)/.test(runtime));

check("REC-C-P1 changes no recommendation, GEO, Nutrition, Meal Context, or Meal Buddy product path",
  !RECCP1_PATHS.some((file) => /consumer-meals|next-meal|geo|meal-buddy|meal-context/.test(file)));
check("all four dedicated commands are registered",
  RECCP1_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-c-p1")));
check("Production and deployment paths remain untouched",
  !RECCP1_PATHS.some((file) => /production|deploy|\.github\/workflows/i.test(file)));

const secretPatterns = [
  /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
check("manifest bytes contain no credential shape, CRLF, BOM, or NUL",
  RECCP1_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file)); const text = bytes.toString("utf8");
    return !secretPatterns.some((pattern) => pattern.test(text)) && !bytes.includes(Buffer.from("\r\n"))
      && !bytes.includes(0) && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
  }));
if ((lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed")
  && !recLifecycle.valid) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECCP1_COMMIT_SUBJECT);
}
const manifest = createReccp1Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths",
  manifest.entries.length === RECCP1_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECCP1_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-c-p1-guard", lifecycle: lifecycle.phase,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name), canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: manifest.entries.find((entry) => entry.path === RECCP1_MIGRATION)?.sha256,
  p0MigrationSha256: "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a",
  networkUsed: false, databaseUsed: false, developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
