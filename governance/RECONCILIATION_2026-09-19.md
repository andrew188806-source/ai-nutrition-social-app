# Canonical Reconciliation Record — 2026-09-19

**STATUS: CURRENT (audit record).** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT`. Baseline verified: `HEAD = origin/main = 8af3fb7d108c4124bb29ab115ea00b411287b00d`, ahead/behind 0/0, worktree clean at start. History reviewed 2026-09-05 → 2026-09-19 (76 commits). Technical registers live in `docs/engineering-state-registers.md`; this record covers the governance side and the reconciliation of decisions.

Source priority used: (1) repository behaviour; (2) the 2026-09-19 reconciliation brief; (3) current canonical governance/product documents; (4) historical documents. Where they differ, both are recorded.

## 1. Canonical status matrix

| Area | Status | Basis |
| --- | --- | --- |
| IP Codex / mascot / scale | `FROZEN`, pushed (commits `a93d901`, `27272e2`) | `docs/ip-codex-scale-system.md` |
| Restaurant operational surface (RA-2, R1, R2A–R2E) | `FROZEN`, closed, pushed (`05a584b`, `e292b0e`, `3e16941`, `42245b3`, `8af3fb7`) | `docs/restaurant-owner-catalog-authoring-r2b.md` |
| Admin Authority | `FROZEN`, closed, pushed (staff-authority stack, `bb03fa0` and predecessors) | `docs/engineering-handoff.md`, SOP |
| This reconciliation / modernization / handoff audit | Current | — |
| Admin non-authority operational functionality | **Next major implementation phase** | Registers §7 |
| Global QA / integration / handoff | After Admin | — |
| Group Table | `POST_MVP` | ODR-013 |
| Collectibles / ownership transfer / marketplace; TastKind points | `POST_MVP` | ODR-014…021 |
| Production | Never enabled | Registers TD-03 |
| Company metrics, pricing, financing | Unvalidated / `TBD` | Strategy doc §5, funding roadmap |

## 2. Decision reconciliation register

Classes: `FOUND_AND_CURRENT` · `FOUND_BUT_STALE` · `MISSING_FROM_CANONICAL_DOCS` · `CONFLICTS_WITH_EXISTING_DOC` · `IMPLEMENTATION_DIFFERS_FROM_INTENT`.

| ID | Item | Class | Resolution |
| --- | --- | --- | --- |
| D-01 | Restaurant catalog self-service framed as an *operating model* | `MISSING_FROM_CANONICAL_DOCS` (R2 docs recorded the capability, not the staffing rationale) | Recorded in ODR-003 and strategy doc §1. |
| D-02 | Engineering handoff heading "CATALOG AUTHORING — UI WIRED, DEVELOPMENT LIVE ACCEPTANCE PENDING" contradicting the R2D/R2E closure bullet below it | `FOUND_BUT_STALE` | Heading corrected. |
| D-03 | Engineering handoff line "8. Remove legacy i18n…" displaced into the Admin section | `FOUND_BUT_STALE` (defect) | Returned to its list. |
| D-04 | ODR-001 "implementation deferred / not started" | `FOUND_BUT_STALE` | Superseded by Admin Authority closure (ODR-001 note). |
| D-05 | Runtime roadmap "Current Phase — Phase 2V; N4/2V-F blocked"; post-2Z order Restaurant → Social → Admin → Production | `FOUND_BUT_STALE` / prior conflict AU18 | Actual history interleaved; sequencing now fixed by brief §9 (ODR sequencing). AU18 resolved by that decision. The frozen roadmap file is **not edited** (an earlier banner was reverted byte-for-byte in the closure patch); it is classified externally in `docs/DOCUMENT_STATUS_INDEX.md`. Phase *names* remain authoritative. |
| D-06 | Admin IA doc: 55 locations / 3 CURRENT permissions / Management and Break-glass not enabled | `FOUND_BUT_STALE` | Not edited (read by a frozen guard); classified in `docs/DOCUMENT_STATUS_INDEX.md`, registers TD-07. |
| D-07 | Founder package: the newer decision is 100 dishes, finite, no 美食趣報導; July docs say 15 (annual) / 100 (two-year), "吃到飽", 美食趣報導 included in v1/v1.2 | `CONFLICTS_WITH_EXISTING_DOC` → **RESOLVED** by the newer decision (ODR-025) | 100 dishes = `CURRENT_PRODUCT_DECISION`; the 15-dish package, the unlimited/吃到飽 wording and the 美食趣報導 benefit are `SUPERSEDED`; July documents kept as `HISTORICAL` evidence only, not edited. Source `.docx` files not edited. |
| D-08 | Restaurant pricing: three structures (≈1,980/3,980; ≈500 entry + transactions; 3xxx + attributed-transaction monetisation) | `CONFLICTS_WITH_EXISTING_DOC` | `PRICING_HYPOTHESIS_CONFLICT` PC-1; none merged. |
| D-09 | Roadmap/Alpha 10: Group Table as MVP-adjacent | `FOUND_BUT_STALE` | `POST_MVP` (ODR-013). |
| D-10 | Alpha 10 monetisation/finance/investor packs (pricing, budgets, KPIs) | `FOUND_BUT_STALE` | `HISTORICAL`; not evidence. |
| D-11 | Meal Buddy "context derived from selected meal, no manual taxonomy" vs code | `FOUND_AND_CURRENT` with a caveat | Recommendation-derived cards carry a food-context key via `20260821010000_meal_buddy_recommendation_context_handoff.sql`; a free-text manual card path with no context also exists. No taxonomy picker found by code search. Not classed as a difference, but recorded (R-12). |
| D-12 | v3.0.1 Master Handbook package states Admin/Restaurant as partial and counts 109 migrations | `FOUND_BUT_STALE` | See §5. |
| D-13 | Meal-photo real-image persistence needs product/legal approval (AU19) | `FOUND_AND_CURRENT` (still open) | Carried forward as `PRODUCT_DECISION_REQUIRED`. |

## 3. Recent chat-only decisions — reconciliation (RECENT_CHAT_ONLY_DECISION_REGISTER)

Each decision in the reconciliation brief was compared with the repository, the v3.0.1 governance package, Alpha 10 docs and the engineering handoff **before** editing.

| # | Brief § | Decision | Finding before edit | Now recorded in |
| --- | --- | --- | --- | --- |
| R-01 | 9 | Phase order / roadmap | `MISSING_FROM_CANONICAL_DOCS` (only conflicting runtime-roadmap order) | ODR sequencing; handoff |
| R-02 | 10 | Restaurant closure + self-service operating model | Capability `FOUND_AND_CURRENT`; operating-model rationale `MISSING_FROM_CANONICAL_DOCS`; one stale handoff heading | ODR-003; strategy §1; handoff |
| R-03 | 11 | `menu_items.name` tenant-local; Owner authority limits | `FOUND_AND_CURRENT` (R2 doc "Tenant-local canonical semantics") | ODR-004; registers §1.1 |
| R-04 | 12 | Draft lifecycle; nutrition not a visibility gate | `FOUND_AND_CURRENT` in R2 contract; not stated as intent | ODR-005; registers §1.1 |
| R-05 | 13 | Restaurant deferred scope | `FOUND_AND_CURRENT` in handoff (partly); classification as `DEFERRED` `MISSING` | ODR-006; registers §3 |
| R-06 | 14 | Cookie `Path=/`; R2E as successor repair, not feature | `FOUND_AND_CURRENT` (R2 doc, handoff) | registers §1.1 |
| R-07 | 15–16 | Admin Authority closed; non-blocking debt | `FOUND_AND_CURRENT` in handoff/SOP; `FOUND_BUT_STALE` in v3.0.1 ODR-001 | ODR-001/007; registers TD-08/09 |
| R-08 | 17 | Development migration-history drift, not repaired | `FOUND_AND_CURRENT` for Admin stack only; R2B–R2E extension `MISSING` | registers TD-01 |
| R-09 | 18–19 | IP Codex series-first; scale; demo data | `FOUND_AND_CURRENT` (`docs/ip-codex-scale-system.md`) | ODR-009/010 |
| R-10 | 20 | Consumer scope freeze + allowed algorithm adjustments | `MISSING_FROM_CANONICAL_DOCS` | ODR-011; handoff |
| R-11 | 21 | Social entry via Meal Buddy cards; derived context | Card-mediated ingress `FOUND_AND_CURRENT` (ODR-002); derived-context intent `MISSING` | ODR-012 |
| R-12 | 21 | (caveat) manual free-text card path exists | Verified by code search only | ODR-012 impl. note |
| R-13 | 22 | Group Table Post-MVP + inventory prerequisite | Post-MVP only in old docs; inventory requirement `MISSING` | ODR-013; registers DF-06 |
| R-14 | 23–27 | Collectible three-layer model, identification, Product Instance/QR, transfer | Only a one-line "out of scope" list in `docs/ip-codex-scale-system.md`; model `MISSING_FROM_CANONICAL_DOCS` | ODR-014…018; handoff |
| R-15 | 28–30 | TastKind points, redemption tracks, restaurant-points deferral | `MISSING_FROM_CANONICAL_DOCS` | ODR-019…021; strategy §2 |
| R-16 | 31 | Transaction attribution principle | `MISSING_FROM_CANONICAL_DOCS` | ODR-022 |
| R-17 | 32 | `POS_DIRECTION_DECISION_DEFERRED` | `MISSING_FROM_CANONICAL_DOCS` (only "Ordering/POS integration for future AB splitting" in legacy roadmap) | ODR-023; handoff |
| R-18 | 33 | Receipt-recognition direction | `MISSING_FROM_CANONICAL_DOCS` | ODR-024; handoff |
| R-19 | 34 | Founder package: 100 dishes, not unlimited; 美食趣報導 removed | `CONFLICTS_WITH_EXISTING_DOC` → resolved (newer decision authoritative) | ODR-025; strategy §3 |
| R-20 | 35–42 | Activation Code, refund boundary, BD attribution, Effective Store Count, Strategic Accounts, franchise/HQ, commission hypotheses | `MISSING_FROM_CANONICAL_DOCS`; **no implementation** (no schema; Admin BD routes `NOT_ENABLED`) | strategy §4 |
| R-21 | 43 | Pricing hypothesis conflict rule | `CONFLICTS_WITH_EXISTING_DOC` (three structures) | strategy §5 PC-1…4 |
| R-22 | 44 | Admin IA separation | `FOUND_AND_CURRENT` (Admin IA doc: semantic boundaries, Engineering workspace) | ODR-008 |
| R-23 | 47–51 | Funding roadmap; exclude founder-private material | `MISSING_FROM_CANONICAL_DOCS` (no route-level record) | `FUNDING_ROADMAP.md` |
| R-24 | 59 | No physical-device / tooling instructions in handoff | Applied | registers TD-05 states facts only |
| R-26 | closure patch | Brand/IP guardrail (licensed IP is never TastKind's identity) | `MISSING_FROM_CANONICAL_DOCS` | ODR-026; strategy §8 |
| R-27 | closure patch | Market-validation / traction integrity; validation in progress | `MISSING_FROM_CANONICAL_DOCS` | ODR-027; strategy §9; governance README |
| R-28 | closure patch | Chunghwa Telecom strategic framing (`PARTNERSHIP_OPTION`, not confirmed) | `MISSING_FROM_CANONICAL_DOCS` | ODR-028; strategy §10; funding roadmap |
| R-29 | closure patch | Consumer Premium pricing hypothesis kept separate from restaurant pricing | Present only in the off-repo July price doc | Strategy §5 PH-2 (`PRICING_HYPOTHESIS`·`UNVALIDATED`) |
| R-25 | 6, 7 | Handoff carries facts, not process | Applied | handoff/registers reviewed for process language |

## 4. Document gap register (DOCUMENT_GAP_REGISTER)

| ID | Gap | Note |
| --- | --- | --- |
| G-01 | No route-level funding research record | Funding roadmap gap analysis. |
| G-02 | Company legal entity, registration location/date, ownership, financials | `TBD — requires current business data`. |
| G-03 | Definition of "Effective Store" | Not in any source. |
| G-04 | Whether the 100-dish founder allocation applies to both packs | PC-3. |
| G-05 | Real IP product dimensions and physical product data | Data does not exist yet. |
| G-06 | Deployment configuration for restaurant-web and admin-web (hosts, env) | Not recorded in the repository; only the Expo Web demo on Vercel is described. |
| G-07 | Which environment holds what: no Production topology exists | TD-03. |
| G-08 | Admin IA prose doc vs executable registry | TD-07. |
| G-09 | Physical-device Push acceptance record | TD-05. |
| G-10 | Legal bundle text; photo-retention approval | TD-10. |
| G-11 | Group Table Inventory | ODR-013 prerequisite, not yet produced. |
| G-12 | The June external funding deck is only partly readable | Image-based PDF; text extraction partial. |

## 5. Governance-package (v3.0.1, snapshot `500c122`) — what is now stale

The v3.0.1 package is outside this repository and was write-protected in the reconciliation environment; it was **not edited**. Its `SOURCE_OF_TRUTH_INDEX` items S01–S48 were re-read; areas superseded by later commits:

| v3.0.1 item(s) | Now |
| --- | --- |
| S01 (HEAD `500c122`, 109 migrations, clean/0-0) | Superseded: HEAD `8af3fb7`, 133 migrations. |
| S02 (runtime roadmap; AU18 conflict) | Phase names valid; "current phase" and post-2Z order superseded; AU18 resolved by sequencing decision. |
| S03 (September handoff) | Historical; superseded by `docs/engineering-handoff.md`. |
| S34–S37 (Platform Admin foundation → sealed roles) | Superseded in extent: full staff-authority stack (P1–P6, P3A–P3K), Step-Up/AAL2, Break-glass, Platform Management UI, Security Log. AU05/AU17 outdated. |
| S38–S45 (Owner sold-out/price/visibility/name/temporal/phone/URL/About) | Extended by catalog authoring R2B–R2E and Restaurant closure; AU06 outdated. |
| S46 (configuration) | New env names (Admin broker/break-glass, restaurant cookies). |
| S47 (demo/remaining carousel) | Still valid as a boundary. |
| AU19 (photo retention approval) | Still open. |
| AU20 (remote deployment unverified) | Still unverified; TD-01 documents the Development history drift. |
| ODR-001 | Implemented (see register). |
| Master Handbook (ZH/EN), Grant Funding pack, Investor DD pack | Technical facts stale (109 migrations; Admin/Restaurant "partial"); must be refreshed before any external use. Their limitations statements remain valid. |

New superseded-claim entries (continuation of the v3.0.1 numbering, for future merge into its index): **AU24** ODR-001 deferred → implemented; **AU25** Restaurant "read-only/partial" → self-service authoring closed; **AU26** S01 counts/HEAD; **AU27** founder package (15/100 dishes, 吃到飽, 美食趣報導); **AU28** single restaurant price structure assumed; **AU29** AU18 resolved; **AU30** Group Table as MVP-adjacent → `POST_MVP`.

## 6. Product decisions required

| # | Decision | Blocks next Admin phase? |
| --- | --- | --- |
| P-1 | Restaurant pricing structure (PC-1, PC-2, PC-4) | **No.** Blocks commercial materials and any billing/BD-incentive design. |
| P-3 | Whether *recurring* paid plans keep dish-build/photography quotas once owner self-service exists (PC-2). Independent of the decided 100-dish founder allowance. | No. |
| P-4 | Meaning of "Effective Store" for BD thresholds (G-03) | No, unless BD is placed in scope. |
| P-5 | `BD_WORKSPACE_NEXT_PHASE_SCOPE_DECISION_REQUIRED` — whether the next Admin phase builds the `business-development` workspace (9 `NOT_ENABLED` routes; no schema). The company operating model can be documented regardless. | **No.** Non-blocking; would depend on P-1/P-4 if included. |
| P-6 | Disposition of the 22 legacy admin-web root routes (TD-06) | No; should be settled early because it affects IA. |
| P-7 | Consent/legal bundle and real photo-retention approval (TD-10) | No; blocks Production. |
| P-8 | Real geocoding provider (TD-11) | No. |
| P-9 | POS direction | No (deferred by decision). |
| P-10 | Company location/registration for funding routes | No. |

*Removed from this list: the founder-package dish allocation (former P-2) — resolved by the newer 100-dish decision (ODR-025).*

**Answer to "does any unresolved product decision block the next Admin phase?": no unresolved decision is a hard blocker.** P-5 is a scoping decision, and P-6 is a cleanliness decision.

## 7. Founder-private material

Excluded by instruction. Nothing in this directory records personal patent monetisation, personal technical-equity strategy, personal borrowing, founder personal financial structuring, or offshore-structure mechanics.

## 8. Closure patch (applied after the first reconciliation commit, before push)

1. Founder package: the 100-dish allocation is decided (ODR-025); 15-dish, 吃到飽 and 美食趣報導 are `SUPERSEDED`; removed from product decisions required. Recurring-plan dish-build quotas remain a separate open decision (P-3).
2. Added ODR-025…029 (founder package, brand/IP guardrail, traction integrity, Chunghwa Telecom, BD-workspace scope), Consumer Premium pricing separation, and the `PRIVATE_INTERNAL` / `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` classification with the vendor-export rule.
3. The frozen runtime roadmap banner was reverted; that file is byte-identical to `8af3fb7`.
4. Current Supabase Security Advisor state was captured in `docs/engineering-state-registers.md` §9 (technical layer). Result: no authority bypass; no `SECURITY_SUCCESSOR_REPAIR_REQUIRED`.
5. Scratchpad credential-like artifacts from completed rounds were deleted (outside the repository; contents never read or recorded).
