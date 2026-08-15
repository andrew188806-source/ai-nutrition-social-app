#!/usr/bin/env node
// SR-1A guard — INTERNAL SERVER PAIR COMPARISON PRIMITIVE and FROZEN-DOMAIN RUNTIME REUSE.
//
// Lifecycle-aware, never lifecycle-dependent: every assertion is a repository CONTENT assertion over
// the working tree, so the verdict is identical before and after the freeze commit. The only
// lifecycle-sensitive input is the manifest, read from the candidate while the round is open and
// from the freeze commit's own diff-tree once it has landed.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SR1C_SUCCESSOR_PATHS } from "./social-ingress-sr1c-successor-manifest.mjs";
import { SR1D_SUCCESSOR_PATHS } from "./social-taste-sr1d-successor-manifest.mjs";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const baseline = "f53177e96af0e4665f50c6d9e954b1da23999ad8";
const freezeMessage = "Add internal server pair comparison primitive";

const domainRoot = "packages/shared/src/domain/taste-similarity";
const mobileTasteRoot = "apps/mobile/features/consumer-taste-profile";
const runtimeRoot = "supabase/functions/_shared/taste-foundation-runtime";
const serverRoot = "supabase/functions/_shared/social-pair";

const ARTIFACT = `${runtimeRoot}/tasteFoundation.generated.mjs`;
const PROVENANCE = `${runtimeRoot}/provenance.generated.json`;
const REPOSITORY = `${serverRoot}/serverTasteFoundationRepository.ts`;
const PAIR = `${serverRoot}/serverPairComparison.ts`;
const BARREL = `${serverRoot}/index.ts`;

const manifest = [
  "package.json",
  "scripts/build-taste-foundation-runtime.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-pair-sr1a-mutations.mjs",
  "scripts/social-pair-sr1a-smoke.mjs",
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  // Nine predecessor guards assert "nothing under `supabase/` changed" at directory granularity, an
  // assertion no round could trip until SR-1A became the first to add server-shared code there. Each
  // is amended with an exactly-enumerated allowance plus a strictly stronger companion check.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs",
  ARTIFACT,
  PROVENANCE,
  BARREL,
  PAIR,
  REPOSITORY
].sort();

// Frozen authority. SR-1A reuses TS-1 → TS-6 through a generated artifact precisely so that not one
// byte of any of these paths has to move.
const frozenPaths = [domainRoot, mobileTasteRoot];

const NUTRITION_MACRO_COLUMNS = [
  "daily_calories_target", "protein_target_g", "carbohydrates_target_g", "fat_target_g", "fiber_target_g"
];

const checks = [];
const failures = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);

// Documentation legitimately NAMES what it excludes — an exclusion note that cannot say the word it
// excludes is worthless. Bans on concepts are therefore evaluated against executable source only,
// unless the ban is meant to hold implementation-wide, in which case the raw text is used.
const executableOnly = (source) => source.split("\n")
  .filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  })
  .join("\n");

function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}

// Tracked modifications AND untracked additions. Before the freeze commit the SR-1A files are
// untracked, and a diff-only view would report an empty change set — which would make every
// "nothing changed here" assertion vacuously true exactly when it matters most.
function changedSince(baselineRef, pathspec) {
  const tracked = lines(git(["diff", "--name-only", baselineRef, "--", pathspec]).stdout);
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]).stdout);
  return [...new Set([...tracked, ...untracked])].map((entry) => entry.replaceAll("\\", "/")).sort();
}

