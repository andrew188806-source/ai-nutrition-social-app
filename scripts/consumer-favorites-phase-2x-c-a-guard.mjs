import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const phase2xAFrozenCommit = "7e4a9148b5caa73955d87570ea6aed645aff9bfe";
const phase2xBFrozenCommit = "bb45c808ef7c1773bc7fd7d5a32da935bf291a78";
const featureRoot = "apps/mobile/features/consumer-favorites";
const docsRoot = "docs/consumer-runtime-phase-2x";
const migrationName = "20260718010000_consumer_favorites_authenticated_read.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const newSourceFiles = [
  `${featureRoot}/supabaseFavoriteContracts.ts`,
  `${featureRoot}/supabaseFavoriteMappers.ts`,
  `${featureRoot}/adapters/supabaseConsumerFavoriteReadRepository.ts`
];
const extensionFiles = [
  `${featureRoot}/types.ts`,
  `${featureRoot}/errors.ts`,
  `${featureRoot}/featureFlags.ts`,
  `${featureRoot}/factories.ts`,
  `${featureRoot}/index.ts`
];
const docFiles = [
  `${docsRoot}/phase-2x-c-a-authenticated-read-preparation.md`,
  `${docsRoot}/phase-2x-c-a-security-and-validation.md`,
  `${docsRoot}/phase-2x-c-a-development-readonly-preflight.sql`
];
const scriptFiles = [
  "scripts/consumer-favorites-phase-2x-c-a-guard.mjs",
  "scripts/consumer-favorites-phase-2x-c-a-contract-smoke.mjs"
];
const allowedChanges = new Set([
  "package.json",
  ...newSourceFiles,
  ...extensionFiles,
  ...docFiles,
  ...scriptFiles,
  migrationPath
]);
const immutablePhase2XFiles = [
  `${docsRoot}/phase-2x-a-discovery-report.md`,
  `${docsRoot}/phase-2x-a-runtime-contract.md`,
  `${docsRoot}/phase-2x-a-security-and-target-identity.md`,
  `${docsRoot}/phase-2x-b-local-disabled-mock-architecture.md`,
  `${docsRoot}/phase-2x-b-validation-plan.md`,
  `${docsRoot}/phase-2x-implementation-plan.md`,
  `${docsRoot}/phase-2x-known-issues-and-deferrals.md`,
  `${docsRoot}/phase-2x-validation-plan.md`,
  "scripts/consumer-favorites-phase-2x-a-guard.mjs",
  "scripts/consumer-favorites-phase-2x-b-guard.mjs",
  "scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs",
  `${featureRoot}/consumerFavoriteService.ts`,
  `${featureRoot}/ports.ts`,
  `${featureRoot}/validation.ts`,
  `${featureRoot}/adapters/disabledConsumerFavoriteRepository.ts`,
  `${featureRoot}/adapters/mockConsumerFavoriteRepository.ts`
];
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));

  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("HEAD remains the Frozen Phase 2X-B commit", git(["rev-parse", "HEAD"]).stdout.trim() === phase2xBFrozenCommit);
  check("Phase 2X-A Frozen Commit is an ancestor", git(["merge-base", "--is-ancestor", phase2xAFrozenCommit, "HEAD"], true).status === 0);
  check("Phase 2X-B Frozen Commit is HEAD or an ancestor", git(["merge-base", "--is-ancestor", phase2xBFrozenCommit, "HEAD"], true).status === 0);
  check("candidate changes stay inside the Phase 2X-C-A allowlist", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("Frozen Phase 2X-A/B artifacts remain byte-unchanged", git(["diff", "--name-only", "HEAD", "--", ...immutablePhase2XFiles]).stdout.trim() === "");
  check("Frozen Phase 2W implementation remains unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/features/consumer-ratings", "docs/consumer-runtime-phase-2w"]).stdout.trim() === "");
  check("Mobile production UI and routes remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/app"]).stdout.trim() === "");
  check("package-lock remains unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "");

  for (const file of [...newSourceFiles, ...docFiles, ...scriptFiles, migrationPath]) {
    check(`required Phase 2X-C-A file exists: ${file}`, fs.existsSync(path.join(root, file)));
  }

  const types = read(`${featureRoot}/types.ts`);
  const errors = read(`${featureRoot}/errors.ts`);
  const flags = read(`${featureRoot}/featureFlags.ts`);
  const factories = read(`${featureRoot}/factories.ts`);
  const index = read(`${featureRoot}/index.ts`);
  const contracts = read(newSourceFiles[0]);
  const mappers = read(newSourceFiles[1]);
  const adapter = read(newSourceFiles[2]);
  const migration = read(migrationPath);
  const preflight = read(docFiles[2]);
  const docs = read(docFiles[0]) + "\n" + read(docFiles[1]);

  check("read source adds Supabase while write source remains frozen", /ConsumerFavoriteReadSource = "disabled" \| "mock" \| "supabase"/.test(types) && /ConsumerFavoriteWriteSource = "disabled" \| "mock";/.test(types));
  check("read flags allow Supabase explicitly", /readSources[\s\S]*"disabled", "mock", "supabase"/.test(flags));
  check("write flags reject Supabase", /writeSources[\s\S]*"disabled", "mock"/.test(flags) && !/writeSources[^\n]*supabase/.test(flags));
  check("both source defaults remain disabled", (flags.match(/return "disabled"/g) ?? []).length >= 2);
  check("invalid sources record an issue instead of mock fallback", /issues\.push/.test(flags) && !/return "mock"/.test(flags));
  check("factory requires an explicitly injected Favorites client", /favoriteClient\?: SupabaseConsumerFavoriteClientLike/.test(factories) && /requires an explicitly injected favorite client/.test(factories));
  check("factory composes Supabase only for readSource", /flags\.readSource === "supabase"/.test(factories) && !/flags\.writeSource === "supabase"/.test(factories));
  check("factory construction contains no client query", !/\.from\s*\(|\.select\s*\(|\.rpc\s*\(/.test(factories));
  check("index exports the single Supabase read path", /supabaseFavoriteContracts/.test(index) && /supabaseFavoriteMappers/.test(index) && /supabaseConsumerFavoriteReadRepository/.test(index));

  check("contracts expose exactly two Favorites tables", contracts.includes('"favorite_restaurants"') && contracts.includes('"favorite_menu_items"'));
  check("selected columns exclude ownership", !/user_id|userId/.test(contracts));
  check("client contract has no RPC or write method", !/\brpc\s*\(|\binsert\s*\(|\bupdate\s*\(|\bdelete\s*\(|\bupsert\s*\(/.test(contracts));
  check("query contract supports active filter ordering cursor and limit", /is\(column: string, value: null\)/.test(contracts) && /or\(filters: string\)/.test(contracts) && /order\(column: string/.test(contracts) && /limit\(count: number\)/.test(contracts));

  check("adapter implements both approved read operations", /getCurrentUserFavorite/.test(adapter) && /listCurrentUserFavorites/.test(adapter));
  check("adapter selects restaurant and menu-item tables separately", /SUPABASE_FAVORITE_RESTAURANTS_TABLE/.test(adapter) && /SUPABASE_FAVORITE_MENU_ITEMS_TABLE/.test(adapter));
  check("every adapter query is active-only", (adapter.match(/\.is\("removed_at", null\)/g) ?? []).length === 4);
  check("menu-item lookup filters restaurant parent and menu item", /\.eq\("restaurant_id", target\.restaurantId\)[\s\S]*\.eq\("menu_item_id", target\.menuItemId\)/.test(adapter));
  check("adapter contains no owner filter or selected ownership", !/\.eq\(\s*["'](?:user_id|owner_id)["']|user_id|userId/.test(adapter));
  check("adapter applies exact three-level ordering", (adapter.match(/\.order\("sort_order", \{ ascending: true, nullsFirst: false \}\)/g) ?? []).length === 2 && (adapter.match(/\.order\("created_at", \{ ascending: false \}\)/g) ?? []).length === 2 && (adapter.match(/\.order\("id", \{ ascending: true \}\)/g) ?? []).length === 2);
  check("adapter requests page size plus one", (adapter.match(/\.limit\(pageSize \+ 1\)/g) ?? []).length === 2);
  check("cursor covers non-null and null-last partitions", /sort_order\.gt/.test(adapter) && /sort_order\.is\.null/.test(adapter) && /created_at\.lt/.test(adapter) && /id\.gt/.test(adapter));
  check("adapter has no direct or RPC write path", !/\.(?:insert|update|delete|upsert|rpc)\s*\(/.test(adapter));
  check("adapter has no mock fallback or global client", !/MockConsumerFavorite|createClient|globalThis|process\.env/.test(adapter));
  check("adapter does not log row or payload data", !/console\.|logger\.|\blog\s*\(/.test(adapter));

  check("mappers validate ID canonical targets nullable metadata integer timestamp and active state", /nonEmptyString\(row\.id/.test(mappers) && /validateConsumerFavoriteTarget/.test(mappers) && /restaurant_id/.test(mappers) && /menu_item_id/.test(mappers) && /nullableString/.test(mappers) && /Number\.isInteger/.test(mappers) && /Date\.parse/.test(mappers) && /row\.removed_at !== null/.test(mappers));
  check("malformed response has a dedicated typed error", /favorite_response_malformed/.test(errors) && /ConsumerFavoriteResponseMalformedError/.test(mappers));
  check("permission transport and database errors are typed", ["favorite_permission_denied", "favorite_transport_failed", "favorite_database_failed"].every((code) => errors.includes(code)));

  const migrationWithoutComments = stripSqlComments(migration);
  check("migration owns an independent transaction", /^\s*begin\s*;/i.test(migrationWithoutComments) && /commit\s*;\s*$/i.test(migrationWithoutComments));
  check("migration revokes all table privileges from PUBLIC anon authenticated", (migrationWithoutComments.match(/revoke all on table public\.favorite_(?:restaurants|menu_items) from public, anon, authenticated/gi) ?? []).length === 2);
  check("migration grants only SELECT to authenticated", (migrationWithoutComments.match(/grant select on table public\.favorite_(?:restaurants|menu_items) to authenticated/gi) ?? []).length === 2);
  check("migration explicitly denies direct DML", (migrationWithoutComments.match(/revoke insert, update, delete on table public\.favorite_(?:restaurants|menu_items) from public, anon, authenticated/gi) ?? []).length === 2);
  check("migration creates no RPC function policy view or data mutation", !/create\s+(?:or\s+replace\s+)?(?:function|policy|view)|\b(?:insert\s+into|update\s+public|delete\s+from)\b/i.test(migrationWithoutComments));
  check("migration contains no privileged role or Production reference", !/service_role|supabase_admin|production/i.test(migrationWithoutComments));

  const preflightWithoutComments = stripSqlComments(preflight);
  const preflightStatements = preflightWithoutComments.split(";").map((value) => value.trim()).filter(Boolean);
  check("operator preflight contains SELECT statements only", preflightStatements.length >= 12 && preflightStatements.every((statement) => /^select\b/i.test(statement)));
  check("preflight covers tables columns RLS policies ACL defaults and indexes", ["pg_class", "information_schema.columns", "pg_policies", "has_table_privilege", "role_table_grants", "pg_default_acl", "pg_indexes"].every((term) => preflight.includes(term)));
  check("preflight covers Favorites objects and aggregate row counts", /proname ilike '%favorite%'/i.test(preflight) && /favorite_restaurant_row_count/.test(preflight) && /favorite_menu_item_row_count/.test(preflight));
  check("preflight covers menu identity and parent consistency without row content", /duplicate_menu_item_id_group_count/.test(preflight) && /cross_restaurant_favorite_menu_item_group_count/.test(preflight) && /favorite_menu_item_parent_mismatch_count/.test(preflight));
  check("preflight contains no credential or connection command", !/password|access_token|service_role|\\connect|postgres(?:ql)?:\/\//i.test(preflight));

  check("documents bind the exact non-Production Development target", /tastkind-development[\s\S]*msbgnnoorsoefuiwluye[\s\S]*Production: false/i.test(docs));
  check("documents report remote evidence as unverified without guessing", (docs.match(/UNVERIFIED/g) ?? []).length >= 4 && /Access token not provided/.test(docs));
  check("documents state Phase 2X-C-A authors but does not deploy the migration", /Phase 2X-C-A authors this migration but does not deploy it/i.test(docs));
  check("documents require exact Development identity and non-Production target", /Development project msbgnnoorsoefuiwluye[\s\S]*Production=false/i.test(docs));
  check("documents require pre-candidate 34-history alignment and absent remote version", /exactly aligned with the 34 pre-candidate local migrations[\s\S]*remote does not already record version 20260718010000/i.test(docs));
  check("retained Frozen migration deploys even when effective ACL already matches", /remains in the Frozen Repository[\s\S]*deploys it to Development even when[\s\S]*effective ACL happens to match/i.test(docs));
  check("documents preserve all versioned migration provenance purposes", /versioned provenance[\s\S]*explicit revocation from PUBLIC\/anon\/authenticated[\s\S]*authenticated SELECT-only grant[\s\S]*direct INSERT\/UPDATE\/DELETE denial[\s\S]*migration-ledger alignment/i.test(docs));
  check("existing remote version requires content checksum match and no repeat", /remote already records version 20260718010000[\s\S]*version, content, and checksum match[\s\S]*does not execute it again/i.test(docs));
  check("non-adoption requires removal before Freeze and synchronized contract updates", /only valid non-adoption path[\s\S]*remove the migration candidate before Phase 2X-C-A Freeze[\s\S]*documentation, guard, and implementation plan/i.test(docs));
  check("documents forbid retained-local permanent remote skip based only on ACL", /retained local migration may never be permanently skipped on remote solely because current ACLs look equivalent/i.test(docs) && !/(?:matching|same|exact|equivalent)[^\n.]{0,80}ACL[^\n.]{0,80}(?:permanent(?:ly)? )?(?:skip|not deploy|withdraw)/i.test(docs));
  check("deferred gate is Development deployment authorization", /Development deployment authorization after remote identity, migration alignment and effective ACL verification/i.test(docs));
  check("preflight records ledger and retained-migration deployment contract", /34[\s\S]*20260718010000[\s\S]*Catalog-equivalent ACLs do not authorize a permanent skip/i.test(preflight));
  check("documents retain default disabled and reject Supabase writes", /Both defaults remain disabled/i.test(docs) && /Supabase write is rejected/i.test(docs));
  check("documents preserve no UI no Production no N4 no Phase 2Y", /No UI route selects/i.test(docs) && /Production operation[\s\S]*N4[\s\S]*Phase 2Y implementation/i.test(docs));

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const previousMigrationsChanged = statusEntries
    .filter(({ file }) => file.startsWith("supabase/migrations/") && file !== migrationPath);
  const migrationSha256 = createHash("sha256").update(migration).digest("hex");
  check("only the new migration draft changes migration inventory", previousMigrationsChanged.length === 0, { previousMigrationsChanged });
  check("local migration inventory is 35 with the new draft latest", migrations.length === 35 && migrations.at(-1) === migrationName, { migrationCount: migrations.length, latestMigration: migrations.at(-1), migrationSha256 });

  const packageJson = JSON.parse(read("package.json"));
  check("Phase 2X-A/B package scripts remain exact", packageJson.scripts?.["test:consumer-phase2x-a"] === "node scripts/consumer-favorites-phase-2x-a-guard.mjs" && packageJson.scripts?.["test:consumer-phase2x-b"] === "node scripts/consumer-favorites-phase-2x-b-guard.mjs" && packageJson.scripts?.["test:consumer-phase2x-b-smoke"] === "node scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs");
  check("package exposes the Phase 2X-C-A guard and smoke", packageJson.scripts?.["test:consumer-phase2x-c-a"] === "node scripts/consumer-favorites-phase-2x-c-a-guard.mjs" && packageJson.scripts?.["test:consumer-phase2x-c-a-smoke"] === "node scripts/consumer-favorites-phase-2x-c-a-contract-smoke.mjs");
  check("package changes add scripts only", git(["diff", "--unified=0", "HEAD", "--", "package.json"]).stdout.split(/\r?\n/).filter((line) => /^[+-](?![+-])/.test(line)).every((line) => /test:consumer-phase2x-c-a/.test(line)));

  const markdownFiles = docFiles.filter((file) => file.endsWith(".md"));
  const markdownWhitespaceIssues = markdownFiles.filter((file) => {
    const text = read(file);
    return !text.endsWith("\n") || text.endsWith("\n\n") || /[ \t]+$/m.test(text);
  });
  check("new Markdown has one EOF newline and no trailing whitespace", markdownWhitespaceIssues.length === 0, { markdownWhitespaceIssues });

  const candidateText = [...newSourceFiles, ...extensionFiles, ...docFiles, ...scriptFiles, migrationPath]
    .filter((file) => fs.existsSync(path.join(root, file)))
    .map(read)
    .join("\n");
  const secretPatterns = [
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /sbp_[A-Za-z0-9_-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /https:\/\/[a-z0-9]{15,}\.supabase\.co/i
  ];
  check("candidate contains no credential token private key or Supabase URL", !secretPatterns.some((pattern) => pattern.test(candidateText)));
  check("candidate contains no environment file", !changedFiles.some((file) => /(^|\/)\.env(?:\.|$)/.test(file)));
  check("candidate contains no generated artifact", !statusEntries.some(({ file }) => /\.(?:js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(?:\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-C-A Authenticated Favorites Read Preparation",
    totalChecks: checks.length,
    passedChecks: checks.filter(({ pass }) => pass).length,
    failedChecks: issues.length,
    migrationCount: migrations.length,
    latestMigration: migrations.at(-1),
    migrationSha256,
    remoteMigrationAlignment: "UNVERIFIED",
    remoteCatalogVerified: false,
    networkUsedByLocalValidation: false,
    databaseWriteUsed: false,
    migrationExecuted: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    mobileUiCutover: false,
    checks,
    issues
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
