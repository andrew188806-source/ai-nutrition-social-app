#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RECDP1_BASELINE,
  RECDP1_COMMIT_SUBJECT,
  RECDP1_MIGRATION,
  RECDP1_NPM_KEYS,
  RECDP1_PATHS,
  classifyRecdp1Lifecycle,
  createRecdp1Manifest
} from "./recommendation-rec-d-p1-successor-manifest.mjs";
import { RECD_BASELINE, RECD_PATHS, classifyRecdLifecycle } from "./recommendation-rec-d-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha = (file) => crypto.createHash("sha256")
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

const head = git(["rev-parse", "HEAD"]); const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const worktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const deltaPaths = head === RECDP1_BASELINE ? []
  : lines(git(["diff", "--name-only", `${RECDP1_BASELINE}..HEAD`]));
const lifecycle = classifyRecdp1Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === RECDP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdLifecycle = classifyRecdLifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths,
  deltaPaths: head === RECD_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECD_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdSuccessor = recdLifecycle.valid;


const sql = read(RECDP1_MIGRATION);
const executable = sql.replace(/--.*$/gm, "");
const table = sql.match(/create table public\.private_user_ingredient_avoidance_settings \([\s\S]*?\n\);/i)?.[0] ?? "";
const repository = read("apps/mobile/features/consumer-ingredient-avoidance-settings/repository.ts");
const controller = read("apps/mobile/features/consumer-ingredient-avoidance-settings/controller.ts");
const contracts = read("apps/mobile/features/consumer-ingredient-avoidance-settings/supabaseContracts.ts");
const runtime = read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
const route = read("apps/mobile/app/ingredient-avoidance-settings.tsx");
const profile = read("apps/mobile/app/me.tsx");
const copy = read("lib/i18n/zh-TW.ts");
const settingCopy = copy.slice(copy.indexOf("ingredientAvoidanceSettings:"),
  copy.indexOf("socialInterestSettings:", copy.indexOf("ingredientAvoidanceSettings:")));
const docs = read("docs/recommendation/rec-d-p1-user-ingredient-avoidance-setting-authority.md");
const packageJson = JSON.parse(read("package.json"));

check("lifecycle is exact REC-D-P1 candidate/freeze or REC-D successor",
  lifecycle.valid || recdSuccessor, recdSuccessor ? recdLifecycle.phase : lifecycle.phase);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains exact REC-D-P0 baseline or pushed P1 freeze",
  originHead === RECDP1_BASELINE || (lifecycle.phase === "frozen_pushed" && originHead === head)
    || (recdSuccessor && originHead === RECD_BASELINE), originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest is sorted, unique, and present",
  JSON.stringify(RECDP1_PATHS) === JSON.stringify([...RECDP1_PATHS].sort())
  && new Set(RECDP1_PATHS).size === RECDP1_PATHS.length
  && RECDP1_PATHS.every((file) => !/[?*]/.test(file) && fs.existsSync(path.join(root, file))));
// Under a REC-D successor the HEAD commit is REC-D's, so its delta is REC-D's exact path set, not
// this round's. Recognised on exactly the terms check 07 below already uses; on REC-D-P1's own
// commit the REC-D set is absent and this assertion evaluates unchanged.
check("round changes exactly the authorized manifest",
  recdSuccessor
    ? JSON.stringify(recdLifecycle.manifest) === JSON.stringify(RECD_PATHS)
    : JSON.stringify(lifecycle.manifest) === JSON.stringify(RECDP1_PATHS),
  { actual: recdSuccessor ? recdLifecycle.manifest : lifecycle.manifest,
    expected: recdSuccessor ? RECD_PATHS : RECDP1_PATHS });
check("round adds exactly one additive migration, while REC-D adds none",
  recdSuccessor
    ? recdLifecycle.manifest.every((file) => !file.startsWith("supabase/migrations/"))
    : JSON.stringify(lifecycle.manifest.filter((file) => file.startsWith("supabase/migrations/")))
      === JSON.stringify([RECDP1_MIGRATION]));
check("frozen REC-C-P0 migration digest is unchanged",
  sha("supabase/migrations/20260830010000_candidate_allergen_data_authority.sql")
    === "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a");
check("frozen REC-C-P1 migration digest is unchanged",
  sha("supabase/migrations/20260831010000_user_allergy_setting_authority.sql")
    === "117994481084313b8c5ef2d9483064a0ec893324589a14e6e286cd85f43171a0");
