#!/usr/bin/env node
// TS-2D static guard — TASTE FOUNDATION AUTHENTICATED LIVE READ ACTIVATION.
//
// This round enables authenticated current-user SELECT on exactly three foundation tables and
// replaces the prepared/deferred repository with a live one. It is READ ENABLEMENT ONLY: the whole
// point of this guard is that "read enablement" cannot quietly become anything else — not a write
// grant, not an anon grant, not a policy rewrite, not a second Supabase client, and not a way to
// ask for another user's rows.
//
// Owner scoping is NOT introduced by this round. It already exists as row level security
// (auth.uid() = user_id) from 20260712131400; the Development ACL audit proved the only missing
// piece was the table privilege, so the migration adds exactly that and nothing else.
//
// LIFECYCLE-AWARE by construction: every assertion is repository CONTENT or a SUBSET assertion over
// uncommitted state, so the freeze commit cannot turn a passing guard into a failing one.
// Fully local: no network, no Supabase client, no credential, no RPC, no deploy.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const gitRaw = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).stdout ?? "";
const git = (args) => gitRaw(args).trim();
const executableOnly = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("--");
    })
    .join("\n");

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
const MIGRATION = "supabase/migrations/20260808010000_consumer_taste_foundation_authenticated_reads.sql";
const MIGRATION_SHA256 = "54e51411283db764a7f87d446272c50b759a5feed2901b61a389098514e065a5";
const LIVE_ADAPTER = `${mobileRoot}/adapters/supabaseConsumerTasteFoundationRepository.ts`;
const CONTRACTS = `${mobileRoot}/supabaseTasteFoundationContracts.ts`;
const PREPARED_ADAPTER = `${mobileRoot}/adapters/preparedSupabaseConsumerTasteFoundationRepository.ts`;
const FACTORIES = `${mobileRoot}/factories.ts`;
const FLAGS = `${mobileRoot}/featureFlags.ts`;
const TYPES = `${mobileRoot}/types.ts`;
const SERVICE = `${mobileRoot}/consumerTasteProfileService.ts`;
const FOUNDATION_MAPPERS = `${mobileRoot}/foundationMappers.ts`;
const BARREL = `${mobileRoot}/index.ts`;
const TS2_GUARD = "scripts/taste-profile-ts2-guard.mjs";
const GUARD = "scripts/taste-foundation-ts2d-guard.mjs";
const SMOKE = "scripts/taste-foundation-ts2d-smoke.mjs";
const MUTATIONS = "scripts/taste-foundation-ts2d-mutations.mjs";

const TABLES = ["taste_profiles", "nutrition_goals", "dietary_restrictions"];

// The EXACT paths this round may introduce or change. Named individually — never a prefix, never a
// wildcard — so an extra path fails here rather than being absorbed.
const CANDIDATE_MANIFEST = Object.freeze([
  MIGRATION, LIVE_ADAPTER, CONTRACTS, FACTORIES, FLAGS, TYPES, BARREL,
  TS2_GUARD, GUARD, SMOKE, MUTATIONS, "package.json"
]);
const EXPECTED_MANIFEST_LENGTH = 12;
const exactManifestAuthority = (manifest) =>
  manifest.length === EXPECTED_MANIFEST_LENGTH &&
  new Set(manifest).size === EXPECTED_MANIFEST_LENGTH &&
  manifest.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs|sql|json)$/i.test(entry)) &&
  manifest.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1 &&
  manifest.every((entry) => !/\*/.test(entry));

const migration = read(MIGRATION);
const migrationSql = executableOnly(migration);
const liveAdapter = read(LIVE_ADAPTER);
const liveAdapterCode = executableOnly(liveAdapter);
const contracts = read(CONTRACTS);
const contractsCode = executableOnly(contracts);
const factories = read(FACTORIES);
const factoriesCode = executableOnly(factories);
const flags = read(FLAGS);
const flagsCode = executableOnly(flags);
const types = read(TYPES);
const service = read(SERVICE);
const serviceCode = executableOnly(service);
const foundationMappers = read(FOUNDATION_MAPPERS);
const featureSources = [liveAdapter, contracts, factories, flags, types, service, foundationMappers, read(PREPARED_ADAPTER)].join("\n");
const featureCode = executableOnly(featureSources);

