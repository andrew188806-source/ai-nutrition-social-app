# Company Strategy and Operating Model

**STATUS: CURRENT** — reconciled 2026-09-19, closure patch applied. **PRIVATE_INTERNAL · NOT_FOR_VENDOR_EXPORT_BY_DEFAULT** — company-internal; not part of the engineering handoff.

Everything in §3–§6 is an **operating / commercial policy input**. None of it is implemented, and none of it is an engineering invariant. Repository evidence at `8af3fb7`: no BD, prospect, contract, activation-code, commission, referral, subscription-plan or billing schema exists in `supabase/migrations`; the Admin `business-development` workspace (9 routes) is `NOT_ENABLED`; payment/checkout is a placeholder stub.

Sources: 2026-09-19 reconciliation brief (*brief*); `tastkind募資資料/Haocu 常規價格與募資早鳥方案完整版.docx` (file dated 2026-07-16, *July price doc*); `TastKind_募資計畫初版.docx` (2026-07-12, *fund plan v1*); `TastKind_完整產品介紹_給募資團隊_v1.2.docx` (2026-07, *intro v1.2*).

## 1. Restaurant operating model — `OPERATING_MODEL`, `CURRENT_PRODUCT_DECISION`

- Restaurants author their own catalog (Menu, Category, Item, Branch linkage) through the Owner console. Platform staff are **not** expected to construct each restaurant's catalog as the routine operating model.
- Reason: early-stage TastKind staffing must not scale linearly with restaurant catalog data-entry workload.
- Platform governance responsibility stays with the platform: nutrition verification/badges, cross-tenant administration, lifecycle interventions, audit. Restaurants own their own content.
- Restaurant creation and Owner provisioning are a separate onboarding/provisioning concern and are not yet built (deferred).
- **Open tension (a separate question from the founder allowance in §3):** the July price doc sells *recurring* paid plans that include TastKind-built dish entries and photography (Basic 3 dishes, Standard 12). Whether recurring paid plans keep dish-build quotas once owner self-service exists is not resolved by any current canonical source. → `PRODUCT_DECISION_REQUIRED` (non-blocking for the next Admin phase). Do not confuse it with the finite 100-dish founder/early-bird onboarding allowance, which **is** decided (§3).

## 2. Points, collectibles, transactions, POS — `POST_MVP` / `DEFERRED`

Held in `OWNER_PRODUCT_DECISION_REGISTER.md` ODR-014…ODR-024. Summary of the economic direction (all unimplemented):
- TastKind Points = platform-controlled ledger, separate from restaurant programmes; restaurant-specific points deferred until transaction/revenue-share control is mature.
- Restaurant monetisation on transactions only where TastKind brings and completes the transaction; no commission on unattributed spend.
- `POS_DIRECTION_DECISION_DEFERRED` — neither third-party POS integration nor a native POS is prioritised.
- Receipt recognition is catalog-first with OCR + AI as fallback and must be compatible with either POS direction.
- Do not build a half-complete parallel checkout workflow that duplicates operational burden for restaurants.

## 3. Founder / early-bird restaurant package — `CURRENT_PRODUCT_DECISION` (ODR-025)

**Decided (newer decision; authoritative):**
- The founder / early-bird **first catalog/photo onboarding allocation is 100 dishes**. It is finite: **not 15, not unlimited / 吃到飽**.
- The former benefit **美食趣報導** is **removed** and is not current package value.

**Superseded older material (kept as `HISTORICAL` evidence; the source files are not edited):**

| Older statement | Where | Status |
| --- | --- | --- |
| Annual founder pack (NT$39,800, 12 months): first-time onboarding of **15** dishes | July price doc (2026-07-16), fund plan v1 (2026-07-12), intro v1.2 | `SUPERSEDED` by the 100-dish allocation |
| Two-year founder pack (NT$69,800): first-time onboarding of 100 dishes | same | Consistent with, and subsumed by, the 100-dish decision |
| "首次菜品上架拍攝吃到飽" (all-you-can-eat) wording | July price doc | `SUPERSEDED` — the allocation is finite; do not reuse this wording |
| 美食趣報導 listed as included | fund plan v1, intro v1.2 | `SUPERSEDED` / removed |

Not decided by this entry: the *prices* of the founder packs and any recurring-plan quota (§1, PC-2). Prices remain `PRICING_HYPOTHESIS`.

## 4. BD / restaurant-acquisition operating model — `OPERATING_MODEL`, not implemented

Captured from the *brief*; none of these appeared in any repository or governance file before this reconciliation. Legal, employment and agency terms are **not** established by this document.

