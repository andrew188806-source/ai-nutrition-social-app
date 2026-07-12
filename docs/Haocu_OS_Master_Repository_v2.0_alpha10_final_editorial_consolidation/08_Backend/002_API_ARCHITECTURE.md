# 002 API Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines how APIs should be structured.

## API Style

MVP can use Supabase client reads plus Edge Functions for business operations. Externally, document APIs as service operations.

## API Categories

### Profile APIs

- `getMyProfile`
- `updateProfile`
- `updateSocialCard`
- `submitVerification`

### Meal APIs

- `createAIAnalysisJob`
- `getAIAnalysisJob`
- `confirmAIAnalysis`
- `createMealRecord`
- `listMealRecords`
- `rateMeal`

### Recommendation APIs

- `getNextMealRecommendations`
- `getRestaurantRecommendations`
- `logRecommendationFeedback`

### Meal Buddy APIs

- `createMealBuddyCard`
- `listMyMealBuddyCards`
- `listMealBuddyCandidates`
- `sendInvitation`
- `respondInvitation`

### Group Table APIs

- `createGroupTable`
- `listAvailableGroupTables`
- `joinGroupTable`
- `leaveGroupTable`
- `completeGroupTableMeal`

### Chat APIs

- `listChatThreads`
- `getChatMessages`
- `sendChatMessage`
- `markThreadRead`

### Restaurant APIs

- `listRestaurants`
- `getRestaurantDetail`
- `createOrUpdateMenuItem`
- `submitNutritionDisclosure`

### Admin APIs

- `listPendingReviews`
- `approveRestaurant`
- `rejectRestaurant`
- `approveNutritionDisclosure`
- `resolveAbuseReport`

## Request Design

Requests should include:

- Auth context from session.
- Minimal required payload.
- Idempotency key for risky operations where useful.
- Clear optional fields.

## Response Design

Responses should include:

- `data` on success.
- Structured error on failure.
- No internal secret or prompt details.

## API Versioning

MVP can use internal versioning through code and docs. Public APIs should eventually include `/v1` boundary if external integrations are exposed.
