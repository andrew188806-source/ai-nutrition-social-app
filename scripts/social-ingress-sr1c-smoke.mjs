#!/usr/bin/env node
// SR-1C local smoke: migration-derived semantic model plus the real implemented HTTP handler with
// injected local dependencies. No network, database, credential, deployment or Production access.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/20260811010000_social_canonical_candidate_pool.sql");
const handlerPath = path.join(root, "supabase/functions/social-candidate-provenance/handler.ts");
const sql = fs.readFileSync(migrationPath, "utf8");
const handler = fs.readFileSync(handlerPath, "utf8");
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
}

const canonicalOrder = /order by participation\.opted_in_at asc, participation\.user_id asc/i.test(sql);
const canonicalLimit = Number((sql.match(/limit\s+(\d+)/i) ?? [])[1]);
const delegatesToD1 = /social_internal\.may_evaluate_candidate\(p_actor_user_id, participation\.user_id\)/i.test(sql);
check("1 migration-derived model requires exact canonical order", canonicalOrder);
check("2 migration-derived model requires exact hard cap 256", canonicalLimit === 256, canonicalLimit);
check("3 migration-derived model delegates eligibility to D1", delegatesToD1);

function activeAccount(userId, profiles) {
  return profiles.some((row) => row.userId === userId && row.status === "active" && row.deletedAt === null)
    && !profiles.some((row) => row.userId === userId && (row.status !== "active" || row.deletedAt !== null));
}
function optedIn(userId, participation) {
  return participation.some((row) => row.userId === userId && row.state === "opted_in");
}
function blocked(left, right, blocks) {
  return blocks.some((row) => row.blocker === left && row.blocked === right);
}
function d1Eligible(actor, candidate, state) {
  return actor !== candidate && activeAccount(actor, state.profiles) && optedIn(actor, state.participation)
    && activeAccount(candidate, state.profiles) && optedIn(candidate, state.participation)
    && !blocked(actor, candidate, state.blocks) && !blocked(candidate, actor, state.blocks);
}
function candidatePool(actor, state) {
  const rows = state.participation
    .filter((row) => row.state === "opted_in" && row.userId !== actor && d1Eligible(actor, row.userId, state))
    .sort((left, right) => left.optedInAt.localeCompare(right.optedInAt) || left.userId.localeCompare(right.userId))
    .slice(0, canonicalLimit);
  return rows.map((row) => row.userId);
}

const actor = "00000000-0000-0000-0000-00000000000a";
const ids = Object.fromEntries(["b", "c", "d", "e", "f", "g", "h"].map((key, index) => [key, `00000000-0000-0000-0000-0000000000${String(index + 11).padStart(2, "0")}`]));
const base = {
  profiles: [actor, ...Object.values(ids)].map((userId) => ({ userId, status: "active", deletedAt: null })),
  participation: [
    { userId: actor, state: "opted_in", optedInAt: "2026-08-01T00:00:00Z" },
    { userId: ids.b, state: "opted_in", optedInAt: "2026-08-02T00:00:00Z" },
    { userId: ids.c, state: "paused", optedInAt: "2026-08-01T00:00:00Z" },
    { userId: ids.e, state: "opted_in", optedInAt: "2026-08-03T00:00:00Z" },
    { userId: ids.f, state: "opted_in", optedInAt: "2026-08-03T00:00:00Z" },
    { userId: ids.g, state: "opted_in", optedInAt: "2026-08-02T00:00:00Z" }
  ],
  blocks: [
    { blocker: actor, blocked: ids.e },
    { blocker: ids.f, blocked: actor },
    { blocker: ids.c, blocked: ids.g }
  ]
};

check("4 empty eligible pool emits count zero", candidatePool(actor, { profiles: base.profiles, participation: [base.participation[0]], blocks: [] }).length === 0);
const pool = candidatePool(actor, base);
check("5 actor is excluded", !pool.includes(actor));
check("6 opted-in active B is included", pool.includes(ids.b));
check("7 paused C is excluded", !pool.includes(ids.c));
check("8 nonparticipant D is excluded", !pool.includes(ids.d));
check("9 outbound-blocked E is excluded", !pool.includes(ids.e));
check("10 reverse-blocked F is excluded", !pool.includes(ids.f));
check("11 unrelated block does not exclude G", pool.includes(ids.g));