| ID | Rule | Class |
| --- | --- | --- |
| BM-01 **Activation Code** | A restaurant is commercially activated when the Activation Code is entered and confirmed. Activation should be attributable in the backend to the relevant acquisition/BD record, when such a system is eventually built. | `OPERATING_MODEL` (not implemented) |
| BM-02 **Refund boundary** | Before activation, refund may be allowed under applicable commercial terms. After valid activation, default is no refund unless a defined exception applies. | `OPERATING_MODEL` / commercial policy input (not enforced anywhere) |
| BM-03 **Attribution** | Performance attribution must not double count. Where several BD participants share one restaurant/account, their allocation for that attributable transaction/account totals **100%** — no duplicated 100% per participant. | `OPERATING_MODEL` |
| BM-04 **Effective Store Count** | Threshold incentives are discussed at **5, 8 and 10 stores**, measured by *Effective Store Count*, not raw account count. **The definition of "effective" is not recorded in any available source and is not invented here.** | `OPERATING_MODEL`; definition → `PRODUCT_DECISION_REQUIRED` |
| BM-05 **Strategic Accounts** | A separate operating category; they do not automatically use the same attribution/incentive mechanics as ordinary restaurant acquisition. | `OPERATING_MODEL` |
| BM-06 **Franchise / headquarters consolidation** | If a franchise restaurant later moves under a headquarters-level arrangement, remaining prepaid value may need migration/refund treatment per that arrangement. Already validly paid BD commission is not automatically clawed back by the migration. | `OPERATING_MODEL` (policy context, not immutable accounting/legal logic) |
| BM-07 **Commission hypotheses** | Long-contract incentive concepts under discussion: 6-month agreement ≈ one month of subscription value; 2-year agreement ≈ 2.5 months of subscription value. | `CURRENT_OPERATING_HYPOTHESIS` — not a binding term |

Engineering implication (product only): the Admin `business-development` registry routes (prospects, pipeline, contacts, contracts, renewals, follow-ups, assignments, history) exist as `NOT_ENABLED` placeholders; nothing here should be read as scope for the next Admin phase unless the Planner adds it.

## 5. Pricing hypotheses — all `PRICING_HYPOTHESIS`, none validated

**Pricing is not yet market-validated.** No willingness-to-pay measurement, paid pilot or transaction evidence exists in any source (KPI K14–K16 in the funding source pack remain `TBD`).

| ID | Source | Structure | Status |
| --- | --- | --- | --- |
| PH-1 | July price doc (2026-07-16) | **Restaurant subscription tiers.** Basic NT$1,980/month (3 dishes built + photographed, AI nutrition estimate for 3, badges, basic exposure, no long-term discount, no social post, excluded from early-bird). Standard NT$3,980/month (12 dishes, 8 with photography; extra shots NT$100 each for dishes 9–12). Standard terms: quarterly NT$11,940; half-year NT$22,680 (9.5×); annual NT$42,980 (9× + one official social post). Add-ons: NT$200/dish without photography, NT$350/dish with photography (photography arranged for 3+ dishes). | `PRICING_HYPOTHESIS` |
| PH-2 | July price doc | **Consumer Premium (kept separate from every restaurant structure below).** Monthly ≈ NT$399; longer terms lower the effective monthly rate — quarterly NT$990 (≈330/month), half-year NT$1,740 (≈290/month), annual NT$3,000 (≈250/month); 14-day free Premium trial for new users after launch; no discounted "pilot-quarter" price. No newer canonical document supersedes these figures; they are a working hypothesis. | `PRICING_HYPOTHESIS` · `UNVALIDATED` |
| PH-3 | July price doc | **Crowdfunding / early-bird tiers.** Consumer NT$890 / NT$1,680 / NT$2,980; restaurant Standard annual NT$39,800 and two-year NT$69,800. Internal challenge estimate: 700 + 800 + 400 consumer backers and 25 + 25 restaurants = NT$5,899,000 gross (≈NT$5,427,000 after an assumed 8% platform/payment deduction). Estimate volumes are targets, not evidence. | `PRICING_HYPOTHESIS` (planning target) |
| PH-4 | *brief* | A low monthly entry tier around **NT$500** with heavier transaction economics. | `PRICING_HYPOTHESIS` |
| PH-5 | *brief* | A **NT$3xxx** higher monthly tier where TastKind mainly monetises TastKind-attributed transactions. | `PRICING_HYPOTHESIS` |

### PRICING_HYPOTHESIS_CONFLICT register (restaurant structures)

