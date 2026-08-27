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
import { SR1C_SUCCESSOR_PATHS } from "./social-ingress-sr1c-successor-manifest.mjs";
import { SR1D_SUCCESSOR_PATHS } from "./social-taste-sr1d-successor-manifest.mjs";
import { SR2A_SUCCESSOR_PATHS } from "./social-ranking-sr2a-successor-manifest.mjs";
import { SR2B_SUCCESSOR_MIGRATION, SR2B_SUCCESSOR_PATHS } from "./social-exposure-sr2b-successor-manifest.mjs";
import { SR2C_SUCCESSOR_MIGRATION, SR2C_SUCCESSOR_PATHS } from "./social-profile-sr2c-successor-manifest.mjs";
import { SR2D_SUCCESSOR_PATHS } from "./social-candidate-sr2d-successor-manifest.mjs";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import { SR2GC_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { RECBP0_MIGRATION, RECBP0_PATHS } from "./recommendation-rec-b-p0-successor-manifest.mjs";

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
  // TS-5 extends the same enumerated successor allowance with its pure cold-start policy module and
  // three suites. Still no prefix and no wildcard, and 26a keeps every TS-2D implementation path off
  // limits regardless.
  "packages/shared/src/domain/taste-similarity/cold-start/assess.ts",
  "packages/shared/src/domain/taste-similarity/cold-start/index.ts",
  "packages/shared/src/domain/taste-similarity/cold-start/policy.ts",
  "packages/shared/src/domain/taste-similarity/cold-start/types.ts",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts5-mutations.mjs",
  "scripts/taste-similarity-ts5-smoke.mjs",
  // TS-6 extends the same enumerated successor allowance with its pure shared-adapter module and
  // three suites. Still no prefix and no wildcard, and 26a keeps every TS-2D implementation path off
  // limits regardless.
  "packages/shared/src/domain/taste-similarity/shared-adapter/adapt.ts",
  "packages/shared/src/domain/taste-similarity/shared-adapter/index.ts",
  "packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts",
  "packages/shared/src/domain/taste-similarity/shared-adapter/types.ts",
  "scripts/taste-similarity-ts6-guard.mjs",
  "scripts/taste-similarity-ts6-mutations.mjs",
  "scripts/taste-similarity-ts6-smoke.mjs",
  "scripts/taste-similarity-ts3b-r1-mutations.mjs",
  "scripts/taste-similarity-ts3b-r1-smoke.mjs"
]);

