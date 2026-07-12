# 001 MVP Release Gate Checklist

## Build / Code

- [ ] TypeScript passes.
- [ ] Expo Web demo route opens after refresh.
- [ ] Mobile route smoke test passes.
- [ ] Demo seed reset works.
- [ ] Feature flags distinguish demo/prod/backend modes where applicable.

## Meal / AI / Nutrition

- [ ] User can analyze/upload meal photo.
- [ ] Candidate result appears with estimate/source/confidence where applicable.
- [ ] User can correct result.
- [ ] Corrected result saves to meal records.
- [ ] Home summary, Today Intake, full nutrition report, and Food Diary agree.
- [ ] Next-meal recommendation changes after saved meal.
- [ ] Nutrition copy does not claim diagnosis/treatment.

## Meal Buddy / Chat

- [ ] User can create Meal Buddy card from AI result.
- [ ] User can create Meal Buddy card from restaurant card.
- [ ] Created card appears immediately.
- [ ] Free/premium card/candidate limits work.
- [ ] Accepted/active chat users are excluded from new candidate list.
- [ ] Unaccepted invitations are strongly down-ranked.
- [ ] No-action impressions are lightly down-ranked.
- [ ] Hidden penalty states are not exposed in UI.
- [ ] Chat list sorts by latest message.
- [ ] Back from chat returns to chat list/tab.

## Restaurant / Group Table

- [ ] Restaurant list/filter works.
- [ ] Restaurant detail/card is readable and uncluttered.
- [ ] Menu item can feed Meal Buddy card creation.
- [ ] Group table and one-on-one chat states are not mixed.

## Data / Security / Compliance

- [ ] Demo/mock data is labeled and separated.
- [ ] Social identity references are unified.
- [ ] RLS policy baseline exists before live backend testing.
- [ ] Chat access is participant-only in backend plan.
- [ ] Report/block/rate-limit requirements are tracked before live social launch.
