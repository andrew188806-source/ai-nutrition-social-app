# 07 Engineering

Version: v2.0 Alpha 4  
Updated: 2026-07-08  
Owner: Engineering Lead

This folder defines how Haocu should be implemented by engineers and coding agents.

## Engineering Goals

- Keep the codebase easy to understand for a small team.
- Convert PRD and architecture into clear implementation units.
- Prevent regressions in AI analysis, Meal Buddy, Group Table, chat, and restaurant flows.
- Make demo deployment reliable enough for fundraising and advisor review.
- Preserve a clean, uncluttered UI while adding functionality.

## Folder Map

- `001_ENGINEERING_STANDARDS.md`
- `002_REPOSITORY_STRUCTURE.md`
- `003_IMPLEMENTATION_PRIORITIES.md`
- `004_STATE_MANAGEMENT.md`
- `005_CODING_AGENT_INSTRUCTIONS.md`
- `006_GIT_WORKFLOW.md`
- `007_CODE_REVIEW_POLICY.md`
- `008_TESTING_STRATEGY.md`
- `009_RELEASE_PROCESS.md`
- `010_TYPE_SAFETY_AND_ERROR_HANDLING.md`
- `011_ENVIRONMENT_CONFIGURATION.md`
- `012_FEATURE_FLAGS_AND_DEMO_MODE.md`
- `013_DEPENDENCY_MANAGEMENT.md`
- `014_ENGINEERING_BACKLOG.md`

## Fixed Technology Stack

- Mobile: Expo React Native / TypeScript / Expo Router.
- Restaurant/Admin: Next.js / TypeScript / Tailwind.
- Backend: Supabase Auth / Postgres / Storage / RLS / Edge Functions.
- Language: Traditional Chinese first via centralized i18n.

## Engineering Principle

Every feature should have a clear path from PRD → Data → API → UI → Test. If a feature cannot be traced across those layers, it is not ready for implementation.
