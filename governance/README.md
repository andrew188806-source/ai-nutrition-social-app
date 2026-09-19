# TastKind Governance Layer — Source-of-Truth Index (successor, 2026-09-19)

**CLASSIFICATION: `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT`.**

This directory is internal company material. It may contain pricing hypotheses, business-development and operating-model policy, commercial policy and funding strategy. It is the current successor company-governance layer (the older off-repo v3.0.1 package is a `HISTORICAL / SUPERSEDED` snapshot) and is deliberately separate from `docs/`, the technical layer.

- **Vendor-export rule:** any future engineering-vendor export must exclude `governance/` unless company management explicitly decides otherwise.
- The Engineering Handoff does not depend on a vendor receiving this directory; nothing in `docs/` requires it.
- Founder-private patent, financing-structure or personal-financial material must never be placed here.
- Location: it sits inside the private product repository for now; management may relocate it later. No filesystem permissions were changed to place it here.

Reconciled against repository `HEAD = origin/main = 8af3fb7d108c4124bb29ab115ea00b411287b00d` (2026-09-19).

## Two layers, two purposes

| Layer | Answers | Where |
| --- | --- | --- |
| **Technical handoff** | *What the system currently is.* | `docs/engineering-handoff.md`, `docs/engineering-state-registers.md`, `docs/DOCUMENT_STATUS_INDEX.md` |
| **Governance / product-strategy** | *What the company has decided the product and business should do.* | This directory |

Nothing here is an engineering invariant unless a technical document states that it is enforced in code. Nothing in `docs/` sets company strategy.

## Files in this layer

| File | Role | Status |
| --- | --- | --- |
| `README.md` | This index and the hierarchy below. | `CURRENT` |
| [`OWNER_PRODUCT_DECISION_REGISTER.md`](OWNER_PRODUCT_DECISION_REGISTER.md) | Product-owner decisions ODR-001…ODR-024, each with strategy class and implementation status. Successor to the register in the v3.0.1 package (which held ODR-001/002 only). | `CURRENT` |
| [`COMPANY_STRATEGY_AND_OPERATING_MODEL.md`](COMPANY_STRATEGY_AND_OPERATING_MODEL.md) | Restaurant operating model, founder/early-bird package, BD/acquisition operating model, commercial policy inputs, pricing hypotheses and their conflict register. | `CURRENT` (pricing = `PRICING_HYPOTHESIS`) |
| [`FUNDING_ROADMAP.md`](FUNDING_ROADMAP.md) | Company financing routes considered. Planning memory only. | `CURRENT` (all program facts `REVERIFY_BEFORE_APPLICATION`) |
| [`RECONCILIATION_2026-09-19.md`](RECONCILIATION_2026-09-19.md) | Decision reconciliation, recent chat-only decisions, document gaps, superseded governance claims. | `CURRENT` (audit record) |

## Source-of-truth hierarchy (company layer)

1. **Repository behaviour** decides what is implemented. A governance decision never proves implementation, Development acceptance, deployment or Production state.
2. **`OWNER_PRODUCT_DECISION_REGISTER.md`** decides *product* intent. Later entries supersede earlier ones only where stated.
3. **`COMPANY_STRATEGY_AND_OPERATING_MODEL.md`** decides operating-model and commercial-policy inputs. Prices and commissions in it are hypotheses until a decision says otherwise.
4. **`FUNDING_ROADMAP.md`** is memory/planning, not legal advice, not financing approval, not eligibility.
5. The **v3.0.1 Master Handbook package** (`TastKind交接文件9.11/TastKind_Master_Handbook_v3.0.1_Output`, snapshot `500c122`, 2026-09-10; outside this repository, write-protected in the reconciliation environment) is `HISTORICAL` for everything after that snapshot: Restaurant R2 (catalog authoring), Admin Authority closure, IP Codex. Its per-area statuses are re-stated in `RECONCILIATION_2026-09-19.md` §5. Its handbooks and source packs (`.docx`/`.pdf`) were not edited.
6. **Alpha 10 packs** (`docs/Haocu_*`), older funding decks, price documents (`tastkind募資資料/`) are `HISTORICAL` input. Where they disagree with the register, the register governs; disagreements are logged in `RECONCILIATION_2026-09-19.md`.

## Status vocabularies

Technical: `CURRENT_CANONICAL` · `FROZEN` · `TECH_DEBT` · `DEFERRED` · `POST_MVP` · `SUPERSEDED` · `HISTORICAL` · `PRODUCT_DECISION_REQUIRED` · `DOCUMENTATION_GAP`.
Business/product: `CURRENT_STRATEGY` · `CURRENT_PRODUCT_DECISION` · `OPERATING_MODEL` · `PRICING_HYPOTHESIS` · `POST_MVP` · `DEFERRED` · `SUPERSEDED` · `PRODUCT_DECISION_REQUIRED`.

## Ground rules for this layer

- Traction integrity (ODR-027): market validation is `MARKET_VALIDATION_IN_PROGRESS`; no external document may present unproven users, restaurants, conversion, retention or survey results as proven.
- No fabricated evidence: no market validation, pricing validation, investor interest, financing eligibility or program requirement is asserted anywhere here unless a source is named.
- Founder-private financial or IP-structuring material is intentionally absent from this layer.
- Company/commercial metrics remain `TBD — requires current business data` unless a dated source exists.
