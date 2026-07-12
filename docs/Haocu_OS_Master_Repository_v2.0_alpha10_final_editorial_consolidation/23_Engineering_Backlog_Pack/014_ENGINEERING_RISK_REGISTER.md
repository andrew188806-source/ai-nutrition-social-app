# 014 Engineering Risk Register

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This register identifies engineering risks that could delay MVP, weaken demo reliability, or create compliance/security exposure.

| ID | Risk | Severity | Probability | Impact | Mitigation | Owner |
|---|---|---:|---:|---|---|---|
| R-ENG-001 | App accumulates TypeScript errors and slows development. | High | Medium | Engineering cannot safely change core flows. | Make typecheck a Sprint 1 exit gate. Avoid `any` as a blanket fix. | Engineering Lead |
| R-ENG-002 | Meal data remains split between fake cards and real records. | High | High | Today Intake/report/recommendation bugs persist. | Replace single latest record with collection and shared aggregation service. | Mobile/Data |
| R-ENG-003 | Meal Buddy, chat, and group table use inconsistent IDs. | High | High | Invites, friends, chats, and group participants desync. | Unified mockUsers/socialCards/matches/chats/groupTables model. | Mobile/Data |
| R-ENG-004 | Supabase migration breaks demo mode. | High | Medium | Demo becomes unstable during fundraising. | Use adapter interface; keep local/demo adapter until backend proven. | Backend |
| R-ENG-005 | RLS policies are postponed too long. | High | Medium | External testing exposes private data. | Draft RLS with schema; block production-like demo until reviewed. | Backend/Security |
| R-ENG-006 | AI outputs are overconfident or medically framed. | Medium | Medium | Trust/compliance issue. | Use source/confidence labels and safe recommendation copy. | AI/Product |
| R-ENG-007 | UI becomes cluttered as features are added. | Medium | High | Demo becomes hard to understand. | Enforce clean UI principle and remove duplicate CTAs. | Product/UI |
| R-ENG-008 | Restaurant/admin work distracts from consumer loop. | Medium | Medium | MVP critical path slips. | Keep restaurant admin P1 unless needed for investor demo. | Product/Engineering |
| R-ENG-009 | Premium/free logic is hardcoded inconsistently. | Medium | Medium | Monetization demo is unreliable. | Centralize capability flags and limit service. | Mobile/Data |
| R-ENG-010 | Chat navigation regressions reappear. | Medium | Medium | Social flow feels broken. | Add regression cases for latest-message sort and return tab. | Mobile/QA |
| R-ENG-011 | Demo data is mistaken for real traction. | Medium | Medium | Investor trust risk. | Label demo/sample data clearly in investor/demo surfaces. | Product |
| R-ENG-012 | Photo storage privacy is underdesigned. | High | Medium | User meal/profile photos may be exposed. | Use storage metadata, scoped bucket policy, signed URLs where appropriate. | Backend/Security |
| R-ENG-013 | Coding agents make broad uncontrolled changes. | Medium | High | Existing flows break silently. | Use scoped prompts, file boundaries, and regression instructions. | Engineering Lead |
| R-ENG-014 | Recommendation logic becomes unexplainable too early. | Medium | Medium | Hard to debug and pitch. | Start with rule engine and reason tags before ML. | AI/Product |
| R-ENG-015 | Founder demo depends on live network/model availability. | Medium | Medium | Presentation can fail. | Keep deterministic demo/mock provider and seed data. | Engineering/Product |

## Top 5 Mitigations to Execute First

1. Typecheck and route smoke test.
2. Single data source for meal records.
3. Unified social identity model.
4. Local/Supabase adapter boundary.
5. Manual regression checklist before each demo.

## Escalation Rule

Any issue that can cause external demo failure, user data exposure, or a contradiction with the product positioning should be escalated to founder/CTO review before merge.
