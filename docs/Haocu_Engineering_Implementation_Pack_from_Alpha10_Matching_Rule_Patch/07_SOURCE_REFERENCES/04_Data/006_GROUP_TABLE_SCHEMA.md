# Group Table Schema

## Purpose
Define data for four-person group dining tables and future 6/8-person upgrades.

## `group_tables`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| host_user_id | uuid | Table creator. |
| host_social_card_id | uuid | Display identity. |
| restaurant_id | uuid | Optional. |
| menu_item_id | uuid | Optional. |
| title | text | Display title. |
| meal_time | timestamptz | Planned time. |
| table_size | int | 4 default; 6/8 Premium upgrade. |
| status | enum | open, full, completed, cancelled, expired. |
| payment_preferences | jsonb | Optional group-level preference. |
| note | text | Host note. |
| created_at | timestamptz |  |
| updated_at | timestamptz |  |
| expires_at | timestamptz |  |

## `group_table_participants`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| table_id | uuid | FK group_tables.id. |
| user_id | uuid | Participant. |
| social_card_id | uuid | Display identity. |
| role | enum | host, participant. |
| status | enum | invited, joined, left, removed, cancelled. |
| joined_at | timestamptz |  |
| cancelled_reason | text | Required when leaving after join if policy requires. |

## `group_table_invitations`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| table_id | uuid |  |
| inviter_user_id | uuid |  |
| invitee_user_id | uuid |  |
| status | enum | sent, accepted, declined, expired, cancelled. |
| created_at | timestamptz |  |

## Chat Relationship

Each group table should have one group chat:

- `chat_type = group_table`
- `table_id = group_tables.id`
- participants mirror joined table participants
- group chat may be deleted or archived one week after meal completion according to policy

## Capacity Rules

- MVP default table size: 4.
- Premium may unlock upgrade to 6 or 8.
- Free users cannot host group table if product policy says host is Premium-only.
- A Premium user can host only one active table at a time if specified by PRD.

## Cancellation Rules

When a participant cancels:

1. Store reason.
2. Add system message to group chat.
3. Update participant status.
4. Reopen seat if applicable.

## Acceptance Criteria

1. Group tables reference the same social card identity model.
2. Participant cards can be opened from table UI.
3. Table status updates when capacity is reached.
4. Cancellation reason can produce system chat message.
5. One group chat maps to one group table.
