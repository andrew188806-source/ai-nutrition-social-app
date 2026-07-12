# 002 Meal Buddy / Chat Workstream

## Goal

Make Meal Buddy card creation, candidate ranking, invitation, relationship, and chat state use one consistent model.

## Source Docs

- `07_SOURCE_REFERENCES/02_PRD/005_MEAL_BUDDY_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/006_SOCIAL_CARD_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/013_CHAT_INVITATION_PRD.md`
- `07_SOURCE_REFERENCES/04_Data/005_SOCIAL_SCHEMA.md`
- `07_SOURCE_REFERENCES/04_Data/011_CHAT_AND_INVITATION_SCHEMA.md`
- `07_SOURCE_REFERENCES/05_UI/005_MEAL_BUDDY_UI.md`
- `07_SOURCE_REFERENCES/05_UI/011_CHAT_INVITATION_UI.md`
- `07_SOURCE_REFERENCES/09_Frontend/012_SOCIAL_AND_CHAT_FRONTEND.md`
- `04_MATCHING_RULE_PATCH/001_CANDIDATE_DEDUP_ENGINEERING_SPEC.md`

## Build Order

1. Normalize mock users/social cards/meal buddy cards/matches/chats/group tables.
2. Implement Meal Buddy card creation from AI result.
3. Implement Meal Buddy card creation from restaurant card.
4. Implement candidate discovery hard exclusions.
5. Implement invitation/no-action soft ranking penalties.
6. Implement invite acceptance to relationship + chat state.
7. Fix chat sorting and back navigation.

## Acceptance

- A created Meal Buddy card appears immediately in visible location.
- Free/premium candidate limits are respected after deduplication.
- Accepted/active chat users never appear as new candidates.
- Invitations not accepted may reappear only with strong penalty.
- Passive impressions may reappear only with light penalty.
- Chat list sorts by latest message.
- Returning from chat goes to chat list, not matched tab.
