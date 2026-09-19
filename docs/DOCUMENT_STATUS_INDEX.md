# Document Status Index

**DOC STATUS: CURRENT** — reconciled 2026-09-19 against `HEAD = origin/main = 8af3fb7d108c4124bb29ab115ea00b411287b00d`.

Purpose: let a reader tell, for any document in this repository, whether it describes the system **now**, is a **frozen contract** for a closed phase, is **history**, or has been **superseded**. Historical documents are kept for traceability; they are not deleted, and where they could mislead they carry an in-place status banner pointing back here.

Status vocabulary: `CURRENT` · `FROZEN` (closed-phase contract or evidence; authoritative for that phase only) · `TECH_DEBT` · `DEFERRED` · `POST_MVP` · `HISTORICAL` · `SUPERSEDED` · `BLOCKED` · `TBD`.

## 1. Source-of-truth hierarchy (engineering)

1. **Repository behaviour** — code, migrations, and what actually runs. Answers "what is implemented".
2. **[docs/engineering-handoff.md](engineering-handoff.md)** — the current technical description of the system (architecture, closed capabilities, invariants, environment, product decisions that shape the design).
3. **[docs/engineering-state-registers.md](engineering-state-registers.md)** — technical debt, deferred/Post-MVP scope, architecture-rigidity audit, dependency and vendor-coupling audit, Admin non-authority inventory.
4. **Frozen phase contracts** (§3) — authoritative for the exact contract of the capability they closed.
5. **Historical / superseded material** (§4–§5) — history and traceability only.

When implementation and stated product intent differ, both are recorded; neither is rewritten to match the other. The executable Admin route registry (`apps/admin-web/auth/admin-route-registry.ts`) outranks the prose Admin IA document where they disagree.

Company/product-strategy decisions (pricing, operating model, funding, commercial policy) are governed by a separate company governance layer in the top-level `governance/` directory (company-internal; **not part of the technical information package** and not part of `docs/`). Nothing in that layer is an engineering invariant unless a technical document states it is enforced in code.

## 2. CURRENT

| Document | Notes |
| --- | --- |
| `docs/engineering-handoff.md` | Living technical description. Legacy mock-era sections inside it are individually tagged. |
| `docs/engineering-state-registers.md` | Debt / deferred / modernization / coupling / Admin inventory. |
| `docs/DOCUMENT_STATUS_INDEX.md` | This file. |
| `docs/admin-authority-sop-zh-tw.md` | Operator-facing Admin Authority procedure (《最高權限開啟 SOP》). |
| `docs/ip-codex-scale-system.md` | IP Codex contract. |
| `docs/restaurant-owner-catalog-authoring-r2b.md` | Restaurant catalog authoring RPC contract, plus R2C/R2D/R2E notes. |
| `docs/restaurant-canonical-data-boundary.md` | Canonical restaurant data model boundaries (its "Restaurant Console uses a mock adapter today" sentence is `HISTORICAL`). |
| `docs/tastkind-runtime-integration-roadmap.md` | Authoritative for Runtime Integration **phase names and ordering**. Its "Current Phase — Phase 2V" section is `SUPERSEDED` by completed work. |
| `docs/admin-operational-surface-inventory.md` | Canonical route-level inventory of all 98 Admin registry routes and 22 legacy roots (A0): state, data source, auth, permission status, disposition, slice. Current technical planning. |
| `docs/admin-information-architecture-ra-3-ia-p1.md` | Authoritative for Admin IA *intent* (workspaces, sensitivity classes, semantic boundaries). Its counts and availability statements are stale — the registry governs (see registers TD-07). |
| `docs/navigation-map.md` | Mobile navigation map; incomplete for newer routes. |
| `supabase/README.md`, `.env.example` | Configuration names and migration notes. |

## 3. FROZEN — closed-phase contracts and evidence

Authoritative for the exact scope and validation state of the phase they record. Their old migration counts, "not started" statements and future-phase language are phase-local, not current status.

