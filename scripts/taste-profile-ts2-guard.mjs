import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const baseline = "4429fa2892b53670c5807355cb886b425c4a2db3";
const freezeMessage = "Freeze canonical taste profile snapshot composition";
const sharedRoot = "packages/shared/src/domain/taste-similarity";
const mobileRoot = "apps/mobile/features/consumer-taste-profile";
const manifest = [
  "package.json",
  `${sharedRoot}/index.ts`,
  `${sharedRoot}/evidenceWindow.ts`,
  `${sharedRoot}/snapshot.ts`,
  `${sharedRoot}/sourceState.ts`,
  `${mobileRoot}/adapters/preparedSupabaseConsumerTasteFoundationRepository.ts`,
  `${mobileRoot}/behaviorMappers.ts`,
  `${mobileRoot}/consumerTasteProfileService.ts`,
  `${mobileRoot}/factories.ts`,
  `${mobileRoot}/featureFlags.ts`,
  `${mobileRoot}/foundationMappers.ts`,
  `${mobileRoot}/index.ts`,
  `${mobileRoot}/ports.ts`,
  `${mobileRoot}/types.ts`,
  "scripts/taste-similarity-ts1-guard.mjs",
  "scripts/taste-profile-ts2-guard.mjs",
  "scripts/taste-profile-ts2-mutations.mjs",
  "scripts/taste-profile-ts2-smoke.mjs"
].sort();
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

function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}

function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of ["test:taste-profile-ts2", "test:taste-profile-ts2-smoke", "test:taste-profile-ts2-mutations"]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

