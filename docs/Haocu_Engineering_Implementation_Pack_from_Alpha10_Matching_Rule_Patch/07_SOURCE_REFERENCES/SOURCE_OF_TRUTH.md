# Source of Truth

## Purpose

This document defines which files control decisions when the Alpha 10 repository contains overlapping explanations across product, engineering, investor, legal, and partner materials.

## Highest-Level Rule

Alpha 10 is frozen as an editorial consolidation. It does not add product scope. If a final Alpha 10 guide appears to conflict with an original 00–27 file, the guide should be used for navigation and governance, while the relevant source folder controls the underlying substance.

## Source-of-Truth Hierarchy

| Decision Area | Primary Source | Secondary Source |
|---|---|---|
| Product vision and MVP scope | `01_Product/001_PRODUCT_VISION.md`, `01_Product/005_MVP_SCOPE.md` | `02_PRD/README.md` |
| Feature requirements | `02_PRD/*` | `05_UI/*`, `04_Data/*` |
| AI behavior | `03_AI/*` | `02_PRD/002_AI_ANALYSIS_PRD.md`, `04_Data/009_AI_ANALYSIS_SCHEMA.md` |
| Data model | `04_Data/*` | `08_Backend/*`, `06_Architecture/*` |
| Architecture | `06_Architecture/*` | `07_Engineering/*`, `08_Backend/*`, `09_Frontend/*` |
| Implementation backlog | `23_Engineering_Backlog_Pack/*` | `07_Engineering/014_ENGINEERING_BACKLOG.md` |
| QA and demo acceptance | `12_QA/*` | `23_Engineering_Backlog_Pack/013_QA_TEST_PLAN_BY_FEATURE.md` |
| Security | `13_Security/*` | `14_Compliance/*`, `08_Backend/004_RLS_SECURITY.md` |
| Privacy/compliance/claims | `14_Compliance/*`, `CLAIMS_AND_RISK_REVIEW.md` | `24_Professional_Review_Pack/*` |
| Legal/IP | `17_Legal_IP/*`, `LEGAL_IP_README.md` | `24_Professional_Review_Pack/*` |
| Business model | `16_Business/*` | `18_Finance/*`, `25_Fundraising_Investor_Materials_Pack/*` |
| Finance and fundraising assumptions | `18_Finance/*` | `25_Fundraising_Investor_Materials_Pack/*`, `27_Investor_Memo_Diligence_QA_Pack/*` |
| Investor external sharing | `26_Investor_Clean_Data_Room/*` | `27_Investor_Memo_Diligence_QA_Pack/*` |
| Investor diligence process | `27_Investor_Memo_Diligence_QA_Pack/*` | `26_Investor_Clean_Data_Room/*` |
| Final repository navigation | `FINAL_README.md`, `DOCUMENT_MAP.md`, `FINAL_REPOSITORY_INDEX.md` | `22_Repository_Packaging/*` |

## Evidence Source Rule

Claims about traction, pilots, partnerships, user testing, demo sessions, investor meetings, LOIs, revenue, live usage, AI accuracy, legal clearance, or professional review must be supported by the relevant evidence tracker or reviewer note. A plan or template is not proof.

## Implementation Conflict Rule

If a fundraising document suggests a feature that is not present in PRD or backlog, it is future narrative, not build scope. Engineers should not build it without founder approval and a documented product decision.

## External Claim Conflict Rule

If an investor or marketing document uses stronger language than the legal/compliance/review files allow, use the safer legal/compliance wording until professional review approves otherwise.

## Mock Data Rule

Mock data is allowed for demo, QA, and walkthrough purposes only. It must not be represented as live user data, revenue, partner usage, nutrition accuracy proof, or market traction.

## Meal Buddy Matching Source-of-Truth Patch — Candidate Deduplication

This repository treats the following rule as final for Meal Buddy recommendation v1:

1. Already accepted Meal Buddy matches and active one-on-one chats are not eligible for new-candidate discovery.
2. If a person already appears in the user's chat list, they must not be shown again as a new Meal Buddy candidate.
3. Prior invitations without acceptance may reappear, but must be down-ranked strongly and may be subject to cooldown.
4. Candidates shown without user action may reappear, but should be down-ranked lightly to reduce repetitive recommendations.
5. Hidden penalty or exclusion states should not be shown in user-facing explanations.

Primary implementation references:

- `02_PRD/005_MEAL_BUDDY_PRD.md`
- `02_PRD/013_CHAT_INVITATION_PRD.md`
- `03_AI/005_RECOMMENDATION_AI.md`
- `04_Data/005_SOCIAL_SCHEMA.md`
- `04_Data/011_CHAT_AND_INVITATION_SCHEMA.md`
- `23_Engineering_Backlog_Pack/010_AI_RECOMMENDATION_TASK_BREAKDOWN.md`
