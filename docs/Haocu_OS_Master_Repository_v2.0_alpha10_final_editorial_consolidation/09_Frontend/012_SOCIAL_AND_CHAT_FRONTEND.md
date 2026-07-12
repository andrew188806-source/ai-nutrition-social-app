# 012 Social and Chat Frontend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines Meal Buddy, social card, invitation, chat, and group table frontend behavior.

## Social Identity

Every social display should resolve from canonical user/profile/social card data.

Display modes:

- Anonymous mascot.
- Premium real profile.
- Verification status.

## Meal Buddy Tabs

Suggested top-level areas:

- My Meal Buddy card.
- Matched/Friends.
- Invitations.
- Chat.
- Group Table / 多人飯局.

Search input should appear only where it helps, such as matched/friend list, not chat or group table views unless explicitly implemented.

## Invitation Flow

Actions:

- 先聊聊.
- 邀請吃飯.

Avoid sending users to an unrelated invitation tab immediately if the intended UX is locked/pending state on the card.

## Chat List

Rules:

- Sort by latest message timestamp descending.
- Sending a message updates current thread preview and moves it to top.
- Back from thread returns to chat tab/list.

## Group Table

Rules:

- Group Table has separate table ID and chat thread ID.
- Participant cards reference same social identity pool.
- Cancellation requires reason and creates system message.
- Group chat expires/deletes according to policy after meal completion window.

## Known Bug Guards

- Do not create a fake LEO/BO/Ivy path that bypasses accepted invitation state.
- Do not let group table route open the wrong four-person table detail.
- Do not mix one-to-one chat with group table chat state.