// SR-1A is the first successor to add paths under `supabase/`, which the TS-3 successor allowance
// deliberately forbids. Rather than relax that rule, its paths get their own exactly-enumerated list
// held to its OWN constraint (26c): every entry must live under `supabase/functions/_shared/`, the
// non-deployable shared directory, so no successor can smuggle a deployable Edge Function entrypoint
// through this allowance. 26a still keeps every TS-2D implementation path off limits regardless.
const SR1A_SUCCESSOR_MANIFEST = Object.freeze([
  "scripts/build-taste-foundation-runtime.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-pair-sr1a-mutations.mjs",
  "scripts/social-pair-sr1a-smoke.mjs",
  // The eight sibling guards that receive the same successor amendment are already covered by
  // TS3_SUCCESSOR_MANIFEST above and are deliberately not repeated here.
  "supabase/functions/_shared/social-pair/index.ts",
  "supabase/functions/_shared/social-pair/serverPairComparison.ts",
  "supabase/functions/_shared/social-pair/serverTasteFoundationRepository.ts",
  "supabase/functions/_shared/taste-foundation-runtime/provenance.generated.json",
  "supabase/functions/_shared/taste-foundation-runtime/tasteFoundation.generated.mjs",
  "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
]);
// SR-1B-B is the first successor to add a MIGRATION. Check 27 below asserts TS-2D owns exactly one
// migration, which is still true — this list names the one successor migration that check must not
// mistake for a TS-2D scope violation. Enumerated exactly, and 26d confines what it may contain.
const SOCIAL_SUCCESSOR_MANIFEST = Object.freeze([
  "supabase/migrations/20260810010000_social_block_authority.sql",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-block-sr1b-b-mutations.mjs",
  "scripts/social-block-sr1b-b-smoke.mjs",
  "supabase/migrations/20260810020000_social_participation_authority.sql",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-participation-sr1b-c-mutations.mjs",
  "scripts/social-participation-sr1b-c-smoke.mjs",
  "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-mutations.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-smoke.mjs",
  "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-mutations.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-smoke.mjs",
  "supabase/migrations/20260810050000_social_runtime_executor_role.sql",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-mutations.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-smoke.mjs"
]);
const SOCIAL_SUCCESSOR_MIGRATIONS = SOCIAL_SUCCESSOR_MANIFEST.filter((entry) => entry.startsWith("supabase/"));
const B3_VALIDATION_SUCCESSOR_MANIFEST = Object.freeze([
  "scripts/social-runtime-transport-sr1b-d2-b3-development-live.ts",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-mutations.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-smoke.mjs"
]);
const ALLOWED_PATHS = new Set([
  ...CANDIDATE_MANIFEST,
  ...TS3_SUCCESSOR_MANIFEST,
  ...SR1A_SUCCESSOR_MANIFEST,
  ...SOCIAL_SUCCESSOR_MANIFEST,
  ...B3_VALIDATION_SUCCESSOR_MANIFEST,
  ...SR1C_SUCCESSOR_PATHS,
  ...SR1D_SUCCESSOR_PATHS,
  ...SR2A_SUCCESSOR_PATHS,
  ...SR2B_SUCCESSOR_PATHS,
  ...SR2C_SUCCESSOR_PATHS,
    ...SR2D_SUCCESSOR_PATHS,
    ...SR2E_SUCCESSOR_PATHS, ...SR2F_SUCCESSOR_PATHS, ...SR2GA_SUCCESSOR_PATHS, ...SR2GB_SUCCESSOR_PATHS, ...SR2GC_SUCCESSOR_PATHS, ...SR2GBR1_SUCCESSOR_PATHS, ...SR2GCR1_SUCCESSOR_PATHS, ...SR2CR1_SUCCESSOR_PATHS, ...SR2GD_SUCCESSOR_PATHS, ...SR2GE1_SUCCESSOR_PATHS, ...SR2GE2_SUCCESSOR_PATHS, ...SR2GF_SUCCESSOR_PATHS, ...RECBP0_PATHS
]);
const outsideManifest = touched.filter((entry) => !ALLOWED_PATHS.has(entry));
check(
  "26. committed-state lifecycle: uncommitted changes are a subset of the TS-2D manifest or the exactly enumerated TS-3 / SR-1A successor manifests, clean tree passes",
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
  "26c. the SR-1A successor allowance is enumerated and confined to the non-deployable shared directory",
  SR1A_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs|json)$/i.test(entry)) &&
    SR1A_SUCCESSOR_MANIFEST.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    SR1A_SUCCESSOR_MANIFEST.filter((entry) => entry.startsWith("supabase/"))
      .every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
    !SR1A_SUCCESSOR_MANIFEST.some((entry) => entry.endsWith(".sql")) &&
    new Set(SR1A_SUCCESSOR_MANIFEST).size === SR1A_SUCCESSOR_MANIFEST.length
);
// The original whole-worktree form of 27 forbade ANY touched `supabase/functions/` path, which would
// have failed the moment a successor added server-shared code — a false positive about this round's
// scope. What 27 actually protects is that TS-2D owns exactly one migration and ships no deployable
// Edge Function. Both halves are now asserted directly, and the second is STRICTER than before: it
// names the deployable-entrypoint shape rather than banning a whole directory prefix.
check(
  "26d. the Social successor allowance is exactly enumerated additive migrations plus their own suites, and cannot reach config or an Edge Function",
  SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1 &&
    SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry)) &&
    SOCIAL_SUCCESSOR_MANIFEST.filter((entry) => !entry.startsWith("supabase/"))
      .every((entry) => /^scripts\/social-(block-sr1b-b|participation-sr1b-c|candidate-authorization-sr1b-d1|authorized-pair-read-sr1b-d2-b1|runtime-executor-sr1b-d2-b2)-(guard|smoke|mutations)\.mjs$/.test(entry)) &&
    !SOCIAL_SUCCESSOR_MANIFEST.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")) &&
    new Set(SOCIAL_SUCCESSOR_MANIFEST).size === SOCIAL_SUCCESSOR_MANIFEST.length
);
check(
  "26e. B3 validation successors are exactly one Development live script plus three local suites",
  B3_VALIDATION_SUCCESSOR_MANIFEST.length === 4 &&
    B3_VALIDATION_SUCCESSOR_MANIFEST.every((entry) => /^scripts\/social-runtime-transport-sr1b-d2-b3-(development-live\.ts|(guard|smoke|mutations)\.mjs)$/.test(entry)) &&
    B3_VALIDATION_SUCCESSOR_MANIFEST.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    new Set(B3_VALIDATION_SUCCESSOR_MANIFEST).size === B3_VALIDATION_SUCCESSOR_MANIFEST.length
);
check(
  "26f. SR-1C successor awareness is an exact path manifest without wildcard authority",
  SR1C_SUCCESSOR_PATHS.length > 0 &&
    SR1C_SUCCESSOR_PATHS.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs|sql|toml|json)$/i.test(entry)) &&
    SR1C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    new Set(SR1C_SUCCESSOR_PATHS).size === SR1C_SUCCESSOR_PATHS.length
);
check(
  "26g. SR-1D successor awareness is an exact path manifest without wildcard authority",
  SR1D_SUCCESSOR_PATHS.length > 0 &&
    SR1D_SUCCESSOR_PATHS.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs|sql|toml|json)$/i.test(entry)) &&
    SR1D_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    new Set(SR1D_SUCCESSOR_PATHS).size === SR1D_SUCCESSOR_PATHS.length
);
check(
  "26h. SR-2A successor awareness is exact and confines Supabase changes to the pure shared ranking module",
  SR2A_SUCCESSOR_PATHS.length > 0 &&
    SR2A_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    new Set(SR2A_SUCCESSOR_PATHS).size === SR2A_SUCCESSOR_PATHS.length &&
    SR2A_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-ranking/")) &&
    !SR2A_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry.startsWith("supabase/migrations/") || entry === "supabase/config.toml" || /^supabase\/functions\/(?!_)/.test(entry))
);
check(
  "26i. SR-2B successor awareness is exact and confines Supabase changes to the pure shared exposure module plus one grant migration",
  SR2B_SUCCESSOR_PATHS.length > 0 &&
    SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length &&
    SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION) &&
    SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1 &&
    !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/(?!_)/.test(entry))
);
check(
  "26j. SR-2C successor awareness is exact and confines Supabase changes to the pure shared profile module plus one projection migration",
  SR2C_SUCCESSOR_PATHS.length > 0 &&
    SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry)) &&
    new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length &&
    SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION) &&
    SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1 &&
    !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/(?!_)/.test(entry))
);
const touchedSupabase = touched.filter((entry) => entry.startsWith("supabase/"));
// "Other migration" means any migration that is neither TS-2D's own nor the exactly enumerated
// SR-1B-B successor. TS-2D still owns exactly one migration; that invariant is unchanged.
const otherMigrations = touchedSupabase.filter(
  (entry) =>
    entry.startsWith("supabase/migrations/") &&
    entry !== MIGRATION &&
    !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry) &&
    !SR1C_SUCCESSOR_PATHS.includes(entry) &&
    !SR1D_SUCCESSOR_PATHS.includes(entry) &&
    !SR2A_SUCCESSOR_PATHS.includes(entry) &&
    !SR2B_SUCCESSOR_PATHS.includes(entry) &&
    !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry) && !SR2GE2_SUCCESSOR_PATHS.includes(entry) && !SR2GF_SUCCESSOR_PATHS.includes(entry) && entry !== RECBP0_MIGRATION
);
const deployableFunctionPaths = touchedSupabase.filter(
  (entry) => /^supabase\/functions\/(?!_)[^/]+\//.test(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry) && !SR2GE2_SUCCESSOR_PATHS.includes(entry) && !SR2GF_SUCCESSOR_PATHS.includes(entry)
);
check(
  "27. this round changes no other migration and adds no deployable Edge Function",
  touchedSupabase.every(
    (entry) =>
      entry === MIGRATION ||
      SR1A_SUCCESSOR_MANIFEST.includes(entry) ||
      SOCIAL_SUCCESSOR_MANIFEST.includes(entry) ||
      SR1C_SUCCESSOR_PATHS.includes(entry) ||
      SR1D_SUCCESSOR_PATHS.includes(entry) ||
      SR2A_SUCCESSOR_PATHS.includes(entry) ||
      SR2B_SUCCESSOR_PATHS.includes(entry) ||
      SR2C_SUCCESSOR_PATHS.includes(entry) ||
      SR2D_SUCCESSOR_PATHS.includes(entry) ||
      SR2E_SUCCESSOR_PATHS.includes(entry) ||
      SR2F_SUCCESSOR_PATHS.includes(entry) ||
      SR2GA_SUCCESSOR_PATHS.includes(entry) || SR2GB_SUCCESSOR_PATHS.includes(entry) || SR2GC_SUCCESSOR_PATHS.includes(entry) || SR2GBR1_SUCCESSOR_PATHS.includes(entry) || SR2GCR1_SUCCESSOR_PATHS.includes(entry) || SR2CR1_SUCCESSOR_PATHS.includes(entry) || SR2GD_SUCCESSOR_PATHS.includes(entry) || SR2GE1_SUCCESSOR_PATHS.includes(entry) || SR2GE2_SUCCESSOR_PATHS.includes(entry) || SR2GF_SUCCESSOR_PATHS.includes(entry) || RECBP0_PATHS.includes(entry)
  ) &&
    otherMigrations.length === 0 &&
    deployableFunctionPaths.length === 0,
  { touchedSupabase, otherMigrations, deployableFunctionPaths }
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
