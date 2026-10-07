#!/usr/bin/env node
// TastKind meal-save recovery guard: exact-inventory / frozen-proof / replaced-assertion static checks and the MUTATION
// controls of the recovery gates (R-01 … R-36).
//
// Mutation controls: each mutant is a textual edit of ONE source file in a throw-away copy of the source tree under the
// OS temp directory (never inside the repository). The recovery smoke is then run against that copy with only the gates the
// mutant targets; the mutant is KILLED when at least one of those gates fails (or, for a "must stay green" control, when none
// does). A mutant that survives is a guard failure.
//
//   node scripts/consumer-meal-save-recovery-guard.mjs [--no-mutations] [--out <external dir>]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "654b2a372eee6dcf2243a478857b17f3b8a34786";
const withMutations = !process.argv.includes("--no-mutations");
const outIndex = process.argv.indexOf("--out");
const OUT = outIndex >= 0 ? path.resolve(process.argv[outIndex + 1]) : null;
const results = [];
function record(name, pass, observed) {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass || observed === undefined ? "" : ` ${typeof observed === "string" ? observed : JSON.stringify(observed)}`}`);
}
const git = (args) => childProcess.spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------------------------- static checks
export const INVENTORY = [
  "apps/mobile/features/consumer-runtime/consumerMealWriteRuntime.ts",
  "apps/mobile/features/consumer-runtime/consumerMealWriteOperationStore.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts",
  "apps/mobile/features/consumer-auth/errors.ts",
  "apps/mobile/features/meal-identification-finalization/errors.ts",
  "apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationMappers.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/index.ts",
  "apps/mobile/app/recommendation.tsx",
  "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx",
  "apps/mobile/app/today-intake.tsx",
  "apps/mobile/app/analysis.tsx",
  "lib/i18n/zh-TW.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-auth/supabaseSdkLoader.ts",
  "scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-smoke.mjs",
  "scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-guard.mjs",
  "apps/mobile/features/consumer-runtime/mealSaveRecovery.ts",
  "apps/mobile/features/consumer-runtime/mealSaveOperationLedger.ts",
  "apps/mobile/features/consumer-runtime/PendingMealSaveNotice.tsx",
  "apps/mobile/features/consumer-auth/actorBoundDispatch.ts",
  "scripts/consumer-meal-save-recovery-smoke.mjs",
  "scripts/consumer-meal-save-recovery-guard.mjs",
  // Authorized harness compatibility fixes (resume round): two legacy smokes adopt the new store/ledger modules.
  "scripts/meal-identification-finalization-mi-e-c5-b2-smoke.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r5-smoke.mjs"
];

// Authorized validation-only successor (corrective round): the two retention validators recognise the exact recovery
// successor. They are bound here by PATH only and all-or-nothing (both modified and present, or neither); their bytes are
// bound by external review, patch, hashes, controls and the committed diff. They in turn bind THIS guard's bytes, so the
// binding runs one way only and there is no cycle.
export const VALIDATION_SUCCESSOR = Object.freeze([
  "scripts/consumer-retention-capture-smoke.mjs",
  "scripts/consumer-retention-persistence-smoke.mjs"
]);

const RT0 = "apps/mobile/features/consumer-runtime";
const changedFromBaseline = () => {
  const tracked = git(["diff", "--name-only", BASELINE]).stdout.split("\n").filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).stdout.split("\n").filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
};
const changed = changedFromBaseline();
const validationSuccessor = changed.filter((p) => VALIDATION_SUCCESSOR.includes(p));
const recoveryChanged = changed.filter((p) => !VALIDATION_SUCCESSOR.includes(p));
const validationSuccessorExact = validationSuccessor.length === 0 || (validationSuccessor.length === VALIDATION_SUCCESSOR.length && validationSuccessor.every((p) => fs.existsSync(path.join(ROOT, p))));
record("candidate inventory is exact (27 distinct recovery paths: 21 modified + 6 added, plus either none or exactly both authorized retention validators; the approved hook path is deliberately NOT modified — it is byte-pinned by frozen guards)", JSON.stringify(recoveryChanged) === JSON.stringify([...INVENTORY].sort()) && validationSuccessorExact, { extra: recoveryChanged.filter((p) => !INVENTORY.includes(p)), missing: INVENTORY.filter((p) => !recoveryChanged.includes(p)), validationSuccessor });
record("server paths: 0 (supabase/** byte-identical, modes unchanged)", git(["diff", "--name-only", BASELINE, "--", "supabase"]).stdout.trim() === "" && git(["diff", BASELINE, "--summary", "--", "supabase"]).stdout.trim() === "");
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
record("all 144 migrations present and byte-identical to the baseline", migrations.length === 144 && git(["diff", "--quiet", BASELINE, "--", "supabase/migrations"]).status === 0);
record("dependencies and lockfiles unchanged", git(["diff", "--quiet", BASELINE, "--", "package.json", "package-lock.json", "apps/mobile/package.json"]).status === 0);
record("no other path outside the inventory differs in bytes or mode (frozen proof input)", git(["diff", BASELINE, "--summary"]).stdout.split("\n").filter((l) => /mode change/.test(l)).length === 0);

const removedLines = (rel) => git(["diff", "-U0", BASELINE, "--", rel]).stdout.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
const guardRemoved = removedLines("scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-guard.mjs");
const smokeRemoved = removedLines("scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-smoke.mjs");
record("b2-b guard: exactly the two superseded assertions were replaced (others untouched)", guardRemoved.length === 2 && /expired pending is removed without sending/.test(guardRemoved.join("")) && /logout and actor change clear in-memory and persisted pending/.test(guardRemoved.join("")), guardRemoved);
record("b2-b smoke: exactly the two superseded assertions were replaced (others untouched)", smokeRemoved.length === 2 && /logout or actor switch clears old actor pending data/.test(smokeRemoved.join("")) && /expired pending request is removed and never auto-sent/.test(smokeRemoved.join("")), smokeRemoved);
const addedLines = (rel) => git(["diff", "-U0", BASELINE, "--", rel]).stdout.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
const c5b2 = "scripts/meal-identification-finalization-mi-e-c5-b2-smoke.mjs";
const c5r5 = "scripts/meal-identification-finalization-mi-e-c5-r5-smoke.mjs";
record("c5-b2 smoke: only the two new production modules were added to its module list (nothing removed)", removedLines(c5b2).length === 0 && JSON.stringify(addedLines(c5b2)) === JSON.stringify([`+  "${RT0}/mealSaveRecovery.ts",`, `+  "${RT0}/mealSaveOperationLedger.ts",`]), addedLines(c5b2));
const r5Removed = removedLines(c5r5);
record("c5-r5 smoke: only the two fake {save,load,clear} store fixtures were replaced by the real store over a map (no assertion removed or added)", r5Removed.length === 10 && r5Removed.every((l) => /operationStore: \{|save: async|load: async|clear: async|^-\s+\},$/.test(l)) && !addedLines(c5r5).some((l) => /expect\(/.test(l)) && addedLines(c5r5).filter((l) => /ConsumerMealIdentificationFinalizationOperationStore\)\(/.test(l)).length === 2, { removed: r5Removed, added: addedLines(c5r5) });
record("the approved hook path is byte-identical to the baseline (preserved, not modified)", git(["diff", "--quiet", BASELINE, "--", "apps/mobile/features/analysis/useMealPhotoFinalization.ts"]).status === 0);
const added = changed.filter((p) => fs.existsSync(path.join(ROOT, p)) && !/^scripts\/consumer-meal-save-recovery-(smoke|guard)\.mjs$/.test(p)).flatMap((p) => {
  const diff = git(["diff", "-U0", BASELINE, "--", p]).stdout;
  return diff ? diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")) : read(p).split("\n");
});
record("new/changed lines use TastKind only (no old Chinese brand, no Haocu; the two new scripts are excluded because they CONTAIN the banned patterns on purpose)", !added.some((l) => /好廚|好初|Haocu|haocu/i.test(l)), added.filter((l) => /好廚|好初|Haocu|haocu/i.test(l)).slice(0, 3));
const smokeSource = read("scripts/consumer-meal-save-recovery-smoke.mjs");
const wanted = Array.from({ length: 36 }, (_, i) => `R-${String(i + 1).padStart(2, "0")}`).filter((id) => id !== "R-27");
const missingGates = wanted.filter((id) => !new RegExp(`gate\\("${id}[a-z]?"`).test(smokeSource));
record("the smoke defines R-01…R-36 (R-27 intentionally absent; R-07a/b/c and R-PG present)", missingGates.length === 0 && /gate\("R-07c"/.test(smokeSource) && /gate\("R-PG"/.test(smokeSource), missingGates);
record("no purgeActor / clear(actorKey) is introduced anywhere in the product sources", !changed.filter((p) => p.startsWith("apps/")).some((p) => /purgeActor|\bclear\s*\(\s*actorKey/.test(read(p))));

// ---------------------------------------------------------------------------------------------- mutation controls
const F = "apps/mobile/features";
const RT = `${F}/consumer-runtime`;
const mutants = [
  { id: "M-01", gates: ["R-07a", "R-07b", "R-14"], note: "setActor deletes the previous actor's operations", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "    this.actorKey = actorKey;\n    this.actorGeneration = actorGeneration;\n    this.actorReady = false;\n    this.storageFailed = false;\n    this.pending = null;", replace: "    const previousActorM = this.actorKey;\n    if (previousActorM) for (const e of (await this.options.operationStore.list(previousActorM)).entries) await this.options.operationStore.remove(previousActorM, e.opId);\n    this.actorKey = actorKey;\n    this.actorGeneration = actorGeneration;\n    this.actorReady = false;\n    this.storageFailed = false;\n    this.pending = null;" }] },
  { id: "M-02", gates: ["R-06", "R-08"], note: "age deletes unresolved operations at boot", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: "  private async recoverInflight(actorKey: string): Promise<void> {\n    const slots = await this.scan(actorKey);", replace: "  private async recoverInflight(actorKey: string): Promise<void> {\n    const slots = await this.scan(actorKey);\n    for (const slot of slots) if (slot.kind === \"entry\" && Date.parse(slot.entry.expiresAt) <= Date.now()) await this.options.storage.removeItem(this.slotKey(actorKey, slot.n));" }] },
  { id: "M-03", gates: ["R-01"], note: "a rollback after an unknown attempt is treated as proof of non-write", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "return had ? unknownWith(\"server\") : { action: \"update\", entry: { ...stamped, state: \"retryable\", lastReason: \"server\" } };", replace: "return { action: \"update\", entry: { ...stamped, state: \"retryable\", lastReason: \"server\" } };" }] },
  { id: "M-04", gates: ["R-02", "R-13"], note: "retry changes the idempotency key", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "this.options.service.createCurrentUserMealRecord(operation.input)", replace: "this.options.service.createCurrentUserMealRecord(entry.attempts > 1 ? { ...operation.input, idempotencyKey: operation.input.idempotencyKey.replace(/.$/, (c) => (c === \"0\" ? \"1\" : \"0\")) } : operation.input)" }] },
  { id: "M-05", gates: ["R-12"], note: "an empty success body is reported as saved", edits: [{ file: `${F}/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`, find: "if (!response.data) return err(new ConsumerMealWriteMappingFailedError(\"Consumer meal write returned no canonical record.\"));", replace: "if (!response.data) return ok({ mealRecordId: \"fake\", mealType: \"lunch\", occurredAt: \"x\", mealDate: \"x\", timezone: \"x\", title: null, note: null, source: \"manual\", createdAt: \"x\", updatedAt: \"x\", items: [] } as never);" }] },
  { id: "M-06", gates: ["R-03"], note: "a late success is ignored", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "    let classification: MealSaveClassification;\n    let errorCode: string | null = null;\n    let errorMessage = \"\";", replace: "    if (late) return this.state;\n    let classification: MealSaveClassification;\n    let errorCode: string | null = null;\n    let errorMessage = \"\";" }] },
  { id: "M-07", gates: ["R-03"], note: "a late result is applied to whoever is current", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "const ownerIsCurrent = this.actorKey === actorKey;", replace: "const ownerIsCurrent = true;" }] },
  { id: "M-08", gates: ["R-04"], note: "an unknown operation is cleared on conflict", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "    case \"conflict\":\n      return had ? unknownWith(\"conflict\") : { action: \"remove\" };", replace: "    case \"conflict\":\n      return { action: \"remove\" };" }] },
  { id: "M-09", gates: ["R-05"], note: "no per-operation single flight", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "    const live = target ? this.attempts.get(target) : undefined;\n    if (live) return live;\n", replace: "" }, { file: `${RT}/consumerMealWriteRuntime.ts`, find: "    const existing = this.attempts.get(entry.opId);\n    if (existing) return existing;\n", replace: "" }] },
  { id: "M-10", gates: ["R-07c"], expectGreen: true, note: "removing the runtime owner check alone leaves the guarded matrix green (the guard, not the check, is the mechanism)", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "    if (operation.ownerActorKey !== actorKey) {\n      return this.isCurrent(actorKey, generation) ? this.fail(\"actor_binding_mismatch\") : this.state;\n    }\n", replace: "" }] },
  { id: "M-11", gates: ["R-10", "R-11"], note: "SQLSTATE 42501 is treated as a login failure", edits: [{ file: `${F}/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`, find: "if (effectiveStatus === 401 || code === \"28000\"", replace: "if (effectiveStatus === 401 || code === \"42501\" || code === \"28000\"" }] },
  { id: "M-12", gates: ["R-10"], note: "an eligibility denial is treated as proof of non-write", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "return had ? unknownWith(\"consent\") : { action: \"update\", entry: { ...stamped, state: \"blocked_consent\", lastReason: \"consent\" } };", replace: "return { action: \"update\", entry: { ...stamped, state: \"blocked_consent\", lastReason: \"consent\" } };" }] },
  { id: "M-13", gates: ["R-11"], note: "HTTP status is read from error.status again", edits: [{ file: `${F}/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`, find: "const effectiveStatus = status ?? error.status ?? undefined;", replace: "const effectiveStatus = error.status ?? undefined;" }] },
  { id: "M-14", gates: ["R-12"], note: "an unreadable finalization body erases the operation again", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "if (code === \"finalization_response_malformed\") return { cls: \"unknown\", meta: meta(\"unreadable\") };", replace: "if (code === \"finalization_response_malformed\") return { cls: \"rejected_input\", meta: meta(\"invalid\") };" }] },
  { id: "M-15", gates: ["R-15"], note: "the legacy record is removed before the slot is verified", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: "    if (raw === null || raw === undefined) return;\n    let legacy:", replace: "    if (raw === null || raw === undefined) return;\n    await this.options.storage.removeItem(this.legacyKey(actorKey));\n    let legacy:" }] },
  { id: "M-16", gates: ["R-16"], note: "dispatch is not preceded by a durable verified write", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: "    await this.options.storage.setItem(this.slotKey(actorKey, n), raw);\n    const back = await this.options.storage.getItem(this.slotKey(actorKey, n));\n    return back === raw;", replace: "    return true;" }] },
  { id: "M-17", gates: ["R-17"], note: "capacity evicts instead of refusing", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: "          const free = slots.find((slot) => slot.kind === \"free\");\n          if (!free) return { ok: false, reason: \"capacity\" };", replace: "          const free = slots.find((slot) => slot.kind === \"free\") ?? slots[0];" }] },
  { id: "M-18", gates: ["R-18"], note: "the reference code carries the full operation id", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "const short = entry.opId.replace(/[^0-9a-fA-F]/g, \"\").slice(0, 8).toLowerCase();", replace: "const short = entry.opId;" }] },
  { id: "M-19", gates: ["R-19"], note: "暫不處理 deletes the operation", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "(entry) => ({ ...entry, deferred: true }));", replace: "() => null);" }] },
  { id: "M-20", gates: ["R-21"], note: "an unknown operation can be cancelled", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "  if (inFlight || entry.hadUnknown) return false;\n  return entry.state === \"new\"", replace: "  if (inFlight) return false;\n  return entry.state === \"unknown\" || entry.state === \"new\"" }] },
  { id: "M-21", gates: ["R-22"], note: "a timer retries automatically", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "    this.actorReady = true;\n    const foreground", replace: "    this.actorReady = true;\n    setInterval(() => { if (this.pending) void this.retry({ actorKey, actorGeneration }); }, 5);\n    const foreground" }] },
  { id: "M-22", gates: ["R-03", "R-23"], note: "the elapsed local wait is treated as 'rolled back'", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "if (\"timeout\" in answer) classification = { cls: \"unknown\", meta: { reason: \"deadline\" } };", replace: "if (\"timeout\" in answer) classification = { cls: \"rolled_back\", meta: { reason: \"deadline\" } };" }] },
  { id: "M-23", gates: ["R-25"], note: "the photo screen no longer retries the persisted operation after a restart", edits: [{ file: "apps/mobile/app/analysis.tsx", find: /: \/\/ After a restart the screen has no frozen draft: retry the PERSISTED operation itself\.\n\s*consumerRuntime\.retryPendingMealIdentificationFinalization\(\)\)/, replace: ": undefined)" }] },
  { id: "M-24", gates: ["R-26", "R-33"], note: "a button without a handler", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "  if (entry.hadUnknown) out.push(\"defer\");", replace: "  out.push(\"purge\" as MealSaveAction);\n  if (entry.hadUnknown) out.push(\"defer\");" }] },
  { id: "M-25", gates: ["R-28"], note: "a clear(actorKey) is added to the store", edits: [{ file: `${RT}/consumerMealWriteOperationStore.ts`, find: "  // Legacy convenience: the most recent unresolved operation of the actor, or null.", replace: "  async clear(actorKey: string) { await this.ledger.list(actorKey); }\n\n  // Legacy convenience: the most recent unresolved operation of the actor, or null." }] },
  { id: "M-26", gates: ["R-28"], note: "a banned word is reintroduced", edits: [{ file: "lib/i18n/zh-TW.ts", find: "title: \"這次沒有儲存成功\",", replace: "title: \"放棄這次儲存\"," }] },
  { id: "M-27", gates: ["R-34"], note: "a repository receives the raw client", edits: [{ file: `${RT}/consumerRuntimeComposition.ts`, find: "finalizationClient: boundMealClient as unknown as", replace: "finalizationClient: input.mealClient as unknown as" }] },
  { id: "M-28", gates: ["R-34"], note: "the registry is not shared with a runtime", edits: [{ file: `${RT}/consumerRuntimeComposition.ts`, find: "    operationStore: new ConsumerMealWriteOperationStore(input.storage),\n    dispatchBinding: dispatchRegistry", replace: "    operationStore: new ConsumerMealWriteOperationStore(input.storage)" }] },
  { id: "M-29", gates: ["R-34"], note: "the SDK client is created without the guard", edits: [{ file: `${F}/consumer-auth/supabaseSdkLoader.ts`, find: "      global: { fetch: createActorBindingFetchGuard({ supabaseUrl: options.url }) as unknown as typeof fetch }\n", replace: "" }] },
  { id: "M-30", gates: ["R-29", "R-07c"], note: "the guard compares the role instead of the subject", edits: [{ file: `${F}/consumer-auth/actorBoundDispatch.ts`, find: "return typeof claims.sub === \"string\" && claims.sub ? claims.sub : null;", replace: "return typeof (claims as { role?: unknown }).role === \"string\" ? (claims as { role: string }).role : null;" }] },
  { id: "M-31", gates: ["R-29", "R-07c"], note: "the guard tag is not stripped (it reaches the server)", edits: [{ file: `${F}/consumer-auth/actorBoundDispatch.ts`, find: "    headers.delete(ACTOR_BINDING_HEADER);\n", replace: "" }] },
  { id: "M-32", gates: ["R-29", "R-07c"], note: "an anon token is accepted", edits: [{ file: `${F}/consumer-auth/actorBoundDispatch.ts`, find: "if (subject === null || subject !== expected) return mismatchResponse(\"identity\");", replace: "if (subject !== null && subject !== expected) return mismatchResponse(\"identity\");" }] },
  { id: "M-33", gates: ["R-29"], note: "an unregistered key is sent untagged (fail open)", edits: [{ file: `${F}/consumer-auth/actorBoundDispatch.ts`, find: "    const tagged = builder as RpcBuilderLike;\n    if (typeof tagged.setHeader !== \"function\") return builder;", replace: "    const tagged = builder as RpcBuilderLike;\n    if (!owner) return builder;\n    if (typeof tagged.setHeader !== \"function\") return builder;" }] },
  { id: "M-34", gates: ["R-32", "R-07c"], note: "a refusal is reported as a network error", edits: [{ file: `${F}/consumer-auth/actorBoundDispatch.ts`, find: "function mismatchResponse(detail: string): Response {\n  return new Response(", replace: "function mismatchResponse(detail: string): Response {\n  throw new TypeError(\"Network request failed \" + detail);\n  return new Response(" }] },
  { id: "M-35", gates: ["R-15"], note: "an unreadable legacy record is deleted instead of quarantined", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: /      let index = 0;\n      while[\s\S]*?      await this\.options\.storage\.removeItem\(this\.legacyKey\(actorKey\)\);\n      return;\n/, replace: "      await this.options.storage.removeItem(this.legacyKey(actorKey));\n      return;\n" }] },
  { id: "M-38", gates: ["R-30"], note: "each ledger instance has its own lock", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: "this.lockScope = options.lockScope ?? options.storage;", replace: "this.lockScope = options.lockScope ?? {};" }] },
  { id: "M-39", gates: ["R-31"], note: "an unusable slot is treated as free space", edits: [{ file: `${RT}/mealSaveOperationLedger.ts`, find: "out.push(entry ? { n, kind: \"entry\", entry, raw } : { n, kind: \"unusable\", raw });", replace: "out.push(entry ? { n, kind: \"entry\", entry, raw } : { n, kind: \"free\" });" }] },
  { id: "M-40", gates: ["R-32"], note: "the guard refusal is classified as unknown", edits: [{ file: `${RT}/mealSaveRecovery.ts`, find: "if (code === \"meal_write_actor_binding_mismatch\") return { cls: \"not_sent\", meta: meta(null) };", replace: "if (code === \"meal_write_actor_binding_mismatch\") return { cls: \"unknown\", meta: meta(\"transport\") };" }] },
  { id: "M-41", gates: ["R-34"], note: "the guard is not the SDK global.fetch", edits: [{ file: `${F}/consumer-auth/supabaseSdkLoader.ts`, find: "global: { fetch: createActorBindingFetchGuard(", replace: "global: { headers: {}, fetch: createActorBindingFetchGuard(" }] },
  { id: "M-42", gates: ["R-17"], note: "normal save: a capacity refusal never ends after a slot is freed", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "const capacityCleared = this.state.errorCode === \"capacity_exhausted\" && listing.free > 0;", replace: "const capacityCleared = false;" }] },
  { id: "M-43", gates: ["R-17"], note: "photo finalization: a capacity refusal never ends after a slot is freed", edits: [{ file: `${RT}/consumerMealIdentificationFinalizationRuntime.ts`, find: "if (this.state.errorCode === \"capacity_exhausted\" && listing.free > 0) {", replace: "if (false) {" }] },
  { id: "M-44", gates: ["R-26"], note: "capacity mode still offers 暫不處理 (it frees no slot)", edits: [{ file: `${RT}/PendingMealSaveNotice.tsx`, find: "action.id !== \"defer\"", replace: "action.id !== \"none\"" }] },
  { id: "M-45", gates: ["R-26"], note: "a capacity refusal is shown as a generic 'try later' failure on the card", edits: [{ file: "apps/mobile/app/recommendation.tsx", find: "    if (result.errorCode === \"capacity_exhausted\") return \"notice\" as const;\n", replace: "" }] },
  { id: "M-46", gates: ["R-26"], note: "the card keeps a stale local 'uncertain' line next to the notice", edits: [{ file: `${F}/next-meal-prototype/NextMealPrototypeContent.tsx`, find: "intakeStatus !== \"idle\" && !(intakeStatus === \"uncertain\" && pendingNotice)", replace: "intakeStatus !== \"idle\"" }] },
  { id: "M-47", gates: ["R-17"], note: "normal save: re-confirming a set-aside operation steals a blocking foreground", edits: [{ file: `${RT}/consumerMealWriteRuntime.ts`, find: "if (!this.pending || this.pending.opId === opId || !blocksNewSave(this.pending)) this.pending = entry;", replace: "this.pending = entry;" }] },
  { id: "M-48", gates: ["R-17"], note: "photo: re-confirming a set-aside operation takes over (and locks) the current analysis", edits: [{ file: `${RT}/consumerMealIdentificationFinalizationRuntime.ts`, find: "    if (this.pending?.opId === opId) this.pending = entry;\n    const operationId = this.operationId;", replace: "    this.pending = entry;\n    const operationId = this.operationId;" }] },
  { id: "M-49", gates: ["R-26"], note: "the photo screen's unknown card has no reference code", edits: [{ file: "apps/mobile/app/analysis.tsx", find: "{`${zhTW.mobile.pendingMealSave.referenceLabel} ${unresolvedFinalizationOperation.reference}`}", replace: "{\"\"}" }] },
  // D1 / D2 corrective
  { id: "M-50", gates: ["R-35"], note: "photo: a late success of the bound operation is not published (residual unknown)", edits: [{ file: `${RT}/consumerMealIdentificationFinalizationRuntime.ts`, find: "if (wasForeground && value && this.isCurrentOperation(actorKey, generation, operationId)) return this.complete(actorKey, value);", replace: "if (!late && wasForeground && value && this.isCurrentOperation(actorKey, generation, operationId)) return this.complete(actorKey, value);" }] },
  { id: "M-51", gates: ["R-35"], note: "photo: the foreground/analysis-operation check is dropped (an earlier operation's late success lands on the new photo)", edits: [{ file: `${RT}/consumerMealIdentificationFinalizationRuntime.ts`, find: "if (wasForeground && value && this.isCurrentOperation(actorKey, generation, operationId)) return this.complete(actorKey, value);", replace: "if (value && this.isCurrent(actorKey, this.actorGeneration)) return this.complete(actorKey, value);" }] },
  { id: "M-52", gates: ["R-35"], note: "photo: the actor check is dropped (A's late success is published to B)", edits: [{ file: `${RT}/consumerMealIdentificationFinalizationRuntime.ts`, find: "if (wasForeground && value && this.isCurrentOperation(actorKey, generation, operationId)) return this.complete(actorKey, value);", replace: "if (value && this.actorKey !== null) return this.complete(actorKey, value);" }] },
  { id: "M-53", gates: ["R-36"], note: "normal save: the untrusted-answer gate is removed (text classification of code-less answers returns)", edits: [{ file: `${F}/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`, find: "  if (!TRUSTED_SERVER_ERROR_CODE.test(code)) return new ConsumerMealWriteTransportFailedError();\n", replace: "" }] },
  { id: "M-54", gates: ["R-36"], note: "photo: the untrusted-answer gate is removed (code-less 401/403/409 classified as login/server/conflict)", edits: [{ file: `${F}/meal-identification-finalization/mealIdentificationFinalizationMappers.ts`, find: "  if (!isTrustedServerErrorCode(error.code)) {\n    return new ConsumerMealIdentificationFinalizationTransportFailedError();\n  }\n", replace: "" }] },
  { id: "M-55", gates: ["R-36"], note: "photo: any non-empty code counts as server-authored again", edits: [{ file: `${F}/meal-identification-finalization/mealIdentificationFinalizationMappers.ts`, find: "return typeof code === \"string\" && /^(?:[0-9A-Z]{5}|PGRST\\d{3})$/.test(code);", replace: "return typeof code === \"string\" && code.length > 0;" }] },
  { id: "M-56", gates: ["R-35"], note: "photo screen: the late-success adoption is removed (STATIC detector; UI behaviour is verified in the UI flow)", edits: [{ file: "apps/mobile/app/analysis.tsx", find: "    if (next.submissionStatus === \"succeeded\") completeMealPhotoFinalization(next);\n", replace: "" }] },
  { id: "M-57", gates: ["R-35"], note: "photo screen: the 暫不處理 note is shown without a set-aside operation (STATIC detector)", edits: [{ file: "apps/mobile/app/analysis.tsx", find: "subtitle={!unresolvedFinalizationOperationId && deferredFinalizationOperation ? zhTW.mobile.pendingMealSave.deferredNote", replace: "subtitle={!unresolvedFinalizationOperationId ? zhTW.mobile.pendingMealSave.deferredNote" }] },
];

const COPY_DIRS = [`${F}/consumer-auth`, `${F}/consumer-meals`, `${F}/consumer-runtime`, `${F}/meal-identification-finalization`, `${F}/meal-identification`];
const COPY_FILES = [`${F}/analysis/useMealPhotoFinalization.ts`, `${F}/next-meal-prototype/NextMealPrototypeContent.tsx`, "lib/i18n/zh-TW.ts", "apps/mobile/app/recommendation.tsx", "apps/mobile/app/today-intake.tsx", "apps/mobile/app/analysis.tsx", "apps/mobile/app/login.tsx", "apps/mobile/app/onboarding.tsx", "apps/mobile/app/meal-photo.tsx"];

function runSmoke(cwd, gates) {
  const result = childProcess.spawnSync(process.execPath, [path.join(ROOT, "scripts/consumer-meal-save-recovery-smoke.mjs")], { cwd, encoding: "utf8", env: { ...process.env, TK_GATES: gates.join(",") }, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  const failedGates = (result.stdout.match(/^FAIL (R-[0-9a-zA-Z]+)/gm) ?? []).map((l) => l.slice(5));
  return { status: result.status, failedGates, tail: result.stdout.split("\n").filter((l) => /^FAIL|^RESULT/.test(l) || /^ {5}FAIL/.test(l)).slice(-6).join(" | "), stderr: result.stderr.slice(-400) };
}

if (withMutations) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tk-recovery-mutants-"));
  const mutantReport = [];
  try {
    for (const dir of COPY_DIRS) fs.cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true, filter: (src) => !src.includes("node_modules") });
    for (const file of COPY_FILES) { fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true }); fs.copyFileSync(path.join(ROOT, file), path.join(tmp, file)); }
    const allGates = [...new Set(mutants.flatMap((m) => m.gates))];
    const pristine = runSmoke(tmp, allGates);
    record("mutation harness sanity: the unmodified temp copy passes every targeted gate", pristine.status === 0 && pristine.failedGates.length === 0, pristine.tail);
    for (const mutant of mutants) {
      const originals = new Map();
      let applied = true;
      for (const edit of mutant.edits) {
        const file = path.join(tmp, edit.file);
        if (!originals.has(file)) originals.set(file, fs.readFileSync(file, "utf8"));
        const text = fs.readFileSync(file, "utf8");
        const matches = typeof edit.find === "string" ? text.includes(edit.find) : edit.find.test(text);
        if (!matches) { applied = false; break; }
        fs.writeFileSync(file, typeof edit.find === "string" ? text.replace(edit.find, () => edit.replace) : text.replace(edit.find, () => edit.replace));
      }
      let outcome;
      if (!applied) outcome = { killed: false, reason: "mutation did not apply (source changed?)" };
      else {
        const run = runSmoke(tmp, mutant.gates);
        const hit = run.failedGates.filter((g) => mutant.gates.includes(g));
        outcome = mutant.expectGreen ? { killed: run.status === 0 && run.failedGates.length === 0, reason: run.status === 0 ? "stays green (as required)" : `unexpectedly red: ${run.tail}` } : { killed: run.status !== 0 && hit.length > 0, reason: `red gates: ${run.failedGates.join(",") || "none"}`, stderr: run.stderr };
      }
      for (const [file, text] of originals) fs.writeFileSync(file, text);
      mutantReport.push({ id: mutant.id, note: mutant.note, targets: mutant.gates, expectGreen: Boolean(mutant.expectGreen), ...outcome });
      record(`${mutant.id} ${mutant.expectGreen ? "stays green" : "killed"}: ${mutant.note} [${mutant.gates.join(",")}] (${outcome.reason})`, outcome.killed);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (OUT) fs.writeFileSync(path.join(OUT, "mutation-report.json"), JSON.stringify(mutantReport, null, 2));
}

const failed = results.filter((r) => !r.pass);
console.log(`RESULT ${results.length - failed.length}/${results.length}${failed.length ? ` FAIL ${failed.map((r) => r.name.slice(0, 60)).join(" ; ")}` : " PASS"}`);
process.exit(failed.length ? 1 : 0);
