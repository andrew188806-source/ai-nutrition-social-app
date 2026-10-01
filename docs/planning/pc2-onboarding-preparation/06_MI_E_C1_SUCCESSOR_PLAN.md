# PC-2-P0R — Publication, Successor and Readiness Plan

> CURRENT VALIDATION STATUS: executor remediation gates complete; independent reacceptance pending. The preparation status below is historical. See the supplemental closure and document 08.

Status: **OWNER DECISION SYNC — PLAN ONLY — no guard, registry or product file edited**
Baseline: `main` @ `30268ee4de59a8d8855c1dcaa01795d2f1ce33b1`
Labels: **[FACT]** · **[PROPOSED]** · **[UNRESOLVED]**

---

## 1. The frozen chain [FACT]

### 1.1 Guard: `scripts/meal-photo-analysis-mi-e-c1-guard.mjs` (448 lines)
- Content invariants only: regex and existence checks over current files. There is no exact-record manifest, no predecessor commit and no successor seam.
- It exits 1 on any failed check. It passes at baseline (twin-clone sweep for PC-1: exit 0 in both trees).
- It is the **only** script that reads `packages/shared/src/domain/consumer-consent/types.ts`.

### 1.2 Consent checks in that guard

| # | Check (paraphrased) | What it asserts |
|---|---|---|
| C1 | Authority lives in `packages/shared/src/domain/consumer-consent` | `types.ts` and `index.ts` exist; the domain barrel has `export * from "./consumer-consent"` |
| C2 | No Mobile duplicate | `apps/mobile/features/consumer-auth/consentPolicy.ts` does not exist |
| C3 | The consumer-auth barrel only re-exports | `from "@haocu/shared";` is present, both constants are named, neither is redefined |
| C4 | Three independent content hashes are required | the three `…ContentSha256: string \| null;` type fields and the three `if (!entry.…ContentSha256) missing.push` lines exist; no single `contentSha256:` property |
| **C5** | **The placeholder cannot pass as production-ready** | `status: "development_placeholder"` is present, the three `…ContentSha256: null,` lines are present, and **`!/status: "active"/`** over the raw source |
| C6 | No single `contentSha256` property | as C4 |

**Within this guard’s consent checks, C5 blocks activation.** Its `!/status: "active"/` clause fails on any active entry, approved or not. Every other clause, including the placeholder's three `null` lines, can keep holding after activation as long as the placeholder entry is kept unchanged.

### 1.3 Other MI-E-C1 invariants PC-2 must keep
These are unrelated to activation but must keep passing:
- the analysis Function has no `trainingEligible`, `trainingConsent`, `allowTraining`, `canTrain`, `training-dataset`, `model-artifact` or `dataset-export`;
- no migration adds a permanent `training_eligible` boolean;
- Storage and bucket invariants hold.

The existing analysis/Storage/training invariants stay frozen in this documentation phase. Future PC-2 derives eligibility (`04_…` §7); selected B also needs a server core-service admission boundary. Freeze its exact scope and successor recognition (§3.5), without adding training-data authority or a permanent eligibility flag to analysis.

---

## 2. Publication and exact successor contract [PROPOSED]

### 2.1 Distinct publication, approval and hash scopes

The three preparation drafts delimit a proposed member body and a reviewer appendix. They are incomplete, unapproved and unusable for real acceptance. Their DRAFT HASH covers each entire current file’s **raw bytes**, including metadata and appendix. It is only review integrity.

After OF facts, remaining policy choices, the selected Option B text and qualified legal review, create clean readable publication artifacts. Remove draft metadata, markers, reviewer notes and the historical alternative; insert the approved operator/contact, required disclosures and effective information. The clean file itself is the immutable legal artifact. Its document ID, version, locale and SHA-256(raw bytes) bind approval. No clean artifact contains its own hash. Approval evidence is a separate record; hashes do not establish authority or legal compliance.

`04_CONSENT_RECORD_CONTRACT.md` §4 defines the exact current bundle, required document set, effective-time gate and stale-submission rejection. Freeze one coherent `zh-TW` bundle with all three published documents; Owner selected Option B: Terms/Privacy and explicit training are all required for completion/core qualification. Social-only 18+ and nutrition limitations are also approved product decisions. These decisions are not approval of clean publication bytes, legal interpretation, training scope or live activation. Bundled client text must reproduce each artifact’s raw bytes, with identity/version labels in the viewer. Missing or mismatched publication/client/registry, unapproved or not-yet-effective bundle => `consent_documents_unavailable`, never substitute placeholder text.

### 2.2 Two hash conventions; independent encoding checks

- **Product/source:** the existing `lfSha256` convention normalizes CRLF to LF before hashing. It **does not reject CRLF**. Pin reviewed source hashes using that convention where predecessor manifests require it.
- **Legal content:** SHA-256 of the exact original bytes, without newline normalization, BOM stripping, Markdown transformation or appendix extraction at acceptance time. A CRLF change changes this raw hash.
- **Separate encoding check:** strict UTF-8 decode, no BOM, LF-only, required final newline and no trailing whitespace on every newly authored artifact/source where this convention applies. A normalized source hash match does not excuse failing encoding.
- Pin raw legal hashes and normalized source hashes in explicitly distinct fields/maps. The client module source hash and its embedded document-byte hashes have different scopes.

### 2.3 Frozen baseline branch and narrow activation branch

Keep the original MI-E-C1 content invariants and placeholder prohibition. The existing source helper `assertConsumerPolicyBundleIsProductionReady` merely checks required hash fields are populated; it is necessary but **not** proof of approval, correct hash or effective applicability.

The sole C5 no-active predicate gains a reviewed exact-successor alternative:

```text
originalNoActivePredicate(sharedConsentTypes)
OR exactAuthorizedPc2Activation(root, independentlyReviewedRecord)
```

The original no-active branch retains all original predicates; it does not become a general exemption for onboarding changes. C1–C4/C6, unchanged placeholder null fields and training/Storage/Function checks remain intact. The successor branch must additionally require:

1. A frozen authorized predecessor is present in history; the exact changed-path set and reviewed bytes match. No prefix, wildcard or arbitrary future descendant acceptance.
2. Exactly one active bundle deep-equals the approved bundle, including identity/version/locale/hash, required set, selected B/core consequences and effective information. Placeholder remains byte/semantically unchanged and unpromoted; extra consent authorities or active entries fail.
3. Clean artifacts exist and raw hashes match independent approval evidence, shared manifest and client bytes. Do not accept a hash freshly copied from the candidate as proof it is approved.
4. Activation migration’s semantic registry/bundle bindings match that same reviewed bundle; merely finding matching strings in comments is insufficient. Authorized Development acceptance later checks actual rows; local source parsing is not evidence of remote apply.
5. Effective time and status are enforced by runtime server applicability checks. Recognition of an approved future-effective artifact is not permission to accept it early.
6. Exact activation/implementation validation and predecessor parity hold. Unapproved document/version, publication mismatch, missing file, unauthorized path and placeholder promotion fail.

Do not loosen the guard to any active bundle or rely on `assertConsumerPolicyBundleIsProductionReady` alone. A later v2 needs independently reviewed successor evidence. No guard is edited in this task.

### 2.4 No self-hash cycle

The future **manifest** describes reviewed product/legal/migration payload paths and hashes. It excludes its own bytes from its internal hash map. The separate **record** declares the complete authorized delta, including guard/manifest/record/mutation paths, and carries a review seal for manifest and validator bytes without attempting to hash itself.

