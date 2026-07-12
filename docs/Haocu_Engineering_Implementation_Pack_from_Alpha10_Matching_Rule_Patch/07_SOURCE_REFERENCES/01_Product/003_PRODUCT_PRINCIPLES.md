# Product Principles

## Purpose

These principles guide product decisions when speed, scope, visual clarity, business ambition, and engineering cost conflict.

## Principle 1 — One Clear Next Action

Every screen should answer: “What should the user do next?”

**Do**

- Use one primary action per major state.
- Keep secondary actions visually lighter.
- Preserve navigation paths after user actions.

**Do Not**

- Put multiple competing primary buttons in one card.
- Hide required choices at the bottom of long screens.
- Force the user to guess whether something was saved.

## Principle 2 — Personal Taste Beats Generic Popularity

Haocu should not simply replicate public restaurant ranking. Personal ratings, similar taste users, nutrition state, meal context, and location intent should matter more than mass popularity.

## Principle 3 — Nutrition Without Shame

Nutrition guidance must be useful but emotionally safe.

**Preferred tone**

- “今天蛋白質偏少，下一餐可以補一點。”
- “這餐熱量較高，晚餐可以選清爽一點。”

**Avoid**

- “你吃太多了。”
- “這是不健康食物。”
- medical claims without review.

## Principle 4 — Social With Boundaries

Meal-buddy features are food-first, opt-in, and safety-aware.

Required boundaries:

- chat-first preference;
- payment preference;
- cancellation reason;
- separate one-on-one and group table chats;
- anonymous free identity;
- verified/real-person states only where explicitly unlocked.

## Principle 5 — Clean, Demo-Friendly UI

The app should be understandable to:

- a first-time consumer;
- a restaurant owner;
- an elder stakeholder;
- an investor;
- an engineer receiving handoff.

Visual priority: clean hierarchy, whitespace, readable cards, consistent avatar states, and minimal duplicate actions.

## Principle 6 — MVP Must Be Narrow but Coherent

A small coherent loop is better than many disconnected features.

The MVP loop is:

```text
Analyze meal -> Save meal -> Understand today -> Recommend next meal/restaurant -> Optional meal buddy
```

Features outside this loop require strong justification.

## Principle 7 — Corrections Are Product Value

AI will not always be correct. User correction should not be treated only as failure; it is a data asset.

Corrections should:

- be easy to make;
- preserve previous context;
- update nutrition estimate;
- improve future personalization;
- remain traceable in correction history.

## Principle 8 — Restaurant Data Should Reduce User Friction

Restaurant participation should make consumer recommendations more useful. It should not force users to understand restaurant backend complexity.

## Principle 9 — Premium Should Unlock Depth, Not Basic Usefulness

Free users must experience the core loop. Premium should unlock more opportunities, richer identity, longer memory, and deeper personalization.

## Principle 10 — Review Before Claims

Any feature that touches health, legal, nutrition claims, paid restaurant visibility, privacy, or user safety must be reviewed before production launch.

## Product Decision Test

Before adding or changing a feature, ask:

1. Does it support the core meal loop?
2. Does it make the next action clearer?
3. Does it preserve clean UI?
4. Does it create data useful for personalization?
5. Does it introduce health, legal, privacy, or social risk?
6. Is it MVP, MVP+, or future?
7. Can engineering implement it without breaking existing flows?
