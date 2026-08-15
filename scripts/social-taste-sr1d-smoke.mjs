#!/usr/bin/env node
// SR-1D local smoke. Executes the real provider/transport/adapter/handler with local fakes only.
// No network, database, credential, deployment or Production access.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/20260811020000_social_candidate_taste_sources.sql");
const providerPath = path.join(root, "supabase/functions/social-candidate-taste/tasteProvider.ts");
const handlerPath = path.join(root, "supabase/functions/social-candidate-taste/handler.ts");
const adapterPath = path.join(root, "supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts");
const pairPath = path.join(root, "supabase/functions/_shared/social-pair/index.ts");
const transportPath = path.join(root, "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts");
const sql = fs.readFileSync(migrationPath, "utf8");
const providerSource = fs.readFileSync(providerPath, "utf8");
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
}

check("1 orchestration accepts only the actor UUID", /canonical_candidate_taste_sources\(p_actor_user_id uuid\)/i.test(sql));
check("2 orchestration derives the canonical pool internally", /canonical_candidate_pool\(p_actor_user_id\)/i.test(sql));
check("3 orchestration calls B1 once with the complete UUID array", (sql.match(/authorized_pair_sources\s*\(/gi) ?? []).length === 1 && /array_agg\(candidate\.user_id order by candidate\.ordinality\)/i.test(sql));
check("4 B1 bounds are fixed at meal 20 and favorites-per-table 10", /p_actor_user_id,\s*canonical_candidate_array\.user_ids,\s*20,\s*10/is.test(sql));
check("5 production provider uses one static parameterized statement", /canonical_candidate_taste_sources\(\$1::uuid\)/.test(providerSource) && !/\$2|\$3/.test(providerSource));
check("6 production provider has no direct D1 or protected-table query", !/may_evaluate_candidate|authorized_candidates|from\s+public\.|join\s+public\./i.test(providerSource));

const denoExecutable = process.env.DENO_BIN?.trim() || "deno";
const usesWindowsDenoFromWsl = process.platform !== "win32" && /\.exe$/i.test(denoExecutable);
const temporaryRoot = usesWindowsDenoFromWsl ? root : process.platform === "win32" ? os.tmpdir() : "/tmp";
const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "sr1d-smoke-"));
const probePath = path.join(tempRoot, "probe.ts");
function toWindowsPath(wslPath) {
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(wslPath);
  if (!match) throw new Error(`Cannot translate WSL path for Windows Deno: ${wslPath}`);
  return `${match[1].toUpperCase()}:/${match[2]}`;
}
const moduleUrl = (file) => usesWindowsDenoFromWsl
  ? `file:///${encodeURI(toWindowsPath(file))}`
  : pathToFileURL(file).href;