check("frozen REC-D-P0 migration digest is unchanged",
  sha("supabase/migrations/20260901010000_candidate_ingredient_avoidance_data_authority.sql")
    === "3e03a4ba3e93a43763861c1669e4193c6b830dcbda2fea630d44b999d11477bd");

check("separate private table binds exact P0 source tuple",
  /create table public\.private_user_ingredient_avoidance_settings/.test(sql)
  && /foreign key \(source_vocabulary_id, source_vocabulary_version, source_value_key\)[\s\S]{0,180}references public\.private_ingredient_avoidance_source_values/.test(sql));
check("settings schema stores only actor, exact tuple, and audit timestamps",
  ["setting_id uuid", "user_id uuid", "source_vocabulary_id text", "source_vocabulary_version integer",
    "source_value_key text", "created_at timestamptz", "updated_at timestamptz"].every((value) => table.includes(value))
  && !/^\s*(?:reason|religion|religious_identity|medical_reason|severity|mode)\s+/im.test(table));
check("exact authority identities are server fixed",
  ["private-ingredient-avoidance-v1", "private-ingredient-avoidance-normalization-v1",
    "tastkind-ingredient-avoidance-v1", "source_domain = 'ingredient_avoidance'",
    "fact_domain = 'ingredient_avoidance_content'"].every((value) => sql.includes(value)));
check("legacy and REC-C Allergy authorities are structurally untouched",
  !/(?:alter|insert into|update|delete from) public\.(?:dietary_restrictions|private_restriction_allergen\w*)/i.test(executable));
check("private settings enforce and force RLS with actor ownership",
  /enable row level security/.test(sql) && /force row level security/.test(sql)
  && /using \(auth\.uid\(\) = user_id\)[\s\S]{0,80}with check \(auth\.uid\(\) = user_id\)/.test(sql));
check("direct canonical table access is revoked from every client and service role",
  /revoke all on table public\.private_user_ingredient_avoidance_settings\s+from public, anon, authenticated, authenticator, service_role/.test(sql));

check("reader and writer derive the actor only from auth.uid",
  (sql.match(/v_user_id uuid := auth\.uid\(\)/g) ?? []).length === 2
  && !/p_(?:user|actor|owner)_id/i.test(sql));
