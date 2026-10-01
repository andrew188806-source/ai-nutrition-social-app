# PC-2-P0 — Profile, Onboarding and Social Contract

Status: **PC-2-P0R OWNER DECISION SYNC — CONTRACT ONLY — NOT IMPLEMENTED — NOT ACTIVE**
Baseline: `main` @ `30268ee4de59a8d8855c1dcaa01795d2f1ce33b1`
Labels: **[FACT]** confirmed in the repository · **[PROPOSED]** engineering contract for PC-2 · **[UNRESOLVED]** owner/legal decision (IDs match `07_OWNER_REVIEW_SHEET.md`).

---

## 1. Current state [FACT]

### 1.1 Profile schema — `public.consumer_profiles` (`20260712130200`)
- **Required columns without defaults:** `user_id` (FK `auth.users`, cascade), `profile_id text unique`, `display_name text` (check `length > 0`), `anonymous_display_name text`, `mascot_avatar_key text`.
- **Columns with defaults:**
  - `willing_to_chat false`;
  - `verification_status 'unverified'`;
  - **`visibility profile_visibility default 'public'`**, where the enum is `private | friends | public`;
  - `status consumer_profile_status default 'active'`;
  - `locale 'zh-TW'`, `timezone 'Asia/Taipei'`.
- `user_id` has **no unique constraint**. One-profile-per-user is not enforced by the schema today. Only `profile_id` is unique.
- `profile_id` is referenced by exactly one foreign key: `consumer_private_profiles.profile_id`.
  - No Social projection returns it; SR-2C explicitly withholds it.
  - The meal-finalization RPC treats it as a forbidden client key (`20260724020000`).
  - Fixtures use arbitrary strings such as `sr2gd_<label>`, and the mock uses `profileId = userId`. No code requires `profile_id = user_id`.
- `anonymous_display_name` has no uniqueness or format constraint. No Social projection exposes it.
- **Access:**
  - RLS: `consumer_profiles_owner_read` and `consumer_profiles_owner_update`.
  - Privileges: `authenticated` has **SELECT only** (`20260713030100`). There is no INSERT or UPDATE privilege, so the owner-update policy is unreachable.
  - `scripts/consumer-schema-phase-1-3-guard.mjs` fails if `authenticated` gains any write privilege on `consumer_profiles`.
- **There is no live generator** for `profile_id`, `anonymous_display_name` or `mascot_avatar_key`, and no `auth.users` trigger or provisioning RPC.

### 1.2 Client profile path
- `supabaseConsumerProfileRepository.ts`: `bootstrapProfile`, `updateProfile` and `markOnboardingComplete` return `ConsumerProfileWriteNotEnabledError` (Phase 1D).
- `supabaseProfileMappers.ts` sets `onboardingComplete: Boolean(row.onboarding_complete)`. **That column does not exist**, so every live profile maps to `false`.
- `consumerProfileBootstrapService.ts` checks lifecycle, then calls `getProfile(userId)`. The live repository rejects that read (requires `getCurrentProfile()`), so ensureProfile may exit there before reaching the disabled-write branch. Do not describe bootstrap as a currently working provisioner.

### 1.3 Auth path
- `SupabaseConsumerAuthAdapter.signUp` returns the session when one is issued. Otherwise it returns `ConsumerEmailConfirmationRequiredError`.
  - It passes `options.data = { displayName, locale, timezone }`, which Supabase stores as **`user_metadata`**.
  - It passes no `emailRedirectTo`.
- The client is created with `detectSessionInUrl: false` and `persistSession: true` (`supabaseConsumerClientFactory.ts`). The app scheme is `haocu` (`app.json`).
- `app/login.tsx` offers sign-in only. There is no create-account mode.
- `ConsumerRuntimeNavigationGate` (`features/consumer-runtime/ConsumerRuntimeProvider.tsx`) redirects signed-out users to `/login` and signed-in users on `/login` to `/`. It has no onboarding state.
- Whether the remote project requires email confirmation is **remote configuration and cannot be verified locally**. Both outcomes must be handled.

### 1.4 Social authority
- `public.social_participation` (`20260810020000`) has one row per participant with `state in ('opted_in','paused')`. **Absence means "not participating".**
  - Its four zero-argument SECURITY DEFINER RPCs (opt-in, pause, resume, opt-out) are actor-derived, idempotent under an advisory lock, and executable by `authenticated` only.
  - Opt-out **deletes** the row.
