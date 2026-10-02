#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSmoke, moduleFiles, defaultModuleRoot, externalEvidenceDirectory, sha256 } from "./consumer-retention-policy-smoke.mjs";

const moduleRoot = path.resolve(process.argv[2] ?? defaultModuleRoot);
const out = externalEvidenceDirectory(process.argv[3]);
const original = Object.fromEntries(moduleFiles.map(file => [file, fs.readFileSync(path.join(moduleRoot, file), "utf8")]));
const hashes = Object.fromEntries(moduleFiles.map(file => [file, sha256(Buffer.from(original[file]))]));
const setup = await runSmoke(moduleRoot, path.join(out, "unmutated"), { print: false });
fs.writeFileSync(path.join(out, "unmutated.raw.json"), JSON.stringify(setup, null, 2));
if (setup.exitCode !== 0 || setup.phase !== "CANDIDATE_EXECUTED") {
  console.error(JSON.stringify({ phase: "UNMUTATED_SETUP_FAILED", exitCode: 2, evidence: out })); process.exitCode = 2;
} else {
  // Each mutation must produce the corresponding behavioral failure in an executed candidate.
  // Loader/typechecker/setup failures are never accepted as corruption rejection.
  const controls = [
    ["M01_FREE_13", "policy.ts", "FREE_DETAIL_DAYS = 14", "FREE_DETAIL_DAYS = 13", "AC01", "CHECK_FAILED:DEADLINE_free"],
    ["M02_PAID_179", "policy.ts", "PAID_DETAIL_DAYS = 180", "PAID_DETAIL_DAYS = 179", "AC01", "CHECK_FAILED:DEADLINE_paid"],
    ["M03_LOCAL_INSTANT", "policy.ts", "localMs - offsetMinutes * 60_000", "localMs", "AC02", "CHECK_FAILED:DEADLINE_OFFSET_CANONICAL"],
    ["M04_UPGRADE_RESET", "evaluate.ts", "iso(t0! + PAID_DETAIL_DAYS * ELAPSED_DAY_MS)", "iso(at + PAID_DETAIL_DAYS * ELAPSED_DAY_MS)", "AC06", "CHECK_FAILED:UPGRADE_ORIGINAL_ANCHOR"],
    ["M05_DOWNGRADE_SHRINK", "evaluate.ts", "retainedUntil: acquired?.kind === \"detail\" ? iso(time(acquired.retainedUntil, \"grant.retainedUntil\")) : null", "retainedUntil: acquired?.kind === \"detail\" ? (entitlement.tier === \"free\" ? iso(t0! + FREE_DETAIL_DAYS * ELAPSED_DAY_MS) : acquired.retainedUntil) : null", "AC05", "CHECK_FAILED:DOWNGRADE_NONSHRINKING"],
    ["M06_DISPLAY_COUPLED", "evaluate.ts", "visibilityStatus = visible ? \"visible\" : \"hidden_by_current_tier\"", "visibilityStatus = \"visible\"", "AC05", "CHECK_FAILED:DISPLAY_SEPARATE"],
    ["M07_REVOKE_PERMANENT", "evaluate.ts", "acquired.permanent ? \"permanent\"", "(acquired.permanent && entitlement.tier === \"paid\") ? \"permanent\"", "AC12", "CHECK_FAILED:PERSISTED_MONTH_PROMOTION"],
    ["M08_SEVEN_MONTHS", "policy.ts", "FREE_REVIEW_MONTHS = 6", "FREE_REVIEW_MONTHS = 7", "AC10", "CHECK_FAILED:SIX_MONTHS_INCLUDING_CURRENT"],
    ["M09_EXCLUDE_CURRENT", "policy.ts", "end - FREE_REVIEW_MONTHS + 1 + index", "end - FREE_REVIEW_MONTHS + index", "AC10", "CHECK_FAILED:SIX_MONTHS_INCLUDING_CURRENT"],
    ["M10_INFER_HISTORY", "evaluate.ts", "let proposal: RetentionEvaluation", "if (!acquired && t0 !== null) acquired = { kind: \"detail\", policyVersion: VERSION, originalRecordedAt: iso(t0), acquisition: { eventId: \"invented\", at: iso(t0), tier: entitlement.tier }, retainedUntil: iso(t0 + PAID_DETAIL_DAYS * ELAPSED_DAY_MS) };\n    let proposal: RetentionEvaluation", "AC08", "CHECK_FAILED:UNKNOWN_RETENTION"],
    ["M11_RESURRECT", "evaluate.ts", "if (material === \"collapsed\" || material === \"deleted\") visibilityStatus", "if (false) visibilityStatus", "AC09", "CHECK_FAILED:NO_RESURRECTION"],
    ["M12_PURGE_UNKNOWN", "evaluate.ts", "purgeAllowed: false", "purgeAllowed: true", "AC14", "CHECK_FAILED:PURGE_FORBIDDEN"],
    ["M13_EXPIRED_UPGRADE", "evaluate.ts", "if (at < time(planned.retainedUntil, \"planned.retainedUntil\"))", "if (at <= time(planned.retainedUntil, \"planned.retainedUntil\"))", "AC07", "CHECK_FAILED:EXPIRY_UPGRADE_NO_EXTENSION"],
    ["M14_FETCH_IO", "evaluate.ts", "const now = time(input.evaluationInstant, \"evaluationInstant\");", "const now = time(input.evaluationInstant, \"evaluationInstant\"); fetch(\"https://invalid.example\");", "AC01", "IO_FORBIDDEN:fetch"],
    ["M15_CLOCK_IO", "evaluate.ts", "const now = time(input.evaluationInstant, \"evaluationInstant\");", "const now = Date.now();", "AC01", "IO_FORBIDDEN:Date.now"],
    ["M16_CORE_BYPASS", "evaluate.ts", "else if (core === \"deny\") visibilityStatus = \"core_denied\";", "else if (false) visibilityStatus = \"core_denied\";", "AC15", "CHECK_FAILED:CORE_ELIGIBILITY_BOUNDARY"],
    ["M18_CREATE_CORE_BYPASS", "evaluate.ts", 'requireFact(core === "allow" && rights === "clear" && protection === "none", "CREATE_ELIGIBILITY_PENDING", "action.create");', "", "AC16", "CHECK_FAILED:UNKNOWN_VISIBILITY"],
    ["M17_REMAP_HISTORY", "evaluate.ts", "monthBinding: binding ? { ...binding } : null", "monthBinding: binding ? { ...binding, timezone: active!.timezone, timezoneVersion: active!.timezoneVersion } : null", "AC13", "CHECK_FAILED:HISTORICAL_ZONE_IMMUTABLE"]
    ,["M19_RAW_EVENT_IDENTITY", "evaluate.ts", 'return JSON.stringify([value.eventId, iso(time(value.at, "event.at")), value.tier, value.reportPeriod?.monthKey ?? null, value.reportPeriod?.timezone ?? null, value.reportPeriod?.timezoneVersion ?? null]);', "return JSON.stringify(value);", "AC07", "CHECK_FAILED:EQUIVALENT_UPGRADE_REPLAY"]
    ,["M20_RAW_DEADLINE", "evaluate.ts", 'retainedUntil: acquired?.kind === "detail" ? iso(time(acquired.retainedUntil, "grant.retainedUntil")) : null', 'retainedUntil: acquired?.kind === "detail" ? acquired.retainedUntil : null', "AC02", "CHECK_FAILED:DEADLINE_OFFSET_CANONICAL"]
  ];
  const results = [];
  for (const [id, file, before, after, caseId, failure] of controls) {
    const copy = path.join(out, id, "candidate"); fs.mkdirSync(copy, { recursive: true });
    for (const name of moduleFiles) fs.writeFileSync(path.join(copy, name), original[name]);
    if (original[file].split(before).length !== 2) throw new Error(`MUTATION_ANCHOR_NOT_UNIQUE:${id}`);
    fs.writeFileSync(path.join(copy, file), original[file].replace(before, after));
    const mutationHashes = Object.fromEntries(moduleFiles.map(name => [name, sha256(fs.readFileSync(path.join(copy, name)))]));
    const raw = await runSmoke(copy, path.join(out, id, "execution"), { checkTypes: false, print: false });
    // Persist individual evidence before evaluation, so an evaluator failure cannot lose it.
    fs.writeFileSync(path.join(out, id, "raw.json"), JSON.stringify(raw, null, 2));
    const failed = raw.results?.find(result => result.id === caseId && !result.pass && result.message?.includes(failure));
    const pass = raw.phase === "CANDIDATE_EXECUTED" && raw.exitCode === 1 && !!failed;
    const result = { id, pass, candidateExitCode: raw.exitCode, expectedCase: caseId, expectedFailure: failure, actualFailure: failed?.message ?? null, mutationTarget: file, beforeSha256: hashes[file], afterSha256: mutationHashes[file], sourceHashes: mutationHashes, exactCommand: `runSmoke(${JSON.stringify(copy)}, ${JSON.stringify(path.join(out, id, "execution"))}, {checkTypes:false,print:false})`, rawOutput: path.join(out, id, "raw.json") };
    fs.writeFileSync(path.join(out, id, "control.json"), JSON.stringify(result, null, 2)); results.push(result); console.log(JSON.stringify(result));
  }
  const unchanged = moduleFiles.every(file => sha256(fs.readFileSync(path.join(moduleRoot, file))) === hashes[file]);
  const result = { phase: "ACTUAL_CANDIDATE_MUTATIONS", exitCode: results.every(r => r.pass) && unchanged ? 0 : 1, setupExitCode: setup.exitCode, setupSourceHashes: hashes, originalCandidateUnchanged: unchanged, mutationHarnessSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), smokeHarnessSha256: setup.provenance.harnessSha256, results, outputDirectory: out };
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ phase: result.phase, exitCode: result.exitCode, controls: results.length, evidence: out })); process.exitCode = result.exitCode;
}
