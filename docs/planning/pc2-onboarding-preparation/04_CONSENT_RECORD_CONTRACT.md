# PC-2-P0 — Consent Record Contract

Status: **PC-2-P0R OWNER DECISION SYNC — CONTRACT ONLY — NOT IMPLEMENTED — NOT ACTIVE**
Baseline: `main` @ `30268ee4de59a8d8855c1dcaa01795d2f1ce33b1`
Scope: this document proposes how the later PC-2 implementation should record account consent and the AI-training grant. It creates no migration, changes no registry and activates no bundle.

Every section is labelled as one of:
- **[FACT]** — confirmed from the repository at the baseline commit;
- **[PROPOSED]** — the engineering contract recommended for PC-2;
- **[UNRESOLVED]** — needs an owner or legal decision (IDs match `07_OWNER_REVIEW_SHEET.md`).

---

## 1. Current state [FACT]

### 1.1 Table `public.consumer_data_consents`
Source: `supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql`

| Column | Definition |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` |
| `consent_type` | `text not null` — free text, **no check constraint, no enum** |
| `policy_version` | `text not null` — free text |
| `accepted_at` | `timestamptz not null default now()` |
| `withdrawn_at` | `timestamptz` (nullable) |
| `source_surface` | `text` (nullable) |
| `locale` | `text not null default 'zh-TW'` |
| `created_at` | `timestamptz not null default now()` |
| constraint | `consumer_data_consents_unique_version unique (user_id, consent_type, policy_version)` |

- Index: `consumer_data_consents_user_idx (user_id)` (`20260712131200`).
- RLS enabled. Its only policy is `consumer_data_consents_owner_read … for select using (auth.uid() = user_id)` (`20260712131400`).
- The repository has no explicit `authenticated`/`anon` table grant or product consent transport. RLS alone does not establish Data API privilege; remote ACL/default privileges were not inspected. No product insert, update or delete path exists.
- **No product code, Edge Function or migration writes this table.** The only references are the migrations above, `scripts/consumer-schema-phase-1-3-guard.mjs`, `scripts/validate-consumer-schema.mjs` and the shared registry. This is a repository fact only: rows created out of band in a remote database were not inspected, because remote reads are not authorized.

### 1.2 Shared registry
Source: `packages/shared/src/domain/consumer-consent/types.ts` (re-exported by `apps/mobile/features/consumer-auth/index.ts`)

- `CONSUMER_AI_TRAINING_CONSENT_TYPE = "ai_model_training_and_service_improvement"`.
- `CONSUMER_POLICY_BUNDLE_MANIFEST` has exactly one entry:
  - `bundleVersion: "membership-bundle-v1-development-placeholder"`, `status: "development_placeholder"`;
  - document IDs `membership-terms`, `privacy-policy`, `ai-training-terms`, each at version `v1-draft`;
  - all three content hashes `null`; `effectiveAt` and `retiredAt` `null`.
- The comment in the source treats `policy_version` as one bundle version covering all three documents. The PC-2-P0R Planner decision replaces that meaning only for **future canonical document rows** (§3); old records keep their original meaning.
- There is no Terms or Privacy `consent_type` constant.

### 1.3 Legacy columns that are not consent authority
`consumer_private_profiles.terms_version` and `.privacy_version` (`20260712130200`) are nullable text columns. Nothing writes them. **[PROPOSED]** They stay unused and are never read as consent evidence, so the database keeps one consent truth.

### 1.4 Frozen constraints on the registry
`scripts/meal-photo-analysis-mi-e-c1-guard.mjs` requires that the shared registry contain no `status: "active"`, that the placeholder hashes stay `null`, and that no single `contentSha256` field exists. The successor plan is in `06_MI_E_C1_SUCCESSOR_PLAN.md`.

---

## 2. Consent identifiers [PROPOSED]

| Semantic action | `consent_type` | Document ID | Withdrawable? |
|---|---|---|---|
| Accept the Membership Terms | `membership_terms_acceptance` | `membership-terms` | No grant-withdrawal operation. Ending use/account processing follows the owner/legal-approved termination policy; historical acceptance is not cleared. |
| Acknowledge reading the Privacy Policy | `privacy_policy_acknowledgment` | `privacy-policy` | No. An acknowledgment is a record of notice, not a grant. |
| Grant AI-model training and service-improvement use | `ai_model_training_and_service_improvement` | `ai-training-terms` | Yes (`withdrawn_at`). |

**Naming compatibility.**
- `consent_type` is free text, so all three strings fit without a schema change.
- The AI-training string is the existing canonical constant and is reused unchanged.
- The two new strings follow the same `snake_case` action style. No existing row, constant or guard uses them.
- The historical design document `docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/04_Data/014_PRIVACY_CONSENT_AUDIT_SCHEMA.md` lists a `data_training` type. It was never implemented. **It is not adopted.** The shared constant is the canonical authority for training.

**Privacy acknowledgment is not consent to processing.** The row records acknowledgment of this exact presented Privacy Policy version; it cannot prove the member actually read or understood it. It does not itself grant a processing legal basis; necessary-service processing and other lawful bases remain matters for legal review. Owner-selected Option B requires its own explicit training grant for core services. Social additionally needs adult qualification and explicit participation; restaurant use of photos as product images needs a separate commercial authorization, never inferred from either.

**Social consent is not recorded here.** Social participation stays in `public.social_participation`, created only by `public.opt_in_authenticated_social_participation()`. No consent row is written for Social, and no consent row implies Social.

---

## 3. Version encoding [PROPOSED]

For future **PC-2 canonical document rows only**, `policy_version` holds a per-document version reference. Unrelated types and legacy namespaces are unchanged:

```
doc:<document-id>@<document-version>
e.g. doc:membership-terms@v1
     doc:privacy-policy@v1
     doc:ai-training-terms@v1
