import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const issues = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  issues.push({ name, message, ...extra });
}

function collectFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, predicate) : predicate(full) ? [full] : [];
  });
}

const requiredFiles = [
  "apps/mobile/features/consumer-ratings/errors.ts",
  "apps/mobile/features/consumer-ratings/types.ts",
  "apps/mobile/features/consumer-ratings/ports.ts",
  "apps/mobile/features/consumer-ratings/validation.ts",
  "apps/mobile/features/consumer-ratings/consumerRatingService.ts",
  "apps/mobile/features/consumer-ratings/featureFlags.ts",
  "apps/mobile/features/consumer-ratings/factories.ts",
  "apps/mobile/features/consumer-ratings/index.ts",
  "apps/mobile/features/consumer-ratings/adapters/mockConsumerRatingRepository.ts",
  "apps/mobile/features/consumer-ratings/adapters/disabledConsumerRatingRepository.ts",
  "docs/consumer-runtime-phase-2w/implementation-plan.md",
  "docs/consumer-runtime-phase-2w/rating-runtime-contract.md",
  "docs/consumer-runtime-phase-2w/architecture-and-source-modes.md",
  "docs/consumer-runtime-phase-2w/known-issues-and-deferrals.md",
  "docs/consumer-runtime-phase-2w/phase-transition-decision.md",
  "docs/consumer-runtime-phase-2w/validation-plan.md",
  "scripts/consumer-ratings-phase-2w-a-guard.mjs",
  "scripts/consumer-ratings-phase-2w-a-contract-smoke.mjs"
];

for (const rel of requiredFiles) {
  if (fs.existsSync(path.join(root, rel))) pass(`required file exists: ${rel}`);
  else fail(`required file exists: ${rel}`, "Missing Phase 2W-A required file.");
}

const allowedExact = new Set([
  "docs/tastkind-runtime-integration-roadmap.md",
  "package.json",
  "scripts/consumer-ratings-phase-2w-a-guard.mjs",
  "scripts/consumer-ratings-phase-2w-a-contract-smoke.mjs"
]);
const allowedPrefixes = ["apps/mobile/features/consumer-ratings/", "docs/consumer-runtime-phase-2w/"];
const changedFiles = [...new Set([
  ...git(["diff", "--name-only"]).split(/\r?\n/),
  ...git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)
].filter(Boolean).map((file) => file.replaceAll("\\", "/")))];
const outOfScope = changedFiles.filter((file) => !allowedExact.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)));
if (!outOfScope.length) pass("all changed files stay inside the approved Phase 2W-A boundary", { changedFiles });
else fail("all changed files stay inside the approved Phase 2W-A boundary", "Out-of-scope files changed.", { outOfScope });

const staged = git(["diff", "--cached", "--name-only"]);
if (!staged) pass("staged diff is empty");
else fail("staged diff is empty", "Phase 2W-A must not stage files.", { staged: staged.split(/\r?\n/) });

