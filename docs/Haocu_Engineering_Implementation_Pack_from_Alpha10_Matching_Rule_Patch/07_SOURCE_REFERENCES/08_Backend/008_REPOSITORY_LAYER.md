# 008 Repository Layer

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

The repository layer isolates database queries from service/domain logic.

## Repository Pattern

Each repository should expose task-oriented methods rather than leaking raw query logic everywhere.

Examples:

- `MealRepository.listByUserAndDate(userId, date)`
- `MealRepository.createMealRecord(input)`
- `MealBuddyRepository.getActiveCards(userId, date)`
- `ChatRepository.updateLastMessage(threadId, message)`
- `GroupTableRepository.addParticipant(tableId, userId)`

## Repository List

- `ProfileRepository`
- `MealRepository`
- `AIAnalysisRepository`
- `RestaurantRepository`
- `MealBuddyRepository`
- `InvitationRepository`
- `ChatRepository`
- `GroupTableRepository`
- `PremiumRepository`
- `AdminReviewRepository`
- `AnalyticsRepository`
- `AuditRepository`

## Query Standards

- Always scope user-private queries by actor user ID.
- Paginate list queries.
- Avoid selecting `*` for public responses.
- Use explicit column lists for sensitive tables.
- Use indexes for frequent filters.

## Mock Repository

For demo mode, mock repositories may implement the same interface. This prevents UI logic from depending on hard-coded page data.

## Migration Path

Start with mock repositories and Supabase repositories sharing the same type contracts. Replace implementations without changing UI flow.