function compileProductionGraph() {
  const configPath = path.join(root, "apps/mobile/tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return [ts.flattenDiagnosticMessageText(config.error.messageText, "\n")];
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), { noEmit: true, incremental: false }, configPath);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts.getPreEmitDiagnostics(program).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n"));
}

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freezeCandidates = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout.split(/\r?\n/).filter(Boolean)
    .map((entry) => entry.split("\t")).filter(([, subject]) => subject === freezeMessage).map(([commit]) => commit);
  const freezeCommit = freezeCandidates[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]).stdout)
    : candidatePaths();

  check("branch remains main", branch === "main", { branch });
  check("TS-2 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("candidate or frozen commit has exact TS-2 manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("freeze lifecycle has at most one exact authority commit", freezeCandidates.length <= 1, { freezeCandidates });
  check("candidate staged diff is empty or frozen successor has no hidden TS-2 staged bytes", freezeCommit
    ? git(["diff", "--cached", "--name-only", "--", sharedRoot, mobileRoot]).stdout.trim() === ""
    : git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("manifest contains no wildcard authority", manifest.every((entry) => !/[?*\[\]{}]/.test(entry)));
  check("package change adds only TS-2 validation commands", packageOnlyAddsValidationScripts(freezeCommit));
  check("manifest contains no migration RPC Edge Function UI Social or GPS path", !manifest.some((entry) => /^(supabase\/|apps\/mobile\/app\/)|migration|rpc|edge-function|components|social|gps/i.test(entry)));

  const snapshot = read(`${sharedRoot}/snapshot.ts`);
  const state = read(`${sharedRoot}/sourceState.ts`);
  const window = read(`${sharedRoot}/evidenceWindow.ts`);
  const types = read(`${mobileRoot}/types.ts`);
  const ports = read(`${mobileRoot}/ports.ts`);
  const service = read(`${mobileRoot}/consumerTasteProfileService.ts`);
  const foundation = read(`${mobileRoot}/foundationMappers.ts`);
  const behavior = read(`${mobileRoot}/behaviorMappers.ts`);
  const adapter = read(`${mobileRoot}/adapters/preparedSupabaseConsumerTasteFoundationRepository.ts`);
  const factories = read(`${mobileRoot}/factories.ts`);
  const flags = read(`${mobileRoot}/featureFlags.ts`);
  const all = [snapshot, state, window, types, ports, service, foundation, behavior, adapter, factories, flags].join("\n");
  const imports = all.split(/\r?\n/).filter((line) => /^import\s/.test(line.trim())).join("\n");

  check("TasteProfileSnapshot contract exists", /export type TasteProfileSnapshot =/.test(snapshot));
  for (const array of ["preferences", "goals", "restrictions", "behavior"]) check(`${array} evidence array is required`, new RegExp(`${array}: readonly`).test(snapshot));
  for (const status of ["available", "empty", "disabled", "unauthenticated", "failed", "deferred"]) check(`source state includes ${status}`, state.includes(`\"${status}\"`));
  check("failed remains distinct from empty", /TasteProfileFailedSourceState/.test(state) && /failureCode/.test(state));
  check("disabled and deferred carry distinct reasons", /source_disabled/.test(state) && /acl_activation_pending/.test(state));
  check("all six required sources have explicit names", ["taste_profile", "nutrition_goals", "dietary_restrictions", "meals", "favorites", "ratings"].every((name) => state.includes(`\"${name}\"`)));
  check("evidence history scope is explicitly bounded", /historyScope: "bounded"/.test(window));
  check("meal requested range limit and actual range are explicit", ["requestedStartDate", "requestedEndDate", "requestedLimit", "actualEarliestAt", "actualLatestAt", "returnedCount"].every((name) => window.includes(name)));
  check("truncation states are explicit", ["not_truncated", "possibly_truncated", "known_truncated"].every((name) => window.includes(name)));
  check("snapshot has no lifetime-history claim", !/lifetime|completeHistory|allHistory/i.test(all));
  check("snapshot has no numeric profile confidence", !/profileConfidence|tasteConfidence|confidenceScore\s*:/.test(all));
  check("snapshot has no similarity or recommendation score", !/similarityScore|recommendationScore|matchScore|rankScore/i.test(all));
  check("Mobile public read API is current-user only", /readCurrentUserSnapshot\(request:/.test(service) && !/getTasteProfileSnapshot\s*\(\s*userId|readTasteProfileSnapshot\s*\(\s*userId/.test(all));
  check("existing ConsumerAuthPort is reused", /consumer-auth\/ports/.test(service) && /getCurrentSession/.test(service));
  check("actor key and generation stale rejection are present", /actorGeneration/.test(service) && /status: "stale"/.test(service) && /isCurrentActor/.test(service));
  check("no second Supabase client is constructed", !/createClient\s*\(|new SupabaseClient/.test(all));
  check("foundation table allowlist is exact", /"taste_profiles",\s*\n\s*"nutrition_goals",\s*\n\s*"dietary_restrictions"/.test(types));
  check("foundation adapter never invokes a table read", !/\.from\s*\(/.test(adapter));
  check("foundation adapter always reports deferred activation", (adapter.match(/return deferred\(\)/g) ?? []).length === 3);
  check("runtime flags cannot activate live foundation reads", /liveFoundationReadsEnabled: false/.test(types) && /liveFoundationReadsEnabled: false/.test(flags));
  check("profile row contract excludes denormalized favorites", !/favorite_restaurant_ids|favorite_menu_item_ids/.test([types, foundation].join("\n")));
  check("foundation contracts exclude private notes", !/health_notes|private_diet_notes|medical_sensitivity_notes/.test([types, foundation].join("\n")));
  check("meal adapter consumes canonical meal record types", /consumer-meals\/types/.test(behavior) && /ConsumerMealRecord/.test(behavior));
  check("favorites adapter consumes canonical Favorites types", /consumer-favorites\/types/.test(behavior) && /ConsumerFavoriteRecord/.test(behavior));
  check("ratings adapter consumes canonical Ratings types", /consumer-ratings\/types/.test(behavior) && /ConsumerCurrentRatingRecord/.test(behavior));
  check("meal source confidence stays source confidence", /sourceConfidence: item\.confidenceScore/.test(behavior) && !/tasteConfidence/.test(behavior));
  check("rating remains scalar unclassified without thresholds", /scalar_evaluation_unclassified/.test(behavior) && !/>=\s*[234]|<=\s*[234]/.test(behavior));
  check("restriction mapping calls frozen TS-1 normalizer", /normalizeRestrictionEvidence/.test(foundation) && /category: "restriction"/.test(foundation));
  check("goal mapping calls frozen TS-1 normalizer", /normalizeGoalEvidence/.test(foundation) && /category: "goal"/.test(foundation));
  check("inactive future and expired goals are excluded", /!row\.is_active \|\| row\.starts_on > asOfDate \|\| \(row\.ends_on !== null && row\.ends_on < asOfDate\)/.test(foundation));
  check("deterministic clock is injected", /clock: ConsumerTasteProfileClock/.test(service) && /this\.options\.clock\.now\(\)/.test(service));
  check("deterministic code-unit ordering is used", /compareCodeUnits/.test(snapshot) && !/localeCompare/.test(all));
  check("noncritical reads are isolated with settled results", /Promise\.all/.test(service) && /function settle/.test(service));
  check("service has no Social dependency", !/(?:from|import)[^\n]*social/i.test(imports));
  check("service has no GPS dependency", !/(?:from|import)[^\n]*(gps|geolocation)/i.test(imports));
  check("service has no UI fixture dependency", !/(?:from|import)[^\n]*(fixture|mock\/|components|i18n)/i.test(imports));
  check("implementation contains no migration or grant activation", !/create policy|grant select|alter table|auth\.uid\(\)/i.test(all));
  check("prepared factory cannot accept live activation", /foundationActivation !== "deferred"/.test(factories));
  const diagnostics = compileProductionGraph();
  check("Mobile production graph compiles", diagnostics.length === 0, { diagnostics });
  const guardSource = read("scripts/taste-profile-ts2-guard.mjs");
  const unconditionalExit = ["process", ".exit(0)"].join("");
  check("guard has no HEAD bypass or unconditional success exit", !guardSource.includes(unconditionalExit));
  check("guard has no unconditional PASS assertion", !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource));

  console.log(JSON.stringify({
    status: failures.length ? "failed" : "passed",
    phase: "TS-2A + TS-2B + TS-2C Canonical Taste Profile Guard",
    totalChecks: checks.length,
    passedChecks: checks.length - failures.length,
    failedChecks: failures.length,
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    freezeCommit,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", phase: "TS-2A + TS-2B + TS-2C Canonical Taste Profile Guard", reason: error instanceof Error ? error.message : String(error), checks, failures }, null, 2));
  process.exitCode = 1;
}
