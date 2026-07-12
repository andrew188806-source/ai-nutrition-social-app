# Chat and Invitation UI

## Purpose
Define one-to-one chat, invitation, and chat list behavior.

## Chat List

Sort by latest message time descending.

Each row should show:

- avatar/mascot
- display name
- last message preview
- time
- unread indicator
- context badge only if useful

Avoid redundant blue tags that duplicate selected tab state.

## Chat Room

Elements:

- header with identity and context
- message list
- input
- invitation context card if active
- back button to chat list

## Invitation UI

Invitation card should show:

- who invited
- restaurant/meal
- time
- chat-first/direct meal intent
- payment preference
- accept/decline actions

## Locked Demo Actions

If “先聊聊” or “邀請吃飯” should be locked in a demo state, show disabled/locked state directly rather than navigating to an unrelated invite tab.

## Critical Behavior

When user sends a message:

- the conversation moves to top of chat list
- last message preview updates
- return path stays on chat tab

When user accepts invitation:

- both users become related/matched
- chat appears in chat list
- person appears in Meal Buddy relationship list

## Acceptance Criteria

1. Chat list sorting updates after send.
2. Back button returns to chat list.
3. Accepting invite updates relationship state.
4. Locked actions do not navigate incorrectly.
5. Chat identity uses consistent avatar/mascot.
