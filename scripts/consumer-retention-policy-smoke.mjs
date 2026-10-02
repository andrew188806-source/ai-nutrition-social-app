#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const moduleFiles = ["types.ts", "policy.ts", "evaluate.ts", "index.ts"];
export const defaultModuleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/shared/src/domain/consumer-retention");
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function externalEvidenceDirectory(value, repository = path.resolve(defaultModuleRoot, "../../../../..")) {
  const result = path.resolve(value ?? fs.mkdtempSync(path.join(os.tmpdir(), "consumer-retention-")));
  if (result === repository || result.startsWith(repository + path.sep)) throw new Error("Evidence must be outside repository");
  fs.mkdirSync(result, { recursive: true }); return result;
}
export function typecheck(moduleRoot) {
  const program = ts.createProgram(moduleFiles.map(file => path.join(moduleRoot, file)), {
    strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], skipLibCheck: false,
    lib: ["lib.es2022.d.ts", "lib.es2022.intl.d.ts"], forceConsistentCasingInFileNames: true
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n") + (d.file ? ` at ${d.file.fileName}:${d.start}` : ""));
}
function loadCandidate(moduleRoot) {
  const cache = new Map(), attempts = [];
  const trap = name => () => { attempts.push(name); throw new Error(`IO_FORBIDDEN:${name}`); };
  class ExplicitDate extends Date {
    constructor(...args) { if (args.length !== 1) { attempts.push("implicit-clock"); throw new Error("IO_FORBIDDEN:implicit-clock"); } super(args[0]); }
    static now = trap("Date.now");
  }
  const context = vm.createContext({ Date: ExplicitDate, Intl, fetch: trap("fetch"), setTimeout: trap("setTimeout"), setInterval: trap("setInterval"), queueMicrotask: trap("queueMicrotask"), process: undefined, console: undefined });
  function load(file) {
    const absolute = path.resolve(file);
    if (!moduleFiles.map(f => path.join(moduleRoot, f)).includes(absolute)) throw new Error(`LOADER_OUTSIDE_SCOPE:${absolute}`);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = fs.readFileSync(absolute, "utf8");
    const compiled = ts.transpileModule(source, { fileName: absolute, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const syntaxErrors = compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
    if (syntaxErrors.length) throw new Error(`LOADER_SYNTAX:${syntaxErrors.map(d => d.code)}`);
    const module = { exports: {} }; cache.set(absolute, module);
    const require = request => {
      if (!request.startsWith(".")) throw new Error(`LOADER_EXTERNAL_IMPORT:${request}`);
      return load(path.resolve(path.dirname(absolute), request.replace(/\.js$/, "") + ".ts"));
    };
    vm.runInContext(`(function(require,module,exports){${compiled.outputText}\n})`, context, { filename: absolute, timeout: 5000 })(require, module, module.exports);
    return module.exports;
  }
  return { exports: load(path.join(moduleRoot, "index.ts")), attempts };
}
function deepFreeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
const VERSION = "consumer-retention-owner-2026-10-03-v1";
const T0 = "2026-10-01T00:00:00.000Z", E14 = "2026-10-15T00:00:00.000Z", E180 = "2027-03-30T00:00:00.000Z";
const day = n => new Date(Date.parse(T0) + n * 86400000).toISOString();
function fixture(now = day(10), tier = "free", kind = "detail") {
  const fact = value => ({ binding: { actorId: "synthetic-actor", resourceId: "synthetic-resource", sourceIdentity: "synthetic-server-event", sourceRevision: "1", factAsOf: now, provenance: "resolved" }, value });
  const acquisition = { eventId: "create-1", at: T0, tier };
  const input = { policyVersion: VERSION, actorId: "synthetic-actor", resourceId: "synthetic-resource", evaluationInstant: now, resourceKind: kind,
    currentEntitlement: fact({ tier, validFrom: "2020-01-01T00:00:00Z", validUntil: null }), materialState: fact("present"), protection: fact("none"), coreEligibility: fact("allow"), rightsState: fact("clear"), action: { kind: "evaluate" } };
  if (kind === "detail") { input.originalRecordedAt = fact(T0); input.acquiredGrant = fact({ kind, policyVersion: VERSION, originalRecordedAt: T0, acquisition, retainedUntil: tier === "free" ? E14 : E180 }); }
  else { const binding = { reportId: input.resourceId, monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1", monthBindingVersion: "month-v1", collision: false };
    input.monthBinding = fact(binding); input.activeReportPeriod = fact({ monthKey: now.slice(0, 7), timezone: "UTC", timezoneVersion: "zone-v1" });
    input.acquiredGrant = fact({ kind, policyVersion: VERSION, reportId: binding.reportId, monthKey: binding.monthKey, timezone: binding.timezone, timezoneVersion: binding.timezoneVersion, monthBindingVersion: binding.monthBindingVersion, acquisition, acquisitionPeriod: { monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1" }, permanent: tier === "paid" }); }
  return { input, fact };
}
export async function runSmoke(moduleRoot = defaultModuleRoot, outputDirectory, { checkTypes = true, print = true } = {}) {
  moduleRoot = path.resolve(moduleRoot);
  const out = externalEvidenceDirectory(outputDirectory);
  const sourceHashes = Object.fromEntries(moduleFiles.map(file => [file, sha256(fs.readFileSync(path.join(moduleRoot, file)))]));
  const provenance = { sourceHashes, harnessSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), node: process.version, typescript: ts.version, compilerPath: import.meta.resolve("typescript"), moduleRoot, outputDirectory: out, typecheck: checkTypes };
  fs.writeFileSync(path.join(out, "provenance.json"), JSON.stringify(provenance, null, 2));
  let loaded;
  try { if (checkTypes) { const errors = typecheck(moduleRoot); fs.writeFileSync(path.join(out, "typecheck.json"), JSON.stringify(errors)); if (errors.length) throw new Error(`TYPECHECK:${errors.join("\n")}`); } loaded = loadCandidate(moduleRoot); }
  catch (error) { const result = { phase: "SETUP_FAILED", exitCode: 2, message: String(error), provenance }; fs.writeFileSync(path.join(out, "setup.json"), JSON.stringify(result, null, 2)); if (print) console.error(JSON.stringify(result)); return result; }
  const api = loaded.exports, results = [];
  const cases = new Map();
  const register = (id, test) => cases.set(id, test);
  let observations;
  function eq(actual, expected, identity) {
    const observation = { identity, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) }; observations.push(observation);
    if (!observation.pass) throw new Error(`CHECK_FAILED:${identity}`);
  }
  function evaluate(input) {
    const before = JSON.stringify(input); deepFreeze(input);
    const result = api.evaluateConsumerRetention(input);
    eq(JSON.stringify(input), before, "INPUT_UNCHANGED"); eq(result.purgeAllowed, false, "PURGE_FORBIDDEN");
    return result;
  }
  function unknown(input, code) { const r = evaluate(input); eq(r.retentionStatus, "unknown", "UNKNOWN_RETENTION"); eq(r.visibilityStatus, "unknown", "UNKNOWN_VISIBILITY"); eq(r.grantTransitionProposal.kind, "pending", "UNKNOWN_NO_PROPOSAL"); if (code) eq(r.reasons[0]?.code, code, "UNKNOWN_REASON"); return r; }
  function event(f, at, id = "upgrade-1", period) { return f.fact({ eventId: id, at, tier: "paid", ...(period ? { reportPeriod: period } : {}) }); }
  function monthly(now, tier, month) { const f = fixture(now, tier, "monthly"); f.input.monthBinding.value.monthKey = month; f.input.acquiredGrant.value.monthKey = month; return f; }
  register("AC01", () => {
    for (const [tier, end] of [["free", E14], ["paid", E180]]) for (const delta of [-1, 0, 1]) {
      const f = fixture(new Date(Date.parse(end) + delta).toISOString(), tier); const r = evaluate(f.input);
      eq(r.retainedUntil, end, `DEADLINE_${tier}`); eq(r.retentionStatus, delta < 0 ? "within_acquired_term" : "due", `EXPIRY_${tier}_${delta}`); eq(r.visibilityStatus, delta < 0 ? "visible" : "expired", `EXPIRY_VISIBILITY_${tier}_${delta}`);
    }
  });
  register("AC02", () => {
    for (const [now, deadline] of [["2026-10-11T00:00:00Z", E14], ["2026-10-11T08:00:00+08:00", "2026-10-15T08:00:00+08:00"], ["2026-10-10T17:00:00-07:00", "2026-10-14T17:00:00-07:00"]]) {
      const f = fixture(now); f.input.acquiredGrant.value.retainedUntil = deadline; const r = evaluate(f.input);
      eq(r.retainedUntil, E14, "DEADLINE_OFFSET_CANONICAL"); eq(r.retentionStatus, "within_acquired_term", "EVALUATION_OFFSET_EQUIVALENCE");
    }
    let first; for (const t0 of [T0, "2026-10-01T08:00:00+08:00", "2026-09-30T17:00:00-07:00"]) { const f = fixture(); f.input.originalRecordedAt.value = t0; f.input.acquiredGrant.value.originalRecordedAt = t0; f.input.acquiredGrant.value.acquisition.at = t0; const r = evaluate(f.input); const value = [r.originalRecordedAt, r.retainedUntil, r.retentionStatus, r.visibilityStatus]; first ??= value; eq(value, first, "OFFSET_EQUIVALENCE"); } });
  register("AC03", () => {
    for (const [t0, end] of [["2026-03-01T12:00:00-05:00", "2026-03-15T17:00:00.000Z"], ["2026-10-25T12:00:00-04:00", "2026-11-08T16:00:00.000Z"], ["2024-02-28T23:30:00Z", "2024-03-13T23:30:00.000Z"], ["2026-12-25T23:30:00Z", "2027-01-08T23:30:00.000Z"]]) for (const zone of ["Asia/Taipei", "America/New_York", "Pacific/Honolulu"]) {
      const f = fixture(new Date(Date.parse(end) - 1).toISOString()); Object.assign(f.input, { deviceTimezone: zone }); f.input.originalRecordedAt.value = t0; Object.assign(f.input.acquiredGrant.value, { originalRecordedAt: t0, retainedUntil: end, acquisition: { eventId: "create-1", at: t0, tier: "free" } }); const r = evaluate(f.input); eq(r.retainedUntil, end, "ELAPSED_NOT_CALENDAR"); eq(r.retentionStatus, "within_acquired_term", "DST_LEAP_YEAR");
    }
  });
  register("AC04", () => { const f = fixture(); f.input.updatedAt = day(9); f.input.occurredAt = day(8); const r = evaluate(f.input); eq(r.retainedUntil, E14, "EDIT_NO_RENEWAL"); const missing = fixture(); missing.input.updatedAt = T0; delete missing.input.originalRecordedAt; unknown(missing.input, "FACT_MISSING"); });
  register("AC05", () => { for (const n of [10, 30]) { const f = fixture(day(n), "paid"); f.input.currentEntitlement.value.tier = "free"; const r = evaluate(f.input); eq(r.retainedUntil, E180, "DOWNGRADE_NONSHRINKING"); eq(r.retentionStatus, "within_acquired_term", "DOWNGRADE_RETAINED"); eq(r.visibilityStatus, n === 10 ? "visible" : "hidden_by_current_tier", "DISPLAY_SEPARATE"); } });
  register("AC06", () => { const f = fixture(day(13), "free"); f.input.action = { kind: "upgrade", events: [event(f, day(13))] }; const r = evaluate(f.input); eq(r.grantTransitionProposal.kind, "extend", "UPGRADE_EXTEND"); eq(r.grantTransitionProposal.grant.retainedUntil, E180, "UPGRADE_ORIGINAL_ANCHOR"); eq(r.retainedUntil, E14, "PROPOSAL_NOT_PERSISTED"); eq(r.grantTransitionProposal.persisted, false, "NO_WRITE_RECEIPT"); });
  register("AC07", () => {
    const f = fixture(day(30)); const u = event(f, day(13)); f.input.action = { kind: "upgrade", events: [u, structuredClone(u), event(f, day(29), "upgrade-2")] }; const r = evaluate(f.input); eq(r.grantTransitionProposal.grant.retainedUntil, E180, "REPLAY_NO_RESET");
    const persisted = fixture(day(40)); persisted.input.acquiredGrant.value = structuredClone(r.grantTransitionProposal.grant); persisted.input.action = { kind: "upgrade", events: [event(persisted, day(13))] }; eq(evaluate(persisted.input).grantTransitionProposal.kind, "noop", "PERSISTED_REPLAY_NOOP");
    const equivalent = fixture(day(13)); const equivalentUtc = event(equivalent, day(13)); const equivalentOffset = event(equivalent, "2026-10-14T08:00:00+08:00");
    equivalent.input.action = { kind: "upgrade", events: [equivalentUtc, equivalentOffset] };
    eq(evaluate(equivalent.input).grantTransitionProposal.kind, "extend", "EQUIVALENT_UPGRADE_REPLAY");
    const storedOffset = fixture(day(40)); storedOffset.input.acquiredGrant.value = structuredClone(r.grantTransitionProposal.grant);
    storedOffset.input.action = { kind: "upgrade", events: [event(storedOffset, "2026-10-14T08:00:00+08:00")] };
    eq(evaluate(storedOffset.input).grantTransitionProposal.kind, "noop", "PERSISTED_EQUIVALENT_REPLAY");
    for (const n of [14, 15]) { const b = fixture(day(n)); b.input.action = { kind: "upgrade", events: [event(b, day(n))] }; eq(evaluate(b.input).grantTransitionProposal.kind, "noop", "EXPIRY_UPGRADE_NO_EXTENSION"); }
    const c = fixture(day(13)); c.input.action = { kind: "upgrade", events: [event(c, day(12)), event(c, day(13))] }; unknown(c.input, "EVENT_CONFLICT");
    const order = fixture(day(13)); order.input.action = { kind: "upgrade", events: [event(order, day(13)), event(order, day(12), "upgrade-2")] }; unknown(order.input, "EVENT_ORDER");
  });
  register("AC08", () => { for (const n of [100, 181]) { const f = fixture(day(n), "paid"); eq(evaluate(f.input).visibilityStatus, n === 100 ? "visible" : "expired", "RESUBSCRIBE_RETAINED_ONLY"); } const f = fixture(day(100), "paid"); delete f.input.acquiredGrant; unknown(f.input, "HISTORICAL_GRANT_MISSING"); });
  register("AC09", () => { for (const state of ["collapsed", "deleted"]) { const f = fixture(day(13)); f.input.materialState.value = state; f.input.action = { kind: "upgrade", events: [event(f, day(13))] }; const r = evaluate(f.input); eq(r.visibilityStatus, "material_unavailable", "NO_RESURRECTION"); eq(r.grantTransitionProposal.kind, "noop", "UNAVAILABLE_NO_EXTENSION"); } });
  register("AC10", () => {
    eq(Array.from(api.freeReviewWindow("2026-10")), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"], "SIX_MONTHS_INCLUDING_CURRENT"); eq(Array.from(api.freeReviewWindow("2027-01")), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"], "SIX_MONTHS_CROSS_YEAR");
    for (const [now, months] of [["2026-10-15T00:00:00Z", ["2026-04", "2026-05", "2026-10"]], ["2027-01-15T00:00:00Z", ["2026-07", "2026-08", "2027-01"]]]) for (const [i, month] of months.entries()) {
      const f = monthly(now, "free", month); f.input.acquiredGrant.value.acquisition.at = `${month}-01T00:00:00Z`; f.input.acquiredGrant.value.acquisitionPeriod.monthKey = month; f.input.payloadRevision = "updated-partial-2"; const r = evaluate(f.input); eq(r.retentionStatus, i === 0 ? "due" : "within_acquired_term", "MONTH_WINDOW_BOUNDARY"); eq(r.monthBinding.monthKey, month, "PARTIAL_UPDATE_IDENTITY");
    }
  });
  register("AC11", () => {
    for (const month of ["2026-05", "2026-04"]) { const f = monthly("2026-10-15T00:00:00Z", "free", month); f.input.acquiredGrant.value.acquisition.at = `${month}-01T00:00:00Z`; f.input.acquiredGrant.value.acquisitionPeriod.monthKey = month; f.input.action = { kind: "upgrade", events: [event(f, "2026-10-15T00:00:00Z", "upgrade-1", { monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1" })] }; const r = evaluate(f.input); eq(r.grantTransitionProposal.kind, month === "2026-05" ? "promote" : "noop", "MONTHLY_UPGRADE_WINDOW"); if (month === "2026-05") eq(r.grantTransitionProposal.grant.permanent, true, "PROMOTION_PERMANENT"); }
    const f = fixture("2026-10-15T00:00:00Z", "free", "monthly"); delete f.input.acquiredGrant; unknown(f.input, "HISTORICAL_GRANT_MISSING");
    const absent = fixture("2026-10-15T00:00:00Z", "free", "monthly"); absent.input.materialState.value = "deleted"; absent.input.action = { kind: "upgrade", events: [event(absent, "2026-10-15T00:00:00Z", "upgrade-1", { monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1" })] }; eq(evaluate(absent.input).grantTransitionProposal.kind, "noop", "ABSENT_MONTH_NO_PROMOTION");
  });
  register("AC12", () => {
    const f = monthly("2026-10-15T00:00:00Z", "free", "2026-05");
    f.input.acquiredGrant.value.acquisition.at = "2026-05-01T00:00:00Z"; f.input.acquiredGrant.value.acquisitionPeriod.monthKey = "2026-05";
    f.input.action = { kind: "upgrade", events: [event(f, "2026-10-15T00:00:00Z", "upgrade-1", { monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1" })] };
    const proposed = evaluate(f.input).grantTransitionProposal.grant;
    const replay = monthly("2027-10-15T00:00:00Z", "free", "2026-05"); replay.input.acquiredGrant.value = structuredClone(proposed);
    replay.input.action = { kind: "upgrade", events: [event(replay, "2026-10-15T00:00:00Z", "upgrade-1", { monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1" })] };
    const result = evaluate(replay.input); eq(result.retentionStatus, "permanent", "PERSISTED_MONTH_PROMOTION"); eq(result.grantTransitionProposal.kind, "noop", "MONTH_PROMOTION_REPLAY_NOOP"); eq(result.visibilityStatus, "hidden_by_current_tier", "PROMOTED_MONTH_HIDDEN");
    for (const tier of ["free", "paid"]) { const f = fixture("2027-10-15T00:00:00Z", "paid", "monthly"); f.input.currentEntitlement.value.tier = tier; const r = evaluate(f.input); eq(r.retentionStatus, "permanent", "MONTHLY_GRANT_NONREVOKED"); eq(r.visibilityStatus, tier === "free" ? "hidden_by_current_tier" : "visible", "MONTHLY_RESUBSCRIBE"); const d = fixture("2027-10-15T00:00:00Z", "paid", "monthly"); d.input.rightsState.value = "deletion_required"; eq(evaluate(d.input).visibilityStatus, "rights_restricted", "PERMANENT_RIGHTS_EXCEPTION"); } });
  register("AC13", () => { const f = fixture("2026-11-01T01:00:00Z", "paid", "monthly"); f.input.activeReportPeriod.value = { monthKey: "2026-10", timezone: "America/Los_Angeles", timezoneVersion: "zone-v2" }; f.input.payloadRevision = "partial-update"; f.input.deviceTimezone = "Asia/Tokyo"; const r = evaluate(f.input); eq(r.monthBinding, f.input.monthBinding.value, "HISTORICAL_ZONE_IMMUTABLE"); const collision = fixture(T0, "paid", "monthly"); collision.input.monthBinding.value.collision = true; unknown(collision.input, "MONTH_BINDING"); const missing = fixture(T0, "paid", "monthly"); delete missing.input.monthBinding.value.timezoneVersion; unknown(missing.input, "MONTH_BINDING"); });
  register("AC14", () => {
    for (const field of ["materialState", "protection", "coreEligibility", "rightsState", "currentEntitlement", "acquiredGrant"]) {
      const f = fixture(); delete f.input[field].binding; unknown(f.input, "FACT_MISSING");
    }
    for (const field of ["monthBinding", "activeReportPeriod"]) { const f = fixture(T0, "paid", "monthly"); delete f.input[field]; unknown(f.input, "FACT_MISSING"); }
    const future = fixture(T0, "paid", "monthly"); future.input.monthBinding.value.monthKey = "2026-11"; unknown(future.input, "FUTURE_MONTH");
    const illegalZone = fixture(T0, "paid", "monthly"); illegalZone.input.monthBinding.value.timezone = "Unknown/Invalid"; unknown(illegalZone.input, "MONTH_BINDING");
    const fakePermanent = fixture(T0, "free", "monthly"); fakePermanent.input.acquiredGrant.value.permanent = true; unknown(fakePermanent.input, "PERMANENT_MISMATCH");
    const fakeExtended = fixture(); fakeExtended.input.acquiredGrant.value.retainedUntil = E180; unknown(fakeExtended.input, "DEADLINE_MISMATCH");
    const edits = [
      [i => delete i.originalRecordedAt, "FACT_MISSING"], [i => i.originalRecordedAt.value = "2026-10-01", "INVALID_INSTANT"],
      [i => i.originalRecordedAt.value = "2026-02-30T00:00:00Z", "INVALID_INSTANT"], [i => i.originalRecordedAt.value = "2026-10-01T00:00:00-00:00", "INVALID_INSTANT"],
      [i => i.originalRecordedAt.value = day(20), "FUTURE_ANCHOR"], [i => i.originalRecordedAt.binding.actorId = "other", "IDENTITY_MISMATCH"],
      [i => i.acquiredGrant.binding.resourceId = "other", "IDENTITY_MISMATCH"], [i => i.acquiredGrant.binding.sourceIdentity = "", "PROVENANCE_UNKNOWN"],
      [i => i.acquiredGrant.binding.sourceRevision = "", "PROVENANCE_UNKNOWN"], [i => i.acquiredGrant.binding.provenance = "unknown", "PROVENANCE_UNKNOWN"],
      [i => i.acquiredGrant.value.retainedUntil = day(13), "DEADLINE_MISMATCH"], [i => i.acquiredGrant.value.originalRecordedAt = day(1), "ANCHOR_MISMATCH"],
      [i => i.currentEntitlement.value.tier = "unknown", "ENTITLEMENT_UNKNOWN"], [i => i.currentEntitlement.binding.factAsOf = day(9), "FACT_TIME"],
      [i => i.currentEntitlement.value.validUntil = day(9), "ENTITLEMENT_VALIDITY"], [i => i.policyVersion = "unknown", "POLICY_VERSION"],
      [i => i.acquiredGrant.value.policyVersion = "old", "GRANT_BINDING"], [i => i.action = { kind: "upgrade", events: [] }, "EVENTS_MISSING"]
    ];
    for (const [edit, code] of edits) { const f = fixture(); edit(f.input); unknown(f.input, code); }
    for (const bad of ["2026-01-01T24:00:00Z", "2026-01-01T00:00:00+14:01", "2026-01-01T00:00:00+08:99", "2026-01-01T00:00:60Z", "0000-01-01T00:00:00Z", "2026-01-01T00:00:00.1234Z"]) eq(api.parseRetentionInstant(bad), null, "INVALID_OFFSET_DATE");
    unknown(null, "INVALID_INPUT");
    const m = fixture(T0, "free", "monthly"); m.input.activeReportPeriod.value.monthKey = "2026-09"; unknown(m.input, "INVALID_REPORT_PERIOD");
    const mismatch = fixture(T0, "free", "monthly"); mismatch.input.acquiredGrant.value.monthKey = "2026-09"; unknown(mismatch.input, "MONTH_GRANT_MISMATCH");
  });
  register("AC15", () => {
    for (const core of ["allow", "deny", "unknown"]) { const f = fixture(day(30), "paid"); f.input.coreEligibility.value = core; f.input.trainingConsent = "withdrawn"; f.input.legalRegistry = "inactive"; const r = evaluate(f.input); eq(r.retainedUntil, E180, "CONSENT_DOES_NOT_SHRINK"); eq(r.visibilityStatus, core === "allow" ? "visible" : core === "deny" ? "core_denied" : "unknown", "CORE_ELIGIBILITY_BOUNDARY"); }
    for (const protection of ["saved_meal", "unknown"]) { const f = fixture(); f.input.protection.value = protection; const r = evaluate(f.input); eq(r.visibilityStatus, "unknown", "FAVORITE_PENDING_NOT_DEFAULT"); }
    eq(loaded.attempts, [], "NO_IO_OR_CLOCK");
  });
  register("AC16", () => {
    for (const [field, state] of [["coreEligibility", "deny"], ["coreEligibility", "unknown"], ["rightsState", "deletion_required"], ["protection", "unknown"]]) {
      const f = fixture(T0, "free"); delete f.input.acquiredGrant; f.input[field].value = state;
      f.input.action = { kind: "create", newResource: true, acquisition: f.fact({ eventId: "new-create", at: T0, tier: "free" }) };
      unknown(f.input, "CREATE_ELIGIBILITY_PENDING");
    }
    for (const kind of ["detail", "monthly"]) for (const tier of ["free", "paid"]) {
      const f = fixture(T0, tier, kind); delete f.input.acquiredGrant; f.input.currentEntitlement.value.tier = tier === "paid" ? "free" : "paid";
      f.input.action = { kind: "create", newResource: true, acquisition: f.fact({ eventId: "new-create", at: T0, tier }), ...(kind === "monthly" ? { reportPeriod: { monthKey: "2026-10", timezone: "UTC", timezoneVersion: "zone-v1" } } : {}) };
      const r = evaluate(f.input); eq(r.grantTransitionProposal.kind, "create", "CREATE_PROPOSAL"); eq(r.retentionStatus, "unknown", "CREATE_NOT_ACTUAL_GRANT");
      eq(kind === "detail" ? r.grantTransitionProposal.grant.retainedUntil : r.grantTransitionProposal.grant.permanent, kind === "detail" ? tier === "free" ? E14 : E180 : tier === "paid", "ACQUISITION_NOT_CURRENT_TIER");
    }
    const legacy = fixture(T0, "paid"); delete legacy.input.acquiredGrant; unknown(legacy.input, "HISTORICAL_GRANT_MISSING");
  });
  for (const [id, test] of cases) {
    observations = []; let message = null, stack = null;
    try { await test(); } catch (error) { message = String(error); stack = error.stack ?? null; }
    const result = { id, pass: message === null, exitCode: message === null ? 0 : 1, message, stack, observations };
    results.push(result); fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(result, null, 2));
    if (print) console.log(JSON.stringify({ id, pass: result.pass, message, assertions: observations.length }));
  }
  const result = { phase: "CANDIDATE_EXECUTED", exitCode: results.every(r => r.pass) && loaded.attempts.length === 0 ? 0 : 1, results, ioAttempts: loaded.attempts, provenance };
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2)); return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runSmoke(process.argv[2] ?? defaultModuleRoot, process.argv[3]);
  console.log(JSON.stringify({ phase: result.phase, exitCode: result.exitCode, evidence: result.provenance.outputDirectory })); process.exitCode = result.exitCode;
}