Approval evidence and review of the record’s own bytes must be external to that record’s self-calculated fields (owner review receipt or signed review artifact with independently verified authority). A validator cannot trust an editable candidate record simply because the candidate recomputed its hashes. Freeze that independent trust input before successor acceptance. No mutual manifest/record/guard self-hash loop, no commit hash of the commit containing the record, no automatic “record current tree and accept” mode. Exact changed-path checking covers the whole delta; payload hashing and independent review together cover all file classes. The executable sealing/import mechanics remain an executor freeze item in §3.5, not an already implemented guarantee.

---

## 3. Exact expected path ledger [PROPOSED; NOT A COMPLETE AUTHORIZED INVENTORY]

The names below are concrete expected paths for a later brief, not authorization to create them now. New feature names are recommended choices. Actual imports, generated migration paths, bundle storage and measured predecessor seams still require executor freeze **before edits**. Do not claim the delta is complete until §3.5 is closed and independent review seals its exact full path set. A rejected path must lead to explicit scope review, never widening a directory allowlist.

### 3.1 Product paths

| Exact expected path | Purpose |
|---|---|
| `apps/mobile/app/login.tsx` | Create-account, document readiness and email-confirmation state |
| `apps/mobile/app/onboarding.tsx` | Proposed profile/current consent flow |
| `apps/mobile/app/consent-document.tsx` | Proposed readable exact-version document viewer |
| `apps/mobile/app/me.tsx` | Proposed consent/participation management |
| `apps/mobile/app/meal-buddies.tsx` | Proposed participation entry and cache/reference clearing |
| `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts` | Signup/session mapping without consent authority in Auth metadata |
| `apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts` | Canonical single-profile read; remove disabled flow intentionally |
| `apps/mobile/features/consumer-auth/consumerProfileBootstrapService.ts` | Profile/current-consent orchestration, lifecycle checks |
| `apps/mobile/features/consumer-auth/supabaseProfileMappers.ts` | Remove nonexistent completion-column dependency |
| `apps/mobile/features/consumer-auth/supabaseProfileContracts.ts` | Exact projection/types |
| `apps/mobile/features/consumer-auth/types.ts` | Derived completion and truthful pending/error state |
| `apps/mobile/features/consumer-auth/ports.ts` | Profile/consent port changes |
| `apps/mobile/features/consumer-auth/index.ts` | Explicit exports if new public contracts require them |
| `apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx` | Derived core UI gate, document/rights/customer-service/deletion/re-grant/sign-out exceptions; server gate also required |
| `lib/i18n/zh-TW.ts` | Selected B consequences, Social-only 18+, approved nutrition boundary and truthful signup/document copy |
| `apps/mobile/features/consumer-onboarding/types.ts` | Proposed exact bundle/status contract |
| `apps/mobile/features/consumer-onboarding/ports.ts` | Proposed owner-derived repository interface |
| `apps/mobile/features/consumer-onboarding/repository.ts` | Proposed adapters to canonical consent/provisioning RPCs |
| `apps/mobile/features/consumer-onboarding/controller.ts` | Proposed unavailable/stale/withdrawal orchestration |
| `apps/mobile/features/consumer-onboarding/useConsumerOnboarding.ts` | Proposed epoch-aware UI state |
| `apps/mobile/features/consumer-onboarding/index.ts` | Proposed exports |
| `apps/mobile/features/social-participation/types.ts` | Proposed existing participation transition/status types |
| `apps/mobile/features/social-participation/ports.ts` | Proposed interface to the four existing RPCs |
| `apps/mobile/features/social-participation/repository.ts` | Proposed RPC adapter; no new Social primitive |
| `apps/mobile/features/social-participation/controller.ts` | Proposed transition and stale-result handling |
| `apps/mobile/features/social-participation/useSocialParticipation.ts` | Proposed UI status and cache/ref invalidation |
| `apps/mobile/features/social-participation/index.ts` | Proposed exports |

This is not an assertion that every row must change. Freeze the necessary subset and any separately justified import/test paths. Migration constraints for profile uniqueness and narrow training lifecycle are legal/registry authority paths below; no filename timestamp is fabricated.

### 3.2 Legal publication / registry paths

| Exact expected path or explicitly unresolved identity | Scope |
|---|---|
| `docs/legal/consumer/membership-terms/v1.zh-TW.md` | Proposed clean `membership-terms` / `v1` / `zh-TW` raw artifact |
| `docs/legal/consumer/privacy-policy/v1.zh-TW.md` | Proposed clean `privacy-policy` / `v1` / `zh-TW` raw artifact |
| `docs/legal/consumer/ai-training-terms/v1.zh-TW.md` | Proposed clean `ai-training-terms` / `v1` / `zh-TW` raw artifact |
| `packages/shared/src/domain/consumer-consent/types.ts` | Preserve placeholder; approved mirror only at legitimate activation; additional bundle fields need successor recognition |
| `apps/mobile/features/consumer-onboarding/approvedDocumentContent.ts` | Proposed generated raw-text mirror plus metadata; no approved content before approval |
| **UNRESOLVED: implementation migration exact CLI-generated path** | Owner uniqueness, empty registry/bundle structures, narrow lifecycle constraints, owner-derived RPCs; may require more than one migration if implementation review demonstrates need |
| **UNRESOLVED: activation migration exact CLI-generated path** | Insert the independently approved document/bundle metadata only; separate file is conditional on sequence (§5) |
| **UNRESOLVED: registry bundle-binding source/path** | §4 of `04_CONSENT_RECORD_CONTRACT.md` requires coherent SQL bundle binding; decide whether stored in the proposed registry structure or a separate narrow relation before freezing migrations |

Use `supabase migration new` only in a later authorized implementation. Final owner choice can change proposed version/path names only through a newly frozen exact ledger. No glob or angle-bracket migration template counts as an exact recorded path.

### 3.3 Validation paths

| Exact proposed path | Required evidence |
|---|---|
| `scripts/pc2-consumer-onboarding-guard.mjs` | Local account/consent contract and unchanged authority boundaries |
| `scripts/pc2-consumer-onboarding-smoke.mjs` | Profile duplicates, idempotency, race fixtures, unavailable/stale states, selected B refusal/withdrawal/re-grant and preserved access, under-18 general onboarding versus Social qualification, Social transitions/cache behavior |
| `scripts/pc2-consumer-onboarding-mutations.mjs` | Fail-closed mutations against real local validators |
| `scripts/pc2-consent-activation-guard.mjs` | Exact reviewed publication/registry/client/approval and applicability |
| `scripts/pc2-consent-activation-mutations.mjs` | §4 mutations with actual guard execution |
| `scripts/pc2-consumer-onboarding-development-live.mjs` | Later authorized Development signup/confirmation, canonical rows and live transitions; not run now |

Fixtures exercise selected B and labelled **local test** bundles without publishing or inserting them remotely; fail mutations that permit optional training core use, underage/unknown Social activation, client-only enforcement or blocking rights/re-grant recovery. Fixture payloads must stay in test paths, unable to pass approval/activation recognition. Pin validator bytes using independent review evidence; do not let a mutated validator validate itself. Local SQL/RPC test execution mechanism and any extra helper paths are unresolved until the later brief.

### 3.4 Predecessor recognition paths

