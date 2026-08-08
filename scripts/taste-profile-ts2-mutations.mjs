import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const entry = path.join(root, "apps/mobile/features/consumer-taste-profile/index.ts");
const servicePath = "apps/mobile/features/consumer-taste-profile/consumerTasteProfileService.ts";
const typesPath = "apps/mobile/features/consumer-taste-profile/types.ts";
const mapperPath = "apps/mobile/features/consumer-taste-profile/foundationMappers.ts";
const behaviorPath = "apps/mobile/features/consumer-taste-profile/behaviorMappers.ts";
const adapterPath = "apps/mobile/features/consumer-taste-profile/adapters/preparedSupabaseConsumerTasteFoundationRepository.ts";
const snapshotPath = "packages/shared/src/domain/taste-similarity/snapshot.ts";
const normalizationPath = "packages/shared/src/domain/taste-similarity/normalization.ts";
const canonicalSources = new Map();

const baseProgram = ts.createProgram([entry], {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true, esModuleInterop: true,
  skipLibCheck: true, rootDir: root
});
for (const source of baseProgram.getSourceFiles()) {
  if (source.fileName.startsWith(root) && !source.fileName.includes(`${path.sep}node_modules${path.sep}`)) {
    canonicalSources.set(path.relative(root, source.fileName).replaceAll("\\", "/"), source.text);
  }
}

