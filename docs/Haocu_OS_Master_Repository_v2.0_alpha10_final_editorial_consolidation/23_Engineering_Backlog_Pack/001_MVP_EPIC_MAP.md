# 001 MVP Epic Map

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This map converts the Haocu MVP into engineering epics. Each epic includes outcome, dependencies, implementation boundary, and completion signal.

## Epic Overview

| Epic ID | Epic | Outcome | Priority | Primary Owners |
|---|---|---|---|---|
| E0 | Repository & Demo Stabilization | The existing app runs cleanly for web/mobile demo and is safe for iterative development. | P0 | Engineering Lead |
| E1 | Core Data Foundation | Meal, profile, restaurant, social, chat, and group-table data use consistent models. | P0 | Backend / Mobile |
| E2 | AI Meal Analysis Loop | User can analyze a meal, choose candidate, correct result, and save it. | P0 | AI / Mobile / Backend |
| E3 | Today Intake & Food Diary | Saved meals drive nutrition summary, daily history, ratings, and diary surfaces. | P0 | Mobile / Data |
| E4 | Recommendation Engine v1 | Next-meal and restaurant suggestions use current intake, preferences, and demo rules. | P0 | AI / Backend / Mobile |
| E5 | Meal Buddy Flow | User can create Meal Buddy card, view candidates, invite, match, and chat. | P0 | Mobile / Backend |
| E6 | Group Table Flow | User can join/create 4-person table and see participant/chat state. | P1 | Mobile / Backend |
| E7 | Restaurant Surface | Restaurant list/detail/menu cards support nutrition and Meal Buddy card creation. | P1 | Frontend / Mobile |
| E8 | Restaurant Admin | Restaurant can manage menu/nutrition/review state in a controlled admin flow. | P1 | Web / Backend |
| E9 | Supabase Backend Migration | Core demo data can migrate from mock/local state to Supabase Auth/DB/Storage/RLS. | P0/P1 | Backend |
| E10 | QA, Analytics, and Release | App has regression test coverage, analytics events, feature flags, and release checklist. | P0 | QA / Engineering |
| E11 | Investor Demo & Data Room Build | Demo is narratable, reliable, and aligned with pitch/investor material. | P1 | Product / Engineering |

## MVP Critical Path

```text
Repo stable
  -> Core data model
  -> Meal analysis save loop
  -> Today intake sync
  -> Recommendation v1
  -> Meal Buddy card creation
  -> Match/invitation/chat demo
  -> Restaurant card integration
  -> QA regression suite
  -> Investor demo release
```

## Epic E0: Repository & Demo Stabilization

### Outcome

The app can be run, typechecked, demonstrated, and modified without chasing broken imports or inconsistent demo state.

### Scope

- Fix TypeScript errors.
- Confirm Expo Web and mobile paths.
- Confirm Next.js restaurant/admin surfaces if present.
- Centralize remaining hardcoded Traditional Chinese copy into i18n.
- Confirm demo-mode seed data can reset.
- Remove duplicate or outdated UI elements that conflict with current PRD.

### Completion Signal

- `npm install` and typecheck pass.
- Core demo routes render without crash.
- Seed reset reproduces known demo data.
- First 3-minute demo path can be performed by a non-engineer.

## Epic E1: Core Data Foundation

### Outcome

The app has one source of truth for meal records, user profiles, restaurants, social cards, meal buddy cards, matches, chats, and group tables.

### Key Decisions

- Replace any single-object state such as `latestCorrectedMealRecord` with a collection of meal records.
- Keep demo/local adapter and Supabase adapter behind the same repository interface.
- Use stable IDs across mock users, social cards, meal buddy cards, matches, chats, and group tables.
- Support MVP fields first; defer multi-photo capture UI while keeping data model fields ready.

### Dependencies

- 04_Data schemas.
- 06_Architecture service boundaries.
- 08_Backend API contracts.
- 09_Frontend state management.

### Completion Signal

- Adding a meal updates Today Intake, Food Diary, recommendation context, and Meal Buddy card creation source.
- Accepting a chat or meal invitation updates friend/match state consistently.
- Group table participant cards reference the same user/social-card objects as Meal Buddy.

## Epic E2: AI Meal Analysis Loop

### Outcome

Users can analyze meal photos in demo mode, choose an AI candidate, correct details, and save the confirmed meal into the real meal collection.

### Scope

- Capture/upload entry.
- Meal timing selection only where needed, not repeated after photo capture.
- AI analysis candidate list.
- “以上皆非 / 手動輸入” correction path.
- Nutrition recalculation after correction.
- Save to today intake and diary.
- Correction feedback event.

### Completion Signal

- A confirmed result creates a persisted meal record.
- The saved record displays the corrected name, restaurant/source, calories, macros, rating placeholder, and photo reference if available.
- Reanalysis/correction does not duplicate records unless user explicitly saves again.