| Exact path | Planned role / boundary |
|---|---|
| `scripts/pc2-consumer-onboarding-manifest.mjs` | Proposed implementation payload/predecessor manifest |
| `scripts/pc2-consumer-onboarding-record.mjs` | Proposed complete implementation delta and review record |
| `scripts/pc2-consent-activation-manifest.mjs` | Proposed independent approved bundle and raw legal/source payload maps |
| `scripts/pc2-consent-activation-record.mjs` | Proposed complete activation delta/review evidence; not a self hash |
| `scripts/meal-photo-analysis-mi-e-c1-guard.mjs` | Narrow approved activation alternative only when activation occurs |
| `scripts/consumer-profile-phase-1d-guard.mjs` | Measured mapper/repository successor or exact baseline parity |
| `scripts/consumer-auth-phase-1a-guard.mjs` | Measured bootstrap/auth successor or exact baseline parity |
| `scripts/consumer-auth-phase-1b-guard.mjs` | Same; existing baseline failures must not be mislabelled new regressions |
| `scripts/consumer-auth-phase-1c-guard.mjs` | Same |
| `scripts/pc1-consumer-closure-guard.mjs` | Preserve PC-1; login is a forbidden-delta check, not a recorded login-byte hash |
| `scripts/pc1-consumer-closure-manifest.mjs` | Existing 17-path PC-1 record includes meal-buddies, not login; preserve its historical evidence |
| `scripts/pc1-consumer-closure-record.mjs` | Preserve existing historical record; change only if exact measured successor contract requires it |
| `scripts/pc1-consumer-closure-mutations.mjs` | Verify original PC-1 recognition and authorized PC-2 successor plus wrong/extra rejection |
| `scripts/gqa6r-stable-demo-repair-guard.mjs` | Conditional transitive recognition check, not blanket permission to edit |
| `scripts/gqa6r-stable-demo-repair-manifest.mjs` | Preserve previous exact bytes; measure whether new successor needs a narrow separate seam |
| `scripts/gqa6r-stable-demo-repair-record.mjs` | Existing record remains authoritative for its own predecessor |
| `scripts/gqa6r-stable-demo-repair-mutations.mjs` | Conditional measured recognition coverage; no unrelated sweep in P0R |

Keep existing schema/Social authorization invariants and historical guard evidence. Selected age/core server enforcement may require narrow integration changes or additional checks; measure and individually freeze their exact paths and successor recognition rather than assuming unchanged primitives already enforce new conditions. No guard or primitive changes now. Possible transitive seams beyond this ledger are **not yet inventoried**. Additional successor helpers must have individually named paths before authorized edits; a family name or folder permission is insufficient. Historical manifests must not be overwritten with new payload hashes to pretend the old acceptance covered PC-2.

### 3.5 Explicit executor freeze items

- Generate real migration filename(s), define bundle storage and shared consent/provisioning lock order under `04`/`05`; no exact SQL is specified by this documentation task.
- Freeze exact necessary product/export/helper/test paths, and the independent approval receipt/review trust mechanism (§2.4).
- **New owner-decision scope still requires freeze:** minimal canonical actor-bound Social adult qualification record, provenance/attestation label, applicability, lock and server enforcement; no age input in general signup/onboarding. Its migration/authority paths are unresolved, not a guessed timestamp or authorized file today.
- Inventory exact **core feature server entry points**, including analysis/recommendation/encyclopedia/catalog and Social reads/writes, plus rights/account/reconsent exceptions. A runtime UI gate alone cannot satisfy Option B; this documentation task does not assert the existing endpoints enforce it. Do not add training-data authority to photo analysis when adding a later service-admission check; preserve MI-E-C1 invariants or obtain a specifically reviewed successor where demonstrated.
- Freeze actual existing-user B reconsent and Social age rollout (cohort, evidence inventory, notices, transition timing, access/preserved rights, stale refs/cards); no existing user is automatically accepted/adult, and no runtime change or mass lock is authorized now.
- Measure each affected predecessor guard and freeze exact required seams/record/manifest/mutation paths; preserve original branch semantics and baseline parity.
- Classify these seven preparation docs as review evidence, never published consent content. If a later authorized commit includes them, enumerate each exact path in that commit’s complete delta; do not silently permit the entire planning directory.
- Current ledger is deliberately **incomplete** on these named items. They are engineering brief prerequisites, not operator facts. Do not claim an executable exact-successor record exists today.

---

## 4. Required activation mutations [PROPOSED]

Run the real MI-E-C1 and activation guards in isolated local clones/fixtures with independently fixed review evidence. Restore fixture bytes; never mutate the product checkout to perform these tests.

| Case | Expected |
|---|---|
| Original no-active baseline | Original MI-E-C1 branch passes |
| Exact independently approved successor | Recognition passes; runtime acceptance still waits for effective time |
| Wrong normalized product hash or unauthorized changed path | Fail |
| Second active bundle, unapproved ID/version/locale or wrong required set or optional training/core admission policy | Fail |
| Placeholder promoted, removed or changed | Fail |
| Null/wrong raw legal hash, missing artifact, one changed legal byte | Fail |
| Registry migration/bundle binding differs from publication/shared/client mirror | Fail |
| Raw embedded document text differs although rendering looks identical | Fail |
| Approval absent, for another artifact, or candidate self-generates approval | Fail |
| Extra consent authority/manifest, single combined content hash | Fail; original C1–C4/C6 retained |
| Predecessor absent or unreviewed future successor claimed | Fail |
| Wildcard/brace path, missing recorded path or extra changed path | Fail |
| CRLF in source with unchanged normalized hash | Encoding check fails independently |
| CRLF or BOM in legal artifact | Encoding check fails; raw hash also differs |
| Strict UTF-8 failure or trailing whitespace | Encoding/content convention check fails |
| Mutated validator, manifest or independently reviewed record | Independent review/delta seal fails; no self-acceptance |
| Approved bundle not yet effective, retired or stale acceptance | Runtime submission fails even if historical artifact recognition passes |
| Treat current product-decision approval as final clean-byte/legal approval | Activation fails; B/age approval alone is insufficient |
| Refusal/withdrawal still permits direct core feature request | Core authorization fails; check real protected entry points |
| Core/training/age gate blocks rights, contact, document or re-grant paths | Contract acceptance fails; these are recovery/account paths |
| General onboarding blocked by Social 18+ | Contract acceptance fails |
| Adult/training status auto-joins Social, or client/user_metadata alone claims adult | Social authorization fails |
| Existing user silently assumed adult/accepted without explicit rollout | Contract acceptance fails |

Local fixture passes do not claim these scripts exist or that remote activation occurred. Include both original and successor positive controls so a guard that rejects everything cannot be counted as success.

---

## 5. Conditional sequence and honest readiness [PROPOSED]

| Label | Meaning / required evidence |
|---|---|
| `IMPLEMENTATION_READY_FOR_LOCAL_ACCEPTANCE` | Authorized implementation contracts and local fixtures accepted; inactive-documents state may be correct. Not approval, real signup closure, remote apply or Production. This P0R documentation package itself does not earn the label. |
| `DOCUMENTS_APPROVED_NOT_ACTIVATED` | Owner/legal decisions completed, clean immutable bytes independently approved and hashed; no active registry/live availability claimed. |
| `DEVELOPMENT_ACTIVATED_LIVE_ACCEPTED` | Separately authorized Development inventory/apply and exact effective approved publication/registry/client acceptance; real signup (including confirmation path), sole canonical profile/current consents and Social transitions verified. |
| `PRODUCT_CLOSURE` | Required product/live paths, operational commitments, policy/governance evidence and owner closure accepted. Development acceptance alone is insufficient, and this label itself does not authorize Production deployment. |

**Approval arrives after implementation:** build/test with placeholder and empty proposed registry, UI truthful unavailable; original MI-E-C1 remains unchanged. After approval, freeze exact activation delta and narrow successor seam. An implementation predecessor plus later activation is appropriate here.

