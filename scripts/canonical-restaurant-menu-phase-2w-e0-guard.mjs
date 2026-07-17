import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const migrationName = "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql";
const allowedChanges = new Set([
  "package.json",
  "packages/shared/src/domain/index.ts",
  "packages/shared/src/domain/canonical-restaurant-menu/index.ts",
  "packages/shared/src/domain/canonical-restaurant-menu/types.ts",
  "packages/shared/src/domain/canonical-restaurant-menu/policies.ts",
  "packages/shared/src/domain/canonical-restaurant-menu/ports.ts",
  "docs/consumer-runtime-phase-2w/phase-2w-d-satisfaction-record.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-implementation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-identity-resolution-contract.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-governance-state-machine.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-nutrition-badge-projection.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-recommendation-trust-policy.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-reporting-reward-contract.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-partner-claim-queue-contract.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-validation-plan.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-known-issues-and-deferrals.md",
  "docs/consumer-runtime-phase-2w/phase-2w-e0-freeze-record.md",
  "scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs",
  "scripts/canonical-restaurant-menu-phase-2w-e0-contract-smoke.mjs"
]);
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
    .split("\0").filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));

  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("starting HEAD remains the frozen Phase 2W-C commit", git(["rev-parse", "HEAD"]).stdout.trim() === "5dd693a57c34220f4d0cb7f4dab40f3a5c38eca5");
  check("all changes stay inside the E0 local boundary", outOfScope.length === 0, { changedFiles, outOfScope });
  check("staged diff is empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("package-lock is unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "");
  check("migrations are unchanged", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).stdout.trim() === "");
  check("Mobile, Restaurant, and Admin UI are unchanged", !changedFiles.some((file) => /^apps\/(mobile|restaurant-web|admin-web)\//.test(file)));
  check("no runtime adapter is changed", !changedFiles.some((file) => /adapter|repository|service/i.test(file)));
  check(".env.local is ignored", git(["check-ignore", "-q", "--", ".env.local"], true).status === 0);
  check(".env.local is not tracked", git(["ls-files", "--", ".env.local"]).stdout.trim() === "");
  check(".env.local is not staged", !git(["diff", "--cached", "--name-only"]).stdout.split(/\r?\n/).includes(".env.local"));

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const migrationText = fs.readFileSync(path.join(root, "supabase", "migrations", migrationName));
  const migrationHash = createHash("sha256").update(migrationText).digest("hex");
  check("migration inventory remains 34", migrations.length === 34, { migrationCount: migrations.length });
  check("latest migration remains Phase 2W-B", migrations.at(-1) === migrationName, { latest: migrations.at(-1) });
  check("Phase 2W-B migration hash is unchanged", migrationHash === "2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f", { migrationHash });

  const types = read("packages/shared/src/domain/canonical-restaurant-menu/types.ts");
  const policies = read("packages/shared/src/domain/canonical-restaurant-menu/policies.ts");
  const ports = read("packages/shared/src/domain/canonical-restaurant-menu/ports.ts");
  const allSource = `${types}\n${policies}\n${ports}`;
  check("shared domain exports the isolated E0 namespace", read("packages/shared/src/domain/index.ts").includes("CanonicalRestaurantMenuGovernance"));
  check("target uses opaque ID, kind, resolution, provenance, and parents", ["targetId", "kind", "resolutionStatus", "identityProvenance", "restaurantId", "branchId"].every((term) => types.includes(term)));
  check("observation evidence is separate from canonical target", /interface CanonicalObservation/.test(types) && /interface CanonicalTargetReference/.test(types));
  check("name, photo, address, and location are evidence rather than ID fields", /rawName/.test(types) && /rawPhotoReference/.test(types) && !/targetId:\s*(?:rawName|rawPhotoReference)/.test(allSource));
  check("strong evidence is allowlisted", ["canonical_id", "place_id", "address_phone", "verified_official_source", "verified_partner_source"].every((term) => policies.includes(`"${term}"`)));
  check("weak similarity evidence cannot auto-resolve", !/STRONG_IDENTITY_EVIDENCE[\s\S]{0,300}(photo_only|similar_name_location|name_only)/.test(policies));
  check("community support requires two independent verified observers and safety checks", /distinctVerifiedObserverCount >= 2/.test(policies) && /observationsIndependent/.test(policies) && /abuseSignalPresent/.test(policies) && /partnerOrCanonicalConflict/.test(policies));
  check("partner suspicion and strong rejection conflict escalate", /partnerRelationshipSuspected[\s\S]*partner_review/.test(policies) && /partnerRejectedWithStrongConflict[\s\S]*admin_review/.test(policies));
  check("all governance states are present", ["received","resolving","resolved_existing","pending_resolution","externally_supported","community_supported","partner_review","admin_review","active","inactive_suspected","archived","rejected","merged"].every((term) => types.includes(`"${term}"`)));
  check("ordinary lifecycle hard delete is prohibited", /supportsOrdinaryLifecycleHardDelete\(\): false/.test(policies));
  check("governance dimensions remain independent", ["existence", "availability", "partnerRelationship", "nutritionVerification"].every((term) => types.includes(term)));
  check("nutrition badge rules validate exact item, parent scope, expiry, and invalidation", /exactMenuItemVerification/.test(policies) && /currentRestaurantOrBranchMenuItemVerifications/.test(policies) && /validUntil/.test(policies) && /invalidationReasons/.test(policies));
  check("trust policy exposes tiers 1 through 5 and hard filters", /RecommendationTrustTier = 1 \| 2 \| 3 \| 4 \| 5/.test(types) && /hard_filter_failed/.test(policies) && /eligibleForGeneralRecommendations: false/.test(policies));
  check("report and reward vocabularies are complete", ["restaurant_closed","wrong_affiliation","incorrect_photo","submitted","confirmed","reversed","not_eligible","issued"].every((term) => types.includes(`"${term}"`)) && /reportStatus === "confirmed"/.test(policies));
  check("partner queue separates historical and live intake", /PartnerClaimQueueIntake = "historical" \| "live"/.test(types) && /input\.intake === "historical"/.test(policies));
  check("historical eligibility uses inclusive observed time and never created time", /observedAt >= historicalStart && observedAt <= verifiedAt/.test(policies) && !/createdAt >= historicalStart|Date\.parse\(item\.createdAt\).*historicalStart/.test(policies));
  check("live intake accepts only post-verification observations through now", /observedAt > verifiedAt && observedAt <= now/.test(policies));
  check("queue timestamps fail closed without using createdAt for eligibility", /observedAt === null \|\| firstObservedAt === null \|\| observedAt > now \|\| firstObservedAt > observedAt/.test(policies) && /verifiedAt === null \|\| now === null \|\| verifiedAt > now/.test(policies) && !/parseQueueTimestamp\(item\.createdAt\)/.test(policies));
  check("partner queue enforces 60 days, batch 20, deterministic ordering, and delivery scope", /60 \* 24 \* 60 \* 60 \* 1000/.test(policies) && /Math\.min\(20/.test(policies) && /localeCompare/.test(policies) && /deliveredScopeIds/.test(policies));
  check("canonical menu claims are not limited by the discovery window", /Existing canonical menu ownership\/claim data[\s\S]*unbounded by 60 days/.test(read("docs/consumer-runtime-phase-2w/phase-2w-e0-partner-claim-queue-contract.md")));
  check("ports cover the approved implementation seams", ["submitObservation","resolveCandidate","registerProvisional","mergeTarget","submitAvailabilityReport","reviewReport","listPartnerClaimQueue","recordPartnerDecision","projectBadges","calculateTrustTier"].every((term) => ports.includes(term)));
  check("ports accept no arbitrary ownership argument", !/\b(userId|user_id|ownerId|owner_id)\b/.test(ports));
  check("E0 source contains no DB, Supabase, HTTP, or direct DML implementation", !/supabase|service_role|fetch\s*\(|https?:\/\/|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(/i.test(allSource));

  const requiredDocs = [
    "phase-2w-d-satisfaction-record.md", "phase-2w-e0-implementation-plan.md", "phase-2w-e0-identity-resolution-contract.md",
    "phase-2w-e0-governance-state-machine.md", "phase-2w-e0-nutrition-badge-projection.md", "phase-2w-e0-recommendation-trust-policy.md",
    "phase-2w-e0-reporting-reward-contract.md", "phase-2w-e0-partner-claim-queue-contract.md", "phase-2w-e0-validation-plan.md",
    "phase-2w-e0-known-issues-and-deferrals.md", "phase-2w-e0-freeze-record.md"
  ];
  check("all E0 evidence documents exist", requiredDocs.every((file) => fs.existsSync(path.join(root, "docs", "consumer-runtime-phase-2w", file))));
  const satisfaction = read("docs/consumer-runtime-phase-2w/phase-2w-d-satisfaction-record.md");
  check("Phase 2W-D satisfaction binds both frozen commits", satisfaction.includes("3f84e54992e5f21cf1260de1eeea4daf54c02b09") && satisfaction.includes("5dd693a57c34220f4d0cb7f4dab40f3a5c38eca5") && satisfaction.includes("PHASE_2W_D_SATISFIED_BY_PRIOR_EVIDENCE=true"));
  const freezeRecord = read("docs/consumer-runtime-phase-2w/phase-2w-e0-freeze-record.md");
  check("Freeze record binds prior evidence without recreating database work", /Phase 2W-D is satisfied[\s\S]*Phase 2W-B\/C evidence[\s\S]*does not recreate or rerun SQL, RPCs, migrations, or adapters/i.test(freezeRecord));
  check("Freeze record preserves canonical identity, evidence, merge, and lifecycle invariants", /observation is separate from a canonical entity[\s\S]*evidence only[\s\S]*opaque server-generated IDs[\s\S]*cannot auto-resolve[\s\S]*Merge preserves[\s\S]*does not hard-delete/i.test(freezeRecord));
  check("Freeze record preserves governance, nutrition, trust, and report invariants", /complete governance state machine[\s\S]*partner\/admin escalation[\s\S]*nutrition badge represents nutrition verification only[\s\S]*at least one current valid nutrition-verified item[\s\S]*trust tiers remain 1 through 5[\s\S]*Hard filters always override trust[\s\S]*cannot be `issued` before[\s\S]*`confirmed`/i.test(freezeRecord));
  check("Freeze record preserves corrected historical and live queue boundaries", /partnerVerifiedAt - 60 days <= lastObservedAt <= partnerVerifiedAt[\s\S]*partnerVerifiedAt < lastObservedAt <= now[\s\S]*createdAt` never determines discovery eligibility[\s\S]*fails closed[\s\S]*not limited to 60 days[\s\S]*capped at 20 items[\s\S]*defer\/resume[\s\S]*once per restaurant\/branch scope[\s\S]*ambiguous branch evidence to headquarters\/admin/i.test(freezeRecord));
  check("Freeze record keeps E0 candidate-only and preserves all exclusions", /Database tables, migrations, SQL\/RPCs, persistence adapters[\s\S]*Admin UI, Restaurant Web UI, and Mobile cutover remain unimplemented[\s\S]*P2W-A-DEP-001`: OPEN \/ ACCEPTED \/ DEFERRED[\s\S]*P2V-PERF-001`: OPEN \/ DEFERRED[\s\S]*N4: BLOCKED \/ NOT EXECUTED[\s\S]*Phase 2V-F: BLOCKED \/ NOT EXECUTED[\s\S]*Production: untouched[\s\S]*PHASE_2W_E0_FREEZE_CANDIDATE=true[\s\S]*PHASE_2W_E0_FROZEN=false[\s\S]*PHASE_2W_E_MOBILE_CUTOVER=NOT_STARTED/i.test(freezeRecord));
  const packageJson = JSON.parse(read("package.json"));
  check("package scripts expose E0 guard and smoke", packageJson.scripts?.["test:consumer-phase2w-e0"] === "node scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs" && packageJson.scripts?.["test:consumer-phase2w-e0-smoke"] === "node scripts/canonical-restaurant-menu-phase-2w-e0-contract-smoke.mjs");
  check("no generated artifacts are present", !statusEntries.some(({ file }) => /\.(js|js\.map|tsbuildinfo|log|tmp|cache)$/i.test(file) || /(^|\/)(\.next|dist|build|coverage|cache)(\/|$)/i.test(file)));

  console.log(JSON.stringify({ status: issues.length ? "failed" : "passed", phase: "Phase 2W-E0", totalChecks: checks.length, passedChecks: checks.filter(({ pass }) => pass).length, failedChecks: issues.length, migrationCount: migrations.length, latestMigration: migrations.at(-1), migrationHash, networkUsed: false, databaseUsed: false, productionTouched: false, checks, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : String(error), checks, issues }, null, 2));
  process.exitCode = 1;
}
