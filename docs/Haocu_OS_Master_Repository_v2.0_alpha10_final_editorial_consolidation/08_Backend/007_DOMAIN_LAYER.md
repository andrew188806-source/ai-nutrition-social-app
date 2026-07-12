# 007 Domain Layer

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

The domain layer defines business rules independent of UI and storage implementation.

## Domain Rules

### Meal Record

- A confirmed AI analysis may create one meal record.
- A meal record can contain multiple meal items.
- Nutrition estimate source must be tracked.
- User corrections should not overwrite raw AI candidates; store both.

### Meal Buddy

- Free users: limited daily card creation and limited candidate count.
- Premium users: higher daily limits and broader matching.
- Creating a new card when limit reached may overwrite or require explicit handling according to PRD.
- Restaurant-generated card defaults to current date.

### Social Card

- Free social identity uses anonymous mascot.
- Premium can unlock real profile mode.
- Real profile requires verification flow before broad exposure.

### Chat

- Chat thread membership controls access.
- Latest message updates thread sort order.
- One-to-one chat and group table chat must be separate thread types.

### Group Table

- Four-person table is MVP default.
- 6/8 upgrades are post-MVP or premium extension.
- Cancellation requires reason and creates system message.
- Group calorie sharing does not automatically modify individual nutrition records in MVP.

### Restaurant

- Restaurant menu data can improve AI estimates.
- Nutrition disclosure must show review/verification state.
- Restaurant owner cannot see private user records.

## Domain State Machines

### Invitation

```text
pending → accepted
pending → declined
pending → expired
pending → cancelled
```

### Group Table

```text
draft → open → full → completed
open → cancelled
full → cancelled
```

### AI Analysis Job

```text
created → processing → completed
created/processing → failed
completed → confirmed
```
