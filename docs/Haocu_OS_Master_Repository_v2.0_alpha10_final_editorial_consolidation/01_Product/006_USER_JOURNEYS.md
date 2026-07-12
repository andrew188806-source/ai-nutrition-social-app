# User Journeys

## Purpose

This document translates the product vision into end-to-end user journeys. PRDs should use these journeys as flow-level references.

## Journey 1 — First-Time Meal Analysis

### User Intent

“I just ate this. Help me understand what it is and whether it fits today.”

### Flow

1. User opens home.
2. User taps AI analysis or homepage analysis shortcut.
3. User selects or confirms meal context when required.
4. User takes photo or uploads image.
5. System shows candidate dishes.
6. User confirms candidate or chooses manual correction.
7. System shows nutrition estimate.
8. User saves meal.
9. Home today summary updates.
10. User sees recommended next action.

### Success State

User understands the meal and sees it reflected in today’s intake.

### Failure Risks

- Analysis resets after leaving screen.
- Saved meal appears in one surface but not another.
- Candidate names feel unrealistic for Taiwan food context.
- Nutrition estimate appears too authoritative without confidence language.

## Journey 2 — Correction and Manual Entry

### User Intent

“The AI result is close but wrong. Let me fix it without starting over.”

### Flow

1. User sees top candidates.
2. User chooses another candidate or “以上皆非／手動輸入”.
3. User edits dish name, restaurant, ingredients, portion, cooking method, and nutrition if needed.
4. System recalculates estimate.
5. User saves corrected meal.
6. Correction history is stored.

### Success State

Correction feels like a normal part of the product, not an error.

## Journey 3 — Today Intake and Food Diary

### User Intent

“What did I eat today, and what does it mean?”

### Flow

1. Home shows compact today summary.
2. User taps detail.
3. Today intake page shows meals, nutrients, balance notes, and planned dinner if any.
4. User can review recent day cards in food diary.
5. User can rate a meal and mark completion state.

### Success State

User sees a consistent, readable record across home, detail, and diary.

## Journey 4 — Restaurant Recommendation

### User Intent

“I need something to eat nearby or for a specific meal.”

### Flow

1. User opens restaurant recommendation.
2. User sets location/search/meal-type/type filters, including “都可以” when appropriate.
3. System shows restaurant cards.
4. Each card explains why it fits.
5. User can view dishes.
6. User can create a meal-buddy card from the restaurant card.

### Success State

The recommendation feels personal, not just popular.

## Journey 5 — Meal Buddy Card from Analysis

### User Intent

“I analyzed this meal or meal plan, and I want to find someone to eat with.”

### Flow

1. User completes analysis.
2. System offers next action to create meal-buddy card.
3. Card defaults to the current day for AI-generated flow.
4. User confirms food/restaurant, time, chat-first/direct meal, payment preference, and note.
5. System creates card.
6. User lands where the new card is visible.
7. Candidate list appears based on availability and limits.

### Success State

User knows the card was created and can invite or wait.

## Journey 6 — Meal Buddy Card from Restaurant

### User Intent

“I found this restaurant. I want to use this meal to find a meal buddy.”

### Flow

1. User opens restaurant card.
2. Date/time selector appears near the restaurant card, not hidden at bottom.
3. User taps create meal-buddy card.
4. System creates card and navigates to its visible location.
5. Candidate recommendations are shown.

### Success State

The restaurant-to-social path is clear and not duplicated.

## Journey 7 — Chat and Invite

### User Intent

“I want to chat first or invite someone to eat.”

### Flow

1. User sees candidates.
2. User taps chat-first or invite meal depending card settings.
3. System creates/opens the correct chat.
4. Accepting invitation adds the person to meal-buddy relationship where defined.
5. Sending a message moves that chat to the top of chat list.
6. Back navigation returns to chat list, not matched tab.

### Success State

Chat behavior matches user expectations from common messaging apps.

## Journey 8 — Group Table

### User Intent

“I want a four-person meal table instead of one-on-one.”

### Flow

1. User opens多人飯局 or restaurant table entry.
2. User sees available four-person tables.
3. User joins or creates a table if allowed.
4. Participants reference the same user profile pool.
5. Table chat is separate from one-on-one chat.
6. Leaving requires a reason and posts system message.
7. Chat expires one week after completion.

## Journey 9 — Premium Upgrade Understanding

### User Intent

“What do I get if I pay?”

### Flow

1. Free user hits card/candidate/list limit or sees locked identity features.
2. UI explains premium benefit in context.
3. Premium unlocks richer social card, more daily opportunities, more candidates, Top saved items, and health-goal mode.
4. Free core loop remains usable.

### Success State

Premium feels like expansion, not ransom.

## Journey 10 — Restaurant Partner Review

### User Intent

“As a restaurant, I want my dishes to show up correctly and responsibly.”

### Flow

1. Restaurant data is added or inferred.
2. Dishes are reviewed for plausibility.
3. Nutrition disclosure is clearly marked as estimate/reviewed where appropriate.
4. Admin review handles verification and claim boundaries.

### Success State

Restaurant data improves consumer recommendations while avoiding unreviewed claims.