- Consumer Runtime: `docs/consumer-runtime-integration/*`, `docs/consumer-runtime-phase-2s|2u|2u-c-a|2u-c-b|2w|2x|2y|2z/*`, `docs/runtime-integration-phase-2v*/*`, `docs/consumer-schema-*.md`, `docs/consumer-canonical-data-mapping.md` (Consumer schema freeze and decision registers).
- Recommendation: `docs/recommendation/*` (REC-A/B/C/D contracts), `docs/meal-identification-*.md`.
- Platform Admin: `docs/platform-admin-*-ra-1*.md`.
- Restaurant Owner authority: `docs/restaurant-owner-*-ra-2*.md` (RA-2A–RA-2I; each phase's guard scripts are single-round checks that pin their own baseline).
- Design record: `docs/consumer-ux/track-u1-next-meal-flow-prototype.md`.

## 4. HISTORICAL — retained for traceability, not current

| Document(s) | Why historical |
| --- | --- |
| Root `README.md`, root `ENGINEER_HANDOFF.md` | Frozen at audited baseline `9d68eab` (91 migrations, `origin/main` `0bedb415`). They pre-date Restaurant RA-2/R2, Admin Authority, IP Codex. Historical notices are in place. |
| Root `ROADMAP.md` | Legacy Phase-6-era product/demo roadmap. Superseded for runtime by `tastkind-runtime-integration-roadmap.md`, and for current sequencing by the engineering handoff. |
| Root `API_PLAN.md`, `PRODUCT_FLOW.md`, `DATABASE_SCHEMA.md`, `MOCK_DATA_GUIDE.md`, `INVESTOR_DEMO_SCRIPT.md`, `TAG_SYSTEM_DESIGN.md` | Early-MVP planning notes (mock-first era). |
| `docs/architecture.md`, `docs/data-governance.md`, `docs/investor-demo-script.md` | Phase-1 skeleton descriptions ("mock-first service adapters", "does not enforce production controls"). |
| `docs/tastkind-canonical-data-integration-status.md` (last updated 2026-07-11), `docs/consumer-schema-runtime-handoff.md` ("Future handoff. Runtime integration is deferred.") | Pre-runtime status snapshots. |
| `docs/supabase-historical-schema-skeleton.md`, `docs/supabase-schema-drafts/*`, `docs/supabase-consumer-schema-drafts/*`, `docs/supabase-schema-review/*`, `docs/supabase-schema-*.md`, `docs/supabase-runtime-integration/*` | Draft schema, review and early runtime-activation material; the applied truth is `supabase/migrations/`. |
| `docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/*` and its `.zip`; `docs/Haocu_Engineering_Implementation_Pack_from_Alpha10_Matching_Rule_Patch/*` and its `.zip`; `docs/haocu-os-spec/*` | "Alpha 10" product/engineering/investor/finance packs written before implementation. Old product vision, KPI, budget, phase names and matching rules. Historical intent only; contain claims (proprietary model, autonomous training, matching order, pricing/finance frameworks) that current code does not support. |
| `design_handoff_haochu_app/` | Design hand-off material. |

## 5. SUPERSEDED (claim-level)

| Superseded statement | Where it appears | Current fact |
| --- | --- | --- |
| "Restaurant Web is read-only / partially active; Admin is a scaffold" | Root `README.md`, `ENGINEER_HANDOFF.md` §2 | Restaurant Owner console is closed and live-accepted (create + maintain catalog); Admin Authority is closed. |
| "Runtime Integration current phase is 2V; N4 blocked" | `docs/tastkind-runtime-integration-roadmap.md` §3; `docs/runtime-integration-phase-2v-e/freeze-record.md` | 2V–2Z complete; N4 recorded as Development-applied. Phase names remain valid. |
| "Admin IA has 55 locations and 3 CURRENT permissions; Platform Management and Break-glass not enabled" | `docs/admin-information-architecture-ra-3-ia-p1.md` | Registry: 98 entries (8 LIVE / 17 DEMO / 73 NOT_ENABLED); Platform Management live; Break-glass control plane exists. |
| "Restaurant Console uses a mock adapter today" | `docs/restaurant-canonical-data-boundary.md` | `TASTKIND_RESTAURANT_DATA_SOURCE=mock\|supabase\|disabled`; live mode is the operational path. |
| "Highest-privilege app role TBD / implementation not started" | company governance package ODR-001 | Primary Permission Manager (derived state) and Break-glass exist and are frozen. |
| "Social cap = daily opportunities / payment plan" | Alpha 10 | Exposure 3/10 and card quotas 1/1 and 3/2 are policy numbers; no billing implied. |
| Group Table as an MVP capability | Root `ROADMAP.md`, Alpha 10 | `POST_MVP`. |
| QR as an MVP flow | Historical | Not an MVP flow. Permanent QR now refers to the future collectible Product Instance (`POST_MVP`). |

## 6. Conventions

- Frozen contracts and guard-read documents are never bannered; they are classified in this index only. A status banner (used only on non-frozen, non-guard-read documents) is a single blockquote line inserted directly under a document's title: `> **DOC STATUS: <STATUS>** — <reason>. See docs/DOCUMENT_STATUS_INDEX.md.`
- New engineering documents state a status on their first lines.
- Directory-level classification in this index applies to files that have no banner of their own.

## 7. Known ambiguities

- `docs/tastkind-runtime-integration-roadmap.md` mixes a still-valid naming/ordering authority with a superseded "current phase" section in one file (`SUPERSEDED` in part). It declares itself frozen and is deliberately **left byte-for-byte unedited**; this index is its only annotation.
- `docs/admin-information-architecture-ra-3-ia-p1.md` is read by a frozen guard (`scripts/admin-ia-p1-guard.mjs`) and is therefore annotated by index rather than by edit.
- The earlier company governance snapshot (Master Handbook v3.0.1 at `500c122`, 2026-09-10; kept outside this repository) predates Restaurant R2, Admin Authority closure and IP Codex; it is `HISTORICAL` for those areas. Its successor index is `governance/README.md`.
- "company governance package ODR-001" in §5 refers to the register in that earlier snapshot; the current register is `governance/OWNER_PRODUCT_DECISION_REGISTER.md`.