**Approval already exists when implementation is authorized:** freeze the approved clean bundle plus combined implementation/activation delta, predecessor and exact successor recognition up front. One legitimate combined change can include publication, active registry migration and the necessary guard seam. Do not force an extra commit simply to avoid successor work. Implementation and approval are still distinct evidence, even in one change.

Neither sequence authorizes commits, remote apply or activation now. The later brief determines change units from actual approval timing, with no amendment of historical records. Twin-clone differential uses the appropriate frozen baseline and complete candidate overlay; require zero new regressions or documented exact baseline parity. Legal raw hashes are recalculated **after** final owner edits, never imported from the three preparation DRAFT HASH values.

Before Development remote apply: separately authorized read-only duplicate inventory and explicit migration preconditions; stop on duplicates, no silent deletion/merge. Confirmation configuration/callback and real account outcome must be exercised, not deferred while calling signup closed. Account deletion/training/reporting/billing pipelines remain separately scoped; no promise of numeric cleanup or backups absent operational support.

---

## 6. Remaining unresolved matters

Owner approved Social-only 18+, selected Option B/core denial/preserved rights and nutrition/medical service limitations. **Still unresolved:** OF-01–05, other PC policy commitments (training scope/third parties, retention/deletion/backups and operational details), non-social minor legal requirements, qualified legal review, clean publication bytes, D-01/effective time and live activation, grouped in `07_OWNER_REVIEW_SHEET.md`. A/B and the Social-only age scope are no longer open questions. Technical exact-inventory/SQL-storage/review-seal items are §3.5 and must be frozen by the later executor. Neither kind is fabricated or treated as approved here.

OD-15, TD-10/AU19 and P-7 remain open. Existing Development acceptance cannot settle prerequisite approval/governance conflicts. The package remains documentation-only and never authorizes a training pipeline, deletion executor, reporting system, billing, Production operations or deployment.


## 7. PC-2 local implementation freeze — 2026-10-01 [EXECUTOR FREEZE]

> HISTORICAL IMPLEMENTATION EVIDENCE — the implementation inventory below is preserved from the original PC-2 run. Its differential parity/PASS claims relied on substituted guard execution and incomplete failure vectors; independent acceptance was BLOCKED. Those claims are superseded for current validation by 08_VALIDATION_INTEGRITY_REMEDIATION.md and the supplemental differential/raw outputs. They are not current acceptance evidence. The product implementation and original validation JSON remain frozen.


The preceding proposed ledgers remain historical preparation evidence. This exact local implementation inventory replaces their unresolved implementation names. Legal publication and activation paths remain excluded. This freeze is an implementation record, not an owner legal approval receipt or independent Planner acceptance. Baseline is `30268ee4de59a8d8855c1dcaa01795d2f1ce33b1`; CLI 2.109.1 generated both migration names. No dependency upgrade. PostgreSQL 17.6 baseline fresh apply passed all 140 migrations.

### product — exact paths

- `apps/mobile/app/login.tsx`
- `apps/mobile/app/onboarding.tsx`
- `apps/mobile/app/consent-document.tsx`
- `apps/mobile/app/auth-callback.tsx`
- `apps/mobile/app/participation-settings.tsx`
- `apps/mobile/app/account-support.tsx`
- `apps/mobile/app/me.tsx`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts`
- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileMappers.ts`
- `apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts`
- `apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx`
- `apps/mobile/features/consumer-onboarding/types.ts`
- `apps/mobile/features/consumer-onboarding/controller.ts`
- `apps/mobile/features/consumer-onboarding/ConsumerOnboardingProvider.tsx`
- `apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx`
- `apps/mobile/features/consumer-onboarding/copy.ts`
- `apps/mobile/features/consumer-onboarding/authRedirect.ts`
- `supabase/functions/_shared/auth/authenticateCaller.ts`

### migrations — exact paths

- `supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql`
- `supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql`

### docs — exact paths

- `docs/planning/pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md`
- `docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md`

### validation — exact paths

- `scripts/pc2-consumer-onboarding-manifest.mjs`
- `scripts/pc2-consumer-onboarding-record.mjs`
- `scripts/pc2-consumer-onboarding-guard.mjs`
- `scripts/pc2-consumer-onboarding-smoke.mjs`
- `scripts/pc2-consumer-onboarding-postgres.mjs`
- `scripts/pc2-consumer-onboarding-fixtures.mjs`
- `scripts/pc2-consumer-onboarding-mutations.mjs`
- `scripts/pc2-consumer-onboarding-differential.mjs`
- `scripts/pc2-consumer-onboarding-validation.json`

### recognition — exact paths

- `scripts/consumer-profile-phase-1d-guard.mjs`
- `scripts/consumer-auth-phase-1c-guard.mjs`
- `scripts/pc1-consumer-closure-manifest.mjs`
- `scripts/pc1-consumer-closure-guard.mjs`
- `scripts/gqa6r-stable-demo-repair-manifest.mjs`

### Database objects and lock order

New private schema `consumer_internal`, private tables `document_versions`, `document_approvals`, `required_bundles`, `rollout_state`, `preparation_cohort`, `social_age_qualifications`. No legal document/approval/bundle rows are seeded; rollout remains preparation. The only compatibility rows are the migration-time sole active profile owners bound to their existing profile IDs and the exact predecessor provenance. Later accounts cannot join this cohort through any client API.

Private functions: `immutable_document_binding`, `current_bundle`, `has_current_consents`, `core_eligible`, `social_qualified`, `owner_lock`, `require_core`, `require_social`, `consent_history_guard`, `core_write_guard`, `current_state`, `accept_required`. Public actor-only RLS predicate `consumer_core_eligible()` has no subject parameter. Public actor-derived RPCs: `get_consumer_required_documents`, `get_authenticated_consumer_participation_state`, `complete_authenticated_consumer_account_onboarding`, `grant_authenticated_ai_training_consent`, `withdraw_authenticated_ai_training_consent`, `attest_authenticated_social_adult`. Public signup document DTO is the one intended unauthenticated read; protected state/writers deny anon/PUBLIC. Internal subject arguments never become public arbitrary-owner APIs.

Constraints/indexes: `consumer_profiles_owner_unique`; retain nontraining/legacy full uniqueness through `consumer_data_consents_legacy_unique_version`; add `consumer_data_consents_canonical_training_live_unique`. No blanket historical type restriction. Immutable document/approval triggers and private RLS; owner consent history UPDATE trigger. Core write triggers and authenticated restrictive RLS policies on exact core tables listed in the server matrix. Social predicate `social_internal.authorized_candidates(uuid,uuid[])`, card creation `social_internal.create_meal_buddy_card` and the four existing public participation functions receive additive gates preserving their existing identities and remaining bodies. Existing relationship/chat pair/block authority is reused.

Fixed writer order: rollout state row SHARE, owner consent advisory lock, owner provisioning advisory lock if provisioning, then existing owner Social advisory lock if touching participation. Consent withdrawal pauses an existing opted_in row atomically. Re-grant touches no participation. Pair operations retain their original ordered Social locks and never acquire a consent lock afterwards. Eligibility reads acquire no advisory lock. All canonical consent writers use the same owner lock and lifecycle index.

### Server eligibility coverage matrix

