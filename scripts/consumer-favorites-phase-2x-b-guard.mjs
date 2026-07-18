import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const expectedHead = "7e4a9148b5caa73955d87570ea6aed645aff9bfe";
const featureRoot = "apps/mobile/features/consumer-favorites";
const docsRoot = "docs/consumer-runtime-phase-2x";
const sourceFiles = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "ports.ts",
  "consumerFavoriteService.ts",
  "featureFlags.ts",
  "factories.ts",
  "index.ts",
  "adapters/disabledConsumerFavoriteRepository.ts",
  "adapters/mockConsumerFavoriteRepository.ts"
];
const docFiles = [
  "phase-2x-b-local-disabled-mock-architecture.md",
  "phase-2x-b-validation-plan.md"
];
const allowedChanges = new Set([
  "package.json",
  ...sourceFiles.map((file) => `${featureRoot}/${file}`),
  ...docFiles.map((file) => `${docsRoot}/${file}`),
  "scripts/consumer-favorites-phase-2x-b-guard.mjs",
  "scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs"
]);
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));

  check("branch remains main", git(["branch", "--show-current"]).trim() === "main");
  check("HEAD remains the Frozen Phase 2X-A commit", git(["rev-parse", "HEAD"]).trim() === expectedHead);
  check("candidate changes stay inside the Phase 2X-B allowlist", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).trim() === "");
  check("package-lock remains unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).trim() === "");
  check("Mobile production UI and navigation remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/app"]).trim() === "");
  check("Frozen Phase 2W files remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/features/consumer-ratings", "docs/consumer-runtime-phase-2w", "scripts/consumer-ratings-phase-2w-a-guard.mjs"]).trim() === "");
  check("Frozen Phase 2X-A files remain unchanged", git(["diff", "--name-only", "HEAD", "--", `${docsRoot}/phase-2x-a-discovery-report.md`, `${docsRoot}/phase-2x-a-runtime-contract.md`, `${docsRoot}/phase-2x-a-security-and-target-identity.md`, `${docsRoot}/phase-2x-implementation-plan.md`, `${docsRoot}/phase-2x-known-issues-and-deferrals.md`, `${docsRoot}/phase-2x-validation-plan.md`, "scripts/consumer-favorites-phase-2x-a-guard.mjs"]).trim() === "");

  // Phase 2X-A historical anchor invariants — carried into all later Phase 2X subphase guards
  const frozenPhase2xaInventory = [
    `${docsRoot}/phase-2x-a-discovery-report.md`,
    `${docsRoot}/phase-2x-a-runtime-contract.md`,
    `${docsRoot}/phase-2x-a-security-and-target-identity.md`,
    `${docsRoot}/phase-2x-implementation-plan.md`,
    `${docsRoot}/phase-2x-known-issues-and-deferrals.md`,
    `${docsRoot}/phase-2x-validation-plan.md`,
    "scripts/consumer-favorites-phase-2x-a-guard.mjs"
  ];
  check(
    "Phase 2X-A Frozen Commit is an ancestor of HEAD or is HEAD",
    spawnSync("git", ["merge-base", "--is-ancestor", expectedHead, "HEAD"], { cwd: root, windowsHide: true }).status === 0
  );
  const frozenFileDiff = spawnSync("git", ["diff", "--name-only", expectedHead, "HEAD", "--", ...frozenPhase2xaInventory], { cwd: root, encoding: "utf8", windowsHide: true });
  check(
    "Phase 2X-A frozen files are byte-for-byte identical between the Phase 2X-A Frozen Commit and HEAD",
    frozenFileDiff.stdout.trim() === "",
    { drift: frozenFileDiff.stdout.trim() || "(none)" }
  );

  for (const file of sourceFiles) check(`required Favorites source exists: ${file}`, fs.existsSync(path.join(root, featureRoot, file)));
  for (const file of docFiles) check(`required Phase 2X-B document exists: ${file}`, fs.existsSync(path.join(root, docsRoot, file)));

  const source = sourceFiles.map((file) => read(`${featureRoot}/${file}`)).join("\n");
  const publicApi = ["types.ts", "ports.ts"].map((file) => read(`${featureRoot}/${file}`)).join("\n");
  const types = read(`${featureRoot}/types.ts`);
  const validation = read(`${featureRoot}/validation.ts`);
  const service = read(`${featureRoot}/consumerFavoriteService.ts`);
  const flags = read(`${featureRoot}/featureFlags.ts`);
  const factory = read(`${featureRoot}/factories.ts`);
  const disabled = read(`${featureRoot}/adapters/disabledConsumerFavoriteRepository.ts`);
  const mock = read(`${featureRoot}/adapters/mockConsumerFavoriteRepository.ts`);
  const docs = docFiles.map((file) => read(`${docsRoot}/${file}`)).join("\n");

  check("source unions allow exactly disabled and mock", /ConsumerFavoriteReadSource = "disabled" \| "mock"/.test(types) && /ConsumerFavoriteWriteSource = "disabled" \| "mock"/.test(types));
  check("targets support exactly restaurant and menu_item", /kind: "restaurant"[\s\S]*restaurantId/.test(types) && /kind: "menu_item"[\s\S]*restaurantId[\s\S]*menuItemId/.test(types) && !/kind: "(?:branch|menu|meal|meal_record|generic)"/.test(types));
  check("public API contains no caller ownership input", !/\buserId\b|\buser_id\b/.test(publicApi) && !/(?:get|list|add|remove)CurrentUserFavorite(?:s)?\s*\([^)]*(?:userId|user_id)/.test(service));
  check("read operations match the Frozen contract", /getCurrentUserFavorite/.test(service) && /listCurrentUserFavorites/.test(service));
  check("write operations match the Frozen contract", /addCurrentUserFavorite/.test(service) && /removeCurrentUserFavorite/.test(service));
  check("write result vocabulary is exact", ["added", "already_present", "removed", "already_absent", "disabled", "unauthenticated", "invalid_target", "write_failed"].every((status) => types.includes(`\"${status}\"`)));
  check("target validation rejects extra keys and fav-derived identities", /exactKeys/.test(validation) && /\^fav-/i.test(validation));
  check("list requires entityType and enforces 20 through 50", /entityType: ConsumerFavoriteEntityType/.test(types) && /DEFAULT_PAGE_SIZE = 20/.test(validation) && /MAX_PAGE_SIZE = 50/.test(validation));
  check("canonical record exposes favoriteId and active state", /favoriteId: string/.test(types) && /active: boolean/.test(types) && !/removedAt: string/.test(types));
  check("cursor tuple is exactly sortOrder-createdAt-id", /ConsumerFavoriteCursorTuple = readonly \[number \| null, string, string\]/.test(validation) && /JSON\.stringify\(\[record\.sortOrder, record\.createdAt, record\.favoriteId\]\)/.test(validation));
  check("ordering is sortOrder asc null-last, createdAt desc, id asc", /left\.sortOrder === null[\s\S]*return 1/.test(validation) && /right\.createdAt\.localeCompare\(left\.createdAt\)/.test(validation) && /left\.favoriteId\.localeCompare\(right\.favoriteId\)/.test(validation));
  check("service authenticates every current-user operation", (service.match(/getAuthenticationError\(\)/g) ?? []).length >= 5 && /ConsumerAuthPort/.test(service));
  check("service binds an injected mock actor to the authenticated session", /mockActorId/.test(service) && /result\.value\.user\.userId !== this\.options\.mockActorId/.test(service));
  check("disabled repository returns typed disabled reads and writes", /ConsumerFavoriteReadDisabledError/.test(disabled) && /ConsumerFavoriteWriteDisabledError/.test(disabled) && !/push\(|splice\(|= \[/.test(disabled));
  check("mock add is idempotent and remove is soft", /already_present/.test(mock) && /active\.removedAt = requireTimestamp/.test(mock) && /already_absent/.test(mock));
  check("mock re-add preserves removed history", /this\.store\.rows\.push\(row\)/.test(mock) && /getHistoryForContract/.test(mock) && !/\.delete\(|splice\(/.test(mock));
  check("mock filters actor and active state", /row\.actorId === this\.actorId && row\.removedAt === null/.test(mock));
  check("mock supports injected clock ID actor initial rows and store", ["actorId", "clock", "idGenerator", "initialRows", "store"].every((term) => mock.includes(term)));
  check("mock uses no nondeterministic global clock or random", !/Date\.now|Math\.random/.test(mock));
  check("runtime instances do not use a global mutable store", !/const\s+\w*(?:store|rows)\w*\s*[:=][^\n]*(?:\[|createMockConsumerFavoriteStore)/i.test(mock.split("export class MockConsumerFavoriteRepository")[0]));
  check("both source defaults are disabled", (flags.match(/return "disabled"/g) ?? []).length >= 2);
  check("unsupported source creates an issue and remains disabled", /issues\.push/.test(flags) && !/return "mock"/.test(flags));
  check("factory has separate read and write selection", /flags\.readSource === "mock"/.test(factory) && /flags\.writeSource === "mock"/.test(factory));
  check("factory requires explicit auth and mock actor injection", /explicit ConsumerAuthPort/.test(factory) && /explicitly injected actor/.test(factory));
  check("Favorites source contains no Supabase import or client", !/from\s+["'][^"']*supabase|createClient|SupabaseClient|\b(?:client|supabase)\.(?:from|rpc)\s*\(/i.test(source));
  check("Favorites source contains no network API", !/fetch\s*\(|XMLHttpRequest|WebSocket/.test(source));
  check("Favorites source reads only explicit public source flags and no secret", /EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE/.test(flags) && /EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE/.test(flags) && !/SUPABASE_ACCESS_TOKEN|service_role|authorization\s*:/i.test(source));
  check("Favorites source is independent from Ratings state", !/consumer-ratings|ratingId|rating row/i.test(source));

  check("documents keep local-only disabled/mock scope", /local implementation candidate; not Frozen/i.test(docs) && /does not add a Supabase client[\s\S]*migration[\s\S]*Mobile UI route/i.test(docs));
  check("documents preserve exact lifecycle semantics", /Duplicate add returns `already_present`[\s\S]*Remove sets `removedAt`[\s\S]*Re-adding a removed target inserts a new active row/i.test(docs));
  check("documents preserve per-entity list and ordering", /combined cross-entity cursor is not implemented/i.test(docs) && /`sortOrder` ascending, with null last[\s\S]*`createdAt` descending[\s\S]*`id` ascending/i.test(docs));
  check("documents preserve retained later-phase hard gates", /Development effective ACL verification[\s\S]*linked-catalog ID representation[\s\S]*authenticated atomic RPC security[\s\S]*privacy retention[\s\S]*quota contract/i.test(docs));
  check("documents keep Production N4 and later phases untouched", /Production are untouched[\s\S]*N4 remains BLOCKED \/ NOT EXECUTED/i.test(docs) && /Phase 2Y are not started/i.test(docs));

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const latestMigration = migrations.at(-1);
  const latestMigrationHash = createHash("sha256").update(read(`supabase/migrations/${latestMigration}`)).digest("hex");
  check("migration inventory remains 34 at the Frozen Phase 2W-B migration", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).trim() === "" && migrations.length === 34 && latestMigration === "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql", { migrationCount: migrations.length, latestMigration, latestMigrationHash });

  const packageJson = JSON.parse(read("package.json"));
  check("package exposes the Phase 2X-B guard", packageJson.scripts?.["test:consumer-phase2x-b"] === "node scripts/consumer-favorites-phase-2x-b-guard.mjs");
  check("package exposes the Phase 2X-B smoke", packageJson.scripts?.["test:consumer-phase2x-b-smoke"] === "node scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs");
  check("package changes add scripts only", git(["diff", "--unified=0", "HEAD", "--", "package.json"]).split(/\r?\n/).filter((line) => /^[+-](?![+-])/.test(line)).every((line) => /test:consumer-phase2x-b/.test(line)));
  check("package-lock and dependency declarations remain unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).trim() === "" && git(["diff", "--unified=0", "HEAD", "--", "package.json"]).split(/\r?\n/).filter((line) => /^[+-](?![+-])/.test(line)).every((line) => !/dependencies|devDependencies/.test(line)));
  check(
    "Phase 2X-A guard package script key and command are preserved unchanged",
    packageJson.scripts?.["test:consumer-phase2x-a"] === "node scripts/consumer-favorites-phase-2x-a-guard.mjs"
  );

  // Phase 2X-A guard diagnostic — EXPECTED_PHASE_TRANSITION_RESULT
  // These 4 failures are legitimate Phase 2X-B progression signals, not runtime regressions.
  // Future Phase 2X-C/D/E guards must carry their own historical anchor checks instead of
  // requiring Phase 2X-A guard 41/41 on a later worktree.
  const phase2xaExpectedFailureNames = [
    "HEAD remains the Frozen Phase 2W-E baseline",
    "candidate changes stay inside the approved Phase 2X-A boundary",
    "no Favorites runtime implementation exists",
    "package-lock and dependencies remain unchanged"
  ];
  const phase2xaGuardRun = spawnSync("node", ["scripts/consumer-favorites-phase-2x-a-guard.mjs"], { cwd: root, encoding: "utf8", windowsHide: true });
  let phase2xaGuardResult;
  try { phase2xaGuardResult = JSON.parse(phase2xaGuardRun.stdout); } catch { phase2xaGuardResult = null; }
  const phase2xaActualFailureNames = (phase2xaGuardResult?.issues ?? []).map((i) => i.name);
  check(
    "Phase 2X-A guard EXPECTED_PHASE_TRANSITION_RESULT — 37/41 pass, exactly 4 legitimate phase-progression failures",
    phase2xaGuardResult?.passedChecks === 37 &&
    phase2xaGuardResult?.failedChecks === 4 &&
    phase2xaExpectedFailureNames.length === phase2xaActualFailureNames.length &&
    phase2xaExpectedFailureNames.every((name) => phase2xaActualFailureNames.includes(name)),
    { phase2xaExpectedFailureNames, phase2xaActualFailureNames }
  );

  const markdownWhitespaceIssues = docFiles.filter((file) => {
    const text = read(`${docsRoot}/${file}`);
    return !text.endsWith("\n") || text.endsWith("\n\n") || /[ \t]+$/m.test(text);
  });
  check("new Markdown has one EOF newline and no trailing whitespace", markdownWhitespaceIssues.length === 0, { markdownWhitespaceIssues });
  check("candidate contains no generated artifact", !statusEntries.some(({ file }) => /\.(?:js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(?:\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));
  check("candidate contains no environment file", !changedFiles.some((file) => /(^|\/)\.env(?:\.|$)/.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-B Local Disabled/Mock Favorites Architecture",
    totalChecks: checks.length,
    passedChecks: checks.filter(({ pass }) => pass).length,
    failedChecks: issues.length,
    migrationCount: migrations.length,
    latestMigration,
    latestMigrationHash,
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    mobileUiCutover: false,
    phase2YStarted: false,
    checks,
    issues
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
