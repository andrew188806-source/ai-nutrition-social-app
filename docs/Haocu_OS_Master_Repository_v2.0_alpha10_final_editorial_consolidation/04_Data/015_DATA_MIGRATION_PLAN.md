# Data Migration Plan

## Purpose
Define how Haocu moves from demo/mock data to production-ready Supabase data without breaking product flows.

## Migration Stages

### Stage 0: Mock Data
Current demo may use local arrays such as mock users, meal buddy cards, matches, chats, group tables, restaurants, and meals.

Goal:
- Keep demo stable.
- Use consistent IDs and relationships.
- Avoid hard-coded one-off records.

### Stage 1: Local Storage Adapter
Introduce cross-platform storage adapter:

- Web: localStorage.
- Native Expo: AsyncStorage.
- Shared interface for read/write.

Goal:
- Preserve demo state across sessions.
- Avoid platform-specific logic inside screens.

### Stage 2: Supabase Core Tables
Move core records to Supabase:

- users/profile
- meal_records
- restaurants/menu_items
- social_cards
- meal_buddy_cards
- chats/messages
- group_tables

### Stage 3: AI and Analytics Tables
Add:

- ai_analysis_runs
- ai_candidates
- nutrition_estimates
- correction_events
- analytics_events

### Stage 4: Governance and Admin Tables
Add:

- consent_records
- audit_logs
- admin_review_items
- restaurant_admin_users

## Seed Data Strategy

Seed data should support demo flows:

- Taiwanese outside-food breakfast/lunch/dinner.
- Healthy bento restaurants.
- Restaurant cards with real-looking menu items.
- Meal Buddy candidates with unified user IDs.
- Group table examples.
- Chat sorting scenarios.

## Migration Rules

- Never migrate broken mock relationships.
- Use stable IDs in seed files for reproducible demos.
- Keep schema migration files versioned.
- Document breaking changes in changelog.
- Add rollback notes for risky migrations.

## Acceptance Criteria

1. Mock data references are unified before production migration.
2. Storage adapter works on web and native.
3. Meal records are collection-based.
4. Chat and group table data share identity model.
5. Supabase migration order avoids FK failures.
