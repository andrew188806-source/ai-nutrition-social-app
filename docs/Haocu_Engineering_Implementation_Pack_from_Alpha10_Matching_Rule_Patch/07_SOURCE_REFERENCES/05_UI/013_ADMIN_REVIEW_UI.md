# Admin Review UI

## Purpose
Define internal admin UI for reviewing restaurants, nutrition disclosure, user reports, social verification, sponsored content, and audit logs.

## Review Queues

- Restaurant verification.
- Menu/nutrition review.
- Real-person social card verification.
- Reported users/content.
- Sponsored/ad review.
- AI estimate issue review.

## Review Item Layout

Each review item should show:

- entity summary
- submitted data
- source type
- risk flags
- prior history
- approve/reject/request changes actions
- reviewer note

## Nutrition Review

Must distinguish:

- restaurant provided
- AI estimated
- admin reviewed
- professional reviewed if applicable

## Audit Requirements

Every admin action should create audit log:

- reviewer
- action
- before/after state
- reason/note
- timestamp

## Acceptance Criteria

1. Review queues are separated by domain.
2. Review actions create audit logs.
3. Nutrition and identity review states are clear.
4. Admin UI does not silently change user/private data.
5. Risky actions require confirmation and note.