const featureRoot = path.join(root, "apps", "mobile", "features", "consumer-ratings");
const sourceFiles = collectFiles(featureRoot, (file) => file.endsWith(".ts"));
const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const forbiddenSourcePatterns = [
  [/@supabase\//i, "SDK import"],
  [/\bfetch\s*\(/, "fetch API"],
  [/\bXMLHttpRequest\b|\bWebSocket\b|\baxios\b/, "network API"],
  [/user_restaurant_ratings|user_menu_item_ratings/i, "database table identifier"],
  [/\.rpc\s*\(/, "RPC call"],
  [/service_role/i, "privileged role reference"]
];
for (const [pattern, label] of forbiddenSourcePatterns) {
  if (!pattern.test(source)) pass(`Phase 2W-A source contains no ${label}`);
  else fail(`Phase 2W-A source contains no ${label}`, `Found forbidden ${label}.`);
}

const ports = read("apps/mobile/features/consumer-ratings/ports.ts");
if (!/\buserId\b|\buser_id\b/.test(ports)) pass("rating repository ports accept no ownership identifier");
else fail("rating repository ports accept no ownership identifier", "Repository ports must not expose arbitrary ownership input.");
if (/getCurrentUserRestaurantRating/.test(ports) && /getCurrentUserMenuItemRating/.test(ports) && /createOrReplaceCurrentUserRating/.test(ports)) {
  pass("rating ports expose current-user restaurant, menu-item, and write boundaries");
} else fail("rating ports expose current-user restaurant, menu-item, and write boundaries", "Required current-user port methods are missing.");

const flags = read("apps/mobile/features/consumer-ratings/featureFlags.ts");
if (/if \(!value\) return "mock"/.test(flags)) pass("default rating read source is mock");
else fail("default rating read source is mock", "Read source must default to mock.");
if (/parseWriteSource[\s\S]*?if \(!value\) return "disabled"/.test(flags)) pass("default rating write source is disabled");
else fail("default rating write source is disabled", "Write source must default to disabled.");
if (/issues\.push\(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_(?:READ|WRITE)_SOURCE/.test(flags) && /return "disabled"/.test(flags)) {
  pass("invalid rating sources record an issue and fail closed to disabled");
} else fail("invalid rating sources record an issue and fail closed to disabled", "Invalid sources must be recorded and disabled.");

const factories = read("apps/mobile/features/consumer-ratings/factories.ts");
if (/flags\.issues\.length/.test(factories) && /ConsumerRatingConfigurationInvalidError/.test(factories)) pass("factory rejects invalid source configuration");
else fail("factory rejects invalid source configuration", "Factory must reject all flag issues.");
if (!/catch[\s\S]*mock|fallback/i.test(factories)) pass("factory has no silent mock fallback");
else fail("factory has no silent mock fallback", "Factory must not catch failures and select mock.");
if (/authPort\?/.test(factories) && /requires an explicit ConsumerAuthPort/.test(factories)) pass("factory requires the existing Consumer Auth boundary explicitly");
else fail("factory requires the existing Consumer Auth boundary explicitly", "Factory must require an injected auth port.");

const errors = read("apps/mobile/features/consumer-ratings/errors.ts");
for (const code of ["rating_read_disabled", "rating_write_disabled", "rating_configuration_invalid", "rating_value_invalid", "rating_ownership_field_rejected"]) {
  if (errors.includes(code)) pass(`typed rating error exists: ${code}`);
  else fail(`typed rating error exists: ${code}`, "Required typed error code is missing.");
}

const mock = read("apps/mobile/features/consumer-ratings/adapters/mockConsumerRatingRepository.ts");
if (!/Date\.now\(|new Date\(|Math\.random\(/.test(mock)) pass("mock rating repository is independent of wall-clock time and randomness");
else fail("mock rating repository is independent of wall-clock time and randomness", "Mock behavior must be deterministic.");
if (/fixtures\?/.test(mock) && /clock\?/.test(mock)) pass("mock rating repository supports deterministic dependency injection");
else fail("mock rating repository supports deterministic dependency injection", "Fixtures and clock must be injectable.");
if (/isCurrent: false/.test(mock) && /isCurrent: true/.test(mock) && /status: replaced \? "replaced" : "saved"/.test(mock)) pass("mock repository implements current-row replacement semantics");
else fail("mock repository implements current-row replacement semantics", "Replacement must retire the old current row and create a current replacement.");
if (/restaurant:/.test(read("apps/mobile/features/consumer-ratings/validation.ts")) && /menu_item:/.test(read("apps/mobile/features/consumer-ratings/validation.ts"))) pass("restaurant and menu-item target keys are isolated");
else fail("restaurant and menu-item target keys are isolated", "Target namespaces must be separate.");

const disabled = read("apps/mobile/features/consumer-ratings/adapters/disabledConsumerRatingRepository.ts");
if (/ConsumerRatingReadDisabledError/.test(disabled) && /ConsumerRatingWriteDisabledError/.test(disabled)) pass("disabled adapter returns typed read and write errors");
else fail("disabled adapter returns typed read and write errors", "Disabled adapter must fail closed with typed errors.");

const appFiles = collectFiles(path.join(root, "apps", "mobile", "app"), (file) => /\.tsx?$/.test(file));
const uiImportsRatings = appFiles.filter((file) => /consumer-ratings/.test(fs.readFileSync(file, "utf8")));
const uiDiff = git(["diff", "--name-only", "--", "apps/mobile/app"]);
if (!uiImportsRatings.length && !uiDiff) pass("Mobile UI is not cut over in Phase 2W-A");
else fail("Mobile UI is not cut over in Phase 2W-A", "UI must remain unchanged and must not import the ratings runtime.", { uiDiff, uiImportsRatings });

const migrationDiff = git(["diff", "--name-only", "--", "supabase/migrations"]);
const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
if (!migrationDiff && migrations.length === 33 && migrations.at(-1) === "20260716060000_restore_restaurant_internal_reader_set_option.sql") {
  pass("migrations remain unchanged at 33 through 20260716060000", { count: migrations.length, latest: migrations.at(-1) });
} else fail("migrations remain unchanged at 33 through 20260716060000", "Phase 2W-A must not change migration inventory.", { migrationDiff, count: migrations.length, latest: migrations.at(-1) });

const contractDoc = read("docs/consumer-runtime-phase-2w/rating-runtime-contract.md");
if (/authenticated atomic RPC/i.test(contractDoc) && /auth\.uid\(\)/.test(contractDoc) && /must not send `user_id`/i.test(contractDoc)) pass("future authenticated atomic RPC ownership decision is documented");
else fail("future authenticated atomic RPC ownership decision is documented", "Future write contract must derive ownership from auth.uid().");

const roadmap = read("docs/tastkind-runtime-integration-roadmap.md");
if (/Phase 2W may begin after the Phase 2V-E Development Freeze/.test(roadmap) && /N4 and Phase 2V-F remain \*\*BLOCKED \/ NOT EXECUTED\*\*/.test(roadmap)) pass("canonical roadmap contains the approved narrow transition note");
else fail("canonical roadmap contains the approved narrow transition note", "Approved Phase 2V to 2W transition note is missing.");

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["test:consumer-phase2w-a"] === "node scripts/consumer-ratings-phase-2w-a-guard.mjs" &&
    packageJson.scripts?.["test:consumer-phase2w-a-smoke"] === "node scripts/consumer-ratings-phase-2w-a-contract-smoke.mjs") {
  pass("package.json contains only the required Phase 2W-A scripts");
} else fail("package.json contains only the required Phase 2W-A scripts", "Phase 2W-A npm scripts are missing or incorrect.");

const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
const artifacts = untracked.filter((file) => /(?:^|\/)(?:\.next|dist|coverage|cache)(?:\/|$)|\.tsbuildinfo$|\.log$|\.tmp$|apps\/mobile\/features\/consumer-ratings\/.*\.js$/i.test(file));
if (!artifacts.length) pass("no untracked generated artifacts exist");
else fail("no untracked generated artifacts exist", "Generated artifacts must not remain in the Repository.", { artifacts });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Phase 2W-A Ratings Contract and Local Architecture",
  totalChecks: checks.length,
  passedChecks: checks.filter((check) => check.pass).length,
  failedChecks: checks.filter((check) => !check.pass).length,
  migrationCount: migrations.length,
  latestMigration: migrations.at(-1),
  phase2WBStarted: false,
  n4Executed: false,
  networkRequestUsed: false,
  databaseWriteUsed: false,
  productionTouched: false,
  checks,
  issues
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);
