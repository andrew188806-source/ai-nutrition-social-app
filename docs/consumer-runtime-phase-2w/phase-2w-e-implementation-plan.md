# Phase 2W-E Mobile Cutover Local Implementation Plan

Status: local implementation only; Development validation, Freeze candidate, and Freeze are false.

## Objective

Connect the existing Mobile Meal Log post-meal form to the Frozen canonical `ConsumerRatingService` while preserving local meal-completion persistence as an independent operation.

## Implementation

1. Add an explicit Mobile composition that injects `ConsumerAuthPort` and, only for explicitly selected Supabase sources, the existing consumer client into the Frozen ratings factory.
2. Add a target mapper that accepts canonical ID fields only and never derives identity from display evidence.
3. Add a presentation state model for initial reads, safe writes, duplicate-submit prevention, and partial-success messaging.
4. Cut the existing Meal Log completion form to restaurant ratings when a safe `restaurantId` exists. The current local Meal Log has no trustworthy `menuItemId` or canonical meal UUID, so menu-item writes and meal linkage remain unavailable there.
5. Preserve local completion percentage and actual-calorie persistence regardless of canonical rating outcome.

No migration, SQL/RPC, adapter contract change, Development connection, credential smoke, UI navigation change, Favorites work, recommendation feedback, or Phase 2X work belongs to this implementation.
