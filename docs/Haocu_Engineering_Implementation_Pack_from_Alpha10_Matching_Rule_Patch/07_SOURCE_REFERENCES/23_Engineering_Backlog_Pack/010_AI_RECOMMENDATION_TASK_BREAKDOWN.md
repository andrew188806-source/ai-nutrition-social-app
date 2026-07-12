# 010 AI / Recommendation Task Breakdown

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document defines the AI and recommendation implementation backlog for MVP. The goal is not to build full personalization immediately; it is to make a reliable, explainable, database-first loop that can evolve.

## AI Product Boundary

Haocu should provide nutrition estimation, meal recommendations, and social/restaurant matching support. It should not present itself as medical diagnosis, treatment, or a substitute for a licensed professional.

## AI Loop v1

```text
Meal photo / manual input
  -> database-first lookup where possible
  -> AI candidate generation if uncertain
  -> user selection/correction
  -> saved meal record
  -> recommendation context update
  -> correction feedback for future improvement
```

## Task Group A — Food Recognition and Candidate Generation

Tasks:

- Define `AnalyzeMealRequest` and `AnalyzeMealResponse`.
- Support demo/mock provider for stable presentations.
- Support future model provider behind interface.
- Return 1 primary candidate + up to 3 alternatives.
- Include confidence/source labels.
- Include ingredient breakdown and nutrition estimate.

Acceptance:

- Candidate list is deterministic in demo mode.
- Candidate selection maps to save-ready meal payload.
- Low-confidence result encourages correction rather than pretending certainty.

## Task Group B — Manual Correction and Feedback

Tasks:

- Capture correction fields: dish, restaurant, ingredients, portion, cooking method, nutrition values.
- Store selected candidate and correction diff.
- Store feedback event for future training/evaluation.
- Make correction UI simple enough for MVP; avoid expert-only nutrition input overload.

Acceptance:

- Corrected values are reflected in saved meal.
- Correction feedback is recorded without blocking the save.

## Task Group C — Nutrition Estimation v1

Tasks:

- Use existing nutrition schema and macro/fiber fields.
- Support restaurant/menu item known values when available.
- Support AI estimate when database value unavailable.
- Preserve source status: user corrected / restaurant verified / AI estimate / manual.

Acceptance:

- User can see whether values are estimated or verified.
- Recommendation can consume nutrition values uniformly.

## Task Group D — Next-Meal Recommendation v1

Inputs:

- Today’s meal records.
- Planned dinner if available.
- User health goal mode if enabled.
- Taste preference tags.
- Meal period.
- Restaurant/menu availability if browsing restaurants.

Rules:

- If protein is low, suggest protein-forward option.
- If calories already high, suggest lighter/balanced option.
- If fiber is low, suggest vegetables/whole foods where appropriate.
- If user recently rated similar food highly, boost similar options.
- If user rated a dish poorly, avoid repeating it unless no alternatives.

Acceptance:

- Recommendation changes after a meal is saved.
- Recommendation includes a short reason.
- Reason uses safe wording.

## Task Group E — Restaurant Recommendation v1

Inputs:

- Search query/location.
- Meal period.
- Food type or `都可以`.
- Menu item nutrition/taste tags.
- User taste memory placeholder.

Tasks:

- Build filter function.
- Build scoring function.
- Explain top recommendation.
- Support direct Meal Buddy card creation from recommendation.

Acceptance:

- Filter changes are reflected on the same page.
- Restaurant recommendation has action path to detail and Meal Buddy card creation.

## Task Group F — Meal Buddy Candidate Ranking v1

Inputs:

- User Meal Buddy card.
- Candidate cards.
- Meal time/date.
- Restaurant/dish match.
- Social card availability.
- Free/premium candidate limits.

Rules:

- Same date/time first.
- Same restaurant/dish or compatible food type next.
- Nearby/available candidates next.
- Apply relationship deduplication before scoring.
- Exclude any candidate who already has an accepted match, active Meal Buddy relationship, or active one-on-one chat with the current user.
- Allow candidates with prior unaccepted invitations to reappear only with a strong ranking penalty and cooldown rules.
- Allow candidates who were previously shown but received no action to reappear only with a lighter no-action penalty.
- Do not boost prior matched/friend users in new-candidate discovery; existing contacts belong in the chat/friend flow.
- Do not expose sensitive health data or ranking-penalty reasons in candidate explanation.

Implementation Notes:

- Build a candidate-history lookup keyed by unordered user pair: `(min(userA,userB), max(userA,userB))`.
- Query `matches`, `meal_buddy_relationships`, `chats`, `chat_participants`, `invitations`, and candidate impression events before ranking.
- Treat active one-on-one chat as a hard exclusion regardless of which meal-buddy card created it.
- Suggested MVP penalties: no accepted invitation `0.55x`, declined/expired invite `0.45x + cooldown`, impression-with-no-action `0.85x`, capped repeat-impression penalty.
- Keep penalty weights configurable through code constants or a lightweight config table.

Acceptance:

- Free shows 3 candidates in demo flow after deduplication and penalty ranking.
- Premium shows 5 and can support multi-select where enabled after deduplication and penalty ranking.
- A user already present in the current user's active one-on-one chat never appears as a new candidate.
- A previously invited but non-accepting candidate may reappear, but is ranked lower than comparable fresh candidates.
- A candidate shown without action may reappear, but repeat frequency is reduced.
- Candidate reason tags are understandable and do not mention hidden penalty states.

## Task Group G — Taste Memory Placeholder

MVP placeholder:

- Store meal ratings.
- Store user taste tags inferred from ratings.
- Prepare interface for similar-taste user logic.
- Use simple rule-based fallback, not complex ML.

Acceptance:

- The code has a clear extension point.
- Lack of rating history does not break recommendation.

## AI Evaluation Checklist

- Candidate correctness can be manually reviewed.
- Correction rate can be tracked.
- Recommendation click/save/invite events can be tracked.
- Cost per analysis can be estimated once provider is connected.
- Safety phrases are reviewed before external demo.

## AI Prompt / Model Guardrails

- Ask model to return structured JSON only.
- Do not ask model to provide medical diagnosis.
- Include uncertainty and source labels.
- Avoid overconfident calorie precision.
- Prefer ranges or estimates where appropriate in user-facing explanation.
