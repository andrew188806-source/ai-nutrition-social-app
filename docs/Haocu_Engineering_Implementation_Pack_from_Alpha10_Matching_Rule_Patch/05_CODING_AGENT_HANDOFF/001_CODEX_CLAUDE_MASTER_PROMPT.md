# 001 Codex / Claude Code Master Prompt

Copy this into Codex / Claude Code when starting implementation.

```text
You are implementing Haocu from the Alpha 10 Final Freeze / Matching Rule Patch engineering pack.

Follow the frozen MVP scope only. Do not add new product modules or expand investor/future roadmap features.

Primary source files:
- 01_Product/005_MVP_SCOPE.md
- 02_PRD/*
- 03_AI/*
- 04_Data/*
- 05_UI/*
- 06_Architecture/*
- 07_Engineering/*
- 08_Backend/*
- 09_Frontend/*
- 12_QA/*
- 23_Engineering_Backlog_Pack/*

Immediate engineering goals:
1. Run typecheck and identify blockers.
2. Stabilize Expo Web demo route.
3. Replace latestCorrectedMealRecord-like single object state with real meal record collection.
4. Unify mock identity references across users, social cards, Meal Buddy cards, matches, chats, and group tables.
5. Preserve centralized Traditional Chinese i18n.
6. Implement candidate deduplication before ranking:
   - accepted matches / active relationships / active one-on-one chats are hard exclusions;
   - unaccepted invitations get strong penalty;
   - no-action impressions get light penalty;
   - hidden penalty states must not be shown to users.
7. Keep demo/mock data separated from production/live data.

Do not redesign UI broadly. Keep layout clean, uncluttered, and demo-friendly.
Before making changes, produce a concise plan listing touched files, source references, and acceptance checks.
After changes, run typecheck and list completed acceptance criteria.
```