```

Why this format:
- It fits the existing `text` column, so no new column is needed.
- It is **disjoint by construction** from the historical bundle namespace (`membership-bundle-…`). A future query can never mistake an old bundle row for a per-document acceptance, and vice versa (Planner preservation rule).
- The document ID inside the value must equal the document mapped to the row's `consent_type` (§2). The server rejects any mismatch.

**Bundles.** A bundle identifies an exact set of document versions (Planner bundle/document rule). In the proposal the bundle is a registry concept and is not stored per row. Each document keeps its own identity, version and hash, and a bundle version never replaces them.

---

## 4. Publication and server registry [PROPOSED — ENGINEERING CONTRACT]

### 4.1 One immutable document identity

- Identity is `(document_id, document_version, locale)`, mapped to exactly one consent type. Initial proposed IDs/versions remain `membership-terms@v1`, `privacy-policy@v1`, `ai-training-terms@v1`, locale `zh-TW`. Owner edits do not activate them; final version/path is frozen before executor work.
- Content is the exact clean publication artifact's UTF-8 bytes: LF, no BOM, no reviewer appendix, alternatives, placeholders, markers or self-hash. Its SHA-256 is a separate field, not inserted into its own content.
- Once approved/published, identity and bytes/hash are immutable. A correction requires a new version and approval; never edit historical bytes or relabel a member's old row.
- Approval evidence records who had owner/legal authority, when, which exact identity/hash/bytes were reviewed, and selected policy decisions. The hash proves integrity, not approval. No approval facts exist yet.
- Raw document bytes are the hashing scope; rendered HTML/React output is not byte-identical and is never hashed as if it were the Markdown file.

### 4.2 Exact active bundle

A bundle is the immutable tuple of the three document identities/hashes and their effective instant, with the **owner-approved Option B** required set: Membership Terms, Privacy acknowledgment and an explicit AI-training grant. The grant control is never prechecked. Refusal inserts no training row and does not complete onboarding or authorize core services. The training document remains readable without a grant.

Only one bundle may be **currently effective**. A scheduled successor is not yet accept-ready. A version can be historical/retired without losing its original meaning. No compatibility/equivalence mechanism is proposed: required account acceptance always uses the exact current approved version. Even a nonmaterial new version requires its own acceptance; remove the former `requires_reacceptance=false` shortcut.

Activation cannot be inferred from “at least one active document.” All three documents, exact bundle binding, required set, approval evidence, publication, client mirror and server registry must agree and be effective. Missing, partial, expired reference, mismatched hash/version/locale or client/server bundle mismatch yields `consent_documents_unavailable`, never completion or a substituted version.

### 4.3 Recommended private SQL allowlist

Server-known version applicability is necessary; a table is not the only possible implementation. Recommend private schema `consumer_internal`, relation `consent_document_versions`, because it can preserve queryable immutable history and enforce identity/bundle consistency. An immutable function can also return retained versions; claiming its history must exist only in migration text would be inaccurate.

Required records/invariants, **not executable schema SQL**:

- Document ID/version/locale, fixed consent type, raw content SHA-256, immutable publication identity, approval-record reference, effective instant and lifecycle metadata.
- Explicit bundle-to-document binding and required document set, shared with the TypeScript mirror. The exact storage of bundle binding is an executor design/path-freeze item; document rows alone must not allow mixed bundles.
- Unambiguous one effective bundle/version per document; historical versions remain available for audit, not for new acceptance. Retirement is lifecycle metadata and cannot change old content.
- Private schema never added to exposed schemas; revoke client/default execution and direct table privileges, actor-gated SECURITY DEFINER wrappers with fully qualified names and a pinned search path. No client role receives registry write authority. Remote effective grants must be verified during authorized acceptance.
- Only reviewed, authorized publication/activation operations add approved entries. No runtime registry editing API. Placeholder/test fixture rows never enter deployed registry or the production client mirror.

### 4.4 Readable client documents and acceptance binding

Choose one publication source: immutable clean Markdown artifacts at the exact legal paths in `06_MI_E_C1_SUCCESSOR_PLAN.md` §3, copied byte-for-byte into a generated **client document content module** during authorized activation. The module carries the exact UTF-8 source strings and metadata; it is not a second editable legal authority.

A proposed `apps/mobile/app/consent-document.tsx` viewer reads that bundled content and renders it. A signed-out user can read the approved published documents without access to private registry tables. An old/offline bundle may be readable as historical, but cannot authorize a new acceptance. The UI verifies raw source bytes against the approved mirror before display and labels identity/version/locale. Tests compare bundled raw text with canonical artifact bytes; do not compare transformed HTML with the Markdown hash.

Authenticated canonical onboarding state reports exact currently available bundle/document metadata. Acceptance inputs include the **presented bundle version and each presented document version/locale/hash**. These are evidence to validate, not client authority. The server fixes document/type mapping, derives owner/time/surface, checks exact approved applicability and rejects stale/mismatched submissions. A concurrent bundle update must be serialized with acceptance through a registry/bundle locking or snapshot contract; it cannot select a new version behind the member's back.

A deployment can temporarily have stale client content, but then new acceptance fails closed. Publication and registry activation require preflight parity and live acceptance; there is no claim that a database migration and a web rollout are automatically atomic. See `06_MI_E_C1_SUCCESSOR_PLAN.md` §2/§5.

### 4.5 Separated authorizations [OWNER PRODUCT DECISION]

Training authorization is not Social opt-in, Social age qualification or restaurant commercial photo permission. Social-only 18+ never becomes an account/consent prerequisite; under-18 owners can complete general onboarding when the exact three required consents and account conditions hold. Non-social minor terms/legal bases remain qualified-review matters, not a blanket prohibition.

Actor-bound canonical Social age qualification and server enforcement must be selected in the later implementation brief (`05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md` §4.5). No client-only flag or user_metadata authority; self-declaration is not verified actual age. Do not introduce an age field into consent rows or broaden approved training scope here.

## 5. Narrow training lifecycle and concurrency [PLANNER DECISION]

**Repository problem:** full `(user_id, consent_type, policy_version)` uniqueness prevents a second lifecycle for the same version after withdrawal. Clearing `withdrawn_at` would destroy the withdrawal history. No existing product consent reader/writer or consent `ON CONFLICT` caller was found; remote rows remain uninventoried.

Adopt lifecycle rows **only** for future canonical `ai_model_training_and_service_improvement` records in the exact `doc:ai-training-terms@<approved-version>` namespace. Do not prescribe migration SQL in this documentation task.

Required constraints:

1. Preserve the original identity uniqueness for every other consent type and every legacy/noncanonical namespace, including legacy training bundle rows.
2. Within new canonical training scope, at most one non-withdrawn row per `(owner, training type, document version)`; withdrawn historical lifecycles may coexist. Only the current effective exact version can be a newly granted, applicable authorization. Live older-version rows can remain history but are not eligible after a successor becomes effective.
3. Never permit callers to clear `withdrawn_at`, rewrite `accepted_at`, change owner/type/version, or rewrite an old grant into another version. Withdrawal sets its timestamp once; re-grant inserts a new row.
4. No blanket new type CHECK that blocks unrelated/unknown historical types. Fixed-type writers validate their own canonical scope; a future broader restriction needs inventory and authority of its own.
5. Withdrawal touches only the actor's new canonical training lifecycle rows. It withdraws all of that actor's non-withdrawn `doc:ai-training-terms@…` training lifecycles, including historical versions, preserving their acceptance identity. It never modifies legacy bundle rows or Terms/Privacy rows.

All future onboarding, grant and withdraw operations take the **same owner consent transaction lock**, not differently named per-operation locks. Profile provisioning additionally takes the owner provisioning lock in a fixed documented order. Bundle read/activation uses a fixed lock order with these operations, or an equivalent proven transactional version check. Active-row uniqueness is additional protection, not a substitute for serialization.

Repeated grant/onboarding returns the existing matching live row without changing timestamps. Concurrent grant/grant produces one current lifecycle; grant/withdraw and onboarding/withdraw serialize so the canonical reread reflects a definite order. A lost response is reconciled from server state, not retried into a fabricated acceptance. Partial-index conflict inference must match its actual scope; old `ON CONFLICT ON CONSTRAINT` names cannot be assumed to survive a constraint replacement.

Compare alternatives: a preserved identity plus append-only events would also work, but adds event storage and derivation without an existing caller requiring it. The narrow row approach is smaller given the present repository, conditional on the constraints and tests above.

## 6. Owner-derived read/write authority [PROPOSED]

Names are proposed exact executor paths/contracts, not functions created by P0R:

| Authority | Input / effect |
|---|---|
| `public.complete_authenticated_consumer_account_onboarding` | Normalized optional display name plus presented bundle/document metadata; validates all required acceptances, provisions/reuses the sole profile and inserts missing rows atomically. Option B requires an explicit training grant; no prechecked, inferred or refusal-created grant. Social age is not an onboarding input or completion condition. |
| `public.grant_authenticated_ai_training_consent` | Presented current training document/bundle metadata; creates/reuses its exact canonical lifecycle. |
| `public.withdraw_authenticated_ai_training_consent` | No owner/version input; applies §5 scope and rereads. |
| `public.get_authenticated_consumer_onboarding_state` | No owner input; returns canonical state, exact documents, consent status and owner profile summary. No writes. |

- `auth.uid()` derives owner; no client user/profile ID, role, eligibility or `user_metadata` authority.
- Server derives `accepted_at`, `withdrawn_at`, fixed surface and validated locale. In P0R proposed publication locale is `zh-TW`; unknown locale is rejected, not silently rewritten.
- Reject no actor, no complete effective bundle, unknown/retired/future/placeholder versions, wrong type/document/hash binding, stale presentation and inactive/deleted/duplicate owner profile.
- No direct consent-table client grant. Narrow definer authority is needed because clients have no profile/consent writes; it must enforce actor filters internally and have explicit execute revokes/grants. Merely marking SECURITY DEFINER is not evidence of safety.
- Validate document applicability before committing any profile/consent write. Failure rolls back the whole onboarding transaction. No Social table is written.

## 7. One status and eligibility model [PROPOSED]

For each fixed type and current effective exact document identity, status precedence is:

| Status | Rule |
|---|---|
| `current` | One matching canonical non-withdrawn lifecycle exists for the exact current ID/version/locale; training scope/use is covered by the approved document. |
| `withdrawn` | Training only: no current lifecycle; a lifecycle for the exact current identity has been withdrawn. Old withdrawn records do not override a current grant. |
| `outdated` | No current-version lifecycle, but canonical document rows exist for a historical version. Those rows do not satisfy current requirements or eligibility. |
| `missing` | No canonical row relevant to the document; legacy bundle records alone still mean missing. |

Unavailable/mismatched/not-yet-effective documents are an availability state, not a fake consent status. Account completion needs an active undeleted **sole** profile and `current` for all three Option B required types (Terms, Privacy and training). There is no nonexistent `onboarding_complete` column read or new completion boolean. Social participation is excluded.

When a successor takes effect, required acceptance becomes outdated until the member accepts exact new bytes. Old timestamps/versions remain unchanged. Training eligibility defaults to **only the exact current effective training version**, no implicit grandfathering/equivalence. A retired version's existence is insufficient. A training update therefore requires an explicit grant of the new version before further training use or core-service eligibility under Option B.

Future job eligibility at actual use time requires all of: exact current approved version/locale, non-withdrawn owner lifecycle, intended use within its approved scope, and valid applicability/effective-time policy. Querying a precomputed `eligible` flag or an old export is insufficient. Never store a permanent `training_eligible` boolean or training authority in meal-photo analysis.

Withdrawal prevents future use of **existing datasets** as well as new dataset creation. Jobs must revalidate before consuming data; pending snapshots/copies must be excluded or removed under PC-17. Ongoing-run cancellation/isolation and a last-moment withdrawal race need an explicit operational plan/test before any pipeline starts; this package creates none. Completed-model treatment is separately subject to owner/legal review: no guaranteed inversion, no universal impossibility assertion and no waiver of legal rights.

### 7.1 Core-service eligibility and preserved account access [OWNER APPROVED PRODUCT DECISION]

`account_onboarding_complete(owner) = sole active undeleted profile + current Terms + current Privacy + current explicit training grant`, resolved against one complete effective approved bundle. `core_service_eligible(owner)` derives from that same canonical server predicate plus established account/session authorization; neither is a permanent DB/local flag. **Social age and participation are excluded from both predicates.**

Refusal, an absent/withdrawn current training grant, outdated required consent or unavailable documents makes core eligibility false for the new Option B flow. Refusal writes no training grant. Withdrawal keeps historical acceptance/timestamps, sets the canonical training lifecycle withdrawn and makes completion/core eligibility false. Nutrition analysis, meal recommendation, encyclopedia and Social are core services. Every protected service entry point (reads, writes, RPCs/Functions and catalog access where used for core features) must enforce the canonical server state; a navigation/onboarding gate alone is insufficient. Exact enforcement paths and successor scope remain a later executor freeze item, not implemented here.

Regardless of denial/withdrawal, preserve viewing Terms/Privacy and other legal documents, sign-out, customer-service contact, personal-data rights requests and account-deletion requests. These routes and supporting APIs must not require core eligibility, current training or Social adulthood; appropriate identity/owner/lifecycle checks still apply to private account requests. State read, consent presentation and explicit re-grant/reconsent are recovery paths, not core services: do not require an existing training grant to grant it again. Formal contact/deletion operational details remain pending.

Re-grant requires the exact current presented approved bytes and an explicit unchecked control. Under the shared owner lock insert a new lifecycle after withdrawal, preserve history, then reread server state. Resume core services only if the full current predicate holds; no automatic Social opt-in/resume, no assumed adult qualification and no restaurant photo permission. Already-valid grants may be idempotently reused without timestamp rewrite. Clients clear core-eligibility caches and discard late in-flight results; server gates remain authoritative.

Future training-job eligibility (§7 above) remains a separate intended-use check: core qualification is not authority to use arbitrary data. Nutrition limitations describe estimates, not medical measurements, and do not enlarge training scope or waive legal rights.

Client caches are presentation only and actor/session scoped; canonical rereads replace them. A stale completion after sign-out, actor change or relevant state transition is discarded.

## 8. Legacy rows, deletion and evidence [PRESERVED / POLICY PENDING]

- No product bundle-based consent writer was found. Any remote records require an authorized read-only inventory; do not infer how they were created solely from repository absence.
- Non-`doc:` namespaces, including the development placeholder bundle, retain original meaning, identity uniqueness and timestamps. They are never reinterpreted as acceptance of new content, never confer current completion/eligibility, and are not modified by withdrawal.
- Before authorized Development apply: inventory consent types, policy versions, withdrawn/live row counts and applicable index/constraint state. Unknown rows are not silently coerced, dropped or merged.
- **Cascade conflict:** current owner FK is `auth.users(id) ON DELETE CASCADE`. Hard deletion therefore cannot presently guarantee consent evidence survival. PC-02/03 must choose retention/legal basis; if approved policy needs evidence after deletion, a separately authorized design must reconcile that FK/data minimization before any such promise or live deletion workflow. Do not invent an evidence store or retention period here.
- **Legacy rollout is explicit and not executed now:** inventory canonical/legacy state under later authorization; publish exact approved B documents and consequences, notify members, obtain explicit current grants, reject refusal without inventing acceptance and preserve rights/account-management access. No migration auto-grants legacy users or reinterprets old bundle rows.
- Existing runtime/lifecycle checks remain unchanged in this documentation phase and during the planned unavailable-documents continuity. A future authorized effective rollout must define cohort, transition timing, notices and server enforcement before applying B restrictions; no blanket lock of existing accounts from this document or from one registry row. The owner-approved future B core rule is not an exception allowing refusal after that rollout.

## 9. Later implementation and acceptance scope [PLAN ONLY]

A later generated migration would enforce profile owner uniqueness after duplicate precondition, private registry/bundle binding, scoped training lifecycle constraints and exact actor-derived authorities. No SQL or timestamped migration file is created by P0R. Exact migration path is frozen only after the CLI generates it; see `06_MI_E_C1_SUCCESSOR_PLAN.md` §3.

Mandatory local isolated tests: duplicate rejection without deletion/selection; concurrent/idempotent provisioning; unavailable/partial/mismatched/future bundle; fake/placeholder/stale/wrong-hash submission; atomic rollback; Option B required set, refusal/withdrawal core denial and preserved rights/re-grant access; exact-version update; immutable historical timestamps; withdrawal/re-grant; concurrent actions; legacy and unrelated-type uniqueness; no Social enrollment; no cross-owner access; mirror/publication parity.

Fixtures exist only inside disposable local tests, carry identifiable test-only content and never ship in migration or client active registry. Test the selected B contract and fail mutations that would allow core use under the superseded optional model. Include under-18 general onboarding and separately denied Social qualification; do not turn B selection into live legal approval. No remote DB write/read is performed in P0R. Owner approval, live registry, training/deletion/reporting/billing operations are not prerequisites for these local tests.

## 10. Readiness and unresolved matters

See `06_MI_E_C1_SUCCESSOR_PLAN.md` §5 for `IMPLEMENTATION_READY_FOR_LOCAL_ACCEPTANCE`, `DOCUMENTS_APPROVED_NOT_ACTIVATED`, `DEVELOPMENT_ACTIVATED_LIVE_ACCEPTED`, `PRODUCT_CLOSURE`. Local fixtures never close real signup. Conditional activation sequencing depends on when approval arrives; no extra activation commit is forced to dodge successor work.

Owner-approved products: Social-only 18+, Option B and its core denial/preserved rights consequences, nutrition-estimate/medical-service limitations. Still pending: OF-01–05, other PC policies (including detailed training scope/retention/third parties), non-social minor legal requirements, qualified legal review, clean publication bytes and D-01. See `07_OWNER_REVIEW_SHEET.md`. Engineering not left to owner: profile UNIQUE, exact-version default, narrow lifecycle constraints/shared lock, unavailable state, BG key, publication hash scope. Final path inventory/bundle storage/lock implementation must be frozen by the later executor before implementation, not guessed by the owner. OD-15, TD-10/AU19 and P-7 stay open; Development evidence does not settle their governance requirements.

## 11. PC-2 local implementation status — 2026-10-01 [NOT ACTIVATED]

The earlier PLAN ONLY statements describe P0R preparation, not this later authorized local implementation. Two CLI-generated additive migrations now implement the contract; exact paths, objects, authority coverage and locks are in 06 §7. Required training is explicit. Initial exact Terms/Privacy/training consent and unique active profile provisioning are one transaction. Canonical training re-grant creates a new lifecycle, preserves withdrawn history and never resumes Social. All consent writers share the owner lock; other historical type/version uniqueness remains intact.

Deployment SQL contains zero document/approval/bundle rows and inactive rollout only. Migration-time sole active owners are a server-controlled preparation cohort bound to their original profile ID and fixed baseline; compatibility is reported separately from completion, training and adulthood. New incomplete accounts cannot join it. Enforcing rollout requires an exact approved effective publication set and a separately authorized transition. No real draft was approved or activated. Training-job/data-use authority remains a documented future obligation, not a pipeline implemented here. The Auth-delete evidence cascade conflict and OD-15/TD-10/AU19/P-7 remain unresolved.

The machine-readable local validation record is `scripts/pc2-consumer-onboarding-validation.json`. Synthetic approvals exist only in disposable test fixtures. Independent Planner acceptance and later authorized Development/live acceptance remain separate gates.
