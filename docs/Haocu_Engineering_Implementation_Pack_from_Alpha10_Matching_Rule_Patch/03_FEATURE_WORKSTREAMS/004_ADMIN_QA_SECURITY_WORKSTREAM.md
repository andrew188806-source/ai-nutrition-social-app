# 004 Admin / QA / Security Workstream

## Goal

Prepare the MVP for safe demo, closed beta, and later production migration.

## Source Docs

- `07_SOURCE_REFERENCES/12_QA/README.md`
- `07_SOURCE_REFERENCES/12_QA/002_DEMO_TEST_SCRIPT.md`
- `07_SOURCE_REFERENCES/12_QA/003_REGRESSION_CHECKLIST.md`
- `07_SOURCE_REFERENCES/13_Security/008_CHAT_AND_SOCIAL_SAFETY_SECURITY.md`
- `07_SOURCE_REFERENCES/14_Compliance/README.md`
- `07_SOURCE_REFERENCES/08_Backend/004_RLS_SECURITY.md`
- `07_SOURCE_REFERENCES/10_DevOps/006_DEPLOYMENT_RUNBOOK.md`

## Build Order

1. Create QA smoke and regression checklist.
2. Add demo seed reset and feature flags.
3. Draft Supabase RLS policy baseline.
4. Add basic report/block/rate-limit requirements to tickets before live social testing.
5. Keep demo/mock data labeled.

## Acceptance

- QA can run AI → intake → restaurant → Meal Buddy → chat → table flow.
- Demo and live data are separated.
- Chat access is participant-only.
- Social safety items are explicitly tracked before live testing.