## Epic E3: Today Intake & Food Diary

### Outcome

Today Intake and Food Diary become reliable reflections of saved meal records, not separate hardcoded or inconsistent demo cards.

### Scope

- Daily nutrition summary.
- Complete nutrition report details.
- Food diary daily cards.
- Rating state and post-meal feedback placeholder.
- Scheduled dinner / planned meal state.
- Free 14-day window and premium Top10 logic in demo form.

### Completion Signal

- Example bug prevented: “today ate 3 meals, but full nutrition report shows 0.”
- Home page shows concise summary only; detail page shows full report.

## Epic E4: Recommendation Engine v1

### Outcome

The app can recommend the next meal, restaurants, and Meal Buddy candidates using explainable MVP rules.

### Scope

- Intake-aware next meal recommendation.
- Restaurant recommendation by location/search/type/meal period.
- Taste-memory placeholders for future personalization.
- Similar-taste user/rating logic for future restaurant reliability.
- Recommendation explanation labels.

### Completion Signal

- Recommendation changes when meal records change.
- Recommendations produce a clear reason, not just a static card.
- No medical or treatment claim is made.

## Epic E5: Meal Buddy Flow

### Outcome

The MVP social loop works from analysis or restaurant card to Meal Buddy card, candidates, invitation, match, and chat.

### Scope

- Create card from AI meal result.
- Create card from restaurant card, with date selector near the restaurant card.
- Free/premium daily limits.
- Candidate list logic.
- Invite to chat / invite to eat locked or enabled according to state.
- Chat tab sorting by latest message.
- Accept invitation adds the user to friends/matches.

### Completion Signal

- Creating a restaurant Meal Buddy card navigates to the correct card area.
- Created card is visible and not lost at page bottom.
- Accepting invitation updates both chat and friend/match list.

## Epic E6: Group Table Flow

### Outcome

Four-person table flow is understandable, separated from one-to-one chat, and useful for demo.

### Scope

- Group table list.
- Create/join table.
- Participant display using social cards.
- Cancellation reason and system message.
- End-of-meal placeholder and calorie/guilt sharing entry.
- Upgrade to 6/8 as premium placeholder after MVP stable.

### Completion Signal

- “多人飯局” does not accidentally route to a one-to-one chat tab.
- Group table state is separate from chat state but can have its own group chat.

## Epic E7: Restaurant Surface

### Outcome

Restaurant card and restaurant detail support nutrition discovery, recommended dishes, and Meal Buddy creation without visual clutter.

### Scope

- Restaurant search/filter/location flow.
- Restaurant cards.
- Menu item cards with nutrition tags.
- Recommended dish CTA: “用這餐建立飯友卡並尋找飯友嗎？”
- Remove duplicate “用這餐選飯友” option.
- Date selector placement under restaurant card.

### Completion Signal

- User can go from restaurant dish to Meal Buddy card creation and see the created result.
- Restaurant card remains clean and readable.

## Epic E8: Restaurant Admin

### Outcome

Restaurant/admin surfaces can support demo-grade menu management and review workflow.

### Scope

- Restaurant profile.
- Menu item CRUD.
- Nutrition disclosure fields.
- AI estimate vs restaurant verified values.
- Review status labels.
- Admin review queue placeholder.

### Completion Signal

- A restaurant menu item can be created/edited in admin and displayed in consumer/restaurant surfaces in demo mode or Supabase-backed mode.

## Epic E9: Supabase Backend Migration

### Outcome

The project has a credible migration path from mock/local data to Supabase with Auth, Postgres, Storage, RLS, and Edge Functions.

### Scope

- Core schema migrations.
- Auth user/profile mapping.
- RLS policies.
- Storage buckets for meal photos and restaurant images.
- Edge Function contracts for AI analysis and recommendations.
- Cross-platform storage adapter.

### Completion Signal

- Demo can run locally with mock adapter and optionally with Supabase adapter.
- Sensitive tables have RLS enabled before production-like testing.

## Epic E10: QA, Analytics, and Release

### Outcome

The MVP is not just built; it can be verified, demoed, and iterated safely.

### Scope

- Feature regression tests.
- Manual QA checklist.
- Core analytics events.
- Error/empty/loading states.
- Feature flags.
- Release checklist.

### Completion Signal

- QA can run a deterministic demo flow and identify whether a bug is P0/P1/P2.
- Investor demo mode can be reset and replayed.

## Epic E11: Investor Demo & Data Room Build

### Outcome

The engineering build supports fundraising storytelling without fake claims or unstable flows.

### Scope

- 3-minute demo script route.
- Demo seed data.
- Investor web page / landing page if applicable.
- Metrics placeholders clearly marked as projections or demo data.
- Data room index alignment.

### Completion Signal

- Founder can demo the product end-to-end without engineering intervention.
- No demo card contradicts PRD, privacy, or financial claims.
