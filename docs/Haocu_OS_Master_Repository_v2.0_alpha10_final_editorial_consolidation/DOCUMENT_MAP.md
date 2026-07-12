# Document Map

## Purpose

This document maps the frozen Alpha 10 repository by audience, decision type, and source-of-truth level.

## Top-Level Map

| Section | Role |
|---|---|
| `00_Repository_Core` | Project status, assumptions, decisions, changelog, repository-level rules. |
| `01_Product` | Product vision, target users, MVP scope, principles, monetization, roadmap. |
| `02_PRD` | Detailed requirements and acceptance boundaries for major app, AI, restaurant, social, premium, and operations features. |
| `03_AI` | AI strategy, food recognition, nutrition estimation, personalization, safety, evaluation, monitoring. |
| `04_Data` | Data models, schemas, governance, consent, audit, migrations. |
| `05_UI` | UI flows, screen specs, component direction, demo readiness, accessibility. |
| `06_Architecture` | System, mobile, backend, data, AI, deployment, security architecture. |
| `07_Engineering` | Engineering standards, workflow, decisions, backlog. |
| `08_Backend` | Backend architecture, DB, RLS, edge functions, service/domain layers, APIs. |
| `09_Frontend` | Mobile, restaurant, admin frontend, routing, state, localization, social/chat UI. |
| `10_DevOps` | CI/CD, release process, environments, deploy, rollback, secrets, observability. |
| `11_Infrastructure` | Supabase, storage, monitoring, backup, capacity, infrastructure backlog. |
| `12_QA` | QA strategy, demo testing, regression, acceptance, test matrix, bug triage. |
| `13_Security` | Security overview, authorization, privacy/security, RLS, data protection, incidents. |
| `14_Compliance` | Privacy, consent, nutrition claims, moderation, data retention, policy boundaries. |
| `15_Operations` | Restaurant operations, support, moderation, pilot process, operational playbooks. |
| `16_Business` | Business model, GTM, restaurant model, partnerships, unit economics, roadmap. |
| `17_Legal_IP` | IP, patent, trademark, privacy, terms, contracts, founder/company ownership issues. |
| `18_Finance` | Pricing, costs, fundraising assumptions, runway, budget, finance backlog. |
| `19_Pitch` | Pitch narrative, deck outline, demo script, investor FAQ, objection handling. |
| `20_Investor_Materials` | Investor one-pagers, memos, data room basics, outreach, use of funds. |
| `21_External_Artifacts` | External one-pagers, landing page copy, partner materials, demo assets. |
| `22_Repository_Packaging` | Manifest, indexes, release notes, continuation/freeze reports, export structure. |
| `23_Engineering_Backlog_Pack` | Implementation epics, sprint plan, task backlog, QA plan, coding-agent prompts. |
| `24_Professional_Review_Pack` | Review briefs for legal, IP, privacy, nutrition claims, finance, securities, risk. |
| `25_Fundraising_Investor_Materials_Pack` | Fundraising narrative, pitch scripts, investor FAQ, GTM, use of funds. |
| `26_Investor_Clean_Data_Room` | Curated external investor/advisor/partner data room. |
| `27_Investor_Memo_Diligence_QA_Pack` | Formal investor memo, diligence Q&A, meeting trackers, demo/pilot evidence templates. |

## Audience Reading Paths

| Audience | First Documents | Deeper Follow-Up |
|---|---|---|
| Founder | `FINAL_README.md`, `FOUNDER_README.md`, `SOURCE_OF_TRUTH.md` | `FINAL_HANDOFF_CHECKLIST.md`, `CLAIMS_AND_RISK_REVIEW.md` |
| Engineer | `ENGINEER_READ_FIRST.md`, `ENGINEER_HANDOFF_README.md` | `23_Engineering_Backlog_Pack`, `02_PRD`, `04_Data`, `06_Architecture` |
| Investor | `INVESTOR_READ_FIRST.md`, `INVESTOR_README.md` | `26_Investor_Clean_Data_Room`, `27_Investor_Memo_Diligence_QA_Pack` |
| Legal/IP | `LEGAL_READ_FIRST.md`, `LEGAL_IP_README.md` | `17_Legal_IP`, `14_Compliance`, `24_Professional_Review_Pack` |
| Restaurant partner | `RESTAURANT_PARTNER_READ_FIRST.md`, `RESTAURANT_PARTNER_README.md` | Restaurant sections in `01`, `02`, `16`, `21`, `26`, `27` |
| Internal team | `INTERNAL_TEAM_READ_FIRST.md`, `TERMINOLOGY_STANDARDIZATION.md` | `SOURCE_OF_TRUTH.md`, `CLAIMS_AND_RISK_REVIEW.md` |

## Conflict Resolution

When documents conflict, use `SOURCE_OF_TRUTH.md`. In general:

1. Product/PRD/Data/Architecture control implementation.
2. Legal/Compliance/Professional Review controls external risk language.
3. Investor materials summarize the repository but do not override build requirements.
4. Alpha 10 final files explain how to read and freeze the repository but do not introduce new product scope.
