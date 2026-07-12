# 002 Safe Task Prompts

## Prompt A — Typecheck / Demo Stabilization

```text
Use the Alpha 10 engineering pack as source of truth. Fix TypeScript/build errors only. Do not change product rules, limits, routes, or UI design unless required to fix compile/runtime failures. After patching, report touched files, errors fixed, and remaining blockers.
```

## Prompt B — Meal Record Collection

```text
Implement a real meal record collection replacing single latest-meal state. Home summary, Today Intake detail, full nutrition report, Food Diary, and next-meal recommendation must read from the same source. Do not add new nutrition features. Preserve demo data behavior and i18n.
```

## Prompt C — Social Identity Unification

```text
Unify mockUsers, socialCards, mealBuddyCards, matches, chats, and groupTables so they reference the same user/card IDs. Do not create fake users directly inside chat or match screens. Preserve existing visible demo scenarios while fixing identity drift.
```

## Prompt D — Meal Buddy Dedup Patch

```text
Implement Meal Buddy candidate deduplication per Alpha 10 Matching Rule Patch. Hard exclude accepted matches, active relationships, and active one-on-one chats before scoring. Apply configurable strong penalty for unaccepted invitations and light capped penalty for no-action impressions. Do not expose penalty states in UI reason tags.
```

## Prompt E — Chat Sorting / Back Navigation

```text
Fix chat list sorting so latest message moves chat to top. Returning from chat detail must return to chat list/tab, not matched tab. Accepted invitation must create/update relationship state and not create duplicate fake identities.
```

## Prompt F — Restaurant Card to Meal Buddy Card

```text
Implement restaurant-card Meal Buddy card creation using the same card creation service as AI analysis. The created card must appear in the visible Meal Buddy card area, and date selector/action placement should remain near the restaurant card context, not hidden at the bottom.
```