- **Candidate authorization** (`20260810030000`) requires both actor and candidate to have an active, undeleted profile and an `opted_in` participation row, and no block between them. The canonical candidate pool (`20260811010000`) and the Meal Buddy card pool (`20260817030000`) compose this primitive.
- **Public projection** (`20260811040000`, SR-2C) returns exactly **`display_name`, `mascot_avatar_key`, `public_bio`, `willing_to_chat`** for authorized candidates, at most 10 per exposure.
- **`consumer_profiles.visibility` is not read by any Social authority.**
  - The legacy view `consumer_public_profiles` has no grant to any client role.
  - `visibility` therefore does not gate discovery today. The canonical participation/profile/block authorization does; participation is not the sole predicate.
- **Card creation** (`20260817020000`) does **not** require participation. A non-participant's card is invisible, because the pool filters owners through candidate authorization.
- **No server-side writer** exists for `public_bio` or `willing_to_chat`. Only fixtures set them. For a newly provisioned profile they stay `null` and `false`.
- Relationships and chat (`20260823010000`, `20260823020000`) are not cascaded from participation. Opting out leaves existing relationships and messages in place.

### 1.5 Mascot vocabulary
- Machine keys are the `assetKey` values in the **repository-root** `lib/i18n/zh-TW.ts` → `mobile.communityCardSettings.mascots`: `PB`, `VG`, `FF`, `DH`, `BG`, `MD`, `LC`, `TE`.
- `resolveSocialCandidateMascot` (`features/social-candidates/mascotAdapter.ts`) maps a key to its mascot. An unknown key falls back to the first entry (`PB`).

---

## 2. Profile generation rules [PROPOSED]

All generation happens **in the server provisioning function**. Nothing is generated by the client or derived from Auth metadata.

| Field | Rule |
|---|---|
| `user_id` | `auth.uid()`. It is never a parameter. |
| `profile_id` | `pg_catalog.gen_random_uuid()::text`. Independent of `auth.uid()`, compatible with the `text unique` column and its one FK, and never exposed by Social. On the (theoretical) unique violation, retry once with a new value, then raise `PROFILE_ID_COLLISION`. |
| `anonymous_display_name` | `'飯友 '` followed by 6 characters from the unambiguous alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 symbols, 32⁶ = 1,073,741,824 combinations). The characters come from the bytes of a **fresh** `gen_random_uuid()`, never from the auth ID, email, name or phone. There is no uniqueness constraint and none is added: it is a label, not an identifier, so collisions are harmless. The UI must not claim it guarantees anonymity. |
| `display_name` | Optional input `p_display_name`, normalized as described below. If it is null or blank after normalization, the server uses `anonymous_display_name`. `user_metadata.displayName` is never used. |
| `mascot_avatar_key` | `'BG'` (均衡守護者). It is an existing key understood by the live UI. It is neutral, whereas `PB` implies a high-protein identity, and it is not premium-only. No new taxonomy is created. The label `均衡守護者` is never stored as the key. |
| `visibility` | `'private'`, **written explicitly** so the schema default of `'public'` is never relied on (Decision D). |
| `willing_to_chat` | `false`, written explicitly. |
| `public_bio` | `null`. |
| `status` | `'active'`. |
| `locale`, `timezone` | `'zh-TW'`, `'Asia/Taipei'`, written explicitly. No client-supplied value is accepted in PC-2. |

**`display_name` normalization.** No existing canonical rule exists beyond the `length > 0` check, so this is a new, minimal rule:
1. Trim the value (`btrim`) and collapse internal whitespace runs to one space.
2. Reject control characters.
3. After normalization, the length must be 1–20 characters.

Any violation raises `DISPLAY_NAME_INVALID`. Because `display_name` is what Social exposes after opt-in (§1.4), the onboarding UI must say so (§4.2).