| Operation / client entry | Actual authority and gate | Denial tests / limits |
|---|---|---|
| Photo upload / nutrition analysis | `storage.objects` restrictive authenticated policy for consumer photo bucket; canonical verified-caller shared Edge authentication checks actor state before provider/service-role work; meal_analyses read/write gates | Fresh local Storage/Edge transport negatives after withdrawal; does not promise cancellation of requests already in progress or remote erasure |
| Recommendation / feedback | shared verified-caller gate on next-meal-geo-candidates; existing actor RPCs plus recommendation_sessions/recommendation_feedback write triggers and authenticated read restriction | Direct RPC and user-scoped read denied; local static recommendation UI covered by app gate; algorithms unchanged |
| Meal records / analysis / planned / summaries | all existing public actor-derived core mutator RPCs are independently gated before their unchanged bodies; restrictive authenticated core-table reads and write triggers | Direct replay and write denied after withdrawal; existing ownership/idempotency preserved |
| Consumer settings / ratings / favorites | existing actor RPCs and owner-table restrictive reads/write triggers | Cross-owner and no-core denials; no Restaurant/Admin gate |
| Card WRITE/list/cancel | verified Consumer Edge caller gate; internal canonical card create requires core + social qualification + opted_in; preserve caps/DTO | Direct internal authority test and Edge negative; no automatic card |
| Discovery/detail / invitation/relationships/chat | shared verified-caller gate; augmented canonical candidate predicate requires both subjects eligible/qualified in enforcement; existing pair/card/profile/block/participant checks retained | Internal direct candidate, relationship/chat tests, stale references fail current authority; retained rows unchanged |
| Static catalogue/features | Consumer app navigation gate with canonical reread; static assets remain ordinary assets | Client route tests; no invented static-data RPC and no promise to erase downloaded assets |
| Document/consent/re-grant/rights/logout management | explicit safe DTO/writer RPCs and recovery routes outside the core gate | Withdrawal recovery remains available; unavailable publication truthfully pending |

Exact core owner tables: `consumer_preferences`, `taste_profiles`, `dietary_restrictions`, `nutrition_goals`, `subscription_entitlements`, `meal_records`, `meal_record_items`, `meal_analyses`, `meal_corrections`, `meal_consumption_adjustments`, `meal_sharing_allocations`, `planned_meals`, `daily_nutrition_summaries`, `user_restaurant_ratings`, `user_menu_item_ratings`, `favorite_restaurants`, `favorite_menu_items`, `recommendation_sessions`, `recommendation_feedback`. Tables with parent-derived ownership use their existing parent relation in the new restrictive read/write check. Existing restrictive tenant/profile/block predicates remain intact. Exact public core RPC signatures are frozen from the applied predecessor catalogue into the eligibility migration; historical migrations are untouched.

### Preparation / enforcement and validation boundary

Preparation compatibility is distinguishable from onboarding completion and training eligibility. Sole active owners captured by the migration may retain accepted baseline core/Social behavior while rollout is inactive, without any new acceptance or adult inference. A new incomplete account is denied. Enforcing rollout requires a separately authorized complete approved-publication bundle and legal/operator acceptance; unavailable/invalid bundles fail closed. Isolated disposable test fixtures are the sole source of synthetic approvals, outside migrations/seeds/runtime. Draft 01–03 raw bytes stay unchanged. The MI-E-C1 placeholder source/no-active predicate stays frozen; no activation successor evidence is manufactured.

PC-2 manifest pins the exact delta and predecessor; record validates hashes without rewriting by default and has an explicit initial sealing operation only after final bytes. No self-hash or manifest/guard import cycle. Narrow predecessor seams recognize only this exact local implementation; independently reviewed Planner acceptance remains a later gate. Full differential compares failure identities in isolated baseline/candidate trees; NEW_REGRESSION must be zero before the one local commit.

### Exact predecessor core RPC freeze

- `add_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text)`
- `add_authenticated_restaurant_favorite(p_restaurant_id text)`
- `cancel_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamp with time zone)`
- `convert_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_conversion_idempotency_key uuid, p_expected_updated_at timestamp with time zone, p_confirmation_timestamp timestamp with time zone, p_actor_timezone text)`
- `create_authenticated_planned_meal_v2(p_create_client_request_id uuid, p_planned_for date, p_planned_timezone text, p_meal_type meal_type, p_display_name_snapshot text, p_planned_nutrition_snapshot jsonb, p_planned_local_time time without time zone, p_meal_category text, p_restaurant_name_snapshot text, p_note text, p_restaurant_id text, p_branch_id text, p_menu_item_id text)`
- `create_authenticated_recommendation_session(p_session_id uuid, p_source_surface text, p_model_version text)`
- `create_current_user_meal_record(p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_title text, p_note text, p_source meal_source_type, p_items jsonb)`
- `create_current_user_meal_record_v2(p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_client_request_id uuid, p_timezone text, p_title text, p_note text, p_source meal_source_type, p_items jsonb)`
- `end_authenticated_recommendation_session(p_session_id uuid)`
- `finalize_current_user_meal_identification_v1(p_client_request_id uuid, p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_finalization jsonb)`
- `finalize_current_user_meal_identification_v1_legacy_internal(p_client_request_id uuid, p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_finalization jsonb)`
- `persist_authenticated_daily_nutrition_summary(p_summary_date date, p_timezone text, p_calculation_version text, p_total_calories numeric, p_total_protein_g numeric, p_total_carbohydrates_g numeric, p_total_fat_g numeric, p_total_fiber_g numeric, p_meal_count integer, p_item_count integer, p_source_cutoff_at timestamp with time zone, p_recalculated_at timestamp with time zone)`
- `read_authenticated_allergy_settings_v1()`
- `read_authenticated_ingredient_avoidance_settings_v1()`
- `record_authenticated_recommendation_feedback_event(p_session_id uuid, p_action text, p_target_kind text, p_event_idempotency_key text, p_recommendation_id text, p_restaurant_id text, p_branch_id text, p_menu_item_id text)`
- `remove_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text)`
- `remove_authenticated_planned_meal(p_planned_meal_id uuid)`
- `remove_authenticated_restaurant_favorite(p_restaurant_id text)`
- `replace_authenticated_allergy_settings_v1(p_source_value_keys text[])`
- `replace_authenticated_ingredient_avoidance_settings_v1(p_source_value_keys text[])`
- `replace_authenticated_social_interest_settings(p_general_tag_keys text[], p_food_tag_keys text[])`
- `replace_authenticated_social_interests(p_namespace text, p_tag_keys text[])`
- `save_authenticated_menu_item_rating(p_restaurant_id text, p_menu_item_id text, p_private_rating numeric, p_branch_id text, p_meal_record_item_id uuid, p_finished boolean, p_dislike_reasons text[], p_taste_feeling text, p_portion_feeling text, p_price_feeling text, p_repurchase_intent text)`
- `save_authenticated_planned_meal(p_planned_for date, p_meal_type text, p_display_name_snapshot text, p_note text, p_restaurant_id text, p_branch_id text, p_menu_item_id text, p_planned_nutrition_snapshot jsonb)`
- `save_authenticated_restaurant_rating(p_restaurant_id text, p_private_rating numeric, p_meal_record_id uuid, p_taste_feeling text, p_portion_feeling text, p_price_feeling text, p_repurchase_intent text)`
- `update_authenticated_planned_meal(p_planned_meal_id uuid, p_planned_for date, p_meal_type text, p_display_name_snapshot text, p_note text, p_restaurant_id text, p_branch_id text, p_menu_item_id text, p_planned_nutrition_snapshot jsonb, p_status text)`
- `update_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb)`

### Coverage refinement before final validation

Add restrictive `pc2_owned_card_core_access` SELECT policy on `public.meal_buddy_cards` for authenticated owners. This closes the direct owner-table read behind card list/cancel; participation recovery state stays readable independently. No card DTO/cap/retention change. Preserve existing Auth-user deletion foreign-key cascades by allowing the core DELETE trigger only when the owning Auth row has already been removed; direct core deletion still requires eligibility.

