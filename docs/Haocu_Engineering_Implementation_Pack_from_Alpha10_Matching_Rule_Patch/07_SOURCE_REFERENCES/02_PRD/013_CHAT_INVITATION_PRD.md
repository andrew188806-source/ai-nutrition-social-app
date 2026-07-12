# Chat and Invitation PRD

## Objective

Define chat, invite, acceptance, cancellation, and list ordering behavior for meal-buddy and group-table flows.

## Product Role

Chat converts meal intent into actual coordination. It must behave predictably like a modern messaging app.

## Chat Types

- One-on-one meal-buddy chat.
- Group table chat.

These must use separate IDs and not be visually or logically merged.

## Primary Flows

### One-on-One Invite

```text
View candidate
  -> Send invite or chat first
  -> Candidate accepts/declines
  -> Match state updates
  -> Chat opens
```

### Group Table Chat

```text
Join/create table
  -> Table chat created/opened
  -> Participants coordinate
  -> Completion/cancellation events appear as system messages
```

## Functional Requirements

1. Sending a message updates chat `lastMessageAt`.
2. Chat list sorts by latest activity descending.
3. Back from chat returns to chat list/tab.
4. Accepting invitation creates/updates meal-buddy relationship.
5. Declining invitation updates status.
6. Cancellation requires reason where defined.
7. System messages are inserted for invite, acceptance, cancellation, leaving table, and completion.
8. One-on-one and table chats are not mixed.

## Known Bug Fix Requirements

- Back navigation must not jump from chat detail to matched tab unexpectedly.
- Latest message must move the chat to the top of the list.
- Accepting chat/meal invite must not create a fake user outside the unified user/card model.


## Candidate Discovery Impact

Chat and invitation state directly affect Meal Buddy candidate discovery:

- Accepted chat or meal invitation creates a relationship and/or active chat. That user must not appear again as a new candidate.
- A candidate already visible in the user's one-on-one chat list must be excluded from new candidate discovery.
- Invitations that were sent but not accepted do not create a hard exclusion, but they should lower future recommendation ranking.
- Candidates previously shown without action should receive a lighter repeat-exposure penalty.
- These internal states must not be surfaced as negative user-facing labels.

## Data Dependencies

- `chats`
- `chat_messages`
- `matches`
- `meal_buddy_invitations`
- `group_tables`
- `users`
- `social_cards`

## API Dependencies

- `GET /chats`
- `GET /chats/{chatId}`
- `POST /chats/{chatId}/messages`
- `POST /invitations/{id}/accept`
- `POST /invitations/{id}/decline`
- `POST /invitations/{id}/cancel`

## Analytics Events

- `chat_list_viewed`
- `chat_opened`
- `chat_message_sent`
- `invite_sent`
- `invite_accepted`
- `invite_declined`
- `invite_cancelled`
- `chat_back_navigation_used`

## Acceptance Criteria

1. Message send updates list order immediately.
2. Back navigation returns to chat list/tab.
3. Accepted invite creates correct meal-buddy relationship.
4. Group and one-on-one chats remain separate.
5. System messages appear for lifecycle events.
6. Chat data references unified user identity.
7. Accepted/active chat relationships exclude duplicate Meal Buddy candidate discovery.