**Provisioning semantics** (inside `complete_authenticated_consumer_account_onboarding`, one transaction):
1. Reject a null actor. Take the shared owner consent transaction lock used by onboarding/grant/withdraw, then the owner provisioning lock, in the fixed ordering required by `04_CONSENT_RECORD_CONTRACT.md` §5. A different lock per operation is forbidden.
2. After uniqueness/duplicate preconditions, if the sole profile row exists for the actor, **reuse it unchanged**. Duplicate rows raise a clear failure; never pick the first.
   - This covers partially provisioned and legacy accounts.
   - Existing `display_name`, mascot, visibility and chat values are **not** rewritten, so no destructive rewrite happens.
   - If the profile is not `active` or has `deleted_at` set, raise `ACCOUNT_NOT_ACTIVE`.
3. Otherwise insert the profile with the values above.
4. Validate presented bundle/document identity/version/locale/hash against the complete effective registry (`04_CONSENT_RECORD_CONTRACT.md` §4/§6). No stale or placeholder acceptance. Insert only missing canonical rows; preserve historical timestamps. Validation failure rolls back provisioning and all consents atomically.
5. Return the canonical onboarding state (§3.2).

The function never writes `social_participation`, `meal_buddy_cards` or any Social table.

**One profile per owner — Planner decision.** Add `UNIQUE(user_id)` in the later migration; no deterministic-first-row fallback. Repository evidence does not establish an intentional multi-profile model: live reads use `.maybeSingle()`, mocks are owner-keyed, private profiles already have owner uniqueness and Social refuses inactive duplicates.

- Migration must explicitly fail on duplicate owner rows before applying uniqueness; never delete, merge or secretly select a canonical row.
- Local isolated tests create duplicate attempts and prove rejection/no loss, idempotent reread, concurrent provisioning, immutable existing values and inactive-account refusal.
- Before any authorized Development remote apply, perform a read-only `user_id` duplicate inventory and report conflicts for separately authorized remediation. No remote inventory happens in P0R.
- The owner provisioning lock plus UNIQUE protects concurrency; a concurrent insert is reconciled to the sole existing row without rewriting it. UUID `profile_id` remains independent of owner ID, compatible with its existing private-profile FK.
- Affected callers: `supabaseConsumerProfileRepository.ts`, `consumerProfileBootstrapService.ts`, profile contracts/mappers, new onboarding authority, Social projections and profile-creating test/Development fixtures. Preserve the Social fail-closed duplicate semantics; constraints do not authorize rewriting frozen primitives.

**Private profiles.** PC-2 does not provision `consumer_private_profiles` merely to fill unused `terms_version/privacy_version`. Do not turn those columns into a second consent truth.

## 3. Account onboarding [PLANNER CONTRACT / POLICY CHOICE PENDING]

### 3.1 Derived completion

`account_onboarding_complete(owner)` requires the sole active undeleted profile and `current` acceptance of **all three** exact required documents in one complete effective approved bundle: Membership Terms, Privacy acknowledgment and the explicit training grant. **Owner selected Option B.** `core_service_eligible(owner)` derives from that predicate plus established account/session authorization, checked by canonical server state for protected services. No `onboarding_complete` DB column, permanent eligibility flag or local UI authority. Social age qualification and Social participation are excluded: under-18 general signup/onboarding is not blocked by the Social-only rule.

Repair the mapper's nonexistent-column read; use the canonical RPC for completion and retain the profile row for profile data. No metadata claims, local caches or legacy bundle rows establish consent authority. Exact status definitions are in `04_CONSENT_RECORD_CONTRACT.md` §7; no nonmaterial-equivalence shortcut.

### 3.2 Canonical states and precedence

Read owner rows without choosing one: duplicates yield `profile_conflict`; for the sole row, preserve established inactive/deleted-account refusal. Then evaluate full document availability, followed by profile existence and current consents. With documents and a sole active profile, classify every required document and return all reasons: any missing required acceptance => `consent_required`; otherwise any outdated required acceptance => `consent_update_required`; otherwise withdrawn exact-current training => `training_authorization_required`; otherwise `complete`. This deterministic aggregate priority never hides per-document reasons; training is required under the selected B policy.