### Final validation refinements

Historical isolated guard fixtures may omit the PC-2 manifest: a narrowly caught missing-module case preserves only their original predecessor branch, never a PC-2 acceptance. Any malformed/present PC-2 module error still fails. The exact full PC-2 delta and payload hashes are required before any successor seam is used. Consent/age controls clear on actor changes and document changes; failed canonical rereads clear old eligibility. Differential execution is sequential within each isolated tree because historical mutation suites modify their disposable tree; no concurrent suite observes such temporary bytes. Baseline and candidate have the same existing dependencies, workspace-source resolution and bounded suite timeout.

### Exact recognition addition discovered during validation

Before changing the guard, add exactly `scripts/gqa6r-stable-demo-repair-guard.mjs` to the predecessor recognition inventory (now six paths; total 46). The already exact manifest seam includes the two PC-2 migrations in its composed product lineage, so the historical GQA-6R no-migration check must distinguish these exact successor files from the original repair. Exempt only the two exact PC-2 migration paths when the entire PC-2 inventory/content proof is valid. `supabase/config.toml` and all other migration paths remain forbidden. Original predecessor behavior remains unchanged when the exact proof is absent. No GQA-7 or other product work is authorized by this validation repair.

Preparation Social compatibility applies only while no age self-attestation is recorded. An explicit false declaration overrides this unknown-age compatibility, atomically pauses Social and blocks re-entry while core preparation access remains available. Explicit true is a separate adult declaration; neither creates new consent or training eligibility. Disposable PostgreSQL tests cover this exact distinction.

### Exact migration-tail recognition addition after full differential

The complete 296-suite isolated differential identified four new failure CHECK identities, all old migration-tail invariants. Before editing them, freeze exactly these four validation recognition paths:
- `scripts/restaurant-catalog-authoring-r2b-guard.mjs`
- `scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs`
- `scripts/admin-operational-read-permissions-ae1-guard.mjs`
- `scripts/admin-dashboard-social-policies-d-guard.mjs`

Recognition inventory is now ten paths; total implementation inventory is 50. Only set aside the two exact PC-2 migration filenames after the complete PC-2 path/content seal matches. Preserve every historical migration byte, all Restaurant/Admin product assertions and the original branch when PC-2 proof is absent. The inherited AE1 frozen-authority allow-list failure is not relaxed. Rerun the affected guards/mutations and the final isolated differential because these are demonstrated unresolved findings, not arbitrary new product work.

### Composed GQA-5 proof and disposable compiler residue

Before editing, add exactly `scripts/gqa5-restaurant-read-repair-manifest.mjs` to recognition (eleven paths; total 51). Its pure historical matcher stays unchanged. Only while complete PC-2 proof is exact, its collected migration list sets aside the two PC-2 files, preserving the original GQA-5 hash/blob/order/count proof. This is required because the four migration-tail guards compose that proof; editing their tails alone cannot preserve GQA-5 recognition.

Historical compiler tests generate untracked adjacent `.js` files in their disposable clone. Preserve each test's own result, then remove only paths newly created by that test before the next suite; do not allow compilation residue to masquerade as a future successor. Initial paths are protected, product repository is never used for the differential, and the final source delta must still match the exact sealed inventory. Earlier sweeps with residual source outputs are diagnostic, not final acceptance evidence.

### Exact session completion safeguard addition

Before editing, add exactly `apps/mobile/features/consumer-auth/sessionStateStore.ts` to product inventory (23 product paths; total 52). Existing restore/sign-in/signup/refresh/sign-out results may not replace a later observed actor/session state. Add only a session request generation guard; preserve ports/error codes and SDK observer authority. Bound initial runtime restore, profile loading and logout, so unavailable local/transport state cannot indefinitely block recovery. This fixes demonstrated asynchronous authority/pending seams in the authorized Consumer session architecture and adds focused actual-class tests.

### Final differential exact ADMIN-C migration-tail recognition

Before editing, add exactly `scripts/admin-operational-review-queues-c-guard.mjs` to recognition inventory (12 recognition paths; final total 53). The completed clean 296-suite differential shows two NEW failed checks in this guard, both caused solely by its latest-migration assertion. Keep all existing ADMIN-C/B1 adapter/page/SQL assertions and inherited failures unchanged. Only exclude the two exact PC-2 migration basenames from that historical tail assertion when the entire current PC-2 inventory and payload bytes are sealed and exact. Wrong bytes or an additional future path cannot enter this branch. No Admin product path is changed.

The final stable candidate requires another candidate sweep because the session completion safeguard and this demonstrated recognition finding changed candidate bytes. Reuse the completed clean baseline's 296 exact named results, with unchanged baseline HEAD/source, commands and test preloader; do not repeat completed baseline work. Earlier candidate sweeps remain diagnostic.

### Canonical final implementation inventory — 53 exact paths

The earlier lists retain their freeze history. This final manifest supersedes their counts and is the sole final commit inventory.

#### product — 23

- `apps/mobile/app/login.tsx`
- `apps/mobile/app/onboarding.tsx`
- `apps/mobile/app/consent-document.tsx`
- `apps/mobile/app/auth-callback.tsx`
- `apps/mobile/app/participation-settings.tsx`
- `apps/mobile/app/account-support.tsx`
- `apps/mobile/app/me.tsx`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts`
- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileMappers.ts`
- `apps/mobile/features/consumer-auth/sessionStateStore.ts`
- `apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts`
- `apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx`
- `apps/mobile/features/consumer-onboarding/types.ts`
- `apps/mobile/features/consumer-onboarding/controller.ts`
- `apps/mobile/features/consumer-onboarding/ConsumerOnboardingProvider.tsx`
- `apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx`
- `apps/mobile/features/consumer-onboarding/copy.ts`
- `apps/mobile/features/consumer-onboarding/authRedirect.ts`
- `supabase/functions/_shared/auth/authenticateCaller.ts`

#### migration — 2

- `supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql`
- `supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql`

#### docs — 7

- `docs/planning/pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md`
- `docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md`

#### validation — 9

- `scripts/pc2-consumer-onboarding-manifest.mjs`
- `scripts/pc2-consumer-onboarding-record.mjs`
- `scripts/pc2-consumer-onboarding-guard.mjs`
- `scripts/pc2-consumer-onboarding-smoke.mjs`
- `scripts/pc2-consumer-onboarding-postgres.mjs`
- `scripts/pc2-consumer-onboarding-fixtures.mjs`
- `scripts/pc2-consumer-onboarding-mutations.mjs`
- `scripts/pc2-consumer-onboarding-differential.mjs`
- `scripts/pc2-consumer-onboarding-validation.json`

#### recognition — 12

- `scripts/consumer-profile-phase-1d-guard.mjs`
- `scripts/consumer-auth-phase-1c-guard.mjs`
- `scripts/pc1-consumer-closure-manifest.mjs`
- `scripts/pc1-consumer-closure-guard.mjs`
- `scripts/gqa6r-stable-demo-repair-manifest.mjs`
- `scripts/gqa6r-stable-demo-repair-guard.mjs`
- `scripts/restaurant-catalog-authoring-r2b-guard.mjs`
- `scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs`
- `scripts/admin-operational-read-permissions-ae1-guard.mjs`
- `scripts/admin-dashboard-social-policies-d-guard.mjs`
- `scripts/admin-operational-review-queues-c-guard.mjs`
- `scripts/gqa5-restaurant-read-repair-manifest.mjs`

### Final validation inventory completeness correction

