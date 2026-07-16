import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const issues = [];
const rawRepository = "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts";
const publicView = "restaurant_public_published_nutrition_v1";
const approvedRpcs = [
  "restaurant_internal_restaurants_v1",
  "restaurant_internal_branches_v1",
  "restaurant_internal_menus_v1",
  "restaurant_internal_menu_categories_v1",
  "restaurant_internal_menu_items_v1",
  "restaurant_internal_branch_menu_items_v1",
  "restaurant_internal_current_nutrition_v1"
].sort();
const rawObjects = [
  "restaurants", "restaurant_branches", "menus", "menu_categories", "menu_items",
  "branch_menu_items", "menu_item_nutrition", "current_published_menu_item_nutrition",
  "restaurant_public_view", "published_menus_view", "published_branch_menu_items_view"
];
const historicalScripts = {
  "scripts/restaurant-supabase-phase-1a-guard.mjs": "693479c975b6a7e51c2378aaac64e56e112ff1575a31df1ab6cb0247cf3afa67",
  "scripts/restaurant-supabase-phase-1b-rest-guard.mjs": "4ce5c7320a4566b1481c1bcc5b91f6b6aa101b07120d36144a9bc2e5b132b9d5",
  "scripts/restaurant-supabase-phase-1d-live-read-parity.mjs": "b34e4d036cab6ef93c9e00f6f920871f69be7aba9e0b162bd338f46ad60ffe25",
  "scripts/nutrition-direct-read-revocation-phase-2u-c-b-guard.mjs": "932b503878cf6a60b8a45fe6d06c7fd27e70f4707a27ceb8ed14a8cfe1856174",
  "scripts/restaurant-public-nutrition-phase-2u-c-a-guard.mjs": "718e0a5c6f4889767226b9cea506534b06f547be1adb2abd30f86b5966966bec",
  "scripts/restaurant-public-nutrition-phase-2u-c-a-smoke.mjs": "8ab4def463ee50b899bfbd7579fa97a9be6e28fbf1c0cf9625f0c65c684e28a0"
};

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}
function check(name, condition, details = "") {
  checks.push({ name, pass: Boolean(condition), details });
  if (!condition) issues.push({ name, details });
}
function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "build", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute)); else files.push(absolute);
  }
  return files;
}

const sourceFiles = walk(path.join(root, "apps/restaurant-web"))
  .filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file));
const sources = sourceFiles.map((file) => ({
  file: path.relative(root, file).replaceAll("\\", "/"),
  text: fs.readFileSync(file, "utf8")
}));

check("dormant raw repository is deleted", !exists(rawRepository));
const executableRawRefs = sources.filter(({ text }) =>
  text.includes("supabase-restaurant-read-repository") || text.includes("createSupabaseRestaurantReadRepository")
).map(({ file }) => file);
check("active source has zero old repository references", executableRawRefs.length === 0, executableRawRefs.join(", "));
for (const [file, expectedHash] of Object.entries(historicalScripts)) {
  const absolute = path.join(root, file);
  const actualHash = fs.existsSync(absolute) ? crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex") : "missing";
  check(`frozen historical script is unchanged: ${file}`, actualHash === expectedHash, actualHash);
}
check("frozen historical script diff is empty", git(["diff", "--name-only", "HEAD", "--", ...Object.keys(historicalScripts)]) === "");

const rawReads = [];
for (const { file, text } of sources) {
  for (const object of rawObjects) {
    const directRead = new RegExp(`(?:\\.from|client\\.select)\\s*(?:<[^>]+>)?\\s*\\(\\s*["']${object}["']`);
    if (directRead.test(text)) rawReads.push(`${file}:${object}`);
  }
}
check("active source has zero raw internal reads", rawReads.length === 0, rawReads.join(", "));

