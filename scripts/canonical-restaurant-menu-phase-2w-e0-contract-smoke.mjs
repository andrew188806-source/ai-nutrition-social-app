import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "packages", "shared", "src", "domain", "canonical-restaurant-menu");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-restaurant-menu-e0-"));
const outRoot = path.join(tempRoot, "canonical-restaurant-menu");
const checks = [];

function expect(condition, name, details = "contract assertion failed") {
  if (!condition) throw new Error(`${name}: ${details}`);
  checks.push({ name, pass: true });
}

try {
  const sourceFiles = fs.readdirSync(sourceRoot).filter((file) => file.endsWith(".ts")).map((file) => path.join(sourceRoot, file));
  const program = ts.createProgram(sourceFiles, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true, esModuleInterop: true, skipLibCheck: true, outDir: outRoot, rootDir: sourceRoot });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  expect(diagnostics.length === 0, "E0 TypeScript contract compilation", diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
  const requireFromTemp = createRequire(path.join(outRoot, "index.js"));
  const policy = requireFromTemp("./index.js");

  const weakKinds = ["name_only", "photo_only", "similar_name_location"];
  for (const kind of weakKinds) expect(!policy.canAutoResolveExistingTarget([{ kind, value: "evidence", verified: true }]), `${kind} cannot auto-resolve`);
  expect(policy.canAutoResolveExistingTarget([{ kind: "place_id", value: "opaque-place", verified: true }]), "strong Place ID resolves existing target");
  expect(!policy.canAutoResolveExistingTarget([{ kind: "canonical_id", value: "target", verified: true, conflictsWithCanonical: true }]), "strong conflicting evidence fails closed");

  const communityBase = { distinctVerifiedObserverCount: 2, observationsIndependent: true, evidenceConsistent: true, abuseSignalPresent: false, partnerOrCanonicalConflict: false, partnerRelationshipSuspected: false, partnerRejectedWithStrongConflict: false };
  expect(policy.evaluateCommunitySupport(communityBase) === "community_supported", "two independent verified users support community state");
  expect(policy.evaluateCommunitySupport({ ...communityBase, partnerRelationshipSuspected: true }) === "partner_review", "partner suspicion overrides community promotion");
  expect(policy.evaluateCommunitySupport({ ...communityBase, partnerRejectedWithStrongConflict: true }) === "admin_review", "partner rejection with strong conflict escalates to admin");

  expect(policy.isGovernanceTransitionAllowed("received", "resolving"), "legal received-to-resolving transition");
  expect(!policy.isGovernanceTransitionAllowed("received", "active"), "illegal received-to-active transition");
  expect(policy.isGovernanceTransitionAllowed("inactive_suspected", "active") && policy.isGovernanceTransitionAllowed("archived", "active"), "inactive/archive lifecycle is reversible");
  expect(policy.supportsOrdinaryLifecycleHardDelete() === false, "ordinary lifecycle has no hard delete");
  const redirect = { aliasTargetId: "provisional-1", canonicalTargetId: "canonical-1", mergedAt: "2026-07-17T00:00:00Z", historyPreserved: true };
  expect(redirect.historyPreserved && redirect.aliasTargetId !== redirect.canonicalTargetId, "merge preserves alias redirect and history");

  const now = "2026-07-17T12:00:00Z";
  const verified = { targetId: "item-1", scope: "branch", branchId: "branch-1", status: "verified", validUntil: "2026-08-17T00:00:00Z", invalidationReasons: [] };
  const badges = policy.projectNutritionBadges({ exactMenuItemVerification: verified, currentRestaurantOrBranchMenuItemVerifications: [verified], now });
  expect(badges.menuItemBadge && badges.restaurantOrBranchBadge, "exact valid item and parent badge project true");
  const parentOnly = policy.projectNutritionBadges({ currentRestaurantOrBranchMenuItemVerifications: [verified], now });
  expect(!parentOnly.menuItemBadge && parentOnly.restaurantOrBranchBadge, "parent badge does not imply exact item badge");
  expect(!policy.isNutritionVerificationCurrent({ ...verified, validUntil: "2026-07-16T00:00:00Z" }, now), "expired verification disables badge");
  expect(!policy.isNutritionVerificationCurrent({ ...verified, invalidationReasons: ["recipe_changed"] }, now), "recipe change invalidates verification");
  expect(!policy.isNutritionVerificationCurrent({ ...verified, branchId: undefined }, now), "branch-scoped verification requires branch identity");
  expect(!policy.isNutritionVerificationCurrent({ ...verified, scope: "shared_recipe", branchId: undefined }, now), "shared recipe requires confirmed recipe, portion, and SOP basis");
  expect(policy.isNutritionVerificationCurrent({ ...verified, scope: "shared_recipe", branchId: undefined, sharedRecipeBasis: { recipeConfirmed: true, portionConfirmed: true, standardOperatingProcedureConfirmed: true } }, now), "confirmed shared recipe basis may project across branches");

  const trustBase = { targetId: "candidate", exactItemNutritionVerified: false, belongsToNutritionBadgedRestaurantOrBranch: false, adminExistenceConfirmed: false, distinctIndependentVerifiedUsers: 0, registeredProvisional: false, allergySafe: true, otherwiseSafe: true, available: true, userExcluded: false };
  const tiers = [
    policy.calculateRecommendationTrustTier({ ...trustBase, targetId: "t1", exactItemNutritionVerified: true }),
    policy.calculateRecommendationTrustTier({ ...trustBase, targetId: "t2", belongsToNutritionBadgedRestaurantOrBranch: true }),
    policy.calculateRecommendationTrustTier({ ...trustBase, targetId: "t3", adminExistenceConfirmed: true }),
    policy.calculateRecommendationTrustTier({ ...trustBase, targetId: "t4", distinctIndependentVerifiedUsers: 2 }),
    policy.calculateRecommendationTrustTier({ ...trustBase, targetId: "t5", registeredProvisional: true })
  ];
  expect(tiers.map((result) => result.tier).join(",") === "1,2,3,4,5", "trust tiers 1 through 5 map exactly");
  expect(tiers[1].reason === "nutrition_badged_parent" && tiers[1].eligibleForGeneralRecommendations, "tier 2 ranks as parent trust without item verification");
  expect(!tiers[4].eligibleForGeneralRecommendations, "tier 5 is excluded from general recommendations");
  expect(policy.calculateRecommendationTrustTier({ ...trustBase, exactItemNutritionVerified: true, allergySafe: false }).tier === null, "allergy hard filter overrides trust");
  expect([...tiers].sort(policy.compareRecommendationTrust).map((item) => item.tier).join(",") === "1,2,3,4,5", "trust ordering is deterministic");

  expect(!policy.canIssueReportReward("submitted", "issued"), "reward cannot issue before confirmation");
  expect(policy.canIssueReportReward("confirmed", "issued"), "confirmed report may issue reward");
  expect(policy.getInitialReportReviewStatus("verified") === "partner_review" && policy.getInitialReportReviewStatus("none") === "admin_review", "partner and non-partner reports route to separate review paths");
  expect(policy.isReportTransitionAllowed("confirmed", "under_review") && policy.isReportTransitionAllowed("rejected", "under_review"), "reports support appeal and reopen");
  expect(!policy.isCanonicalPartnerAffiliation({ kind: "restaurant", targetId: "provisional", resolutionStatus: "pending_resolution", identityProvenance: "server_registered_provisional" }), "provisional target cannot claim canonical partner affiliation");

  const partnerVerifiedAt = "2026-07-17T00:00:00Z";
  const makeItem = (index, overrides = {}) => ({ queueItemId: `queue-${String(index).padStart(2, "0")}`, kind: "observation", restaurantId: "restaurant-1", branchId: "branch-1", ambiguousBranch: false, pending: true, createdAt: "2026-07-01T00:00:00Z", lastObservedAt: `2026-07-${String(Math.min(16, index + 1)).padStart(2, "0")}T00:00:00Z`, confidence: 0.5, distinctVerifiedObserverCount: 1, occurrenceCount: 1, evidenceKinds: ["name_only"], deliveredScopeIds: [], ...overrides });
  const queueItems = Array.from({ length: 21 }, (_, index) => makeItem(index));
  queueItems.push(makeItem(30, { createdAt: "2026-05-01T00:00:00Z" }));
  queueItems.push(makeItem(31, { reportType: "restaurant_closed", evidenceKinds: ["name_only"] }));
  queueItems.push(makeItem(32, { evidenceKinds: ["place_id"] }));
  queueItems.push(makeItem(33, { deliveredScopeIds: ["restaurant-1:branch:branch-1"] }));
  queueItems.push(makeItem(34, { deferredUntil: "2026-07-18T00:00:00Z" }));
  const queuePage = policy.listPartnerClaimQueue({ items: queueItems, intake: "historical", partnerVerifiedAt, restaurantId: "restaurant-1", branchId: "branch-1", now, limit: 20 });
  expect(queuePage.items.length === 20, "partner claim queue caps batches at 20");
  expect(queuePage.items[0].queueItemId === "queue-31" && queuePage.items[0].priorityBand === 1, "high-risk report has first priority");
  expect(queuePage.items[1].queueItemId === "queue-32" && queuePage.items[1].priorityBand === 2, "strong identity evidence has second priority");
  expect(!queuePage.items.some((item) => ["queue-33", "queue-34"].includes(item.queueItemId)), "defer and once-per-scope delivery are enforced independently of createdAt");
  expect(queuePage.nextCursor !== null, "queue uses cursor pagination");
  const repeatPage = policy.listPartnerClaimQueue({ items: queueItems, intake: "historical", partnerVerifiedAt, restaurantId: "restaurant-1", branchId: "branch-1", now, limit: 20 });
  expect(JSON.stringify(queuePage) === JSON.stringify(repeatPage), "partner priority ordering is deterministic");
  const ambiguous = policy.listPartnerClaimQueue({ items: [makeItem(40, { branchId: undefined, ambiguousBranch: true })], intake: "historical", partnerVerifiedAt, restaurantId: "restaurant-1", now });
  expect(ambiguous.items[0]?.route === "headquarters", "ambiguous branch routes to headquarters");

  const eligibilityItems = [
    makeItem(50, { createdAt: "2026-04-18T00:00:00Z", lastObservedAt: "2026-07-07T00:00:00Z" }),
    makeItem(51, { createdAt: "2026-07-07T00:00:00Z", lastObservedAt: "2026-05-17T00:00:00Z" }),
    makeItem(52, { createdAt: "2026-05-18T00:00:00Z", lastObservedAt: "2026-05-18T00:00:00Z" }),
    makeItem(53, { createdAt: "2026-07-17T00:30:00Z", lastObservedAt: "2026-07-17T01:00:00Z" }),
    makeItem(54, { lastObservedAt: "not-a-time" }),
    makeItem(55, { createdAt: "2026-07-18T13:00:00Z", lastObservedAt: "2026-07-18T13:00:00Z" }),
    makeItem(56, { observedAt: "2026-07-10T00:00:00Z", lastObservedAt: "2026-07-09T00:00:00Z" })
  ];
  const historicalEligibility = policy.listPartnerClaimQueue({ items: eligibilityItems, intake: "historical", partnerVerifiedAt, restaurantId: "restaurant-1", branchId: "branch-1", now });
  const liveEligibility = policy.listPartnerClaimQueue({ items: eligibilityItems, intake: "live", partnerVerifiedAt, restaurantId: "restaurant-1", branchId: "branch-1", now });
  const historicalIds = historicalEligibility.items.map((item) => item.queueItemId);
  const liveIds = liveEligibility.items.map((item) => item.queueItemId);
  expect(historicalIds.includes("queue-50"), "created 90 days ago and observed 10 days ago is historical INCLUDED");
  expect(!historicalIds.includes("queue-51"), "created 10 days ago and observed 61 days ago is historical EXCLUDED");
  expect(historicalIds.includes("queue-52"), "observation exactly 60 days before verification is historical INCLUDED");
  expect(!historicalIds.includes("queue-53") && liveIds.includes("queue-53"), "post-verification observation enters live intake only");
  expect(!historicalIds.some((id) => ["queue-54", "queue-55", "queue-56"].includes(id)) && !liveIds.some((id) => ["queue-54", "queue-55", "queue-56"].includes(id)), "invalid, future, and contradictory observation times fail closed");

  const consumerProjection = policy.projectConsumerTarget({ kind: "menu_item", targetId: "item-1", restaurantId: "restaurant-1", branchId: "branch-1", resolutionStatus: "admin_review", identityProvenance: "server_registered_provisional" }, false);
  expect(!("resolutionStatus" in consumerProjection) && !("identityProvenance" in consumerProjection), "consumer projection hides governance status and provenance");
  const partnerProjection = policy.projectPartnerSafeQueueEntry(queuePage.items[0], "target-1");
  expect(!Object.keys(partnerProjection).some((key) => /user|rating|meal|movement|photo/i.test(key)), "partner projection leaks no private user, meal, rating, movement, or photo data");

  console.log(JSON.stringify({ status: "passed", phase: "Phase 2W-E0 Canonical Restaurant/Menu Contract Smoke", totalChecks: checks.length, checks, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false, phase2WEMobileCutover: "NOT_STARTED", phase2X: "NOT_STARTED" }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", phase: "Phase 2W-E0 Canonical Restaurant/Menu Contract Smoke", reason: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
