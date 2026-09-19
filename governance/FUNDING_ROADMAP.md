# TastKind Funding Roadmap

**STATUS: CURRENT — MEMORY / PLANNING / COMPANY-STRATEGY DOCUMENT.** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT`; not part of the engineering handoff. Created 2026-09-19.

This is **not legal advice, not financing approval, and not a statement of eligibility.** It preserves which financing routes have been considered, why they matter, what each depends on, and what should be checked next, so they are not forgotten. It is company-level only: founder-private financial, patent, borrowing or structuring material is intentionally excluded.

## How to read this document

- **Nothing in a "program facts" cell is a verified current fact.** Program names are given as recalled and may have changed or ended. Amounts, residency rules, age/company-age bands, application windows, matching-fund ratios, interest rates and eligibility criteria are **not stated** because no verified source exists locally. Every such item is `REVERIFY_BEFORE_APPLICATION`.
- `UNKNOWN` means no source in the repository or governance package supplies it. It is not filled with a guess.
- Items marked `ASSUMPTION` are logical considerations to check, not researched facts.
- "Source / last verified" for every route is: *reconciliation brief 2026-09-19 (route named as considered); no program document reviewed; last verified — never.*

## Route table

| ID | Route | Type | Current relevance |
| --- | --- | --- | --- |
| FR-01 | Central-government youth entrepreneurship / start-up loan routes (program family administered at national level, e.g. the small-and-medium and new-venture agency's youth start-up loan; name as recalled) | `LOAN` | Considered; suitable only if company/founder conditions are met (unknown). |
| FR-02 | Taipei City subsidy / youth-financing routes | `GRANT` / `LOAN` (mixed, unverified) | Considered; depends on company location. |
| FR-03 | New Taipei City subsidy / youth-financing routes | `GRANT` / `LOAN` (mixed, unverified) | Considered; depends on company location. |
| FR-04 | AI / R&D / digital-transformation grants where relevant (e.g. national small-business innovation research programmes and AI/digital-transformation subsidy programmes; names as recalled) | `GRANT` | Considered; product has an AI meal-analysis and recommendation component and a Development-accepted prototype. |
| FR-05 | Government / public start-up investment routes, e.g. National Development Fund and angel-style programmes (name as recalled) | `PUBLIC_INVESTMENT` | Considered where "already researched" — **no research record exists locally**. |
| FR-06 | Crowdfunding / preorder as **non-equity** market validation | `PREORDER` | Considered; local planning material exists (see FR-06 detail). |
| FR-07 | Later angel / VC equity financing | `EQUITY` | Later stage; no local material. |

## Route detail

Fields per route: eligibility assumptions · company-location dependency · founder-residency dependency (only if genuinely applicable) · application timing · capital / matching-fund requirement · repayment consequence · dilution consequence · known sequencing conflicts · next action · flag.

### FR-01 — Central youth entrepreneurship / start-up loan — `LOAN`
- **Eligibility assumptions (`ASSUMPTION`):** conditions typically concern founder age band, company registration status and age, and ownership/role of the applicant. Exact criteria: `UNKNOWN`.
- **Company-location dependency:** `UNKNOWN` (national programme; local handling may apply).
- **Founder-residency dependency:** `UNKNOWN`. Treat as possibly applicable; do not record personal detail here.
- **Timing:** `UNKNOWN` (may be rolling or windowed).
- **Capital / matching requirement:** `UNKNOWN`.
- **Repayment consequence:** it is a loan — repayment obligation and possible guarantee/collateral terms exist; specifics `UNKNOWN`.
- **Dilution:** none by nature.
- **Sequencing conflicts (`ASSUMPTION`):** possible interaction with company-registration date and other public funding received for the same purpose.
- **Next action:** obtain current programme rules from the administering agency; confirm company registration state (see gaps below).
- **Flag:** `REVERIFY_BEFORE_APPLICATION`

### FR-02 — Taipei City routes — `GRANT` / `LOAN`
- **Eligibility assumptions (`ASSUMPTION`):** typically depend on the company being registered in the city and on the project type. Details `UNKNOWN`.
- **Company-location dependency:** **likely material** (registered address/location). `UNKNOWN` in detail.
- **Founder-residency dependency:** `UNKNOWN`; check per programme.
- **Timing / capital / repayment / dilution:** `UNKNOWN`; a loan-interest-subsidy scheme would carry repayment, a subsidy would not (unverified).
- **Sequencing conflicts (`ASSUMPTION`):** city programmes may be mutually exclusive with New Taipei programmes because both depend on company location.
- **Next action:** decide the intended company location before evaluating city routes; then collect current city programme rules.
- **Flag:** `REVERIFY_BEFORE_APPLICATION`

### FR-03 — New Taipei City routes — `GRANT` / `LOAN`
Same structure and unknowns as FR-02. **Key dependency:** company location; FR-02 and FR-03 are effectively alternatives unless the company has presence in both (unverified).
- **Flag:** `REVERIFY_BEFORE_APPLICATION`

### FR-04 — AI / R&D / digital-transformation grants — `GRANT`
- **Eligibility assumptions (`ASSUMPTION`):** registered company, a defined R&D or transformation project, matching self-funded portion, reporting/expenditure-claim obligations. Exact terms `UNKNOWN`.
- **Reusable application material that already exists:** the Grant Funding Source Pack (ZH-TW, v3.0.1) — product introductions (100 / 300 / 500–800 characters and long form), pain-point/hypothesis table, innovation and AI-use statement, estimated TRL 4–5 range (internal estimate, not an agency ruling), a draft 90-day PoC framework, an 18-item KPI library (targets `TBD`), draft 12/18/24-month roadmap, budget-category candidates and a risk table. **Its technical facts are a snapshot at `500c122` (109 migrations, Restaurant/Admin "partial") and are stale** — Restaurant catalog authoring, Admin Authority, IP Codex and 133 migrations postdate it. Refresh the technical claims before any use.
- **Company-location dependency:** `UNKNOWN` (some schemes are city-run).
- **Capital / matching:** `ASSUMPTION` — a self-funded share is commonly required; ratio `UNKNOWN`.
- **Repayment / dilution:** none for a pure grant (verify per programme); expenditure must be reportable.
- **Sequencing conflicts (`ASSUMPTION`):** overlap rules against other public funding for the same cost items; budget must not double-claim costs.
- **Next action:** shortlist open calls; map budget-category candidates to each call's eligible expenses.
- **Flag:** `REVERIFY_BEFORE_APPLICATION`

### FR-05 — National Development Fund / angel-style public investment — `PUBLIC_INVESTMENT`
- **Local research record:** none. The brief calls this "where already researched"; no such record was found.
- **Eligibility / structure assumptions (`ASSUMPTION`):** angel-style schemes typically involve private angel investors alongside public co-investment and impose company-stage/registration conditions.
- **Dilution:** equity-type; terms `UNKNOWN`.
- **Company-location / residency dependency:** `UNKNOWN`.
- **Sequencing conflicts (`ASSUMPTION`):** sequencing against later priced VC rounds and any existing crowdfunding obligations.
- **Next action:** locate the earlier research (if it exists outside the repository) and record its source and date here; otherwise research from primary programme sources.
- **Flag:** `REVERIFY_BEFORE_APPLICATION`

### FR-06 — Crowdfunding / preorder (non-equity validation) — `PREORDER`
- **Local material (dated):**
  - July 2026 price document (`tastkind募資資料/Haocu 常規價格與募資早鳥方案完整版.docx`, 2026-07-16): five early-bird tiers — consumer NT$890 / NT$1,680 / NT$2,980 and restaurant NT$39,800 / NT$69,800 — and an internal "NT$5 million challenge" estimate of NT$5,899,000 gross (≈NT$5,427,000 after an assumed 8% platform/payment deduction). Volumes (700/800/400 consumers, 25/25 restaurants) are planning targets, not evidence.
  - Fund plan v1 (2026-07-12) and product introduction v1.2 (2026-07): fact base for the fundraising team, with the purposes "will consumers prepay", "will restaurants buy early packages", "do the mascot and personality quiz drive sharing", "can seed users/restaurants/conversion data for the next round be accumulated".
  - June 2026 external funding-strategy deck: `HISTORICAL`, not adopted, investment-like dealer language needs legal review (see `COMPANY_STRATEGY_AND_OPERATING_MODEL.md` §6).
- **Dilution:** none (reward/pre-order), but creates **fulfilment obligations** (memberships, physical items, restaurant packages). Restaurant founder packages carry a finite 100-dish onboarding allocation and no 美食趣報導 (strategy doc §3; the older 15-dish/吃到飽 wording is superseded).
- **Company-location / residency dependency:** platform/payment-processor requirements `UNKNOWN`.
- **Capital / matching:** none; costs include platform/payment fee (assumed 8% in the estimate) and fulfilment cost (physical merchandise design, cost, MOQ, packaging and lead time are undecided per fund plan v1).
- **Sequencing conflicts (`ASSUMPTION`):** preorder revenue and public-grant expense claims, and any restaurant packages sold before pricing is decided (pricing conflict PC-1..PC-4), must be checked against each other and against later equity terms.
- **Next action:** resolve the restaurant pricing-structure conflicts (PC-1, PC-2, PC-4) before any public campaign; all campaign claims must respect the traction-integrity rule (strategy doc §9); confirm fulfilment feasibility for physical goods and restaurant onboarding.
- **Flag:** `REVERIFY_BEFORE_APPLICATION` for platform terms and fees.

### FR-07 — Later angel / VC equity — `EQUITY`
- **Local material:** none in this repository. Alpha 10 finance/fundraising folders (`18_Finance`, `25_Fundraising_Investor_Materials_Pack`, `26_Investor_Clean_Data_Room`, `27_Investor_Memo_Diligence_QA_Pack`) are `HISTORICAL` pre-implementation frameworks, not evidence; the DD source pack (EN, v3.0.1) is a technical/diligence snapshot at `500c122`.
- **Dilution:** yes; terms `UNKNOWN`.
- **Sequencing:** later than the non-dilutive routes; interacts with any public investment (FR-05) and preorder obligations (FR-06) (`ASSUMPTION`).
- **Next action:** none until traction evidence exists; KPI library items (retention, willingness to pay, CAC/contribution margin) are `TBD — requires current business data`.
- **Flag:** `REVERIFY_BEFORE_APPLICATION`

## Funding-roadmap gap analysis

| Gap | Effect |
| --- | --- |
| No route-level research record (program names, sources, dates, amounts, eligibility) exists in the repository or governance package. | All route facts above are `UNKNOWN`/`REVERIFY_BEFORE_APPLICATION`. FR-01…FR-05 and FR-07 need primary-source research. |
| Company registration state, legal entity, registered location, founding date, team list, ownership structure, financial statements, revenue and bank evidence: `TBD — requires current business data` (funding source pack §13). | Most routes cannot be assessed until these exist; company location decides FR-02 vs FR-03. |
| Technical claims in the reusable Grant Funding Source Pack are stale (109 migrations, `500c122`). | Refresh before any submission; keep stated limitations (Production not enabled, physical-device Push not reconfirmed, consent bundle placeholder). |
| Restaurant pricing structure unresolved (PC-1, PC-2, PC-4; PC-3 resolved). | Blocks a credible crowdfunding tier table and any revenue projection. |
| Fulfilment feasibility (merchandise MOQ/cost/lead time; restaurant dish-build capacity) undecided. | Blocks FR-06 launch. |
| The June external funding deck could not be fully read (image-based). | Its full content is unreviewed. |

## Unresolved eligibility items (all routes)
Company location and registration; whether founder-residency or age conditions apply to any chosen route; applicable matching-fund capacity; sequencing/overlap rules between public funding, preorder revenue and equity.

## Reverify list (summary)
Every monetary amount, rate, residency/age/company-age condition, application window, eligibility criterion, matching ratio, programme name and programme existence: `REVERIFY_BEFORE_APPLICATION`.

## Strategic-programme note (not a financing route by itself)

The Chunghwa Telecom programme is tracked as a `PARTNERSHIP_OPTION` / `NOT_CONFIRMED_TRACTION` (strategy doc §10, ODR-028) rather than as prize money. If it later carries a strategic-investment component it would be a new route here, with its own `REVERIFY_BEFORE_APPLICATION` facts. Nothing is confirmed.