for (const [label, profilePatch] of [
  ["inactive", { status: "disabled", deletedAt: null }],
  ["deleted", { status: "active", deletedAt: "2026-08-02T00:00:00Z" }]
]) {
  const profiles = base.profiles.map((row) => row.userId === ids.b ? { ...row, ...profilePatch } : row);
  check(`12.${label} invalid profile is excluded`, !candidatePool(actor, { ...base, profiles }).includes(ids.b));
}
const duplicateProfiles = [...base.profiles, { userId: ids.b, status: "deleted", deletedAt: "2026-08-02T00:00:00Z" }];
check("13 duplicate mixed account rows fail closed", !candidatePool(actor, { ...base, profiles: duplicateProfiles }).includes(ids.b));
check("14 participation primary identity makes duplicate output impossible", new Set(pool).size === pool.length);

const tieState = {
  profiles: [actor, ids.b, ids.g].map((userId) => ({ userId, status: "active", deletedAt: null })),
  participation: [
    { userId: actor, state: "opted_in", optedInAt: "2026-08-01T00:00:00Z" },
    { userId: ids.g, state: "opted_in", optedInAt: "2026-08-02T00:00:00Z" },
    { userId: ids.b, state: "opted_in", optedInAt: "2026-08-02T00:00:00Z" }
  ], blocks: []
};
check("15 tie is broken by user_id ASC", candidatePool(actor, tieState).join(",") === [ids.b, ids.g].sort().join(","));
check("16 ordering is deterministic across repeated reads", JSON.stringify(candidatePool(actor, tieState)) === JSON.stringify(candidatePool(actor, tieState)));

const manyIds = Array.from({ length: 260 }, (_, index) => `10000000-0000-0000-0000-${String(index).padStart(12, "0")}`);
const manyState = {
  profiles: [actor, ...manyIds].map((userId) => ({ userId, status: "active", deletedAt: null })),
  participation: [
    { userId: actor, state: "opted_in", optedInAt: "2026-08-01T00:00:00Z" },
    ...manyIds.map((userId, index) => ({ userId, state: "opted_in", optedInAt: index < 2 ? "2026-08-02T00:00:00Z" : `2026-08-${String(3 + Math.floor(index / 30)).padStart(2, "0")}T00:00:00Z` }))
  ], blocks: []
};
const bounded = candidatePool(actor, manyState);
check("17 260 eligible candidates emit exactly first 256", bounded.length === 256, bounded.length);
check("18 response count can never exceed 256", candidatePool(actor, manyState).length <= 256);
check("19 first same-time subjects retain user_id tie order", bounded[0] < bounded[1]);

const irrelevant = { visibility: "private", willingToChat: false, verificationStatus: "unverified" };
const irrelevantChanged = { visibility: "public", willingToChat: true, verificationStatus: "verified" };
check("20 visibility does not affect eligibility", JSON.stringify(candidatePool(actor, { ...base, profiles: base.profiles.map((row) => ({ ...row, ...irrelevant })) })) === JSON.stringify(candidatePool(actor, { ...base, profiles: base.profiles.map((row) => ({ ...row, ...irrelevantChanged })) })));
check("21 willing_to_chat does not affect eligibility", !/willing_to_chat/i.test(sql));
check("22 verification_status does not affect eligibility", !/verification_status/i.test(sql));

// Execute the real TypeScript handler under Deno 2.9.5 with local injected dependencies.
const denoExecutable = process.env.DENO_BIN?.trim() || "deno";
const usesWindowsDenoFromWsl = process.platform !== "win32" && /\.exe$/i.test(denoExecutable);
const temporaryRoot = usesWindowsDenoFromWsl ? root : process.platform === "win32" ? os.tmpdir() : "/tmp";
const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "sr1c-handler-smoke-"));
const probePath = path.join(tempRoot, "probe.ts");
function toWindowsPath(wslPath) {
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(wslPath);
  if (!match) throw new Error(`Cannot translate WSL path for Windows Deno: ${wslPath}`);
  return `${match[1].toUpperCase()}:/${match[2]}`;
}
const handlerUrl = usesWindowsDenoFromWsl
  ? `file:///${encodeURI(toWindowsPath(handlerPath))}`
  : pathToFileURL(handlerPath).href;