| State | Meaning |
|---|---|
| `account_not_active` | Existing profile is inactive/deleted; unavailable documents do not bypass this lifecycle check. |
| `profile_conflict` | Multiple owner rows; fail closed and request authorized remediation, not selection. |
| `consent_documents_unavailable` | Missing/partial/not-yet-effective/unapproved/mismatched publication, client or registry state; not a completed consent state. |
| `profile_required` | Effective docs available, no profile. |
| `consent_required` | Sole active profile, missing required canonical acceptance. |
| `consent_update_required` | A required exact version is outdated; new acceptance required. |
| `training_authorization_required` | Exact-current training grant withdrawn; completion/core eligibility false. Owner-approved preserved rights/account-management paths remain accessible. |
| `complete` | Exact derived predicate holds. |

Server returns presented bundle metadata, required document identities/version/locale/raw hashes, training status, owner-only profile summary and a precise availability reason. It never returns another owner's rows or Social participation as account completion. Unknown/loading/error is never coerced to complete.

### 3.3 Option B core qualification and recovery [OWNER APPROVED PRODUCT DECISION]

| Behavior | Selected Option B contract |
|---|---|
| Controls | Three independent required **unchecked** controls; exact readable current documents; explicit notice 「若不同意，將無法使用本服務。」 |
| Refusal | No training grant, no completion or core use. Do not treat Auth account existence as eligibility. |
| Withdrawal | Shared canonical withdrawal commits preserved history and stops core qualification, including nutrition analysis, meal recommendation, encyclopedia and Social. |
| Preserved paths | Legal documents, sign-out, customer service, personal-data rights requests and account-deletion requests remain reachable; no core/training/Social-age prerequisite. Identity/owner checks for private requests still apply. |
| Re-grant | Recovery UI and actor-bound grant remain accessible without an existing current grant. Explicit current-version acceptance creates a new lifecycle after withdrawal; canonical reread resumes core only if all required state holds. |
| Social | Core qualification alone never joins or resumes Social; 18+ canonical qualification and separate explicit opt-in/current participation still required. |

Server enforcement must protect actual feature entry points, not just this screen or local navigation. A withdrawn/incomplete account cannot bypass via direct core RPC/Function/catalog requests; exact entry-point inventory is not yet frozen. Read/withdraw/grant/state recovery and rights APIs must not be accidentally wrapped by the core gate. Client invalidates request epochs and cached eligibility after changes, discarding late results; admission is a fresh server decision.

Option A is superseded, not selectable. Detailed training scope/retention/third-party policy and legal/final publication remain unresolved; B selection does not activate the placeholder or implement a training pipeline.

### 3.4 Before activation and legacy continuity

- If the app already knows approved documents are unavailable (including no active client mirror), signup UI shows 「帳號註冊尚未開放」 and makes no `signUp` call.
- An already-created incomplete account sees 「帳號設定等待正式文件啟用」, not complete, with sign-out/retry and no fabricated consent. Auth confirmation or session alone does not provision or enroll Social.
- A stale client may not know activation failed; the onboarding/grant authority still refuses missing/mismatched/not-effective documents and commits no writes. Do not claim the UI can forbid all external calls to the Auth signup API.
- Existing active legacy users retain established features and lifecycle checks while new documents are unavailable. Profile existence does not equal new-document acceptance. No local legacy flag becomes completion; no disabled account is admitted through this continuity rule.
- Only a **complete coherent effective activation and separately specified legacy rollout** begins B reconsent/enforcement. Freeze cohorts, notices, timing, explicit-current acceptance, refusal/withdrawal core denial and preserved rights/recovery routes. No default acceptance, one-row switch or silent mass lock; this phase does not alter existing accounts/runtime.
- Disposable fixtures test no-doc/partial/future/hash-mismatch states, the selected B deny/recovery contract and under-18 general onboarding. They never become a deployed registry, approved status or acceptance evidence.

### 3.5 Auth, presentation and reconciliation

1. Signup with immediate session: bind actor, read canonical state, present exact approved content and controls, submit exact presented bundle/version/locale/hash, reread, navigate only on complete.
2. Signup without session: check-email state; do not provision, record consent or mark completion. A no-session response is not proof of delivery; use 「請查看確認信；完成確認後回到這裡登入」 and safe resend/help behavior if supported.
3. After confirmation: sign in explicitly; `detectSessionInUrl:false` remains. No URL-token assumption. Remote redirect/email configuration and real confirmation flow must be checked in authorized Development live acceptance; PC-6 may broaden E2E evidence, but cannot substitute for claiming PC-2 signup live closure without evidence.
4. Partial/incomplete existing account: reread owner profile/state, reuse sole profile unchanged, show current exact documents; profile-only partial state from historical/out-of-band work is possible, but new atomic onboarding must not create a profile-only commit when consent validation fails.
5. Sign-out/actor switch clears presentation cache. Every request captures actor/session epoch; discard late state/completion from an earlier epoch. Document update mid-flow rejects stale submission and requires redisplay/reselection, never silently grants newer bytes.