// =============================================================================================
// 1. Migration is exactly an authenticated SELECT grant on exactly three tables (1-8)
// =============================================================================================
const grantLines = migrationSql.split("\n").map((line) => line.trim()).filter((line) => /^grant/i.test(line));
const grantAuthority = (sql) => {
  const lines = sql.split("\n").map((line) => line.trim()).filter((line) => /^grant/i.test(line));
  if (lines.length !== 3) return false;
  return TABLES.every((table) =>
    lines.some((line) => line.toLowerCase() === `grant select on table public.${table} to authenticated;`)
  );
};
check("1. the migration exists at the exact expected path", exists(MIGRATION));
check("2. the migration SHA-256 is pinned", sha(MIGRATION) === MIGRATION_SHA256, sha(MIGRATION));
check(
  "3. exactly three grants, one per allowlisted table, SELECT only, to authenticated only",
  grantAuthority(migrationSql),
  grantLines
);
check(
  "4. no anon, public, service_role or postgres grantee appears",
  !/\bto\s+(anon|public|service_role|postgres)\b/i.test(migrationSql)
);
check(
  "5. no write privilege and no ALL PRIVILEGES",
  !/grant[^;]*\b(insert|update|delete|truncate|references|trigger|execute|all)\b/i.test(migrationSql)
);
check(
  "6. no wildcard grant (all tables in schema / any sequence or function)",
  !/all\s+tables\s+in\s+schema|all\s+sequences|all\s+functions|on\s+schema/i.test(migrationSql)
);
check(
  "7. no schema change: no table, column, index, view, trigger, function, RPC or type change",
  !/create\s+table|alter\s+table|drop\s+table|add\s+column|drop\s+column|create\s+index|create\s+view|create\s+trigger|create\s+(or\s+replace\s+)?function|create\s+type|create\s+extension/i.test(
    migrationSql
  )
);
check(
  "8. no policy is created, altered, dropped or weakened, and RLS is never disabled",
  !/create\s+policy|alter\s+policy|drop\s+policy|disable\s+row\s+level\s+security|force\s+row\s+level\s+security|enable\s+row\s+level\s+security/i.test(
    migrationSql
  )
);

// =============================================================================================
// 2. Live repository shape (9-16)
// =============================================================================================
const injectedClientAuthority = (source) =>
  /constructor\(private readonly client: SupabaseConsumerTasteFoundationClientLike\) \{\}/.test(source) &&
  !/createClient/.test(source);