fs.writeFileSync(probePath, `
import { processSocialCandidateProvenanceRequest } from ${JSON.stringify(handlerUrl)};
const actor = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
let checks = 0;
function assert(value: unknown, name: string) { if (!value) throw new Error(name); checks += 1; }
function deps(options: { auth?: boolean; values?: string[]; fail?: boolean; closeFail?: boolean; config?: boolean } = {}) {
  let closed = false;
  return {
    value: {
      loadConfig: () => options.config === false ? { ok: false, errorCode: "server_unavailable" as const } : { ok: true, value: { supabaseUrl: "https://local.invalid", supabaseAnonKey: "anon-placeholder" } },
      authenticateCaller: async () => options.auth === false ? { ok: false, errorCode: "authentication_required" as const } : { ok: true, value: { userId: actor, userScopedClient: {} as never } },
      createCandidateProvider: () => ({
        getCanonicalSocialCandidates: async (received: string) => { assert(received === actor, "verified actor forwarding"); if (options.fail) throw new Error("raw-db-secret"); return options.values ?? []; },
        close: async () => { closed = true; if (options.closeFail) throw new Error("close failure"); }
      })
    },
    closed: () => closed
  };
}
const empty = deps();
const emptyResponse = await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST" }), empty.value as never);
assert(emptyResponse.status === 200, "empty status");
assert(JSON.stringify(await emptyResponse.json()) === JSON.stringify({ candidate_count: 0 }), "empty count-only body");
assert(empty.closed(), "provider closed");
const candidateOne = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const candidateTwo = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const two = deps({ values: [candidateOne, candidateTwo] });
const twoResponse = await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST", body: "{}" }), two.value as never);
const twoBody = await twoResponse.text();
assert(twoResponse.status === 200 && twoBody === '{"candidate_count":2}', "two count-only");
assert(!twoBody.includes(candidateOne) && !twoBody.includes(candidateTwo), "ids never serialized");
for (const body of ["not-json", "[]", '{"actor_user_id":"spoof"}', '{"candidate_user_ids":["x"]}', '{"target_user_id":"x"}', '{"limit":999}']) {
  const outcome = await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST", body }), deps().value as never);
  assert(outcome.status === 400, "authority body rejected " + body);
}
assert((await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social?actor_user_id=spoof", { method: "POST" }), deps().value as never)).status === 400, "query rejected");
for (const header of ["x-actor-user-id", "x-candidate-user-ids", "x-target-user-id", "x-limit"]) {
  assert((await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST", headers: { [header]: "spoof" } }), deps().value as never)).status === 400, "authority header rejected " + header);
}
assert((await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "GET" }), deps().value as never)).status === 400, "method rejected");
assert((await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST" }), deps({ auth: false }).value as never)).status === 401, "missing auth denied");
assert((await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST" }), deps({ config: false }).value as never)).status === 503, "missing server config denied");
const failure = await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST" }), deps({ fail: true }).value as never);
const failureBody = await failure.text();
assert(failure.status === 503 && !failureBody.includes("raw-db-secret") && !failureBody.includes("candidate_count"), "provider failure is safe error");
const overflow = await processSocialCandidateProvenanceRequest(new Request("https://local.invalid/social", { method: "POST" }), deps({ values: Array.from({ length: 257 }, (_, i) => String(i)) }).value as never);
assert(overflow.status === 503, "overflow fails closed");
console.log(JSON.stringify({ status: "passed", checks }));
`, "utf8");
try {
  const denoProbePath = usesWindowsDenoFromWsl ? toWindowsPath(probePath) : probePath;
  // npm CJS interop (@supabase/supabase-js -> @supabase/functions-js -> tslib) reads the module
  // cache through node:module at runtime, which is permission checked even under --cached-only.
  // Read cannot be path-scoped reliably: the reported cache directory and the path the permission
  // check sees diverge wherever the OS redirects per-user cache paths. Read alone still leaves the
  // probe with no net, env, write, run or ffi, so it stays offline and credential-free.
  const deno = spawnSync(denoExecutable, ["run", "--cached-only", "--no-config", "--node-modules-dir=none", "--no-lock", "--allow-read", denoProbePath], { cwd: root, encoding: "utf8", windowsHide: true });
  const denoDiagnostic = deno.error?.message ?? deno.stderr?.trim() ?? "Deno probe failed without diagnostics";
  check("23 real handler probe exits successfully under cached Deno", deno.status === 0, denoDiagnostic);
  const result = deno.status === 0 ? JSON.parse(deno.stdout.trim()) : { checks: 0 };
  check("24 real handler probe exercises all authority/privacy/error branches", result.status === "passed" && result.checks >= 22, result);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ suite: "social-ingress-sr1c-smoke", proofKind: "migration-derived semantic model plus real TypeScript handler with injected local dependencies", status: failures.length ? "failed" : "passed", totalChecks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
process.exit(failures.length ? 1 : 0);