Navigation excludes `/onboarding` and `/consent-document`, rights/customer-service/account-deletion access and consent recovery from core-service redirect loops; sign-out remains usable. Readable docs remain accessible signed-out; signed-in incomplete/withdrawn state may route to onboarding/recovery but must preserve these exits. Canonical core gate applies to features/server entry points; protected account requests retain owner authentication. Legacy unavailability continuity retains lifecycle checks pending its explicit rollout, not fabricated B acceptance.

Stop signup `options.data` as a source for provisioning; display name is normalized server-side, locale/timezone defaults are explicit. No authorization ever trusts `user_metadata`. Do not enable broad direct Supabase writes or create a second privileged client.

## 4. Social contract [VERIFIED SERVER FACTS / PROPOSED CLIENT WORK]

### 4.1 Canonical non-discovery boundary

- Signup/bootstrap alone does not join Social. `social_participation` absence means not participating, never opted_in.
- Both actor and candidate need `state='opted_in'`, active undeleted profiles, no inactive/deleted duplicate and no bidirectional block. `visibility='private'` is not privacy proof for this flow; it remains explicitly private in provisioning without being flipped by opt-in.
- `willing_to_chat=false` is not a profile invisibility switch. Never use it to bypass or substitute canonical participation.
- Existing four actor-derived RPCs suffice for **participation transitions**; use owner SELECT for participation reread. They are not evidence that newly required age/core qualification is enforced today. Later authorized integration must enforce canonical prerequisites server-side on activation and protected access, with exact paths/successor review; no architectural-preference orchestration RPC.

### 4.2 One disclosure across documents and opt-in

| Surface | Visible data |
|---|---|
| Base Social profile | `display_name`, `mascot_avatar_key`, `public_bio`, `willing_to_chat`, plus opaque person ref. |
| Meal Buddy list | Those fields, selected interest categories/overflow, user-published dining date/meal period/intention and restaurant name/ID, opaque candidate/card refs. |
| Meal Buddy detail | Those profile fields plus complete current selected general/food interest tags. |
| User-published card context | Dining date/period/intent/restaurant is an intentional publication, not a live device-coordinate disclosure; its retained valid card may be exposed again after rejoin. |

No direct Auth/user/profile ID, private diary records/photos/health settings or current device coordinates is returned through these public DTOs. Opaque refs are actor-scoped/expiring transport values, not anonymity guarantees or continuing authorization.

**Common proposed member disclosure (synchronize 01/02/07):**

「飯友只限年滿 18 歲並另外明確選擇加入的會員；訓練同意不代表加入或年齡已符合。加入後，其他符合飯友參與及存取條件的會員可能看到：基本個人檔案（顯示名稱、吉祥物頭像、自我介紹、是否願意聊天）；飯友推薦卡（選定的興趣分類、其他興趣數量、你自行發布的用餐日期、餐期、用餐意向和餐廳資訊）；詳細檔案（選定的完整一般興趣與飲食興趣標籤）。電子郵件、裝置目前座標、私人飲食紀錄、餐點照片與健康設定不會因此直接顯示。用餐卡餐廳資訊與装置座標不同。不願聊天不是完整隱藏開關。」

Show current name/mascot inline and links to approved Terms/Privacy. Joining is one explicit action with a secondary “not now”; no prechecked toggle, no server call when declining or merely viewing. Selecting interests alone never implies participation.

### 4.3 Retained records, fresh reads and stale displays

Pause/opt-out exclude fresh discovery and direct profile reads. Existing cards/relationships/messages are retained, but relationship reads and chat read/send also require current authorization. Resume/re-opt-in can expose still-valid retained cards and re-enable eligible existing relationships/chat; do not promise fresh-card creation is required or data was deleted.

References/source chain:

- `supabase/migrations/20260810030000_social_candidate_authorization_authority.sql` → `20260811010000_social_canonical_candidate_pool.sql` → `20260811040000_social_public_profile_projection.sql` / `20260818030000_social_public_interest_projection.sql`.
- `supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql`: retained cards must pass current authorization each fresh pool read.
- `supabase/functions/meal-buddy-candidate-profile/handler.ts` / `_shared/meal-buddy-candidate-profile-api/compose.ts`: verify actor-bound expiring ref, then recheck current pool; old ref does not bypass opt-out.
- `supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql` / `20260823020000_meal_buddy_chat_authority.sql`: retained is not readable/chat-enabled after pause or opt-out.
- Shared DTO and live renderers: `packages/shared/src/domain/meal-buddy-candidate/types.ts`, `apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx` / `useMealBuddyCandidateProfile.ts`.
- Legacy `apps/mobile/app/community-profile/[profileId].tsx` uses Demo-only mock resolver, not live evidence or an identified real-data bypass.

**Client work required:** after participation mutation/uncertain result, canonical reread; clear candidate list/detail/card refs and cache, invalidate request epoch, discard earlier late results. Refresh on relevant screen re-entry. Loading/unknown is not opted_in. Other devices may still show previously delivered bytes until refreshed; an earlier in-flight snapshot may finish. No promise of immediate remote erasure.

### 4.4 Transitions and known write-contract gap

| From | Action | Existing RPC | Result |
|---|---|---|---|
| no row | Join | `opt_in_authenticated_social_participation()` | Current RPC yields opted_in; future activation must additionally enforce canonical age/core prerequisites. Current state alone is not age evidence. |
| paused | Join again | same opt-in RPC | still paused; no implicit resume. |
| opted_in | Pause | `pause_authenticated_social_participation()` | paused, fresh reads gated. |
| paused | Resume | `resume_authenticated_social_participation()` | opted_in, original lifecycle timestamp retained. |
| opted_in/paused | Opt-out | `opt_out_authenticated_social_participation()` | participation row deleted; retained data not automatically removed. |

Proposed surfaces: existing `app/me.tsx` Social section and `app/meal-buddies.tsx` opt-in gate; social interests remain separate settings. UI uses canonical `loading | not_participating | opted_in | paused | unknown` with explicit refresh.

**Gap remains:** server card creation does not itself require participation. Its **exposure** is gated; a nonparticipant may have an unexposed card. UI card creation will sit behind explicit participation, but that is not a new server write gate. Assess later scope/authority before changing the frozen writer; P0R neither implements nor conceals it.

### 4.5 Social-only adult qualification [OWNER APPROVED PRODUCT DECISION / NOT IMPLEMENTED]

- Only Social/Meal Buddy is restricted to **18+**. Nutrition analysis, meal recommendation, encyclopedia and general account signup/onboarding have no 18+ prerequisite under this rule. Non-social minor terms/consent requirements are qualified legal-review matters, not a new all-service ban.
- `social_access_eligible(owner)` requires canonical core qualification, applicable actor-bound adult qualification and the action’s current canonical participation/profile/block conditions. Adult status never implies opt-in; training grant never implies adult status, participation or restaurant commercial photo permission.
- Later executor must select a minimal **canonical actor-bound qualification record**, its provenance/applicability and server enforcement/lock boundary. Derive actor from auth.uid(); reject supplied foreign owner, client-only flag or user_metadata. A self-declared 18+ attestation must be labelled self-declared, never “verified actual age.” Whether stronger verification is required remains a qualified policy/legal/implementation review item; do not collect DOB or identity documents by default here.
- Unknown/missing/inapplicable or not-qualified record cannot enable Social under the authorized future rule. Opt-in/resume must check adult/core eligibility on the server; fresh candidate/card/detail, relationships/chat and applicable Social writes must not bypass it. Candidate exposure must also have applicable candidate qualification/core state, not just the actor’s UI check. Preserve other current authorization predicates.
- Current card WRITE participation gap (§4.4) remains identified; new age/core requirements need an exact authorized server-scope assessment, not a claim the existing primitive already enforces them. No new authority, RPC, migration or gate is implemented by this document.
- Existing Social users require a separately frozen rollout: inventory evidence under authorization, classify unknown separately, notify, obtain actor-bound qualification and B reconsent where required, then apply the approved server boundary. **Do not default all existing users to adults**, silently manufacture qualification, auto-grant consent or rewrite/delete participation/history. Freeze transition timing and stale-card/ref/cache handling; current runtime remains unchanged in this phase.
- Re-granting training or passing adulthood does not automatically join/resume. Existing opted_in state may only authorize later access when all current qualification predicates hold; resume/re-opt-in remains an explicit existing transition as applicable. Rights/account-management recovery is outside the Social/core gate.

