# Group Table PRD

## Objective

Support group dining through four-person tables, with possible premium upgrades to six or eight participants.

## Product Role

Group table offers a lower-pressure social dining model than one-on-one matching. It should remain food-first and operationally simple.

## Table Model

### MVP / Default

- Four-person table is the primary visible model.
- User can browse available tables.
- User can join or create where allowed.

### Premium / MVP+

- Upgrade to six/eight participants where defined.
- Premium user may have table creation privileges.

## Required Fields

| Field | Description |
|---|---|
| `tableId` | Stable ID. |
| `hostUserId` | Creator. |
| `restaurantId` | Optional. |
| `mealDate` | Date. |
| `mealTime` | Time. |
| `capacity` | 4, 6, or 8. |
| `participants` | User references. |
| `status` | open, full, completed, cancelled. |
| `chatId` | Separate group chat. |
| `source` | restaurant, meal-buddy, manual. |

## Primary Flow

```text
Open group table surface
  -> View available tables
  -> Join or create table
  -> Confirm participants
  -> Open table chat
  -> Meal happens
  -> Completion/cancel flow
  -> Chat expires after one week
```

## Functional Requirements

1. Four-person table is the default model.
2. Participant data references the same user pool as social cards.
3. One-on-one chats and table chats are separate.
4. Leaving table requires reason.
5. Leaving/cancellation posts system message.
6. Group chat expires one week after meal completion.
7. Restaurant entry may show table find/create, but not aggressively.
8. Full tables cannot be joined unless capacity changes.

## UI Requirements

- “多人飯局” should be a single clear entry.
- Group table should not be confused with normal chat tab.
- Participant avatars must match social card identity.
- Table status must be clear.

## Data Dependencies

- `group_tables`
- `group_table_participants`
- `social_cards`
- `restaurants`
- `chats`
- `chat_messages`

## API Dependencies

- `POST /group-tables`
- `GET /group-tables?filters=`
- `POST /group-tables/{tableId}/join`
- `POST /group-tables/{tableId}/leave`
- `POST /group-tables/{tableId}/complete`

## Analytics Events

- `group_table_viewed`
- `group_table_created`
- `group_table_joined`
- `group_table_left`
- `group_table_completed`
- `group_chat_message_sent`

## Acceptance Criteria

1. User can view available tables.
2. User can join/create a table in demo flow.
3. Participants display correct identities.
4. Table chat is separate from one-on-one chat.
5. Leaving requires reason and posts system message.
6. Expiration rule is documented for implementation.

## MVP+ Enhancements

- Table invitation system.
- Capacity upgrades.
- Restaurant table packages.
- Safety moderation.