const rpcRepository = read("apps/restaurant-web/repositories/supabase/restaurant-owner-rpc-repository.ts");
const rpcBlock = rpcRepository.match(/const RPC = \{([\s\S]*?)\}\s+as const/)?.[1] ?? "";
const actualRpcs = [...rpcBlock.matchAll(/["'](restaurant_internal_[a-z0-9_]+_v1)["']/g)].map((match) => match[1]).sort();
check("exactly seven approved internal RPC names remain", JSON.stringify(actualRpcs) === JSON.stringify(approvedRpcs), actualRpcs.join(", "));
check("owner repository uses only RPC calls", /client\.rpc\(name, args\)/.test(rpcRepository) && !/\.from\s*\(|client\.select/.test(rpcRepository));

const resources = read("apps/restaurant-web/adapters/supabase/readonly-resources.ts");
const resourceBlock = resources.match(/READONLY_RESOURCES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
const resourceNames = [...resourceBlock.matchAll(/["']([a-z0-9_]+)["']/g)].map((match) => match[1]);
check("readonly REST allowlist contains only the public-safe view", JSON.stringify(resourceNames) === JSON.stringify([publicView]), resourceNames.join(", "));

const publicRepository = read("apps/restaurant-web/repositories/supabase/supabase-public-nutrition-repository.ts");
check("public-safe repository selects only approved view", publicRepository.includes(`client.select<RestaurantPublicPublishedNutritionRow[]>("${publicView}"`) && !rawObjects.some((object) => new RegExp(`["']${object}["']`).test(publicRepository)));
check("server readonly transport remains server-only", read("apps/restaurant-web/adapters/supabase/server-readonly-client.ts").startsWith('import "server-only"'));

const runtimeText = sources.map(({ text }) => text).join("\n");
check("explicit mock mode remains", /dataSource === "mock"/.test(read("apps/restaurant-web/services/restaurant-runtime-service-factory.ts")));
check("production mock fails closed", /raw === "mock"[\s\S]*dataSource: "disabled"[\s\S]*production-mock/.test(read("apps/restaurant-web/config/restaurant-data-source.ts")));
check("no Supabase-to-mock fallback", !/fallbackToMock|readonlyFallbackToMock|catch\s*\([^)]*\)\s*\{[^}]*\bmock\b/is.test(runtimeText));
check("no database write method exists in active Restaurant Web source", !/\.(?:insert|update|upsert|delete)\s*\(/.test(runtimeText));
check("no getSession authorization", !/\.auth\.getSession\s*\(/.test(runtimeText));
check("no browser credential storage", !/(?:localStorage|sessionStorage)[\s\S]{0,100}(?:token|session)|(?:token|session)[\s\S]{0,100}(?:localStorage|sessionStorage)/i.test(runtimeText));
check("no privileged browser dependency", !/service[_-]?role/i.test(runtimeText));

const docs = [
  "implementation-plan.md", "n4-revocation-contract.md", "raw-runtime-dependency-closure.md",
  "dv-001-actor-validation-plan.md", "performance-and-query-plan-contract.md",
  "development-readonly-query-plan-audit.sql", "validation-and-rollout-plan.md", "known-issues-and-deferrals.md"
].map((name) => `docs/runtime-integration-phase-2v-e/${name}`);
for (const doc of docs) check(`required artifact exists: ${doc}`, exists(doc));
const docText = docs.filter(exists).map(read).join("\n");
for (const issue of [
  "P2V-B-KI-001", "P2V-B-DV-001", "P2V-C-TR-001", "P2V-C-DI-002", "P2V-C-DD-001",
  "P2V-C-PD-001", "P2V-D-DEP-001", "P2V-D-DEP-002", "P2V-D-PKG-002", "P2V-D-PERF-002",
  "P2V-D-RAW-001", "P2V-D-PD-001", "P2V-PERF-001"
]) check(`issue register preserves ${issue}`, docText.includes(issue));
check("N4 is explicitly blocked", /N4[^\n]{0,40}blocked|N4[^\n]{0,40}阻擋/i.test(docText));

const audit = read("docs/runtime-integration-phase-2v-e/development-readonly-query-plan-audit.sql");
const auditNoComments = audit.replace(/--[^\n]*/g, "");
check("audit pack is transaction read-only", /BEGIN\s*;/i.test(auditNoComments) && /SET\s+TRANSACTION\s+READ\s+ONLY\s*;/i.test(auditNoComments) && /ROLLBACK\s*;/i.test(auditNoComments));
check("audit pack has no DML", !/\b(?:INSERT|UPDATE|DELETE|MERGE|COPY|TRUNCATE)\b/i.test(auditNoComments));
check("audit pack has no privilege mutation", !/\b(?:GRANT|REVOKE)\b/i.test(auditNoComments));
check("audit pack has no role switch", !/\bSET\s+(?:LOCAL\s+)?ROLE\b|RESET\s+ROLE|SESSION\s+AUTHORIZATION/i.test(auditNoComments));
check("audit pack has no direct Auth user query", !/auth\.users/i.test(auditNoComments));
check("audit pack has no privileged role dependency", !/service[_-]?role/i.test(auditNoComments));
check("audit pack receives actor claims through a runtime placeholder", /set_config\s*\(\s*'request\.jwt\.claims'\s*,\s*:'actor_jwt_claims_json'\s*,\s*true\s*\)/i.test(auditNoComments));
check("audit pack contains no hard-coded actor UUID", !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(auditNoComments));
check("audit pack covers all seven RPCs", approvedRpcs.every((rpc) => audit.includes(rpc)));

const restaurantPackage = JSON.parse(read("apps/restaurant-web/package.json"));
check("historical Restaurant Web package scripts are preserved", restaurantPackage.scripts["test:phase1a"] === "node ../../scripts/restaurant-supabase-phase-1a-guard.mjs" && restaurantPackage.scripts["test:phase1b-rest"] === "node ../../scripts/restaurant-supabase-phase-1b-rest-guard.mjs" && restaurantPackage.scripts["test:phase1d-live"] === "node ../../scripts/restaurant-supabase-phase-1d-live-read-parity.mjs");
const rootPackage = JSON.parse(read("package.json"));
check("new Phase 2V-E package scripts are preserved", rootPackage.scripts["test:restaurant-phase2v-e-preflight"] === "node scripts/restaurant-n4-phase-2v-e-preflight-guard.mjs" && rootPackage.scripts["test:restaurant-phase2v-e"] === "node scripts/restaurant-n4-phase-2v-e-guard.mjs" && rootPackage.scripts["test:restaurant-phase2v-e-smoke"] === "node scripts/restaurant-n4-phase-2v-e-contract-smoke.mjs");

const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
check("migration inventory remains exact", migrations.length === 33 && migrations.at(-1) === "20260716060000_restore_restaurant_internal_reader_set_option.sql", `${migrations.length}:${migrations.at(-1)}`);
check("migration diff is empty", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]) === "");
check("frozen Phase 2V documents are unchanged", git(["diff", "--name-only", "HEAD", "--", "docs/runtime-integration-phase-2v", "docs/runtime-integration-phase-2v-b", "docs/runtime-integration-phase-2v-c", "docs/runtime-integration-phase-2v-d"]) === "");
check("staged diff is empty", git(["diff", "--cached", "--name-only"]) === "");

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2V-E",
  checks: checks.length,
  passedChecks: checks.filter((item) => item.pass).length,
  issues,
  sourceFilesScanned: sources.length,
  approvedRpcs: actualRpcs,
  remoteOperationUsed: false,
  databaseWriteExecuted: false,
  n4Executed: false
}, null, 2));
process.exit(issues.length ? 1 : 0);