const noUserIdArgumentAuthority = (source) =>
  !/readCurrentUser(TasteProfile|NutritionGoals|DietaryRestrictions)\s*\([^)]*\w+[^)]*\)/.test(source) &&
  !/\.eq\(\s*["']user_id["']/.test(source);
const failureNotEmptyAuthority = (source) =>
  /if \(response\.error\) return \{ status: "failed", failureCode: "source_read_failed" \};/.test(source) &&
  /if \(rows\.length === 0\) return \{ status: "empty", rows: \[\] \};/.test(source) &&
  source.indexOf("response.error") < source.indexOf("rows.length === 0");
check(
  "9. the live repository uses the INJECTED existing client and never constructs one",
  injectedClientAuthority(liveAdapterCode) && !/createClient/.test(featureCode)
);
check(
  "10. no second auth lifecycle, no service role, no key or URL handling",
  !/auth\.|signIn|getSession|SUPABASE_URL|SERVICE_ROLE|service_role|apikey|Bearer/i.test(liveAdapterCode)
);
check(
  "11. current-user API only — no method takes a user id and no query filters one",
  noUserIdArgumentAuthority(liveAdapterCode) && !/userId/.test(liveAdapterCode)
);
check(
  "12. exactly the three allowlisted tables are reachable, by named constant",
  TABLES.every((table) => contractsCode.includes(`"${table}" as const`)) &&
    (contractsCode.match(/_TABLE = "/g) ?? []).length === 3 &&
    /CONSUMER_TASTE_FOUNDATION_TABLE_ALLOWLIST/.test(types)
);
check(
  "13. SELECT only — the repository performs no insert, update, upsert, delete or rpc",
  !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(liveAdapterCode) &&
    (liveAdapterCode.match(/\.select\(/g) ?? []).length === 1
);
check(
  "14. denormalized favourite ids are never selected",
  !/favorite_restaurant_ids|favorite_menu_item_ids/.test([contractsCode, liveAdapterCode, types].join("\n"))
);
check(
  "15. private medical / free-text note columns are never selected",
  !/health_notes|private_diet_notes|medical_sensitivity_notes|notes/i.test(contractsCode)
);
check(
  "16. a permission or transport failure is FAILED, never empty",
  failureNotEmptyAuthority(liveAdapterCode)
);

// =============================================================================================
// 3. Activation gate and source-state transition (17-20)
// =============================================================================================
const environmentFenceAuthority = (source) =>
  /const TASTE_FOUNDATION_LIVE_ENVIRONMENT = "development" as const;/.test(source) &&
  /environment === TASTE_FOUNDATION_LIVE_ENVIRONMENT/.test(source) &&
  /authSource === "supabase-live" && authEnabled/.test(source) &&
  /if \(environmentAllowsLive && authAllowsLive\)/.test(source);
const failClosedFactoryAuthority = (source) =>
  /throw new Error\("Taste foundation live activation requires complete live capability\."\);/.test(source) &&
  /throw new Error\("Taste foundation live reads require the existing consumer Supabase client\."\);/.test(source) &&
  /throw new Error\("Taste foundation live reads require the deferred TS-2D authority\."\);/.test(source);
check(
  "17. live activation is fenced behind the Development environment and a live auth source",
  environmentFenceAuthority(flagsCode)
);
check(
  "18. the factory still fails closed on incomplete live capability or a missing client",
  failClosedFactoryAuthority(factoriesCode) &&
    /flags\.foundationActivation === "live"/.test(factoriesCode) &&
    !/createClient/.test(factoriesCode)
);
check(
  "19. deferred/acl_activation_pending survives ONLY as the non-live fallback",
  // The deferred state must still exist (a non-live runtime must still be expressible) but must not
  // be what a live activation produces.
  /reason: "acl_activation_pending"/.test(flagsCode) &&
    /sourceState: null/.test(flagsCode) &&
    /foundationActivation: "live"/.test(flagsCode) &&
    !/foundationActivation: "live"[\s\S]{0,200}acl_activation_pending/.test(flagsCode)
);
check(
  "20. the prepared adapter still performs no read, so the deferred path stays inert",
  !/\.from\s*\(/.test(executableOnly(read(PREPARED_ADAPTER))) &&
    (read(PREPARED_ADAPTER).match(/return deferred\(\)/g) ?? []).length === 3
);

// =============================================================================================
// 4. Frozen TS-2A-C semantics preserved (21-24)
// =============================================================================================
check(
  "21. actor/session stale-result rejection is unchanged",
  /return this\.actorKey === actorKey && this\.actorGeneration === actorGeneration;/.test(serviceCode) &&
    (serviceCode.match(/return \{ status: "stale" \};/g) ?? []).length >= 4
);
check(
  "22. goal active/date-validity and restriction severity normalization are unchanged",
  /!row\.is_active \|\| row\.starts_on > asOfDate \|\|/.test(foundationMappers) &&
    / \|\| \(row\.ends_on !== null && row\.ends_on < asOfDate\)/.test(foundationMappers)
);
check(
  "23. no similarity score, numeric taste confidence, ranking, Social or GPS dependency",
  !/similarityScore|matchScore|rankScore|scoreTaste|recommendationScore|tasteConfidence|profileConfidence/.test(featureCode) &&
    !/(?:from|import)[^\n]*(social|gps|geolocation)/i.test(featureCode)
);
check(
  // Scoped to OPERATIONS, not to the word. The suites must be able to name "production" as an
  // environment VALUE — that is exactly how the Production fence in featureFlags is proven — so a
  // bare word scan would forbid the evidence rather than the risk. What must be absent is any code
  // that could act on a remote project: a deploy/push/link invocation, a project-ref target, a
  // store submission, or an embedded remote URL/credential.
  "24. no Production operation, deploy, push or remote-mutation code in any candidate path",
  // Fragment-assembled so this guard never matches its own pattern definitions — the guard is itself
  // a candidate path, so a literal here would fail the check it defines.
  (() => {
    const OPERATION_PATTERNS = [
      new RegExp(["supabase", "\\s+(?:db|functions|migration|secrets)\\s+(?:push|deploy|set)"].join("")),
      new RegExp(["supabase", "\\s+(?:link|login)"].join("")),
      new RegExp(["--project", "-ref"].join("")),
      new RegExp(["eas", "\\s+(?:build|submit)|expo\\s+publish"].join("")),
      new RegExp(["https:\\/\\/[a-z0-9]+\\.supa", "base\\.co"].join(""))
    ];
    const everyPathIsOperationFree = CANDIDATE_MANIFEST.every((entry) => {
      const code = executableOnly(read(entry));
      return !OPERATION_PATTERNS.some((pattern) => pattern.test(code));
    });
    // The service-role ban applies to the MIGRATION and the IMPLEMENTATION, where the token could
    // only ever mean "use a service role". The suites are excluded on purpose: they name the token
    // precisely in order to forbid it (guard check 4, and the mutation grant authority), so a
    // blanket scan would reject the evidence instead of the risk.
    const IMPLEMENTATION_PATHS = [MIGRATION, LIVE_ADAPTER, CONTRACTS, FACTORIES, FLAGS, TYPES, BARREL];
    const serviceRole = new RegExp(["service", "_role"].join(""), "i");
    const implementationIsServiceRoleFree = IMPLEMENTATION_PATHS.every(
      (entry) => !serviceRole.test(executableOnly(read(entry)))
    );
    return everyPathIsOperationFree && implementationIsServiceRoleFree;
  })()
);

// =============================================================================================
// 5. Manifest, lifecycle and hygiene (25-29)
// =============================================================================================
check(
  "25. the candidate manifest is exactly twelve named paths with exactly one migration",
  exactManifestAuthority(CANDIDATE_MANIFEST) && CANDIDATE_MANIFEST.every(exists)
);
const worktree = gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll("\\", "/"));
const versusHead = git(["diff", "--name-only", "HEAD"]).split("\n").map((entry) => entry.trim()).filter(Boolean);
const touched = [...new Set([...worktree, ...versusHead])];
// TS-3 successor amendment. Check 26 was written as a whole-worktree subset assertion. That was
// correct while TS-2D was the open round, but it becomes false the moment ANY successor round opens
// an implementation candidate: a TS-3 file would be reported as a TS-2D scope violation, which is
// a false positive about this round's scope. The invariant actually being protected is "TS-2D edits
// nothing outside its own manifest", not "the repository never changes again".
//
// The successor manifest is therefore enumerated EXACTLY, path by path, with no prefix and no
// wildcard, so an unexpected path still fails here. The frozen predecessor is simultaneously held
// to a STRICTER bar by 26a: once TS-2D is committed, none of its own implementation paths may be
// left modified by any later round, which the original whole-worktree check never asserted.
const TS3_SUCCESSOR_MANIFEST = Object.freeze([
  "packages/shared/src/domain/taste-similarity/index.ts",
  "packages/shared/src/domain/taste-similarity/similarity/comparator.ts",
  "packages/shared/src/domain/taste-similarity/similarity/index.ts",
  "packages/shared/src/domain/taste-similarity/similarity/policy.ts",
  "packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts",
  "packages/shared/src/domain/taste-similarity/similarity/types.ts",
  "scripts/taste-similarity-ts1-mutations.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3-mutations.mjs",
  "scripts/taste-similarity-ts3-smoke.mjs",
  // TS-3B-R1 extends the same enumerated successor allowance with its own three suites. The four
  // similarity implementation files it edits are already named above. Still no prefix and no
  // wildcard, and 26a keeps every TS-2D implementation path off limits regardless.
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  // TS-3C extends the same enumerated successor allowance with its own pure compatibility module and
  // three suites. Still no prefix and no wildcard, and 26a keeps every TS-2D implementation path off
  // limits regardless.
  "packages/shared/src/domain/taste-similarity/compatibility/comparator.ts",
  "packages/shared/src/domain/taste-similarity/compatibility/index.ts",
  "packages/shared/src/domain/taste-similarity/compatibility/policy.ts",
  "packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts",
  "packages/shared/src/domain/taste-similarity/compatibility/types.ts",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3c-mutations.mjs",
  "scripts/taste-similarity-ts3c-smoke.mjs",
  // TS-3D extends the same enumerated successor allowance with its own pure goal/restriction module
  // and three suites. Still no prefix and no wildcard, and 26a keeps every TS-2D implementation path
  // off limits regardless.
  "packages/shared/src/domain/taste-similarity/goal-restriction/comparator.ts",
  "packages/shared/src/domain/taste-similarity/goal-restriction/index.ts",
  "packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts",
  "packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts",
  "packages/shared/src/domain/taste-similarity/goal-restriction/types.ts",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3d-mutations.mjs",
  "scripts/taste-similarity-ts3d-smoke.mjs",
  // TS-3E extends the same enumerated successor allowance with its pure composition module and three
  // suites. Still no prefix and no wildcard, and 26a keeps every TS-2D implementation path off limits.
  "packages/shared/src/domain/taste-similarity/comparison/compose.ts",
  "packages/shared/src/domain/taste-similarity/comparison/index.ts",
  "packages/shared/src/domain/taste-similarity/comparison/policy.ts",
  "packages/shared/src/domain/taste-similarity/comparison/types.ts",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts3e-mutations.mjs",
  "scripts/taste-similarity-ts3e-smoke.mjs",
  // TS-4 extends the same enumerated successor allowance with its pure evidence-confidence module and
  // three suites. Still no prefix and no wildcard, and 26a keeps every TS-2D implementation path off
  // limits regardless.
  "packages/shared/src/domain/taste-similarity/confidence/compute.ts",
  "packages/shared/src/domain/taste-similarity/confidence/index.ts",
  "packages/shared/src/domain/taste-similarity/confidence/policy.ts",
  "packages/shared/src/domain/taste-similarity/confidence/types.ts",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts4-mutations.mjs",
  "scripts/taste-similarity-ts4-smoke.mjs",
  "scripts/taste-similarity-ts3b-r1-mutations.mjs",
  "scripts/taste-similarity-ts3b-r1-smoke.mjs"
]);
const ALLOWED_PATHS = new Set([...CANDIDATE_MANIFEST, ...TS3_SUCCESSOR_MANIFEST]);
const outsideManifest = touched.filter((entry) => !ALLOWED_PATHS.has(entry));
check(
  "26. committed-state lifecycle: uncommitted changes are a subset of the TS-2D manifest or the exactly enumerated TS-3 successor manifest, clean tree passes",
  outsideManifest.length === 0,
  { touchedEntries: touched.length, outsideManifest }
);
const TS2D_IMPLEMENTATION_PATHS = [MIGRATION, LIVE_ADAPTER, CONTRACTS, FACTORIES, FLAGS, TYPES, BARREL];
const ts2dIsCommitted = spawnSync("git", ["ls-files", "--error-unmatch", MIGRATION], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
const frozenPathsTouched = touched.filter((entry) => TS2D_IMPLEMENTATION_PATHS.includes(entry));
check(
  "26a. once TS-2D is committed, no TS-2D implementation path is left modified by a successor round",
  !ts2dIsCommitted || frozenPathsTouched.length === 0,
  { ts2dIsCommitted, frozenPathsTouched }
);
check(
  "26b. the successor allowance is enumerated, not a wildcard or prefix escape",
  TS3_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs|sql|json)$/i.test(entry)) &&
    TS3_SUCCESSOR_MANIFEST.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    !TS3_SUCCESSOR_MANIFEST.some((entry) => entry.startsWith("supabase/")) &&
    new Set(TS3_SUCCESSOR_MANIFEST).size === TS3_SUCCESSOR_MANIFEST.length
);
check(
  "27. this round changes no other migration and no Edge Function",
  touched.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry === MIGRATION) &&
    !touched.some((entry) => entry.startsWith("supabase/functions/"))
);
const guardSource = read(GUARD);
const guardCode = executableOnly(guardSource);
check(
  "28. no unconditional pass, skip flag, environment escape hatch or wildcard allowance",
  !/process\.env\.[A-Z_]*(SKIP|BYPASS|FORCE|DISABLE)/.test(guardCode) &&
    !/\|\|\s*true\b/.test(guardCode) &&
    !/check\([^,]+,\s*true\s*\)/.test(guardCode) &&
    !/process\.exit\(0\)/.test(guardCode) &&
    /if \(failed\.length\) process\.exit\(1\);/.test(guardSource)
);
// Fragment-assembled so these scans never match their own definitions. The migration SHA is a
// content digest, not a commit allowance, so only 40-hex commit SHAs are forbidden.
const COMMIT_ALLOWANCE_PATTERNS = [
  /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/,
  new RegExp(["rev", "-parse"].join("")),
  new RegExp(["\\bHEAD", "~|\\bHEAD\\^"].join(""))
];
const SECRET_PATTERNS = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\."].join("")),
  new RegExp(["service", "_role"].join("") + "[\"'\\s:=]+[A-Za-z0-9_-]{12,}"),
  new RegExp(["sb", "p_"].join("") + "[A-Za-z0-9]{16,}"),
  new RegExp(["msbgnnoo", "roesoefuiwluye"].join(""))
];
check(
  "29. no specific-commit bypass and no secret in any candidate path",
  !COMMIT_ALLOWANCE_PATTERNS.some((pattern) => pattern.test(guardCode)) &&
    CANDIDATE_MANIFEST.every((entry) => !SECRET_PATTERNS.some((pattern) => pattern.test(read(entry))))
);
check(
  "29a. this guard is lifecycle-AWARE: it never requires a path to be modified, staged or untracked",
  !/worktree\.includes\(/.test(guardCode) &&
    !/touched\.includes\(/.test(guardCode) &&
    !/touched\.length\s*(?:>|===)\s*0/.test(guardCode) &&
    !/\.length === CANDIDATE_MANIFEST\.length/.test(guardCode) &&
    /outsideManifest\.length === 0/.test(guardCode)
);
check("29b. this guard's own run stages nothing", git(["diff", "--cached", "--name-only"]) === "");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "taste-foundation-ts2d",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  migrationSha256: sha(MIGRATION),
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
