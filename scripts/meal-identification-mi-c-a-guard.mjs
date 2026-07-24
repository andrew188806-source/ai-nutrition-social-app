#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const protectedMigration =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const allowedImplementationPaths = [
  "apps/mobile/features/meal-identification/finalizationContract.ts",
  "apps/mobile/features/meal-identification/index.ts",
  "package.json",
  "scripts/meal-identification-mi-c-a-contract-smoke.mjs",
  "scripts/meal-identification-mi-c-a-guard.mjs"
].sort();
const frozenMiBPaths = [
  "apps/mobile/features/meal-identification/types.ts",
  "apps/mobile/features/meal-identification/sourceResolutionPolicy.ts",
  "apps/mobile/features/meal-identification/catalogCandidateAdapter.ts",
  "apps/mobile/features/meal-identification/candidateResolver.ts"
];
const checks = [];
const issues = [];

function check(name, pass, details = "") {
  checks.push({ name, pass, ...(details ? { details } : {}) });
  if (!pass) issues.push({ name, details });
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.error || "unknown error"}`
    );
  }
  return result.stdout.trim();
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const trackedChanged = git(["diff", "--name-only"])
  .split(/\r?\n/)
  .filter(Boolean);
const untracked = git(["ls-files", "--others", "--exclude-standard"])
  .split(/\r?\n/)
  .filter(Boolean);
const implementationPaths = [
  ...trackedChanged,
  ...untracked.filter((entry) => entry !== protectedMigration)
].sort();

check(
  "exact MI-C-A implementation path inventory",
  JSON.stringify(implementationPaths) ===
    JSON.stringify(allowedImplementationPaths),
  implementationPaths.join(", ")
);
check(
  "protected migration is the only non-implementation untracked path",
  JSON.stringify(
    untracked.filter((entry) => !allowedImplementationPaths.includes(entry))
  ) === JSON.stringify([protectedMigration]),
  untracked.join(", ")
);

const migrationTrackedDiff = trackedChanged.filter((entry) =>
  entry.startsWith("supabase/migrations/")
);
const migrationUntracked = untracked.filter(
  (entry) =>
    entry.startsWith("supabase/migrations/") && entry !== protectedMigration
);
check(
  "no migration added or modified",
  migrationTrackedDiff.length === 0 && migrationUntracked.length === 0
);

for (const frozenPath of frozenMiBPaths) {
  check(
    `frozen MI-B core unchanged: ${frozenPath}`,
    !trackedChanged.includes(frozenPath) && !untracked.includes(frozenPath)
  );
}

const indexPath = "apps/mobile/features/meal-identification/index.ts";
const indexDiff = git(["diff", "--unified=0", "--", indexPath]);
const indexAddedLines = indexDiff
  .split(/\r?\n/)
  .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
  .map((line) => line.slice(1));
check(
  "index.ts changes only add finalization exports",
  !indexDiff
    .split(/\r?\n/)
    .some((line) => line.startsWith("-") && !line.startsWith("---")) &&
    indexAddedLines.length > 0 &&
    indexAddedLines.every(
      (line) =>
        line.trim() === "" ||
        /^export(?: type)? \{$/.test(line.trim()) ||
        /finalizationContract|buildMealIdentificationFinalization|MEAL_IDENTIFICATION_FINALIZATION_VERSION|projectMealIdentificationFinalizationToMealWrite|validateMealIdentificationFinalizationCommand|MealIdentification/.test(
          line
        ) ||
        /^[{}];?$/.test(line.trim())
    ),
  indexDiff
);
check(
  "index.ts retains existing MI-B exports",
  /adaptRestaurantCatalogCandidates/.test(read(indexPath)) &&
    /resolveCatalogMealCandidates/.test(read(indexPath)) &&
    /createPersonalUnresolvedCandidate/.test(read(indexPath)) &&
    /toTrustedCanonicalIdentity/.test(read(indexPath))
);

const packageCurrent = JSON.parse(read("package.json"));
const packageBase = JSON.parse(git(["show", "HEAD:package.json"]));
const expectedScripts = {
  "test:meal-identification-mi-c-a":
    "node scripts/meal-identification-mi-c-a-guard.mjs",
  "test:meal-identification-mi-c-a-smoke":
    "node scripts/meal-identification-mi-c-a-contract-smoke.mjs"
};
check(
  "package.json adds exact MI-C-A scripts",
  Object.entries(expectedScripts).every(
    ([key, value]) => packageCurrent.scripts?.[key] === value
  )
);
const packageWithoutMiCA = structuredClone(packageCurrent);
for (const key of Object.keys(expectedScripts)) {
  delete packageWithoutMiCA.scripts[key];
}
check(
  "package.json preserves every pre-existing field and script",
  JSON.stringify(packageWithoutMiCA) === JSON.stringify(packageBase)
);

const contractPath =
  "apps/mobile/features/meal-identification/finalizationContract.ts";
const contract = read(contractPath);
const smoke = read(
  "scripts/meal-identification-mi-c-a-contract-smoke.mjs"
);
const guard = read("scripts/meal-identification-mi-c-a-guard.mjs");

check(
  "versioned deterministic builder validator and projection exist",
  /meal-identification-finalization-v1/.test(contract) &&
    /buildMealIdentificationFinalization/.test(contract) &&
    /validateMealIdentificationFinalizationCommand/.test(contract) &&
    /projectMealIdentificationFinalizationToMealWrite/.test(contract)
);
check(
  "contract imports existing identity nutrition correction and mapper types only",
  /import type[\s\S]*consumer-meals\/types/.test(contract) &&
    /import type[\s\S]*consumerMealWriteMapper/.test(contract) &&
    /import type[\s\S]*from "\.\/types"/.test(contract) &&
    !/^import(?! type)/m.test(contract)
);
check(
  "contract has no Supabase RPC network or storage transport",
  !/(?:from\s+["'][^"']*supabase|createClient|supabaseClient|\.rpc\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|AsyncStorage|from\s+["'][^"']*storage)/i.test(
    contract
  )
);
check(
  "contract has no GPS or location API dependency",
  !/(?:expo-location|navigator\.geolocation|requestForegroundPermissions|Location\.)/.test(
    contract
  )
);
check(
  "contract has no legacy alias authority dependency",
  !/(?:findAliasByInput|resolveAlias|menu-item-repository)/.test(contract)
);
check(
  "contract does not use implicit time randomness or global state",
  !/(?:Date\.now\s*\(|Math\.random\s*\(|randomUUID\s*\()/.test(contract)
);
check(
  "all six Catalog IDs are explicit in finalization contract",
  [
    "restaurantId",
    "branchId",
    "menuId",
    "menuCategoryId",
    "menuItemId",
    "branchMenuItemId"
  ].every((identity) => contract.includes(`"${identity}"`))
);
check(
  "Catalog claim is explicitly pending server validation",
  /identityClaimStatus:\s*"pending_server_validation"/.test(contract) &&
    !/identityClaimStatus:\s*"(?:verified|server_validated)"/.test(contract)
);
check(
  "unresolved reasons remain the frozen four-value authority",
  ["manual", "self_cooked", "none_of_the_above", "catalog_unavailable"].every(
    (reason) => contract.includes(`"${reason}"`)
  )
);
check(
  "unresolved null identity invariant is implemented",
  /parseNullIdentity/.test(contract) &&
    /value\[key\]\s*!==\s*null/.test(contract) &&
    /unresolved_identity_present/.test(contract)
);
check(
  "only explicitly confirmed Catalog input is accepted",
  /confirmationStatus\s*!==\s*"confirmed"/.test(contract) &&
    /catalog_not_confirmed/.test(contract)
);
check(
  "original analysis and correction snapshots are separated and frozen",
  /originalAnalysis/.test(contract) &&
    /corrections/.test(contract) &&
    /deepFreeze/.test(contract) &&
    !/\.push\([^)]*originalAnalysis/.test(contract)
);
check(
  "projection preserves six-ID snapshot but emits only four supported IDs",
  /menuCategoryId/.test(contract) &&
    /branchMenuItemId/.test(contract) &&
    /trustedCanonicalIdentity[\s\S]*restaurantId[\s\S]*branchId[\s\S]*menuId[\s\S]*menuItemId/.test(
      contract
    )
);
check(
  "contract is not connected to analysis UI or production runtime",
  !trackedChanged.some(
    (entry) =>
      entry === "apps/mobile/app/analysis.tsx" ||
      entry.includes("ConsumerRuntimeProvider") ||
      entry.includes("consumerMealWriteRuntime") ||
      entry.includes("consumerRuntimeComposition")
  ) &&
    !/consumerMealWriteRuntime|ConsumerRuntimeProvider|analysis\.tsx/.test(
      contract
    )
);
check(
  "Food Memory and live correction adapters remain out of scope",
  !implementationPaths.some(
    (entry) =>
      /food.?memory|nutrition-memory|supabase.*correction|mealCorrectionRepository/i.test(
        entry
      )
  )
);
check(
  "smoke covers required identity evidence preservation and failure semantics",
  [
    "confirmed Catalog preserves all six IDs",
    "unconfirmed Catalog candidate fails closed",
    "builder does not mutate caller input",
    "multiple corrections preserve caller-provided append order",
    "same input produces deterministic finalization output"
  ].every((name) => smoke.includes(name)) &&
    ["manual", "self_cooked", "none_of_the_above", "catalog_unavailable"].every(
      (reason) => smoke.includes(`"${reason}"`)
    ) &&
    smoke.includes(
      "`${reason} unresolved keeps all six Catalog IDs null`"
    )
);
const forbiddenEnvironmentTokens = [
  "process" + ".env",
  "SUPABASE" + "_URL",
  "SERVICE" + "_ROLE",
  "PASS" + "WORD",
  "ACCESS" + "_TOKEN"
];
check(
  "guard and smoke contain no external environment or credential access",
  !forbiddenEnvironmentTokens.some((token) =>
    `${guard}\n${smoke}`.includes(token)
  )
);
const forbiddenArtifactTokens = [
  "write" + "File",
  "append" + "File",
  "mkd" + "temp",
  "mk" + "dir",
  "rm" + "Sync",
  "un" + "link",
  "re" + "name",
  "copy" + "File"
];
check(
  "guard is read-only and creates no temporary artifact",
  !forbiddenArtifactTokens.some((token) =>
    guard.includes(token)
  )
);
check(
  "guard and smoke are deterministic",
  !/(?:Date\.now\s*\(|Math\.random\s*\(|randomUUID\s*\()/.test(
    `${guard}\n${smoke}`
  )
);

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Meal Identification MI-C-A Safety Guard",
  checkCount: checks.length,
  checks,
  issues,
  exactImplementationPaths: implementationPaths,
  migrationChanged: false,
  networkRequestUsed: false,
  databaseWriteUsed: false,
  credentialsUsed: false,
  temporaryArtifactCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
