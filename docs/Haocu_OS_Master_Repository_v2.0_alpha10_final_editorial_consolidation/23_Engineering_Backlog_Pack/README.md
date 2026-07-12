# 23 Engineering Backlog Pack

Version: v2.0 Alpha 7A  
Updated: 2026-07-08  
Owner: Engineering Lead / CTO / Product Owner

## Purpose

This folder converts the Haocu OS Master Repository into an implementation-ready engineering backlog. It is intended for CTO onboarding, external engineers, coding agents, and sprint planning.

Alpha 7A does not replace the Product, PRD, Data, Architecture, Backend, Frontend, QA, Security, or Compliance folders. Instead, it translates those folders into issue-level work that can be assigned, estimated, tested, and shipped.

## What This Pack Enables

- A CTO or lead engineer can understand the MVP build sequence without rereading the full repository first.
- Engineers can split work into GitHub Issues, Linear tickets, Notion tasks, or coding-agent prompts.
- Coding agents can execute scoped tasks without accidentally changing product rules.
- QA can trace each feature to acceptance criteria and regression tests.
- Fundraising/demo work can continue without blocking the implementation backbone.

## Folder Map

- `001_MVP_EPIC_MAP.md` — MVP implementation epics and dependencies.
- `002_FEATURE_BACKLOG.md` — issue-style backlog grouped by epic.
- `003_USER_STORIES.md` — user stories for consumer, restaurant, admin, and investor/demo surfaces.
- `004_ACCEPTANCE_CRITERIA.md` — feature-level acceptance criteria.
- `005_PRIORITY_MATRIX.md` — P0/P1/P2 execution matrix.
- `006_SPRINT_1_TO_6_IMPLEMENTATION_PLAN.md` — six-sprint build sequence.
- `007_MOBILE_APP_TASK_BREAKDOWN.md` — Expo mobile task breakdown.
- `008_BACKEND_TASK_BREAKDOWN.md` — backend service and API task breakdown.
- `009_DATABASE_SUPABASE_TASK_BREAKDOWN.md` — schema, RLS, storage, migration tasks.
- `010_AI_RECOMMENDATION_TASK_BREAKDOWN.md` — AI analysis, correction, recommendation, and personalization tasks.
- `011_RESTAURANT_ADMIN_TASK_BREAKDOWN.md` — restaurant/admin implementation tasks.
- `012_WEB_INVESTOR_DEMO_TASK_BREAKDOWN.md` — web demo and investor-facing build tasks.
- `013_QA_TEST_PLAN_BY_FEATURE.md` — QA plan mapped to features.
- `014_ENGINEERING_RISK_REGISTER.md` — risks, severity, mitigation, owner.
- `015_TECHNICAL_DEBT_REGISTER.md` — known debt and cleanup plan.
- `016_FIRST_14_DAYS_BUILD_PLAN.md` — first two weeks of execution.
- `017_CODEX_CLAUDE_CODE_EXECUTION_PROMPTS.md` — safe coding-agent prompts.
- `018_ISSUE_TEMPLATE_AND_LABELS.md` — issue format and label taxonomy.
- `019_DEFINITION_OF_READY_DONE.md` — readiness and done standards.
- `020_ALPHA7A_HANDOFF_SUMMARY.md` — implementation handoff summary.
- `backlog_items.csv` — portable backlog import table.
- `backlog_items.json` — structured backlog source for automation.

## Alpha 7A Build Philosophy

Build the minimum reliable loop first:

1. User captures or uploads meal photo.
2. AI/mock analysis produces candidates.
3. User confirms or corrects the result.
4. Meal record is saved to a real collection.
5. Today Intake, nutrition report, food diary, and recommendation surfaces read from the same data source.
6. User can create a Meal Buddy card from the meal or a restaurant.
7. Matching, invitation, chat, and group table demo flows use unified social data.
8. Restaurant/admin/demo surfaces remain consistent with the consumer flow.

## Non-Negotiable Engineering Constraints

- TypeScript must stay clean.
- Traditional Chinese strings must go through centralized i18n.
- Demo mode must remain stable while Supabase migration proceeds.
- Meal records must use a real collection, not a single `latestCorrectedMealRecord` object.
- Meal Buddy, social card, match, chat, and group table IDs must use one consistent data model.
- Mobile UI must remain clean, uncluttered, and demo-friendly.
- Nutrition content must be informational and should not present medical diagnosis or treatment claims.
- Personalization and recommendation logic must be explainable enough for user trust and investor review.
