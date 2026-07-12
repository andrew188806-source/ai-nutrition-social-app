# Chat and Invitation Schema

## Purpose
Define chat, invitation, and sorting behavior across Meal Buddy and group table flows.

## `chats`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| chat_type | enum | one_to_one, group_table. |
| table_id | uuid | Required for group_table chat. |
| last_message_at | timestamptz | Used for sorting. |
| last_message_preview | text | Optional. |
| status | enum | active, archived, deleted. |
| created_at | timestamptz |  |

## `chat_participants`

| Field | Type | Notes |
|---|---|---|
| chat_id | uuid | FK. |
| user_id | uuid | Participant. |
| social_card_id | uuid | Display identity. |
| role | enum | member, host, admin. |
| joined_at | timestamptz |  |
| last_read_at | timestamptz |  |
| status | enum | active, left, blocked. |

## `messages`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| chat_id | uuid | FK. |
| sender_user_id | uuid | Null for system message. |
| message_type | enum | text, system, invite, table_update. |
| body | text |  |
| metadata | jsonb | Optional. |
| created_at | timestamptz |  |
| deleted_at | timestamptz | Soft delete. |

## `invitations`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| invitation_type | enum | chat, meal, group_table. |
| sender_user_id | uuid |  |
| receiver_user_id | uuid |  |
| meal_buddy_card_id | uuid | Optional. |
| table_id | uuid | Optional. |
| status | enum | sent, accepted, declined, expired, cancelled. |
| created_at | timestamptz |  |
| responded_at | timestamptz |  |

## Critical Behavior Rules

### Chat Sorting
Chat list must sort by `last_message_at` descending.

When a user sends a message:

1. Create message.
2. Update chat.last_message_at.
3. Update chat.last_message_preview.
4. Chat moves to top of list.

### Back Navigation
Returning from a chat room should return to the chat list, not the matched tab.

### Accepting Invitation
Accepting chat or meal invitation should:

1. Update invitation status.
2. Create or update relationship state.
3. Ensure both users appear in relevant Meal Buddy/friend list.
4. Create or activate chat.


### Candidate Discovery Deduplication

Candidate discovery must check chat and invitation state before ranking:

1. If a one-on-one chat exists between the current user and candidate with active participants, exclude that candidate from new Meal Buddy discovery.
2. If an accepted match or active Meal Buddy relationship exists between the same two users, exclude that candidate from new Meal Buddy discovery.
3. If an invitation was sent but not accepted, the candidate may reappear only with a strong ranking penalty and optional cooldown.
4. If the candidate was shown as an impression but the user took no action, the candidate may reappear with a lighter no-action penalty.
5. Hidden penalty states should be internal only and should not appear in user-facing reason tags.

## Acceptance Criteria

1. One-to-one and group table chats are separate but share base schema.
2. Chat list reorders when a new message is sent.
3. Invite acceptance creates relationship state.
4. System messages can record group table cancellation/update events.
5. Chat identity references social card display rules.
6. Active one-on-one chat state can be used as a hard exclusion for duplicate candidate discovery.
7. Unaccepted invitation and no-action history can be used for ranking penalties.