The initial differential task selector matched npm task names only and missed 183 local commands whose actual script filename is a guard/smoke/validator. Correct the already-inventoried differential runner to match both task names and commands, and include the unregistered PC1/GQA6R exact predecessor guards explicitly. Final coverage is 481 local named suites; 21 live/Development entries remain excluded, never counted as passes. Reuse the completed stable 296 baseline/candidate results and execute only the missing 185 pairs in isolated trees. Product, migration, guard and recognition bytes are unchanged by this validation-only correction. No dependency/package change or repeated completed suite is needed.

### Measured historical guard recognition expansion — exact 29 paths

The completed 481-suite extension exposed 29 historical guards whose original clean/frozen/old-UI/backend delta assertions reject this explicitly authorized PC-2 successor. Before editing, freeze these exact additional recognition paths (final 82 total: 23 product / 2 migrations / 7 docs / 9 validation / 41 recognition):

- `scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs`
- `scripts/consumer-favorites-phase-2x-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-c-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-c-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-d-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-d-b-guard.mjs`
- `scripts/consumer-ratings-phase-2w-a-guard.mjs`
- `scripts/consumer-ratings-phase-2w-b-guard.mjs`
- `scripts/consumer-ratings-phase-2w-c-guard.mjs`
- `scripts/consumer-ratings-phase-2w-e-guard.mjs`
- `scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs`
- `scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs`
- `scripts/consumer-runtime-mi-e-c5-r3-guard.mjs`
- `scripts/consumer-ux-u1-guard.mjs`
- `scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs`
- `scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs`
- `scripts/meal-identification-mi-c-a-guard.mjs`
- `scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs`
- `scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs`
- `scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs`
- `scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs`
- `scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs`
- `scripts/restaurant-owner-price-ra-2c-p1-guard.mjs`
- `scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs`
- `scripts/social-candidate-sr2d-guard.mjs`
- `scripts/social-candidate-sr2f-guard.mjs`
- `scripts/social-taste-sr1d-guard.mjs`
- `scripts/taste-foundation-ts2d-guard.mjs`

Preserve the complete original guard branch. Only after the COMPLETE exact PC-2 inventory/content seal AND current semantic PC-2 contracts pass, validate the untouched original historical guard against the fixed 30268 baseline in a disposable local snapshot, and label that result explicitly as predecessor evidence. The current successor behavior is validated by PC-2 client/database/security tests; no historical guard is presented as testing a changed modern implementation. Snapshot includes the actual baseline Git objects/refs/index and original source, with existing dependencies linked; no synthetic product commit or authority is created. Extra path/byte or missing proof disables this exact branch. No wildcard future acceptance, legal activation or independent Planner acceptance is implied.

Three additional apparent regressions are the same baseline ENOENT with different disposable clone absolute roots. Normalize ONLY the two known isolated root prefixes when comparing failure identity; keep the same missing relative migration and original raw logs. This is failure-identity normalization, not a pass. Run affected candidate checks again; reuse only verified unchanged completed results.

### Canonical final implementation inventory — 82 exact paths

This final manifest supersedes the 53-path list after measured historical recognition findings. Product implementation is unchanged.

#### product — 23

- `apps/mobile/app/login.tsx`
- `apps/mobile/app/onboarding.tsx`
- `apps/mobile/app/consent-document.tsx`
- `apps/mobile/app/auth-callback.tsx`
- `apps/mobile/app/participation-settings.tsx`
- `apps/mobile/app/account-support.tsx`
- `apps/mobile/app/me.tsx`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts`
- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileMappers.ts`
- `apps/mobile/features/consumer-auth/sessionStateStore.ts`
- `apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts`
- `apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx`
- `apps/mobile/features/consumer-onboarding/types.ts`
- `apps/mobile/features/consumer-onboarding/controller.ts`
- `apps/mobile/features/consumer-onboarding/ConsumerOnboardingProvider.tsx`
- `apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx`
- `apps/mobile/features/consumer-onboarding/copy.ts`
- `apps/mobile/features/consumer-onboarding/authRedirect.ts`
- `supabase/functions/_shared/auth/authenticateCaller.ts`

#### migration — 2

- `supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql`
- `supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql`

#### docs — 7

- `docs/planning/pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md`
- `docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md`

#### validation — 9

- `scripts/pc2-consumer-onboarding-manifest.mjs`
- `scripts/pc2-consumer-onboarding-record.mjs`
- `scripts/pc2-consumer-onboarding-guard.mjs`
- `scripts/pc2-consumer-onboarding-smoke.mjs`
- `scripts/pc2-consumer-onboarding-postgres.mjs`
- `scripts/pc2-consumer-onboarding-fixtures.mjs`
- `scripts/pc2-consumer-onboarding-mutations.mjs`
- `scripts/pc2-consumer-onboarding-differential.mjs`
- `scripts/pc2-consumer-onboarding-validation.json`

#### recognition — 41

- `scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs`
- `scripts/consumer-favorites-phase-2x-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-c-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-c-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-d-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-d-b-guard.mjs`
- `scripts/consumer-ratings-phase-2w-a-guard.mjs`
- `scripts/consumer-ratings-phase-2w-b-guard.mjs`
- `scripts/consumer-ratings-phase-2w-c-guard.mjs`
- `scripts/consumer-ratings-phase-2w-e-guard.mjs`
- `scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs`
- `scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs`
- `scripts/consumer-runtime-mi-e-c5-r3-guard.mjs`
- `scripts/consumer-ux-u1-guard.mjs`
- `scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs`
- `scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs`
- `scripts/meal-identification-mi-c-a-guard.mjs`
- `scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs`
- `scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs`
- `scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs`
- `scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs`
- `scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs`
- `scripts/restaurant-owner-price-ra-2c-p1-guard.mjs`
- `scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs`
- `scripts/social-candidate-sr2d-guard.mjs`
- `scripts/social-candidate-sr2f-guard.mjs`
- `scripts/social-taste-sr1d-guard.mjs`
- `scripts/taste-foundation-ts2d-guard.mjs`
- `scripts/consumer-profile-phase-1d-guard.mjs`
- `scripts/consumer-auth-phase-1c-guard.mjs`
- `scripts/pc1-consumer-closure-manifest.mjs`
- `scripts/pc1-consumer-closure-guard.mjs`
- `scripts/gqa6r-stable-demo-repair-manifest.mjs`
- `scripts/gqa6r-stable-demo-repair-guard.mjs`
- `scripts/restaurant-catalog-authoring-r2b-guard.mjs`
- `scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs`
- `scripts/admin-operational-read-permissions-ae1-guard.mjs`
- `scripts/admin-dashboard-social-policies-d-guard.mjs`
- `scripts/admin-operational-review-queues-c-guard.mjs`
- `scripts/gqa5-restaurant-read-repair-manifest.mjs`

### Live-alias classification correction

Three package tasks have `live-smoke` names but commands point at filenames without `live`: Consumer Phase 2K/2M/2O. Their isolated-clone outputs explicitly show opt-in disabled, no client/sign-in/network/DB/RPC action, and skipped status. Preserve those diagnostic flags, but do not count their exit 0 as a local test pass. Final selector checks BOTH name and command, with only an explicit inspected `--mock-contract` exception. Reclassify these three completed entries as excluded: final 478 local suites and 24 live/Development exclusions. This metadata-only correction does not require executing previously completed valid suites again, and authorizes no live operation.

### Final measured recognition extension: Phase 2X-E

