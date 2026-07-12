# Feature Map

## Purpose

This document maps Haocu features by domain and release stage. It prevents scope creep and helps engineering convert product intent into backlog items.

## Release Stage Definitions

| Stage | Meaning |
|---|---|
| Demo | Must work for guided product demonstration. Mock data allowed. |
| MVP | Must work for early external users with stable data flow. |
| MVP+ | Valuable after MVP but not required for first market validation. |
| Beta | Wider user testing, improved reliability, selected integrations. |
| Future | Phase 2/3 strategic expansion. |

## Consumer Feature Map

| Domain | Feature | Demo | MVP | MVP+ | Notes |
|---|---:|---:|---:|---:|---|
| AI Analysis | Photo/upload meal analysis | Yes | Yes | Enhance | Candidate dishes and nutrition estimate required. |
| AI Analysis | Three-candidate correction | Yes | Yes | Enhance | Include “none of the above/manual input.” |
| AI Analysis | Restaurant/dish context | Partial | Yes | Enhance | Use restaurant data when available. |
| Meal Record | Saved meal collection | Yes | Yes | Enhance | Replace single latest record state. |
| Meal Record | Today intake summary | Yes | Yes | Enhance | Home shows compact summary only. |
| Meal Record | Full nutrition report | Partial | Yes | Enhance | Detail page reads same source as today intake. |
| Food Diary | Recent day cards | Yes | Yes | Enhance | Month expansion can be MVP+ if needed. |
| Food Diary | Ratings/favorites | Partial | Yes | Enhance | Private rating feeds recommendation. |
| Recommendation | Next meal suggestion | Yes | Yes | Enhance | Based on intake and taste. |
| Recommendation | Restaurant recommendation | Yes | Yes | Enhance | Explain “why recommended.” |
| Social | Meal-buddy card | Yes | Yes | Enhance | Analysis and restaurant entry channels. |
| Social | Candidate list | Yes | Yes | Enhance | Free/premium limits. |
| Social | One-on-one chat | Demo | MVP | Enhance | Latest-message sorting required. |
| Social | Group table | Demo | MVP+ | Enhance | Four-person primary model. |
| Premium | Free/premium switch | Yes | Yes | Enhance | Demo may use global toggle. |
| Premium | Real-person card | Demo | MVP+ | Enhance | Requires verification boundary. |
| Mascot | Anonymous avatar | Yes | Yes | Enhance | Must stay consistent across screens. |

## Restaurant Feature Map

| Domain | Feature | Demo | MVP | MVP+ | Future |
|---|---:|---:|---:|---:|---:|
| Restaurant Discovery | Restaurant list/card | Yes | Yes | Enhance | — |
| Menu Data | Dish list with plausible dishes | Yes | Yes | Enhance | — |
| Nutrition | Nutrition estimate display | Demo | Review-gated | Enhance | — |
| Social Entry | Create meal-buddy card from restaurant | Yes | Yes | Enhance | — |
| Group Dining | Find/create table from restaurant | Demo | MVP+ | Enhance | — |
| Restaurant Admin | Menu edit | Concept | MVP+ | Beta | — |
| Restaurant Verification | Blue-check/review | Concept | MVP+ | Beta | — |
| ESG Operations | Surplus/near-expiry flow | No | No | No | Yes |

## Admin and Operations Feature Map

| Feature | Stage | Notes |
|---|---|---|
| Restaurant verification queue | MVP+ | Needed before public trust badges. |
| Nutrition claim review | MVP+ | Required for production nutrition claims. |
| Ad/sponsorship review | Future | Paid placement must be transparent. |
| Consent/audit record | MVP | Privacy-sensitive events need logs. |
| Support runbook | MVP | Needed before external users. |

## Dependency Map

```text
AI Analysis
  -> Meal Record
  -> Today Intake
  -> Recommendation
  -> Meal Buddy Card

Restaurant Data
  -> Dish Recognition Context
  -> Restaurant Recommendation
  -> Meal Buddy Card from Restaurant
  -> Future Restaurant Admin

User Profile
  -> Nutrition Preference
  -> Social Card
  -> Premium Capability
  -> Recommendation Personalization

Social Card
  -> Meal Buddy Card
  -> Candidate Matching
  -> Chat
  -> Group Table
```

## Deferred Features

The following are intentionally not required for MVP:

- full multi-photo capture UI;
- automatic group calorie import into personal nutrition record;
- production payment;
- full POS integration;
- household grocery planning;
- automated medical advice;
- paid restaurant ranking without review;
- real identity verification vendor integration.

## Engineering Backlog Conversion Rule

Each feature should become backlog items with:

- user story;
- data dependency;
- UI state;
- API contract;
- acceptance criteria;
- analytics event;
- MVP/MVP+/future label.