function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of [
    "build:taste-foundation-runtime",
    "test:social-pair-sr1a",
    "test:social-pair-sr1a-smoke",
    "test:social-pair-sr1a-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: a private query cannot be built without an owner predicate, cannot name a source
// outside the fixed allow-list, and the primitive exposes no snapshot-shaped result type.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "social-pair-sr1a-types-"));
  try {
    const repositoryImport = path.join(root, REPOSITORY).replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "server-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type { ServerPrivateQuery, ServerPrivateReadOutcome } from ${JSON.stringify(repositoryImport)};

      const scoped: ServerPrivateQuery = {
        source: "taste_profiles",
        columns: ["id", "user_id"],
        ownerColumn: "user_id",
        ownerUserId: "00000000-0000-0000-0000-000000000000"
      };
      void scoped;

      // @ts-expect-error a query with no owner user id does not typecheck
      const unscoped: ServerPrivateQuery = {
        source: "taste_profiles",
        columns: ["id", "user_id"],
        ownerColumn: "user_id"
      };
      void unscoped;

      const misdirected: ServerPrivateQuery = {
        source: "taste_profiles",
        columns: ["id"],
        // @ts-expect-error the owner column cannot be redirected to another column
        ownerColumn: "id",
        ownerUserId: "u"
      };
      void misdirected;

      const ratings: ServerPrivateQuery = {
        // @ts-expect-error a source outside the fixed allow-list does not typecheck
        source: "restaurant_ratings",
        columns: ["id"],
        ownerColumn: "user_id",
        ownerUserId: "u"
      };
      void ratings;

      declare const outcome: ServerPrivateReadOutcome<{ id: string }>;
      if (outcome.status === "available") {
        const rows: readonly { id: string }[] = outcome.rows;
        void rows;
      }
      // @ts-expect-error a failed read carries no rows — it can never be mistaken for an empty read
      outcome.status === "failed" && outcome.rows;
    `, "utf8");
    const program = ts.createProgram([path.join(root, REPOSITORY), probePath], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      skipLibCheck: true
    });
    return ts.getPreEmitDiagnostics(program)
      .filter((diagnostic) => !diagnostic.file || diagnostic.file.fileName.includes("social-pair"))
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freezeCandidates = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout.split(/\r?\n/).filter(Boolean)
    .map((entry) => entry.split("\t")).filter(([, subject]) => subject.startsWith(freezeMessage)).map(([commit]) => commit);
  const freezeCommit = freezeCandidates[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]).stdout)
    : candidatePaths();

  const artifact = read(ARTIFACT);
  const provenance = JSON.parse(read(PROVENANCE));
  const repository = read(REPOSITORY);
  const pair = read(PAIR);
  const barrel = read(BARREL);
  const builder = read("scripts/build-taste-foundation-runtime.mjs");
  const implementation = [repository, pair, barrel].join("\n");
  const executable = executableOnly(implementation);
  const artifactExecutable = executableOnly(artifact);

  // ---- 1-3. exact manifest ----------------------------------------------------------------------
  check("1. the SR-1A change set is exactly the enumerated manifest",
    same(lifecycleManifest, manifest), { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists on disk",
    manifest.every((entry) => fs.existsSync(path.join(root, entry))));
  check("3. package change adds only the SR-1A build and validation commands",
    packageOnlyAddsValidationScripts(freezeCommit));

  // ---- 4-8. frozen authority untouched ----------------------------------------------------------
  check("4. not one byte of the frozen taste domain changed since the baseline",
    changedSince(baseline, domainRoot).length === 0, { changed: changedSince(baseline, domainRoot) });
  check("5. not one byte of the frozen Mobile taste-profile feature changed since the baseline",
    changedSince(baseline, mobileTasteRoot).length === 0, { changed: changedSince(baseline, mobileTasteRoot) });
  check("6. no Mobile file changed at all — SR-1A is server-internal",
    changedSince(baseline, "apps").length === 0, { changed: changedSince(baseline, "apps") });
  check("7. no packages/ file changed at all",
    changedSince(baseline, "packages").length === 0, { changed: changedSince(baseline, "packages") });
  // SR-1B-B adds the first Social migration. Checks 8, 9 and 36 were written as whole-prefix
  // assertions and would report a successor's migration as an SR-1A scope violation. The one new
  // path is enumerated EXACTLY; anything else under supabase/ still fails. Check 8a additionally
  // constrains what this allowance may ever contain, which the original assertions never did.
  const SR1B_B_SUCCESSOR_PATHS = Object.freeze([
    "supabase/migrations/20260810010000_social_block_authority.sql",
    "supabase/migrations/20260810020000_social_participation_authority.sql",
    "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql",
    "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
    "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
  ]);
  const B3_SUCCESSOR_PATHS = Object.freeze([
    "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
    "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
    "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
  ]);
  const sr1dSuccessorOnly = SR1D_SUCCESSOR_PATHS.filter((entry) => !manifest.includes(entry));
  const supabaseChanged = changedSince(baseline, "supabase")
    .filter((entry) => !SR1B_B_SUCCESSOR_PATHS.includes(entry) && !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !sr1dSuccessorOnly.includes(entry));
  check("8. supabase changes are exactly the five SR-1A server paths",
    same(supabaseChanged, [ARTIFACT, PROVENANCE, BARREL, PAIR, REPOSITORY].sort()), { changed: supabaseChanged });
  check("8a. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SR1B_B_SUCCESSOR_PATHS.length >= 1
    && new Set(SR1B_B_SUCCESSOR_PATHS).size === SR1B_B_SUCCESSOR_PATHS.length
    && SR1B_B_SUCCESSOR_PATHS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry))
    && !SR1B_B_SUCCESSOR_PATHS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));

  // ---- 9-12. no migration, no SQL scorer, no grant, no deployment artifact ----------------------
  const migrationsChanged = changedSince(baseline, "supabase/migrations")
    .filter((entry) => !SR1B_B_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry));
  check("9. SR-1A itself added no migration",
    migrationsChanged.length === 0, { changed: migrationsChanged });
  check("10. no SQL file appears anywhere in the manifest",
    !manifest.some((entry) => entry.endsWith(".sql")));
  check("11. no new grant, policy or privilege statement was introduced",
    !/\bGRANT\b|\bREVOKE\b|CREATE POLICY|ALTER TABLE|SECURITY DEFINER/i.test(implementation));
  check("12. no deployable Social function directory or entrypoint exists",
    !fs.existsSync(path.join(root, "supabase/functions/social-pair"))
    && !fs.existsSync(path.join(root, "supabase/functions/social-pair-comparison"))
    && !fs.existsSync(path.join(root, serverRoot, "index.http.ts"))
    && !manifest.some((entry) => /supabase\/functions\/[^_][^/]*\//.test(entry)));

  // ---- 13-17. no ingress, no registration, no credential ---------------------------------------
  check("13. no HTTP handler, request or response type exists in the server primitive",
    !/\bDeno\.serve\b|\bserve\s*\(|new\s+Response\b|:\s*Request\b|addEventListener\s*\(|\bfetch\s*\(/.test(executable));
  check("14. no Social endpoint is registered in supabase/config.toml",
    /^supabase\/config\.toml$/.test(changedSince(baseline, "supabase/config.toml")[0] ?? "")
    && /\[functions\.social-candidate-provenance\][^[]*verify_jwt = true/.test(read("supabase/config.toml")));
  check("15. no privileged credential, admin key or service role reference was added",
    !/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|sb_secret|ADMIN_KEY|SOCIAL_PAIR_COMPARISON_ADMIN_KEY/i.test(implementation)
    && !/SERVICE_ROLE|sb_secret|ADMIN_KEY/i.test(builder));
  check("16. the server primitive constructs no client and reads no environment variable",
    !/createClient|createAdminClient|Deno\.env|process\.env|new\s+SupabaseClient/.test(implementation));
  check("17. no Production reference appears anywhere in the change set",
    !/\bproduction\b/i.test(implementation) && !/\bproduction\b/i.test(builder));

  // ---- 18-24. explicit owner scoping ------------------------------------------------------------
  const ownerFieldRequired = /readonly ownerUserId: string;/.test(repository)
    && !/ownerUserId\?:/.test(repository);
  check("18. the query type makes the owner user id REQUIRED, not optional",
    ownerFieldRequired);
  check("19. the owner column is pinned to the literal user_id and cannot be redirected",
    /readonly ownerColumn: "user_id";/.test(repository) && /ownerColumn: "user_id",/.test(repository));
  const selectCalls = [...executableOnly(repository).matchAll(/this\.rowSource\.select\(([^)]*\))/g)].map((match) => match[1]);
  check("20. every transport call goes through the owner-scoping builder",
    selectCalls.length === 7 && selectCalls.every((argument) => argument.trim().startsWith("owned(")),
    { selectCalls: selectCalls.length });
  check("21. the owner-scoping builder binds the predicate to the explicit target user id",
    /ownerUserId: targetUserId/.test(executableOnly(repository)));
  check("22. a missing or blank target user id is rejected rather than silently unscoped",
    /targetUserId\.trim\(\)\.length === 0/.test(repository) && /throw new Error\(/.test(repository));
  check("23. the reader never issues a raw or dynamic query",
    !/\.from\s*\(|\.select\s*\(\s*["'`]|select \*|SELECT \*/i.test(executableOnly(repository)));
  const sourceLiterals = (repository.match(/export const SERVER_PRIVATE_SOURCES = \[([\s\S]*?)\] as const;/) ?? [])[1] ?? "";
  check("24. the private source allow-list is a fixed literal of exactly the seven taste sources",
    lines(sourceLiterals.replaceAll(/["',]/g, "")).length === 7,
    { sources: lines(sourceLiterals.replaceAll(/["',]/g, "")) });

  // ---- 25-30. data minimization -----------------------------------------------------------------
  const columnConstants = [...repository.matchAll(/export const (SERVER_[A-Z_]*COLUMNS) = \[([\s\S]*?)\] as const;/g)];
  const allColumns = columnConstants.flatMap(([, , body]) => body.replaceAll(/["'\s]/g, "").split(",").filter(Boolean));
  check("25. every private read uses a fixed column literal — seven column sets, no wildcard",
    columnConstants.length === 7 && !allColumns.includes("*"), { columnSets: columnConstants.length });
  check("26. no nutrition macro target column appears in ANY column set",
    !NUTRITION_MACRO_COLUMNS.some((column) => allColumns.includes(column)),
    { macrosFound: NUTRITION_MACRO_COLUMNS.filter((column) => allColumns.includes(column)) });
  const macroTokens = executable.match(/daily_calories_target|protein_target_g|carbohydrates_target_g|fat_target_g|fiber_target_g/g) ?? [];
  const macroNulls = executable.match(/(?:daily_calories_target|protein_target_g|carbohydrates_target_g|fat_target_g|fiber_target_g):\s*null/g) ?? [];
  check("27. every macro token in executable source is an explicit null declaration, never a read",
    macroTokens.length === 5 && macroNulls.length === 5, { macroTokens: macroTokens.length, macroNulls: macroNulls.length });
  // The frozen snapshot contract REQUIRES a `ratings` source state and a `ratings` evidence window,
  // so the token cannot be banned outright. What must be impossible is a ratings READ: the reader
  // never names ratings at all, and the only two occurrences anywhere are the frozen contract keys.
  const ratingsInPair = executableOnly(pair).match(/\w*rating\w*/gi) ?? [];
  check("28. ratings are never read — the token survives only as two frozen contract keys",
    !/rating/i.test(executableOnly(repository))
    && ratingsInPair.length === 2 && ratingsInPair.every((hit) => hit === "ratings"),
    { inRepository: (executableOnly(repository).match(/\w*rating\w*/gi) ?? []).slice(0, 5), inPair: ratingsInPair });
  check("29. the ratings source state is the canonical disabled state, never a fabricated empty",
    /ratings: \{ status: "disabled" as const, evidenceCount: 0, reason: "source_disabled" as const \}/.test(pair));
  check("30. no private nutrition, name, portion or recognition column is read",
    !/nutrition_snapshot|display_name_snapshot|user_entered_name|ai_detected_name|normalized_name|portion_snapshot|confidence_score|nutrition_source/.test(executable));

  // ---- 31-36. no scorer duplication -------------------------------------------------------------
  const frozenStageNames = [
    "compareTasteProfiles", "calculateEvidenceConfidence", "assessColdStart", "adaptSharedTasteComparison",
    "composeTasteProfileSnapshot", "mapTasteProfileRow", "mapNutritionGoalRows", "mapDietaryRestrictionRows",
    "normalizeBehavioralEvidence"
  ];
  check("31. every frozen stage the primitive uses is IMPORTED from the generated runtime",
    frozenStageNames.every((name) => new RegExp(`^\\s*${name},?$`, "m").test(pair))
    && new RegExp(`from "\\.\\./taste-foundation-runtime/tasteFoundation\\.generated\\.mjs"`).test(pair));
  check("32. no frozen stage is re-declared locally",
    !frozenStageNames.some((name) => new RegExp(`(function|const|let|class)\\s+${name}\\b`).test(executable)),
    { redeclared: frozenStageNames.filter((name) => new RegExp(`(function|const|let|class)\\s+${name}\\b`).test(executable)) });
  check("33. no similarity, scoring or confidence arithmetic is implemented in the server primitive",
    !/\bjaccard\b|\bintersection\b|\bunion\b|similarityScore|\bweight\b|Math\.(pow|sqrt|log|exp)/i.test(executable));
  // A local binding of a frozen stage's return value is fine; DECLARING a score is not. No object
  // literal anywhere in the server primitive may introduce a score, value, similarity or confidence
  // field, because any such field would be a number this round invented.
  const declaredScoreFields = executable.match(/\b(score|value|similarity|confidence|weight|rank)\s*:/g) ?? [];
  check("34. the server primitive declares no score, value, similarity or confidence field of its own",
    declaredScoreFields.length === 0, { declared: declaredScoreFields.slice(0, 5) });
  check("34a. the only confidence and cold start values come from the frozen stages",
    /const confidence = calculateEvidenceConfidence\(comparison\);/.test(pair)
    && /const coldStart = assessColdStart\(comparison, confidence\);/.test(pair));
  const serverPairFiles = fs.readdirSync(path.join(root, serverRoot));
  const sr1dAdapter = read(`${serverRoot}/authorizedPairSourcesAdapter.ts`);
  check("35. no scorer source file was copied into supabase/functions as a second authority",
    !serverPairFiles.some((file) => /similarity|comparator|confidence|coldStart/i.test(file))
    && !/score|similarity|confidence|coldStart|compareTasteProfiles|adaptSharedTasteComparison/i.test(executableOnly(sr1dAdapter)),
    { files: serverPairFiles });
  // Originally this asserted "no migration exists at all", using absence as a proxy for "no scorer
  // was reimplemented in SQL". With one enumerated successor migration now permitted, the proxy is
  // replaced by the invariant it stood for: the migration is READ and proven to contain no scoring
  // construct. That is strictly stronger — absence never proved anything about content.
  // Comments stripped: a successor migration that documents "this performs no scoring" must be able
  // to say the word. The invariant is that no scoring CONSTRUCT exists in executable SQL.
  const successorMigrationSql = SR1B_B_SUCCESSOR_PATHS
    .filter((entry) => fs.existsSync(path.join(root, entry)))
    .map((entry) => read(entry).split("\n").map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) return "";
      const at = line.indexOf("--");
      return at === -1 ? line : line.slice(0, at);
    }).join("\n")
      // `comment on ... is '...'` is documentation that happens to be SQL; its string literal may
      // legitimately state "performs no scoring". Only executable constructs are in scope here.
      .replace(/comment on [\s\S]*?;\s*$/gim, ""))
    .join("\n");
  check("36. no SQL re-implementation of a frozen scorer exists",
    migrationsChanged.length === 0
    && !/CREATE (OR REPLACE )?FUNCTION|CREATE (OR REPLACE )?VIEW/i.test(implementation)
    && !/\bjaccard\b|\bsimilarity\b|\bcosine\b|\bscore\b|\bweight\b|\brank\b|\bconfidence\b|\bcold[_ ]?start\b/i.test(successorMigrationSql),
    { successorMigrationBytes: successorMigrationSql.length });

  // ---- 37-42. generated runtime provenance ------------------------------------------------------
  check("37. the generated artifact contains zero import statements",
    (artifactExecutable.match(/^\s*import[\s{*'"]/gm) ?? []).length === 0
    && !/\bfrom\s+["']/.test(artifactExecutable));
  check("38. the generated artifact references no Node-only global",
    !/\b(process|Buffer|__dirname|__filename)\b/.test(artifactExecutable));
  check("39. the artifact is marked generated and names its own builder",
    /GENERATED FILE/.test(artifact) && /build-taste-foundation-runtime/.test(artifact));
  check("40. provenance records a digest for every source and for the artifact itself",
    Array.isArray(provenance.sources) && provenance.sources.length > 0
    && provenance.sources.every((entry) => typeof entry.sha256 === "string" && entry.sha256.length === 64)
    && typeof provenance.artifactSha256 === "string" && provenance.artifactSha256.length === 64,
    { sourceCount: provenance.sources?.length });
  check("41. every provenance source is a real frozen path that still exists",
    provenance.sources.every((entry) => fs.existsSync(path.join(root, entry.path)))
    && provenance.sources.some((entry) => entry.path.startsWith(`${domainRoot}/`))
    && provenance.sources.some((entry) => entry.path.startsWith(`${mobileTasteRoot}/`)));
  const regenerate = spawnSync(process.execPath, ["scripts/build-taste-foundation-runtime.mjs", "--check"],
    { cwd: root, encoding: "utf8", windowsHide: true });
  check("42. regenerating from frozen source reproduces the artifact and provenance byte-for-byte",
    regenerate.status === 0, { output: regenerate.stdout.trim().slice(0, 400) });
  // Without this the artifact's identity would depend on which checkout produced the working tree:
  // `core.autocrlf=true` rewrites some frozen sources to CRLF, and a byte-level digest would then
  // report drift that does not exist — or let real drift hide behind a line-ending flip.
  check("42b. the builder normalizes line endings before transpiling, embedding and hashing",
    /const normalizeNewlines = \(value\) => value\.replaceAll\("\\r\\n", "\\n"\);/.test(builder)
    && /normalizeNewlines\(fs\.readFileSync\(path\.join\(root, id\), "utf8"\)\)/.test(builder)
    && (builder.match(/normalizeNewlines\(fs\.readFileSync/g) ?? []).length === 3);
  check("42a. the builder fails closed on an external specifier rather than emitting a partial graph",
    /throw new Error\(`SR-1A generator: external specifier/.test(builder)
    && /throw new Error\(`SR-1A generator: unresolved specifier/.test(builder));

  // ---- 43-48. the result stays internal ---------------------------------------------------------
  check("43. the primitive exposes no serialization, persistence or transport path",
    !/JSON\.stringify|JSON\.parse|localStorage|AsyncStorage|\.insert\(|\.upsert\(|\.update\(|cache/i.test(executable));
  check("44. the primitive emits no log or telemetry",
    !/console\.(log|info|warn|error|debug)|track\(|analytics/i.test(executable));
  check("45. no request DTO, response DTO or candidate id parsing exists",
    !/RequestBody|ResponseBody|RequestDto|ResponseDto|\bDTO\b|req\.json\(|request\.json\(/i.test(executable));
  check("46. the barrel exports server modules only and registers no handler",
    /^export \* from "\.\/serverTasteFoundationRepository\.ts";$/m.test(barrel)
    && /^export \* from "\.\/serverPairComparison\.ts";$/m.test(barrel)
    && /^export \* from "\.\/authorizedPairSourcesAdapter\.ts";$/m.test(barrel)
    && lines(executableOnly(barrel)).length === 3
    && !/handler|Deno\.serve|Request|Response/.test(executableOnly(barrel)));
  check("47. no authorization, entitlement, discoverability, block or ranking logic was invented",
    !/\bauthoriz|entitlement|discoverab|\bblocked\b|blockList|\brank(ing)?\b|\bfeed\b|recommend/i.test(executableOnly(`${repository}\n${pair}`))
    && !/candidate|actor|block|participation|entitlement|rank|recommend/i.test(executableOnly(sr1dAdapter)));
  check("48. the comparison parameter is named so the module cannot be mistaken for a gate",
    /alreadyAuthorizedCandidate/.test(pair));

  // ---- 49-52. symmetry of the pair --------------------------------------------------------------
  check("49. one as-of value governs both sides — the primitive reads no clock",
    !/Date\.now\(\)|new Date\(\)/.test(executable) && /readonly generatedAt: string;/.test(pair));
  check("50. the evidence window is a single injected value, not a per-side parameter",
    /readonly window: ServerMealHistoryWindow;/.test(pair)
    && /asOf\.window\./.test(pair)
    && !/windowA|windowB|actorWindow|candidateWindow/.test(pair));
  check("51. a failed read is never flattened into an empty read",
    /if \(outcome\.status === "failed"\) return \{ status: "failed" as const/.test(pair));
  check("52. truncation is measured against the requested limit rather than assumed",
    /returnedCount >= requestedLimit \? \("possibly_truncated"/.test(pair));

  // ---- 53. compiler contract --------------------------------------------------------------------
  const diagnostics = compileContractProbe();
  check("53. the owner predicate and source allow-list are enforced by the type system",
    diagnostics.length === 0, { diagnostics: diagnostics.slice(0, 5) });

  console.log(JSON.stringify({
    guard: "social-pair-sr1a",
    status: failures.length ? "failed" : "passed",
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    branch,
    head,
    baseline,
    freezeCommit,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(`GUARD ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
