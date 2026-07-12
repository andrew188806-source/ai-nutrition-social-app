# MVP Scope

## MVP Goal

The MVP proves that Haocu can guide an external diner from meal analysis to personalized food recommendation and optional meal-buddy connection.

The MVP does not need to prove every future business line. It must prove the core product loop.

## Core MVP Loop

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

## In Scope for MVP

### Mobile Consumer App

- Home screen with compact today summary.
- AI analysis entry.
- Photo/upload flow.
- Candidate dish result.
- Manual correction and recalculation.
- Saved meal collection.
- Today intake detail page.
- Food diary basics.
- Restaurant recommendation list/card.
- Meal-buddy card creation.
- Meal-buddy candidates.
- Basic invite/chat flow.
- Free/premium visible distinction.
- Anonymous mascot identity for free users.

### Data and Architecture

- Real meal record collection.
- Shared data source for home summary and nutrition report.
- Cross-platform storage adapter for demo/native stability.
- Unified user/card/match/chat/table mock model before production DB migration.
- Basic event tracking specification.

### Restaurant Surface

- Restaurant list and card.
- Dish/menu mock data that is plausible for the restaurant type.
- Create meal-buddy card from restaurant card.
- Restaurant table discovery/creation as demo or MVP+ depending implementation capacity.

### Premium Surface

- Free vs premium rules visible.
- Premium can unlock larger recommendation lists, more card opportunities, real-person card, longer saved-item windows, and health-goal mode.
- Production payment is out of scope.

## Out of Scope for MVP

- Medical-grade nutrition precision.
- Automated diagnosis or treatment advice.
- Full restaurant POS replacement.
- Live payment/subscription processing.
- Production identity verification vendor.
- Full ad marketplace.
- Full ESG supply-chain operations.
- Household fresh food app.
- Automated import of group calorie sharing into personal health records.
- Multi-photo capture UI, although data model can be prepared.

## MVP vs MVP+ Boundary

| Capability | MVP | MVP+ |
|---|---|---|
| Photo meal analysis | Required | Improve accuracy |
| Manual correction | Required | Add smarter suggestions |
| Today intake | Required | Add richer trend views |
| Food diary | Basic | Expanded calendar/Top lists |
| Restaurant recommendation | Required | More personalization signals |
| Meal-buddy card | Required | More advanced matching |
| Group table | Demo/basic if feasible | Robust table lifecycle |
| Premium | Capability distinction | Payment and subscription backend |
| Restaurant admin | Concept/demo | Real partner onboarding |
| Nutrition review workflow | Specified | Operationalized |

## Release Gate

The MVP is not ready for external testing unless:

1. Analysis result can be saved reliably.
2. Saved meal appears consistently in all relevant surfaces.
3. User can correct AI output without losing state.
4. Restaurant card actions navigate to visible results.
5. Chat list order updates by latest message.
6. Free/premium rules are consistent in UI and data.
7. Demo data uses unified identities.
8. Traditional Chinese copy is centralized.
9. Privacy and nutrition disclaimers are present where needed.
10. QA can run a complete demo script without dead ends.

## Scope Control Rule

Any new feature request must be labeled:

- `MVP Required`
- `MVP Nice-to-Have`
- `MVP+`
- `Future Phase`
- `Parking Lot`

Unlabeled ideas must not enter engineering backlog.