Before editing: freeze one additional exact predecessor-recognition path, scripts/consumer-favorites-phase-2x-e-guard.mjs. The completed differential demonstrated its inherited “Phase 2X-D-B guard is unchanged” assertion is affected by the previously frozen exact successor prefix. Preserve its entire original body byte-for-byte and apply the same current-seal/contracts plus explicitly labelled fixed-baseline historical evidence branch. No Restaurant/Admin product or additional Consumer behavior change is included. Final inventory becomes 83 paths, with 42 recognition paths and 30 historical guards.

The other remaining finding is truncated historical JSON from the Phase 2Y-E child: wait for stdout/stderr write completion before process exit, preserving the original status and failed CHECK identities. Add a large-result delivery control. Reuse unchanged completed baseline/candidate pairs; rerun the two demonstrated affected candidate commands only. Three opt-in-disabled live aliases are excluded from the final 478 local suites and are never counted as successful live validation.

### Final exact inventory (83 paths; supersedes earlier inventory counts)

#### Product (23)

- `apps/mobile/app/login.tsx`
- `apps/mobile/app/onboarding.tsx`
- `apps/mobile/app/consent-document.tsx`
- `apps/mobile/app/auth-callback.tsx`
- `apps/mobile/app/participation-settings.tsx`
- `apps/mobile/app/account-support.tsx`
- `apps/mobile/app/me.tsx`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts`
- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileMappers.ts`
- `apps/mobile/features/consumer-auth/sessionStateStore.ts`
- `apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts`
- `apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx`
- `apps/mobile/features/consumer-onboarding/types.ts`
- `apps/mobile/features/consumer-onboarding/controller.ts`
- `apps/mobile/features/consumer-onboarding/ConsumerOnboardingProvider.tsx`
- `apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx`
- `apps/mobile/features/consumer-onboarding/copy.ts`
- `apps/mobile/features/consumer-onboarding/authRedirect.ts`
- `supabase/functions/_shared/auth/authenticateCaller.ts`

#### Additive migrations (2)

- `supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql`
- `supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql`

#### DRAFT preparation documents (7)

- `docs/planning/pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md`
- `docs/planning/pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md`
- `docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md`
- `docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md`

#### Validation (9)

- `scripts/pc2-consumer-onboarding-manifest.mjs`
- `scripts/pc2-consumer-onboarding-record.mjs`
- `scripts/pc2-consumer-onboarding-guard.mjs`
- `scripts/pc2-consumer-onboarding-smoke.mjs`
- `scripts/pc2-consumer-onboarding-postgres.mjs`
- `scripts/pc2-consumer-onboarding-fixtures.mjs`
- `scripts/pc2-consumer-onboarding-mutations.mjs`
- `scripts/pc2-consumer-onboarding-differential.mjs`
- `scripts/pc2-consumer-onboarding-validation.json`

#### Exact predecessor recognition (42)

- `scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs`
- `scripts/consumer-favorites-phase-2x-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-c-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-c-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-d-a-guard.mjs`
- `scripts/consumer-favorites-phase-2x-d-b-guard.mjs`
- `scripts/consumer-favorites-phase-2x-e-guard.mjs`
- `scripts/consumer-ratings-phase-2w-a-guard.mjs`
- `scripts/consumer-ratings-phase-2w-b-guard.mjs`
- `scripts/consumer-ratings-phase-2w-c-guard.mjs`
- `scripts/consumer-ratings-phase-2w-e-guard.mjs`
- `scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs`
- `scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs`
- `scripts/consumer-runtime-mi-e-c5-r3-guard.mjs`
- `scripts/consumer-ux-u1-guard.mjs`
- `scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs`
- `scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs`
- `scripts/meal-identification-mi-c-a-guard.mjs`
- `scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs`
- `scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs`
- `scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs`
- `scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs`
- `scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs`
- `scripts/restaurant-owner-price-ra-2c-p1-guard.mjs`
- `scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs`
- `scripts/social-candidate-sr2d-guard.mjs`
- `scripts/social-candidate-sr2f-guard.mjs`
- `scripts/social-taste-sr1d-guard.mjs`
- `scripts/taste-foundation-ts2d-guard.mjs`
- `scripts/consumer-profile-phase-1d-guard.mjs`
- `scripts/consumer-auth-phase-1c-guard.mjs`
- `scripts/pc1-consumer-closure-manifest.mjs`
- `scripts/pc1-consumer-closure-guard.mjs`
- `scripts/gqa6r-stable-demo-repair-manifest.mjs`
- `scripts/gqa6r-stable-demo-repair-guard.mjs`
- `scripts/restaurant-catalog-authoring-r2b-guard.mjs`
- `scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs`
- `scripts/admin-operational-read-permissions-ae1-guard.mjs`
- `scripts/admin-dashboard-social-policies-d-guard.mjs`
- `scripts/admin-operational-review-queues-c-guard.mjs`
- `scripts/gqa5-restaurant-read-repair-manifest.mjs`

### Final local validation evidence — 2026-10-01

Final inventory: 83 paths (23 product / 2 additive migrations / 7 DRAFT preparation documents / 9 validation / 42 exact recognition). Client smoke 58/58, fresh full 142-migration PostgreSQL 17 apply/security 95/95, meaningful mutations 18/18, contracts-only guard 25/25, root/mobile typechecks and mobile web export all passed (exit 0). Local Supabase CLI security advisors have the same four baseline WARN identities and zero new findings.

Final stable candidate differential: 478 local suites; baseline failures 235; candidate failures 235; exact failed-CHECK identity parity 235; NEW_REGRESSION = 0. The 24 live/Development suites are excluded by authorization, not counted as passes. Full named commands, failure identities and isolated fixture results are embedded in scripts/pc2-consumer-onboarding-validation.json. Baseline evidence is reused only from the unchanged clean required snapshot; earlier changing-candidate/compilation-residue sweeps are diagnostic.

This is local executor evidence, not independent Planner acceptance, legal publication approval or live signup closure. The three original DRAFT hashes remain unchanged; registry rollout is inactive and no approval/bundle/document content is seeded. Future activation blockers in 07 remain unresolved. The mandatory full exact guard/record are checked after final evidence sealing and again after the single authorized commit without rewriting bytes. No push, deployment, remote database action, PC-3, GQA-7 or Group Table work occurred.

## Validation integrity remediation — acceptance BLOCKED

Independent PC-2 acceptance was BLOCKED: 30 predecessor guards replayed baseline and exited before candidate assertions; GQA-6R missing-delta/deleted-file controls gained two failures; 33 differential failure groups had only UNREPORTED_FAILURE, so parity was unproven. Validation-only corrective gates are complete in the supplemental evidence; independent reacceptance remains pending. Original implementation evidence is historical and is not remediation acceptance. See 08_VALIDATION_INTEGRITY_REMEDIATION.md for the supplemental evidence. Legal drafts remain DRAFT / NOT ACTIVE. OD-15, TD-10/AU19 and P-7 remain open.

## Supplemental executor validation closure

Independent acceptance was BLOCKED for the three stated integrity defects. The exact 61-path correction restores actual candidate validation, GQA record/file-existence controls, and concrete failure-vector evidence. The verified complete inventory is 478 local / 24 excluded live or Development suites; the original 39 predecessor commands are a subset. NEW_REGRESSION = 0 with all failure vectors verified; inherited failures remain failures. Earlier 482 is unsupported and superseded. See 08 and its supplemental JSON/raw-output ZIP for full provenance, source bindings and reproducible evidence. This is READY_FOR_PC_2_REACCEPTANCE, not independent acceptance or legal activation. Legal drafts remain DRAFT / NOT ACTIVE; OD-15, TD-10/AU19 and P-7 remain open.
