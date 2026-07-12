# 001 MVP Scope Lock

## Core MVP Loop

工程先完成這條可展示、可測試、可保存的主線：

```text
User opens Haocu
  -> analyzes or uploads meal photo
  -> confirms/corrects result
  -> saves meal record
  -> sees today intake summary
  -> receives next meal or restaurant recommendation
  -> optionally creates meal-buddy card
  -> optionally chats or joins meal/table flow
```

## Required MVP Work

### Mobile Consumer App

- Home compact today summary
- AI analysis entry
- photo / upload flow
- candidate dish result
- manual correction / recalculation
- saved meal collection
- Today Intake detail
- Food diary basics
- restaurant recommendation list/card
- Meal Buddy card creation
- Meal Buddy candidates
- basic invite/chat flow
- free/premium visible distinction
- anonymous mascot identity for free users

### Data / Architecture

- real meal record collection
- shared data source for Home summary and full nutrition report
- web/native storage adapter
- unified mock user/card/match/chat/table identity before production migration
- basic event tracking specification

### Restaurant / Premium

- restaurant list/card
- plausible menu mock data
- create Meal Buddy card from restaurant card
- visible free vs premium rules
- production payment out of scope

## Out of Scope

- medical-grade nutrition precision
- diagnosis or treatment advice
- full POS replacement
- live subscription/payment processing
- production identity verification vendor
- full ad marketplace
- full ESG supply chain operations
- household fresh food app
- multi-photo UI, although data model may be prepared

## Release Gate

MVP is not ready unless:

1. Analysis result saves reliably.
2. Saved meal appears consistently across all relevant surfaces.
3. Correction does not lose state.
4. Restaurant card actions navigate to visible results.
5. Chat list order updates by latest message.
6. Free/premium rules are consistent.
7. Demo data uses unified identities.
8. Traditional Chinese copy is centralized.
9. Privacy and nutrition disclaimers are present where needed.
10. QA can run complete demo script without dead ends.

Source: `07_SOURCE_REFERENCES/01_Product/005_MVP_SCOPE.md`
