# Phase 2W-E Mobile Cutover Contract

## Initial read

- Opening the Meal Log completion form maps the selected record through the safe target mapper.
- A safe restaurant target calls `getCurrentUserRestaurantRating`; a future safe menu target may call `getCurrentUserMenuItemRating`.
- `missing` is normal. Available values prefill only stars, exact supported portion feeling, and yes/no repurchase intent.
- Disabled, unauthenticated, target-unavailable, and failed states are presented without raw transport or database details.
- An unsafe target calls no canonical repository or service method.

## Submit

- Stars map to `ratingValue`; portion choice maps to `portionFeeling`; would-eat-again maps to `repurchaseIntent` as `yes` or `no`.
- `unfinishedReason` is not mapped to `dislikeReasons` or another feedback field.
- The local meal completion is saved first through the existing store. Canonical rating then calls only `createOrReplaceCurrentUserRating`.
- Duplicate canonical submits are suppressed while a save is in flight.
- Canonical saved/replaced/disabled/unauthenticated/failed results remain distinct presentation states.
- Canonical failure never rolls back or hides a completed local completion update.

Default read remains `mock`; default write remains `disabled`. No silent fallback is introduced.