### 4.6 Nutrition service boundary [OWNER APPROVED PRODUCT DECISION]

Photo analysis estimates food type/amount/nutrition; it is not actual nutrient measurement, blood-glucose/blood-pressure measurement, diagnosis/treatment or a complete individual medical diet. For chronic disease/special physiological conditions the member copy directs users to their physician/dietitian’s actual instructions and gives those instructions priority when platform suggestions differ (`01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md` 第 5 條).

“Based on photos” describes photo analysis, not the whole platform: next-meal recommendation may use preferences/food records and other canonical inputs already disclosed in 02. No promise of precise measurement or blanket waiver, and no expansion of AI-training scope. Later UI copy must match this approved boundary; no nutritional algorithm changes now.

## 5. Later exact implementation surface and guard boundary

`06_MI_E_C1_SUCCESSOR_PLAN.md` §3 lists expected exact paths in four separate groups. It is a planning ledger, not a complete activation manifest; generated migration filename, bundle binding storage and differential-discovered predecessor changes remain executor freeze items.

Expected guard relationships, not assumed passes:

- MI-E-C1 baseline checks remain; approved activation needs exact successor recognition, not blanket permission.
- `consumer-profile-phase-1d-guard.mjs` and auth phase guards: measure baseline/candidate differential; do not edit to hide unrelated failures.
- `pc1-consumer-closure-manifest.mjs` records exact product hashes including meal-buddies; **not login**. `pc1-consumer-closure-guard.mjs` rejects login/auth changes via forbidden delta. New PC-2 work needs exact recognized successor where demonstrated, while preserving PC-1 recognition.
- Consumer schema guard keeps no broad authenticated profile writes; use actor-gated RPCs. Frozen Social primitives remain unchanged unless later new evidence/scope authorization says otherwise.

No feature implementation, migration, registry activation or guard edit is authorized by this document repair.

## 6. Policy and readiness still pending

Owner already approved Social-only 18+, Option B/core denial/preserved rights and nutrition service limitations. Remaining matters include non-social minor legal requirements, canonical age evidence/enforcement and existing-user rollout design, PC-16 retained-but-gated Social policy and other pending items in `07_OWNER_REVIEW_SHEET.md`; A/B and age scope are not questions again. Readiness labels and conditional sequence are in `06_MI_E_C1_SUCCESSOR_PLAN.md` §5. Local fixtures permit engineering progress; no real signup closure with inactive docs, and no Product Closure/Production inference from Development acceptance.

OD-15、TD-10/AU19 and P-7 remain open. Product decisions do not close governance, approve legal publication or authorize live activation.

## 7. PC-2 local implementation status — 2026-10-01 [NOT ACTIVATED]

The preparation-only wording above remains historical. The subsequent authorized implementation now has canonical owner-unique transactional profile provisioning, derived completion, configured PKCE confirmation callback, bounded/stale-safe client flows, required training withdrawal/re-grant and actor-only recovery routes. Canonical reread failure clears previous eligibility; actor or bundle changes clear the consent/age selections.

Age qualification is explicit server-timestamped 18+ self-attestation, never verified age and never a general onboarding age gate. Existing opt-in/pause/resume/opt-out RPCs retain their original state/idempotency rules with additive core/age boundaries. Qualification alone does not opt in. Withdrawal atomically pauses an opted-in row, retaining cards/relationships/chat; re-grant does not resume. Candidate authority gates both subjects and direct card creation gates current core/age/opted-in state. Direct owner card reads require core access. Exact server coverage, static-asset limitations and preparation cohort boundary are in 06 §7.

No Restaurant photo authorization, matching/quota algorithm, training pipeline, deletion workflow or Group Table was added. Real legal documents/rollout remain inactive. Existing-member legal notice, reconsent, age transition, retained Social policies and the governance conflicts still require their separate authority and acceptance.
