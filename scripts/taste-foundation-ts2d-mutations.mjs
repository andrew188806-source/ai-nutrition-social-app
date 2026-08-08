#!/usr/bin/env node
// TS-2D targeted semantic mutation suite.
//
// Each mutation must (a) actually change its fixture and (b) make the targeted authority predicate
// false. A no-op transform, an unloadable module or an unrelated crash is never counted as a kill.
//
// Behavioural mutations are transpiled and EXECUTED against the real modules; ACL mutations are
// applied to the migration text and re-checked against the same grant authority the guard uses.
// Nothing on disk is ever written. Fully local: no network, no credential, no Production.
//
// Known technical debt (TS-2A-C): the sibling harness resolves canonical sources by comparing a
// backslash cwd against TypeScript's forward-slash fileNames, so it only applies on POSIX. This
// suite deliberately avoids that mechanism — it mutates file text it reads itself — so it runs on
// both Windows and WSL.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const results = [];

const readFile = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const executableOnly = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("--");
    })
    .join("\n");

const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
// `overrides` maps a repo-relative path to mutated text; everything else loads from disk, so a
// mutation is confined to exactly the module under test.
const evaluate = (relative, overrides = new Map(), cache = new Map()) => {
  const absolute = path.join(root, relative);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const key = path.relative(root, absolute).replaceAll("\\", "/");
  const source = overrides.get(key) ?? fs.readFileSync(absolute, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved relative import ${specifier}`);
    return evaluate(path.relative(root, resolved).replaceAll("\\", "/"), overrides, cache);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
};

const mutation = async (name, original, mutate, authority) => {
  const changed = mutate(original);
  const applied = JSON.stringify(changed) !== JSON.stringify(original);
  let killed = false;
  if (applied) {
    try {
      killed = !(await authority(changed));
    } catch {
      killed = false; // an unloadable module is not a behavioural kill
    }
  }
  results.push({ name, applied, killed });
  console.log(`${applied && killed ? "PASS" : "FAIL"} MUTATION ${results.length} ${name}${applied ? "" : " (not applied)"}`);
};

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
const MIGRATION = "supabase/migrations/20260808010000_consumer_taste_foundation_authenticated_reads.sql";
const LIVE_ADAPTER = `${mobileRoot}/adapters/supabaseConsumerTasteFoundationRepository.ts`;
const CONTRACTS = `${mobileRoot}/supabaseTasteFoundationContracts.ts`;
const FLAGS = `${mobileRoot}/featureFlags.ts`;
const FACTORIES = `${mobileRoot}/factories.ts`;
const SERVICE = `${mobileRoot}/consumerTasteProfileService.ts`;
const FOUNDATION_MAPPERS = `${mobileRoot}/foundationMappers.ts`;
const TABLES = ["taste_profiles", "nutrition_goals", "dietary_restrictions"];

// ---- authorities -------------------------------------------------------------------------------
const grantAuthority = (sql) => {
  const body = executableOnly(sql);
  const lines = body.split("\n").map((line) => line.trim()).filter((line) => /^grant/i.test(line));
  if (lines.length !== 3) return false;
  if (/\bto\s+(anon|public|service_role|postgres)\b/i.test(body)) return false;
  if (/grant[^;]*\b(insert|update|delete|truncate|references|trigger|execute|all)\b/i.test(body)) return false;
  if (/all\s+tables\s+in\s+schema|on\s+schema/i.test(body)) return false;
  if (/create\s+policy|alter\s+policy|drop\s+policy|disable\s+row\s+level\s+security/i.test(body)) return false;
  return TABLES.every((table) =>
    lines.some((line) => line.toLowerCase() === `grant select on table public.${table} to authenticated;`)
  );
};

const makeClient = (scripted) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, columns: null, filters: [] };
      calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        eq(column, value) { call.filters.push({ column, value }); return builder; },
        then(resolve, reject) {
          return Promise.resolve(typeof scripted === "function" ? scripted(table) : scripted).then(resolve, reject);
        }
      };
      return builder;
    }
  };
};

const denialIsFailedAuthority = async (adapterSource) => {
  const overrides = new Map([[LIVE_ADAPTER, adapterSource]]);
  const { SupabaseConsumerTasteFoundationRepository } = evaluate(LIVE_ADAPTER, overrides);
  const client = makeClient({ data: null, error: { code: "42501", message: "permission denied" } });
  const result = await new SupabaseConsumerTasteFoundationRepository(client).readCurrentUserTasteProfile();
  return result.status === "failed";
};
const noUserFilterAuthority = async (adapterSource) => {
  const overrides = new Map([[LIVE_ADAPTER, adapterSource]]);
  const { SupabaseConsumerTasteFoundationRepository } = evaluate(LIVE_ADAPTER, overrides);
  const client = makeClient({ data: [], error: null });
  await new SupabaseConsumerTasteFoundationRepository(client).readCurrentUserTasteProfile();
  return client.calls.every((call) => call.filters.length === 0);
};
const exactTablesAuthority = async (contractsSource) => {
  const overrides = new Map([[CONTRACTS, contractsSource]]);
  const { SupabaseConsumerTasteFoundationRepository } = evaluate(LIVE_ADAPTER, overrides);
  const client = makeClient({ data: [], error: null });
  const repo = new SupabaseConsumerTasteFoundationRepository(client);
  await repo.readCurrentUserTasteProfile();
  await repo.readCurrentUserNutritionGoals();
  await repo.readCurrentUserDietaryRestrictions();
  return client.calls.every((call) => TABLES.includes(call.table)) && client.calls.length === 3;
};
const noDenormalizedFavoritesAuthority = async (contractsSource) => {
  const overrides = new Map([[CONTRACTS, contractsSource]]);
  const { SupabaseConsumerTasteFoundationRepository } = evaluate(LIVE_ADAPTER, overrides);
  const client = makeClient({ data: [], error: null });
  await new SupabaseConsumerTasteFoundationRepository(client).readCurrentUserTasteProfile();
  return !/favorite_restaurant_ids|favorite_menu_item_ids/.test(client.calls.map((call) => call.columns).join(","));
};
const noPrivateNotesAuthority = async (contractsSource) => {
  const overrides = new Map([[CONTRACTS, contractsSource]]);
  const { SupabaseConsumerTasteFoundationRepository } = evaluate(LIVE_ADAPTER, overrides);
  const client = makeClient({ data: [], error: null });
  await new SupabaseConsumerTasteFoundationRepository(client).readCurrentUserDietaryRestrictions();
  return !/health_notes|private_diet_notes|medical_sensitivity_notes/.test(client.calls.map((call) => call.columns).join(","));
};
const noCreateClientAuthority = (source) => !/createClient/.test(executableOnly(source));
const productionCannotActivateAuthority = async (flagsSource) => {
  const overrides = new Map([[FLAGS, flagsSource]]);
  const { getConsumerTasteProfileRuntimeFlags } = evaluate(FLAGS, overrides);
  const prod = getConsumerTasteProfileRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "production",
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true"
  });
  return prod.foundationActivation === "deferred" && prod.liveFoundationReadsEnabled === false;
};
const deferredGoneWhenLiveAuthority = async (flagsSource) => {
  const overrides = new Map([[FLAGS, flagsSource]]);
  const { getConsumerTasteProfileRuntimeFlags } = evaluate(FLAGS, overrides);
  const live = getConsumerTasteProfileRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true"
  });
  return live.foundationActivation === "live" && live.sourceState === null;
};
const factoryFailsClosedAuthority = async (factoriesSource) => {
  const overrides = new Map([[FACTORIES, factoriesSource]]);
  const { createConsumerTasteProfileService } = evaluate(FACTORIES, overrides);
  const base = {
    authPort: { getCurrentSession: async () => ({ ok: true, value: null }) },
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) },
    favoriteService: { listCurrentUserFavorites: async () => ({ status: "empty", records: [], nextCursor: null, source: "mock" }) },
    ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [], source: "mock" }) },
    clock: { now: () => "2026-08-08T12:00:00.000Z" },
    env: { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true" }
  };
  try {
    createConsumerTasteProfileService(base); // no client supplied
    return false; // constructing without a client means it did NOT fail closed
  } catch {
    return true;
  }
};
const actorRaceAuthority = async (serviceSource) => {
  const overrides = new Map([[SERVICE, serviceSource]]);
  const { ConsumerTasteProfileService } = evaluate(SERVICE, overrides);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let first = true;
  const service = new ConsumerTasteProfileService({
    authPort: { getCurrentSession: async () => ({ ok: true, value: { user: { userId: "user-a", provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-01-01T00:00:00Z" }, provider: "mock", issuedAt: "2026-08-08T00:00:00Z" } }) },
    foundationRepository: {
      source: "supabase-live",
      readCurrentUserTasteProfile: async () => first ? (first = false, pending) : ({ status: "empty", rows: [] }),
      readCurrentUserNutritionGoals: async () => ({ status: "empty", rows: [] }),
      readCurrentUserDietaryRestrictions: async () => ({ status: "empty", rows: [] })
    },
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) },
    favoriteService: { listCurrentUserFavorites: async () => ({ status: "empty", records: [], nextCursor: null, source: "mock" }) },
    ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [], source: "mock" }) },
    clock: { now: () => "2026-08-08T12:00:00.000Z" }
  });
  service.setActor("user-a", 1);
  const inFlight = service.readCurrentUserSnapshot({ mealWindow: { startDate: "2026-08-01", endDate: "2026-08-08", limit: 10 }, favoritePageSize: 10 });
  await new Promise((resolve) => setImmediate(resolve));
  service.setActor("user-b", 2);
  release({ status: "empty", rows: [] });
  return (await inFlight).status === "stale";
};
const inactiveGoalExcludedAuthority = async (mapperSource) => {
  const overrides = new Map([[FOUNDATION_MAPPERS, mapperSource]]);
  const { mapNutritionGoalRows } = evaluate(FOUNDATION_MAPPERS, overrides);
  const goal = { id: "g", user_id: "user-a", goal_label: "goal", daily_calories_target: null, protein_target_g: null, carbohydrates_target_g: null, fat_target_g: null, fiber_target_g: null, starts_on: "2026-08-01", ends_on: "2026-08-31", is_active: false, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" };
  return mapNutritionGoalRows([goal], "user-a", "2026-08-08").length === 0;
};
const severityPreservedAuthority = async (mapperSource) => {
  const overrides = new Map([[FOUNDATION_MAPPERS, mapperSource]]);
  const { mapDietaryRestrictionRows } = evaluate(FOUNDATION_MAPPERS, overrides);
  const row = { id: "r", user_id: "user-a", restriction_type: "allergy", label: "peanut", severity: "totally-unknown-value", visibility: "private", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" };
  const mapped = mapDietaryRestrictionRows([row], "user-a");
  return JSON.stringify(mapped).includes("unknown");
};

// ---- mutations ---------------------------------------------------------------------------------
const migration = readFile(MIGRATION);
const liveAdapter = readFile(LIVE_ADAPTER);
const contracts = readFile(CONTRACTS);
const flags = readFile(FLAGS);
const factories = readFile(FACTORIES);
const service = readFile(SERVICE);
const mappers = readFile(FOUNDATION_MAPPERS);

await mutation("01 authenticated grant becomes anon", migration,
  (s) => s.replace("to authenticated;\ngrant select on table public.nutrition_goals", "to anon;\ngrant select on table public.nutrition_goals"),
  async (s) => grantAuthority(s));
await mutation("02 SELECT becomes ALL", migration,
  (s) => s.replace("grant select on table public.taste_profiles", "grant all on table public.taste_profiles"),
  async (s) => grantAuthority(s));
await mutation("03 SELECT becomes INSERT/UPDATE/DELETE", migration,
  (s) => s.replace("grant select on table public.nutrition_goals", "grant select, insert, update, delete on table public.nutrition_goals"),
  async (s) => grantAuthority(s));
await mutation("04 table allowlist is expanded to a fourth table", migration,
  (s) => `${s}grant select on table public.consumer_private_profiles to authenticated;\n`,
  async (s) => grantAuthority(s));
await mutation("05 RLS owner restriction is bypassed by a permissive policy", migration,
  (s) => `${s}create policy taste_profiles_all_read on public.taste_profiles for select using (true);\n`,
  async (s) => grantAuthority(s));
await mutation("06 schema-wide wildcard grant is introduced", migration,
  (s) => `${s}grant select on all tables in schema public to authenticated;\n`,
  async (s) => grantAuthority(s));
await mutation("07 createClient is introduced in the live repository", liveAdapter,
  (s) => s.replace("export class SupabaseConsumerTasteFoundationRepository", "const extra = createClient(\"url\", \"key\");\nexport class SupabaseConsumerTasteFoundationRepository"),
  async (s) => noCreateClientAuthority(s));
await mutation("08 an arbitrary user id filter is introduced", liveAdapter,
  (s) => s.replace(".select(columns);", ".select(columns).eq(\"user_id\", \"someone-else\");"),
  async (s) => noUserFilterAuthority(s));
await mutation("09 a permission failure is mapped to empty", liveAdapter,
  (s) => s.replace('if (response.error) return { status: "failed", failureCode: "source_read_failed" };', 'if (response.error) return { status: "empty", rows: [] };'),
  async (s) => denialIsFailedAuthority(s));
await mutation("10 denormalized favourite ids are selected", contracts,
  (s) => s.replace('  "preferred_cuisine_tags",', '  "preferred_cuisine_tags",\n  "favorite_restaurant_ids",'),
  async (s) => noDenormalizedFavoritesAuthority(s));
await mutation("11 private notes are selected", contracts,
  (s) => s.replace('  "restriction_type",', '  "restriction_type",\n  "health_notes",'),
  async (s) => noPrivateNotesAuthority(s));
await mutation("12 a fourth table becomes reachable from the contracts", contracts,
  (s) => s.replace('export const SUPABASE_TASTE_PROFILES_TABLE = "taste_profiles" as const;', 'export const SUPABASE_TASTE_PROFILES_TABLE = "consumer_private_profiles" as const;'),
  async (s) => exactTablesAuthority(s));
await mutation("13 the Production environment fence is removed", flags,
  (s) => s.replace("const environmentAllowsLive = environment === TASTE_FOUNDATION_LIVE_ENVIRONMENT;", "const environmentAllowsLive = true;"),
  async (s) => productionCannotActivateAuthority(s));
await mutation("14 deferred remains after a successful live activation", flags,
  (s) => s.replace("      sourceState: null,", '      sourceState: { status: "deferred", evidenceCount: 0, reason: "acl_activation_pending" },'),
  async (s) => deferredGoneWhenLiveAuthority(s));
await mutation("15 the factory stops failing closed without a client", factories,
  (s) => s.replace('      throw new Error("Taste foundation live reads require the existing consumer Supabase client.");', "      void 0;"),
  async (s) => factoryFailsClosedAuthority(s));
await mutation("16 the actor race accepts a stale result", service,
  (s) => s.replace("return this.actorKey === actorKey && this.actorGeneration === actorGeneration;", "return true;"),
  async (s) => actorRaceAuthority(s));
await mutation("17 an inactive goal is included", mappers,
  (s) => s.replace("!row.is_active || row.starts_on > asOfDate ||", "row.starts_on > asOfDate ||"),
  async (s) => inactiveGoalExcludedAuthority(s));

const killed = results.filter((entry) => entry.applied && entry.killed).length;
console.log(JSON.stringify({
  status: killed === results.length ? "passed" : "failed",
  phase: "TS-2D Live Foundation Activation Targeted Mutation Suite",
  totalMutations: results.length,
  killedMutations: killed,
  survivedMutations: results.length - killed,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (killed !== results.length) process.exit(1);
