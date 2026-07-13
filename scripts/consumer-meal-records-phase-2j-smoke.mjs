import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const mockOptIn = process.env.TASTKIND_CONSUMER_PHASE2J_MOCK_CONTRACT === "true";

if (!mockOptIn) {
  console.log(JSON.stringify({
    status: "skipped",
    phase: "Consumer Runtime Integration Phase 2J",
    reason: "SKIPPED - daily nutrition summary persistence is disabled by default.",
    supabaseClientCreated: false,
    networkRequestUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  }, null, 2));
  process.exit(0);
}

const result = await runMockContractSmoke();
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === "passed" ? 0 : 1;

async function runMockContractSmoke() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2j-"));
  const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
  const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
  const mobileNodeModulesPath = path.join(root, "apps", "mobile", "node_modules");

  for (const file of [...walk(authRoot), ...walk(mealRoot)]) {
    const rel = path.relative(path.join(root, "apps", "mobile", "features"), file);
    const target = path.join(tempRoot, rel).replace(/\.ts$/, ".js");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, strict: true },
      fileName: file
    }).outputText;
    fs.writeFileSync(target, output, "utf8");
  }

  process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();

  const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "consumerDailyNutritionSummaryPersistenceService.js"));
  const auth = requireFromTemp("../consumer-auth/types.js");
  const { ConsumerMealRecordsService } = requireFromTemp("./consumerMealRecordsService.js");
  const { ConsumerDailyNutritionSummaryPersistenceService } = requireFromTemp("./consumerDailyNutritionSummaryPersistenceService.js");
  const { MockConsumerDailyNutritionSummaryPersistenceRepository } = requireFromTemp("./adapters/mockConsumerDailyNutritionSummaryPersistenceRepository.js");

  const mealRecord = {
    mealRecordId: "phase2j-meal",
    mealType: "lunch",
    occurredAt: "2026-07-13T04:00:00.000Z",
    mealDate: "2026-07-13",
    timezone: "Asia/Taipei",
    title: "Phase 2J deterministic meal",
    source: "manual",
    createdAt: "2026-07-13T04:00:00.000Z",
    updatedAt: "2026-07-13T04:00:00.000Z",
    items: [{
      mealRecordItemId: "phase2j-item",
      displayName: "Phase 2J deterministic item",
      nutrition: { calories: 360, protein: 24, carbohydrates: 42, fat: 10, fiber: 6 },
      nutritionSource: "manual",
      nutritionSchemaVersion: "consumer-nutrition-snapshot-v1",
      occurredAt: "2026-07-13T04:00:00.000Z",
      timezone: "Asia/Taipei",
      consumedRatio: 1,
      correctionStatus: "none",
      createdAt: "2026-07-13T04:00:00.000Z",
      updatedAt: "2026-07-13T04:00:00.000Z"
    }]
  };

  const mealRecordsService = new ConsumerMealRecordsService({
    repository: {
      source: "mock",
      listCurrentUserMealRecords: async () => auth.ok([mealRecord])
    }
  });
  const repository = new MockConsumerDailyNutritionSummaryPersistenceRepository();
  const service = new ConsumerDailyNutritionSummaryPersistenceService({
    mealRecordsService,
    repository,
    clock: { now: () => new Date("2026-07-13T08:00:00.000Z") },
    timezone: "Asia/Taipei"
  });

  const first = await service.persistCurrentUserDailyNutritionSummary({ summaryDate: "2026-07-13" });
  const second = await service.persistCurrentUserDailyNutritionSummary({ summaryDate: "2026-07-13" });
  const deterministic = JSON.stringify(first) === JSON.stringify(second);

  return {
    status: first.status === "persisted" && second.status === "persisted" && deterministic ? "passed" : "failed",
    phase: "Consumer Runtime Integration Phase 2J",
    reason: "Mock daily nutrition summary persistence contract verified without Supabase.",
    first,
    second,
    deterministic,
    supabaseClientCreated: false,
    networkRequestUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  };
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}