fs.writeFileSync(probePath, `
import { adaptAuthorizedPairSources } from ${JSON.stringify(moduleUrl(adapterPath))};
import { compareComposedServerPair, composeServerSnapshot } from ${JSON.stringify(moduleUrl(pairPath))};
import { processSocialCandidateTasteRequest } from ${JSON.stringify(moduleUrl(handlerPath))};
import { buildSocialTasteAsOf, createCanonicalSocialTasteProvider } from ${JSON.stringify(moduleUrl(providerPath))};
import { SocialRuntimeExecutorTransport } from ${JSON.stringify(moduleUrl(transportPath))};

let checks = 0;
function assert(value: unknown, name: string) { if (!value) throw new Error(name); checks += 1; }
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const candidateOne = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const candidateTwo = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sourceKeys = ["dietary_restrictions", "favorite_menu_items", "favorite_restaurants", "meal_record_items", "meal_records", "nutrition_goals", "taste_profiles"] as const;
function emptySources() {
  return Object.fromEntries(sourceKeys.map((key) => [key, { rows: [], requested_limit: 999, returned_count: 0, has_more: true }]));
}
function subject(user_id: string) { return { user_id, sources: emptySources() }; }
function payload(candidates = [subject(candidateOne), subject(candidateTwo)]) {
  return { actor: subject(actor), authorized_candidate_user_ids: candidates.map((item) => item.user_id), candidates };
}
function localTransport(value: unknown, log: { sql?: string; params?: readonly unknown[]; closed?: boolean }) {
  return new SocialRuntimeExecutorTransport({
    withTransaction: async (operation: (tx: unknown) => Promise<unknown>) => await operation({
      queryObject: async (sql: string, params: readonly unknown[]) => { log.sql = sql; log.params = params; return [{ payload: value }]; }
    }),
    close: async () => { log.closed = true; }
  } as never);
}

const reads = adaptAuthorizedPairSources(emptySources());
assert(Object.values(reads).every((outcome) => outcome.status === "available" && outcome.rows.length === 0), "all seven zero-row sources remain available");
assert(!JSON.stringify(reads).includes("failed") && !JSON.stringify(reads).includes('"empty"'), "adapter never invents failed or empty");
const metadataVariant = emptySources();
for (const value of Object.values(metadataVariant)) { value.has_more = false; value.requested_limit = 1; }
assert(JSON.stringify(adaptAuthorizedPairSources(metadataVariant)) === JSON.stringify(reads), "B1 metadata cannot alter reads");

for (const [instant, expectedStart, expectedEnd] of [
  ["2026-03-31T23:59:59.000Z", "2026-03-01", "2026-03-31"],
  ["2026-01-15T12:00:00.000Z", "2025-12-16", "2026-01-15"],
  ["2024-03-01T00:00:00.000Z", "2024-01-31", "2024-03-01"]
]) {
  const asOf = buildSocialTasteAsOf(instant);
  assert(asOf.generatedAt === instant && asOf.window.requestedStartDate === expectedStart && asOf.window.requestedEndDate === expectedEnd, "UTC 31-calendar-day inclusive window " + instant);
  assert(asOf.window.requestedLimit === 20 && asOf.window.favoritesLimit === 20, "composition limits " + instant);
}

const log: { sql?: string; params?: readonly unknown[]; closed?: boolean } = {};
let clockReads = 0;
const now = () => { clockReads += 1; return new Date("2026-03-31T23:59:59.000Z"); };
const provider = createCanonicalSocialTasteProvider(localTransport(payload(), log), now);
const diagnostics = await provider.evaluateCanonicalCandidates(actor);
await provider.close();
assert(clockReads === 1, "one generatedAt captured per request");
assert(log.params?.length === 1 && log.params[0] === actor && log.sql?.trim() === "select social_internal.canonical_candidate_taste_sources($1::uuid) as payload", "real transport receives actor-only static SQL");
assert(log.closed === true, "provider closes real transport");
const asOf = buildSocialTasteAsOf("2026-03-31T23:59:59.000Z");
const actorSnapshot = composeServerSnapshot(actor, adaptAuthorizedPairSources(emptySources()), asOf);
const exactStatuses = [candidateOne, candidateTwo].map((id) => (compareComposedServerPair(actorSnapshot, composeServerSnapshot(id, adaptAuthorizedPairSources(emptySources()), asOf)) as { status: string }).status);
assert(exactStatuses.every((status) => status === "adapted" || status === "unsupported"), "frozen result status vocabulary is exact");
assert(diagnostics.authorizedCandidateCount === 2 && diagnostics.adaptedCount === exactStatuses.filter((status) => status === "adapted").length && diagnostics.unsupportedCount === exactStatuses.filter((status) => status === "unsupported").length, "aggregate is exact frozen status classification");
const repeatedProvider = createCanonicalSocialTasteProvider(localTransport(payload(), {}), () => new Date("2026-03-31T23:59:59.000Z"));
const repeatedDiagnostics = await repeatedProvider.evaluateCanonicalCandidates(actor);
await repeatedProvider.close();
assert(JSON.stringify(repeatedDiagnostics) === JSON.stringify(diagnostics), "identical input and generatedAt are deterministic");

const emptyLog: { closed?: boolean } = {};
const emptyProvider = createCanonicalSocialTasteProvider(localTransport({ actor: null, authorized_candidate_user_ids: [], candidates: [] }, emptyLog), now);
assert(JSON.stringify(await emptyProvider.evaluateCanonicalCandidates(actor)) === JSON.stringify({ authorizedCandidateCount: 0, adaptedCount: 0, unsupportedCount: 0 }), "empty canonical pool is legitimate zero aggregate");
await emptyProvider.close();

for (const invalid of [
  { actor: subject(actor), authorized_candidate_user_ids: [candidateOne], candidates: [] },
  { actor: subject(actor), authorized_candidate_user_ids: [candidateOne], candidates: [subject(candidateTwo)] },
  { actor: subject(actor), authorized_candidate_user_ids: [candidateOne, candidateOne], candidates: [subject(candidateOne), subject(candidateOne)] }
]) {
  const bad = createCanonicalSocialTasteProvider(localTransport(invalid, {}), now);
  let failed = false;
  try { await bad.evaluateCanonicalCandidates(actor); } catch { failed = true; }
  assert(failed, "invalid B1 payload fails closed");
  await bad.close();
}

function dependencies(options: { auth?: boolean; diagnostics?: { authorizedCandidateCount: number; adaptedCount: number; unsupportedCount: number }; fail?: boolean; config?: boolean } = {}) {
  let closed = false;
  return {
    value: {
      loadConfig: () => options.config === false ? { ok: false, errorCode: "server_unavailable" as const } : { ok: true, value: { supabaseUrl: "https://local.invalid", supabaseAnonKey: "anon-placeholder" } },
      authenticateCaller: async () => options.auth === false ? { ok: false, errorCode: "authentication_required" as const } : { ok: true, value: { userId: actor, userScopedClient: {} as never } },
      createTasteProvider: () => ({
        evaluateCanonicalCandidates: async (received: string) => { assert(received === actor, "handler forwards verified actor only"); if (options.fail) throw new Error("raw-private-error"); return options.diagnostics ?? { authorizedCandidateCount: 2, adaptedCount: 1, unsupportedCount: 1 }; },
        close: async () => { closed = true; }
      })
    },
    closed: () => closed
  };
}
const good = dependencies();
const response = await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST", body: "{}" }), good.value as never);
const responseText = await response.text();
assert(response.status === 200 && responseText === '{"authorized_candidate_count":2,"adapted_count":1,"unsupported_count":1}', "response is exact aggregate shape");
assert(!responseText.includes(actor) && !responseText.includes(candidateOne) && !/score|reason|source|row/i.test(responseText), "response carries no identity or private result");
assert(good.closed(), "handler closes provider");
for (const body of ["not-json", "[]", '{"actor_user_id":"spoof"}', '{"candidate_user_ids":["x"]}', '{"meal_limit":999}', '{"start_date":"2020-01-01"}']) {
  assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST", body }), dependencies().value as never)).status === 400, "authority body rejected " + body);
}
assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste?limit=1", { method: "POST" }), dependencies().value as never)).status === 400, "query rejected");
for (const header of ["x-actor-user-id", "x-candidate-user-ids", "x-target-user-id", "x-meal-limit", "x-start-date"]) {
  assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST", headers: { [header]: "spoof" } }), dependencies().value as never)).status === 400, "authority header rejected " + header);
}
assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "GET" }), dependencies().value as never)).status === 400, "method rejected");
assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST" }), dependencies({ auth: false }).value as never)).status === 401, "auth failure denied");
assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST" }), dependencies({ config: false }).value as never)).status === 503, "config failure denied");
const failed = await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST" }), dependencies({ fail: true }).value as never);
assert(failed.status === 503 && !(await failed.text()).includes("raw-private-error"), "provider failure is safe and never zero");
const inconsistent = await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST" }), dependencies({ diagnostics: { authorizedCandidateCount: 2, adaptedCount: 0, unsupportedCount: 0 } }).value as never);
assert(inconsistent.status === 503, "inconsistent aggregate fails closed");
for (const invalidDiagnostics of [
  { authorizedCandidateCount: 257, adaptedCount: 257, unsupportedCount: 0 },
  { authorizedCandidateCount: 1, adaptedCount: -1, unsupportedCount: 2 },
  { authorizedCandidateCount: 1, adaptedCount: 0.5, unsupportedCount: 0.5 }
]) {
  assert((await processSocialCandidateTasteRequest(new Request("https://local.invalid/taste", { method: "POST" }), dependencies({ diagnostics: invalidDiagnostics }).value as never)).status === 503, "invalid aggregate fails closed");
}
console.log(JSON.stringify({ status: "passed", checks }));
`, "utf8");

try {
  const denoProbePath = usesWindowsDenoFromWsl ? toWindowsPath(probePath) : probePath;
  const deno = spawnSync(denoExecutable, ["run", "--cached-only", "--no-config", "--node-modules-dir=none", "--no-lock", "--allow-read", denoProbePath], { cwd: root, encoding: "utf8", windowsHide: true });
  const diagnostic = deno.error?.message ?? deno.stderr?.trim() ?? "Deno probe failed without diagnostics";
  check("7 real provider, transport, adapter and handler probe exits successfully", deno.status === 0, diagnostic);
  const result = deno.status === 0 ? JSON.parse(deno.stdout.trim()) : { checks: 0 };
  check("8 probe exercises aggregate, UTC, request, privacy and failure branches", result.status === "passed" && result.checks >= 35, result);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ suite: "social-taste-sr1d-smoke", proofKind: "real production provider/transport/adapter/handler with local deterministic fakes", status: failures.length ? "failed" : "passed", totalChecks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
process.exit(failures.length ? 1 : 0);