| ID | Conflict | Why it cannot be resolved from evidence | Disposition |
| --- | --- | --- | --- |
| PC-1 | PH-1 (subscription ≈ NT$1,980 / NT$3,980 with dish-build inclusions) vs. PH-4 (≈ NT$500 entry + heavier transaction economics) vs. PH-5 (NT$3xxx + attributed-transaction monetisation) describe three different restaurant revenue structures. | No source states which is current; no transaction path (ODR-022/023) exists to support PH-4/PH-5. | `PRICING_HYPOTHESIS_CONFLICT` → `PRODUCT_DECISION_REQUIRED`. **Do not merge into a single fictional price list.** |
| PC-2 | PH-1's *recurring* dish-build/photography inclusions (Basic 3, Standard 12) vs. the ODR-003 self-service model. Independent of the founder allowance. | See §1 tension. | `PRODUCT_DECISION_REQUIRED` |
| PC-3 | Founder pack dish counts (15 vs 100). | Resolved by the newer decision (§3, ODR-025). | **RESOLVED** — 100 dishes is current; 15 is `SUPERSEDED`. |
| PC-4 | Commission concepts (BM-07) are expressed in "subscription value"; that value is undefined while PC-1 is open. | Depends on PC-1. | `PRODUCT_DECISION_REQUIRED` |

None of these blocks the next Admin non-authority phase; they affect commercial materials and any future billing design.

## 6. Cautions inherited from product documents

- The in-platform "營養認證徽章" must not be presented as a government, medical or third-party laboratory certification (intro v1.2 §4.3). The naming was flagged for re-confirmation before public use.
- No promise of fixed ranking, exposure, footfall or revenue to restaurants; AI nutrition estimates are estimates, not diagnosis, precision measurement or weight-loss guarantees.
- Before public sale, a single Free-vs-Premium comparison table must reconcile the pricing document, the app and the crowdfunding page (intro v1.2 §3.7).
- The June 2026 external funding-strategy deck (`餐飲APP募資策略架構.pdf`) describes agent/dealer-tier "co-investment" price tiers with transferable orders and resale ("炒貨"). It is `HISTORICAL`, **not adopted**, and its investment-like language warrants legal review before any reuse (text extracted only in part; the deck is largely image-based).

## 7. Consumer / product strategy summary

- Consumer main scope frozen (ODR-011); IP codex is series-first (ODR-009); social entry is Meal Buddy-card-mediated (ODR-002/012).
- Post-MVP order: Group Table → collectibles / ownership transfer / marketplace + TastKind points economics (ODR-013…ODR-021).

## 8. Brand / IP guardrail — `CURRENT_PRODUCT_DECISION` · `BRAND_GUARDRAIL` (ODR-026)

TastKind stays fundamentally the food / nutrition + social dining + collectibles product ecosystem. A licensed external IP must **not** become the identity of TastKind itself. Any licensed IP (for example a Teletubbies-type collaboration, or any future licence) is modelled as a **Collection, Season, Collaboration, Series or equivalent content layer**, never as the product identity. Purpose: keep the platform from depending on one licensed IP. Licensing terms and speculation are out of scope here; the engineering layer is affected only through the existing IP → Series → Series Entry codex model, which already separates catalog layers from product identity.

## 9. Market-validation and traction integrity — `CURRENT_STRATEGY` · DD / INVESTOR DISCLOSURE GUARDRAIL (ODR-027)

- **Status: `MARKET_VALIDATION_IN_PROGRESS`.** Questionnaire/survey work began in September 2026; fuller validation data is expected later, around October-stage fundraising preparation. No results exist in any repository or governance file.
- **Rule for all external communication** (investors, DD packs, grant applications, crowdfunding pages, partners): do **not** fabricate traction. Do not describe users, restaurants, conversion, retention, survey results or market validation as *proven* unless real supporting evidence exists and is cited. Until then use factual wording such as `MARKET_VALIDATION_IN_PROGRESS`.
- Existing source packs already follow this (KPI targets/results and company/commercial metrics are `TBD — requires current business data`; PoC and roadmap items are drafts). New material must preserve that discipline.

## 10. Strategic partnership option — Chunghwa Telecom — `CURRENT_STRATEGY` · `PARTNERSHIP_OPTION` · `NOT_CONFIRMED_TRACTION` (ODR-028)

The Chunghwa Telecom competition/programme is **not** modelled only as competition prize money. Its strategic value may include: a PoC opportunity; strategic partnership; channel and resource matching; platform/cloud/telecom collaboration; business development; accelerator/ecosystem access; and a potential strategic-investment relationship. **Nothing is secured.** No partnership, PoC, channel, investment or award may be described as confirmed, and it counts as traction only when real evidence exists (see §9).
