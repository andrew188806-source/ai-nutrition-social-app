# Error, Empty, Loading, and Offline State PRD

## Objective

Ensure Haocu feels reliable even when data is missing, AI fails, network is unstable, or users have not created content yet.

## Product Principle

An empty state should tell the user what to do next. An error state should preserve user work when possible.

## Cross-App States

### Loading

Use short, friendly Traditional Chinese copy.

Examples:

- “正在分析餐點…”
- “正在整理今天的飲食…”
- “正在找附近適合你的餐廳…”

### Empty

Must include:

- what is missing;
- why it matters;
- one next action.

### Error

Must include:

- what failed;
- whether user data is safe;
- retry or fallback action.

### Offline

- Allow viewing cached records where possible.
- Queue non-critical actions where feasible.
- Do not lose unsaved correction input.

## Screen-Specific Empty States

| Screen | Empty State | Primary Action |
|---|---|---|
| Today Intake | No meals saved today | Start AI analysis |
| Food Diary | No history yet | Save first meal |
| Restaurant | No matching restaurants | Broaden search |
| Meal Buddy | No active cards | Create card |
| Chat | No messages | Send first message |
| Group Table | No tables | Create table or change filters |
| Premium | No entitlement | View benefits |

## Failure Handling Requirements

1. AI upload failure allows retry/manual entry.
2. Meal save failure preserves corrected input.
3. Restaurant fetch failure preserves filters.
4. Chat send failure shows retry.
5. Card creation failure preserves selected fields.
6. Offline mode does not silently discard user actions.

## Analytics Events

- `empty_state_viewed`
- `error_state_viewed`
- `retry_tapped`
- `offline_state_viewed`
- `queued_action_created`

## Acceptance Criteria

1. No major screen shows a blank state without explanation.
2. User always has a clear next action.
3. Failed saves do not destroy user input.
4. Error copy remains friendly and non-technical.
5. Empty states support clean UI and do not feel cluttered.