const request = { mealWindow: { startDate: "2026-08-01", endDate: "2026-08-08", limit: 1 }, favoritePageSize: 1 };
const okSession = (userId) => ({ ok: true, value: { user: { userId, provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-01-01T00:00:00Z" }, provider: "mock", issuedAt: "2026-08-08T00:00:00Z" } });
const deferred = () => ({ status: "deferred", reason: "acl_activation_pending" });
const foundation = () => ({ source: "injected-test", readCurrentUserTasteProfile: async () => deferred(), readCurrentUserNutritionGoals: async () => deferred(), readCurrentUserDietaryRestrictions: async () => deferred() });
const meal = { mealRecordId: "m", mealType: "lunch", occurredAt: "2026-08-07T00:00:00Z", mealDate: "2026-08-07", timezone: "UTC", source: "manual", createdAt: "2026-08-07T00:00:00Z", updatedAt: "2026-08-07T00:00:00Z", items: [{ mealRecordItemId: "mi", displayName: "x", nutrition: {}, nutritionSource: "manual", nutritionSchemaVersion: "v1", occurredAt: "2026-08-07T00:00:00Z", timezone: "UTC", confidenceScore: 0.8, consumedRatio: 1, correctionStatus: "none", createdAt: "2026-08-07T00:00:00Z", updatedAt: "2026-08-07T00:00:00Z" }] };
const goal = { id: "g", user_id: "user-a", goal_label: "goal", daily_calories_target: null, protein_target_g: null, carbohydrates_target_g: null, fat_target_g: null, fiber_target_g: null, starts_on: "2026-08-01", ends_on: "2026-08-31", is_active: true, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" };
const emptyFavorite = { status: "empty", records: [], nextCursor: null, source: "mock" };
const emptyRating = { status: "available", records: [], source: "mock" };

function deps(overrides = {}) {
  return { authPort: { getCurrentSession: async () => okSession("user-a") }, foundationRepository: foundation(), mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) }, favoriteService: { listCurrentUserFavorites: async () => emptyFavorite }, ratingService: { listCurrentUserRatings: async () => emptyRating }, clock: { now: () => "2026-08-08T12:00:00.000Z" }, ...overrides };
}

async function read(domain, overrides = {}) {
  const service = new domain.ConsumerTasteProfileService(deps(overrides));
  service.setActor("user-a", 1);
  return service.readCurrentUserSnapshot(request);
}

const mutations = [
  { name: "failed source becomes empty", file: servicePath, from: 'return { status: "failed", evidenceCount, failureCode: "source_read_failed" };', to: 'return { status: "empty", evidenceCount: 0 } as TasteProfileSourceState;', probe: async (d) => (await read(d, { ratingService: { listCurrentUserRatings: async () => ({ status: "read_failed", source: "mock", error: {} }) } })).snapshot.sourceStates.ratings.status === "failed" },
  { name: "disabled source becomes empty", file: servicePath, from: 'if (result.value.status === "disabled") return { evidence: [] as readonly BehavioralEvidence[], state: { status: "disabled", evidenceCount: 0, reason: "source_disabled" } as const };', to: 'if (result.value.status === "disabled") return { evidence: [] as readonly BehavioralEvidence[], state: { status: "empty", evidenceCount: 0 } as const };', probe: async (d) => (await read(d, { ratingService: { listCurrentUserRatings: async () => ({ status: "disabled", source: "disabled", error: {} }) } })).snapshot.sourceStates.ratings.status === "disabled" },
  { name: "deferred source becomes empty", file: servicePath, from: 'if (result.status === "deferred") return { status: "deferred", evidenceCount: 0, reason: "acl_activation_pending" };', to: 'if (result.status === "deferred") return { status: "empty", evidenceCount: 0 };', probe: async (d) => (await read(d)).snapshot.sourceStates.taste_profile.status === "deferred" },
  { name: "meal truncation is dropped", file: servicePath, from: 'truncation: mealsMapped.rawRecordCount >= request.mealWindow.limit ? "possibly_truncated" : "not_truncated"', to: 'truncation: "not_truncated"', probe: async (d) => (await read(d, { mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [meal] }) } })).snapshot.evidenceWindow.meals.truncation === "possibly_truncated" },
  { name: "requested evidence window is dropped", file: servicePath, from: 'requestedStartDate: request.mealWindow.startDate,', to: 'requestedStartDate: request.mealWindow.endDate,', probe: async (d) => (await read(d)).snapshot.evidenceWindow.meals.requestedStartDate === request.mealWindow.startDate },
  { name: "arbitrary userId read parameter is enabled", file: servicePath, from: 'readCurrentUserSnapshot(request: ConsumerTasteProfileReadRequest)', to: 'readCurrentUserSnapshot(request: ConsumerTasteProfileReadRequest, userId?: string)', probe: async (_d, sources) => !sources.get(servicePath).includes("userId?: string") },
  { name: "actor race accepts stale A response for B", file: servicePath, from: 'return this.actorKey === actorKey && this.actorGeneration === actorGeneration;', to: 'return true;', probe: async (d) => { let release; let first = true; const pending = new Promise((resolve) => { release = resolve; }); const service = new d.ConsumerTasteProfileService(deps({ foundationRepository: { ...foundation(), readCurrentUserTasteProfile: async () => first ? (first = false, pending) : deferred() } })); service.setActor("user-a", 1); const a = service.readCurrentUserSnapshot(request); await new Promise((resolve) => setImmediate(resolve)); service.setActor("user-b", 2); release(deferred()); return (await a).status === "stale"; } },
  { name: "denormalized favorite IDs enter foundation contract", file: typesPath, from: 'preferred_cuisine_tags: readonly string[];', to: 'preferred_cuisine_tags: readonly string[];\n  favorite_restaurant_ids: readonly string[];', probe: async (_d, sources) => !/favorite_restaurant_ids|favorite_menu_item_ids/.test(sources.get(typesPath)) },
  { name: "inactive goal is included", file: mapperPath, from: '!row.is_active || row.starts_on > asOfDate ||', to: 'row.starts_on > asOfDate ||', probe: async (d) => d.mapNutritionGoalRows([{ ...goal, is_active: false }], "user-a", "2026-08-08").length === 0 },
  { name: "expired goal is included", file: mapperPath, from: ' || (row.ends_on !== null && row.ends_on < asOfDate)', to: '', probe: async (d) => d.mapNutritionGoalRows([{ ...goal, starts_on: "2026-01-01", ends_on: "2026-08-07" }], "user-a", "2026-08-08").length === 0 },
  { name: "future goal is included", file: mapperPath, from: 'row.starts_on > asOfDate || ', to: '', probe: async (d) => d.mapNutritionGoalRows([{ ...goal, starts_on: "2026-08-09" }], "user-a", "2026-08-08").length === 0 },
  { name: "private notes enter foundation row contract", file: typesPath, from: 'restriction_type: string;', to: 'restriction_type: string;\n  health_notes: string | null;', probe: async (_d, sources) => !/health_notes|private_diet_notes|medical_sensitivity_notes/.test(sources.get(typesPath)) },
  { name: "unknown restriction severity becomes soft", file: normalizationPath, from: 'enforcement: rawSeverity === "preference" ? "soft" : "unclassified",', to: 'enforcement: rawSeverity === "preference" ? "soft" : "soft",', probe: async (d) => d.mapDietaryRestrictionRows([{ id: "r", user_id: "user-a", restriction_type: "dietary", label: "x", severity: "unknown", visibility: "private", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" }], "user-a")[0].enforcement === "unclassified" },
  { name: "meal source confidence becomes taste confidence", file: behaviorPath, from: 'behaviorKind: "meal_occurrence",\n      interpretation: "observed",', to: 'behaviorKind: "meal_occurrence",\n      interpretation: "observed",\n      ...({ tasteConfidence: item.confidenceScore } as object),', probe: async (_d, sources) => !/tasteConfidence/.test(sources.get(behaviorPath)) },
  { name: "rating threshold introduces positive polarity", file: behaviorPath, from: 'interpretation: "scalar_evaluation_unclassified",\n    ratingValue:', to: 'interpretation: (record.ratingValue >= 3 ? "positive" : "negative") as "scalar_evaluation_unclassified",\n    ratingValue:', probe: async (d) => d.mapRatingRecordsToTasteEvidence([{ ratingId: "r", ratingValue: 4, visibility: "private", isCurrent: true, tasteFeeling: null, portionFeeling: null, priceFeeling: null, repurchaseIntent: null, ratedAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", target: { kind: "restaurant", restaurantId: "rest" } }])[0].interpretation === "scalar_evaluation_unclassified" },
  { name: "noncritical source failure aborts composition", file: servicePath, from: 'const ratingsMapped = mapRatings(ratingsResult);', to: 'const ratingsMapped = mapRatings(ratingsResult);\n    if (ratingsMapped.state.status === "failed") throw new Error("abort all");', probe: async (d) => (await read(d, { mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [meal] }) }, ratingService: { listCurrentUserRatings: async () => ({ status: "read_failed", source: "mock", error: {} }) } })).status === "available" },
  { name: "deterministic evidence ordering is removed", file: snapshotPath, from: 'return [...values].sort((left, right) => compareCodeUnits(left.evidence.evidenceId, right.evidence.evidenceId));', to: 'return [...values];', probe: async (d) => { const record = (id) => ({ ratingId: id, ratingValue: 3, visibility: "private", isCurrent: true, tasteFeeling: null, portionFeeling: null, priceFeeling: null, repurchaseIntent: null, ratedAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", target: { kind: "restaurant", restaurantId: "rest" } }); const result = await read(d, { ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [record("z"), record("a")], source: "mock" }) } }); return result.snapshot.behavior.map((entry) => entry.evidence.evidenceId).join(",") === "rating:a,rating:z"; } },
  { name: "generatedAt uses uncontrolled wall clock", file: servicePath, from: 'const generatedAt = this.options.clock.now();', to: 'const generatedAt = new Date().toISOString();', probe: async (d) => (await read(d)).snapshot.generatedAt === "2026-08-08T12:00:00.000Z" },
  { name: "second client lifecycle is constructed", file: adapterPath, from: 'export class PreparedSupabaseConsumerTasteFoundationRepository implements ConsumerTasteFoundationRepository {', to: 'export class PreparedSupabaseConsumerTasteFoundationRepository implements ConsumerTasteFoundationRepository {\n  private readonly alternateClient = { from: (_table: string) => null };', probe: async (_d, sources) => !/alternateClient|createClient\s*\(|new SupabaseClient/.test(sources.get(adapterPath)) },
  { name: "live foundation SELECT is activated", file: adapterPath, from: 'async readCurrentUserTasteProfile() {\n    void this.existingClient;', to: 'async readCurrentUserTasteProfile() {\n    this.existingClient?.from("taste_profiles");', probe: async (d) => { let calls = 0; const repository = new d.PreparedSupabaseConsumerTasteFoundationRepository({ from: () => { calls += 1; } }); await repository.readCurrentUserTasteProfile(); return calls === 0; } }
];

function mutateSources(mutation) {
  const sources = new Map(canonicalSources);
  const source = sources.get(mutation.file);
  const occurrences = source?.split(mutation.from).length - 1;
  if (occurrences !== 1) return { applied: false, occurrences, sources };
  sources.set(mutation.file, source.replace(mutation.from, mutation.to));
  return { applied: true, occurrences, sources };
}

function compile(sources, token) {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, `taste-profile-ts2-mutant-${token}-`));
  const outRoot = path.join(tempRoot, "out");
  const host = ts.createCompilerHost(baseProgram.getCompilerOptions());
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const relative = fileName.startsWith(root) ? path.relative(root, fileName).replaceAll("\\", "/") : null;
    return relative && sources.has(relative)
      ? ts.createSourceFile(fileName, sources.get(relative), languageVersion, true)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const options = { ...baseProgram.getCompilerOptions(), outDir: outRoot, rootDir: root, noEmit: false };
  const program = ts.createProgram([entry], options, host);
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  if (diagnostics.length) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { compiled: false, diagnostics: diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")) };
  }
  try {
    const requireFromTemp = createRequire(path.join(outRoot, "apps/mobile/features/consumer-taste-profile/index.js"));
    return { compiled: true, domain: requireFromTemp("./index.js"), cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { compiled: true, loaded: false, loadError: error instanceof Error ? error.message : String(error) };
  }
}

const canonical = compile(canonicalSources, "canonical");
if (!canonical.compiled || !canonical.domain) {
  console.error(JSON.stringify({ status: "failed", reason: "canonical TS-2 graph did not compile/load", canonical }, null, 2));
  process.exit(1);
}

const results = [];
try {
  for (const [index, mutation] of mutations.entries()) {
    const applied = mutateSources(mutation);
    let canonicalPass = false;
    try { canonicalPass = Boolean(await mutation.probe(canonical.domain, canonicalSources)); } catch {}
    if (!applied.applied) {
      results.push({ name: mutation.name, applied: false, occurrences: applied.occurrences, canonicalPass, compiled: false, killed: false });
      console.log(`FAIL MUTATION ${index + 1} ${mutation.name} (not applied exactly once)`);
      continue;
    }
    const mutant = compile(applied.sources, String(index + 1));
    let mutantPass = null;
    let runtimeError = null;
    if (mutant.compiled && mutant.domain) {
      try { mutantPass = Boolean(await mutation.probe(mutant.domain, applied.sources)); }
      catch (error) { runtimeError = error instanceof Error ? error.message : String(error); mutantPass = false; }
      finally { mutant.cleanup?.(); }
    }
    const killed = canonicalPass && mutant.compiled && Boolean(mutant.domain) && mutantPass === false;
    results.push({ name: mutation.name, applied: true, occurrences: applied.occurrences, canonicalPass, compiled: mutant.compiled, loaded: Boolean(mutant.domain), mutantPass, runtimeError, diagnostics: mutant.diagnostics ?? [], loadError: mutant.loadError ?? null, killed });
    console.log(`${killed ? "PASS" : "FAIL"} MUTATION ${index + 1} ${mutation.name}`);
  }
} finally {
  canonical.cleanup?.();
}

const killedCount = results.filter((entry) => entry.killed).length;
const passed = killedCount === mutations.length;
console.log(JSON.stringify({
  status: passed ? "passed" : "failed", phase: "TS-2A + TS-2B + TS-2C Targeted Semantic Mutation Suite",
  totalMutations: mutations.length, killedMutations: killedCount, survivedMutations: mutations.length - killedCount,
  compileOnlyKillsAccepted: false, results, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
}, null, 2));
if (!passed) process.exitCode = 1;