check("writer accepts only a stable-key array and rejects malformed input",
  /replace_authenticated_ingredient_avoidance_settings_v1\(\s*p_source_value_keys text\[\]/.test(sql)
  && /INGREDIENT_AVOIDANCE_SOURCE_KEY_INVALID/.test(sql)
  && /INGREDIENT_AVOIDANCE_SOURCE_KEY_DUPLICATE/.test(sql)
  && /v_key_count > 3/.test(sql));
check("writer validates complete active governance before replacement",
  /if v_invalid_key is not null then/.test(sql)
  && /INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE/.test(sql)
  && (sql.match(/active and .*retired_at is null/g) ?? []).length >= 10
  && sql.indexOf("INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE")
    < sql.indexOf("delete from public.private_user_ingredient_avoidance_settings"));
check("writer serializes and atomically replaces only current actor REC-D v1 rows",
  /pg_advisory_xact_lock/.test(sql) && /:ingredient_avoidance_settings:v1/.test(sql)
  && /delete from public\.private_user_ingredient_avoidance_settings[\s\S]{0,220}setting\.user_id = v_user_id/.test(sql)
  && /insert into public\.private_user_ingredient_avoidance_settings/.test(sql));
check("empty replacement clears only REC-D and cannot rewrite Allergy",
  /from pg_catalog\.unnest\(v_keys\)/.test(sql)
  && !/delete from public\.dietary_restrictions/.test(executable));
check("reader returns exact identity, active keys, and explicit unresolved count",
  /read_authenticated_ingredient_avoidance_settings_v1\(\)/.test(sql)
  && /'ingredient_avoidance_keys', v_keys/.test(sql)
  && /'unresolved_selection_count', v_unresolved_count/.test(sql)
  && /not exists \([\s\S]{0,3000}target\.active and target\.retired_at is null/.test(sql));
check("only authenticated RPC execution is exposed",
  (sql.match(/grant execute on function public\.(?:read|replace)_authenticated_ingredient_avoidance_settings_v1/g) ?? []).length === 2
  && (sql.match(/revoke all on function public\.(?:read|replace)_authenticated_ingredient_avoidance_settings_v1/g) ?? []).length === 4);
check("Taste Social Public and Meal Buddy receive no authority",
  !/grant[^;]*(?:taste|social|public_profile|meal_buddy)|create view/i.test(executable));

check("Mobile uses exactly the three frozen P0 options and labels",
  /CANDIDATE_INGREDIENT_AVOIDANCE_VALUES\.map/.test(repository)
  && ["pork", "beef", "coriander"].every((key) => docs.includes(`\`${key}\``))
  && ["豬肉／豬來源成分", "牛肉／牛來源成分", "香菜"].every((label) => docs.includes(label)));
check("Mobile repository sends stable keys only and validates exact authority response",
  /p_source_value_keys: \[\.\.\.selectedKeys\]/.test(repository)
  && /isCandidateIngredientAvoidanceKey/.test(repository)
  && /PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID/.test(repository)
  && !/p_(?:user|actor|owner|source_vocabulary)/i.test(repository + contracts));
check("controller is actor-generation safe with explicit replacement and truthful failure",
  /requestSequence/.test(controller) && /actorGeneration/.test(controller)
  && /replaceCurrentUser\(draft\)/.test(controller)
  && /phase: "save_failed"/.test(controller)
  && /invalid_server_response/.test(controller));
check("settings surface is exact checklist plus explicit Save with unresolved blocking",
  /accessibilityRole="checkbox"/.test(route) && /controller\.toggle\(option\.key\)/.test(route)
  && /controller\.save\(\)/.test(route) && /state\.unresolvedSelectionCount > 0/.test(route)
  && !/TextInput|reasonPicker|religionPicker|severityPicker/i.test(route));
check("profile route and stack registration are explicit and separate from Allergy",
  profile.includes('/ingredient-avoidance-settings')
  && read("apps/mobile/app/_layout.tsx").includes('name="ingredient-avoidance-settings"'));
check("runtime binds a separate settings repository without recommendation activation",
  /bindConsumerIngredientAvoidanceSettingsRuntimeDependencies\(\{\s*authPort,\s*client: client as unknown/.test(runtime)
  && /clearConsumerIngredientAvoidanceSettingsRuntimeDependencies\(\)/.test(runtime)
  && !/applyIngredientAvoidance|ingredientAvoidanceSettingsReader|ingredient_avoidance_keys/.test(runtime));
check("copy is truthful while docs reject religion and current recommendation effect",
  /選擇你平常不吃的食物，之後推薦會依可確認的餐點成分資料進行篩選/.test(settingCopy)
  && !/過敏原|清真|宗教|安全|保證/.test(settingCopy)
  && /not injected into the recommendation repository/i.test(docs)
  && /no safety, guarantee, religious-compliance, or identity claim/i.test(docs));
check("all four dedicated commands are registered",
  RECDP1_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-d-p1")));
check("Production and deployment paths remain untouched",
  !RECDP1_PATHS.some((file) => /production|deploy|\.github\/workflows/i.test(file)));

const secretPatterns = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}"].join("")),
  new RegExp(["sb", "_secret_[A-Za-z0-9_-]{10,}"].join("")),
  new RegExp(["postgres", "(?:ql)?://[^\\s\"']*:[^\\s\"']*@"].join("")),
  new RegExp(["-----BEGIN ", "[A-Z ]*PRIVATE KEY-----"].join(""))
];
check("manifest bytes contain no credential shape, CRLF, BOM, or NUL", RECDP1_PATHS.every((file) => {
  const bytes = fs.readFileSync(path.join(root, file)); const text = bytes.toString("utf8");
  return !secretPatterns.some((pattern) => pattern.test(text)) && !bytes.includes(Buffer.from("\r\n"))
    && !bytes.includes(0) && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
}));
if (!recdSuccessor && (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed")) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECDP1_COMMIT_SUBJECT);
}
const manifest = createRecdp1Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths",
  manifest.entries.length === RECDP1_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECDP1_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-d-p1-guard", lifecycle: lifecycle.phase,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: manifest.entries.find((entry) => entry.path === RECDP1_MIGRATION)?.sha256,
  recdP0MigrationSha256: "3e03a4ba3e93a43763861c1669e4193c6b830dcbda2fea630d44b999d11477bd",
  networkUsed: false, databaseUsed: false, developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
