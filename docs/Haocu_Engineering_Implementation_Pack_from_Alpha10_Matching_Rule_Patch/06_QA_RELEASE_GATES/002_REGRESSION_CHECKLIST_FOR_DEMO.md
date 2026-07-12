# 002 Regression Checklist for Demo

## Core 3-Minute Demo Path

1. Home opens cleanly.
2. Start AI analysis.
3. Show candidate dish result.
4. Correct/confirm result.
5. Save meal.
6. Today Intake updates.
7. Recommendation updates.
8. Create Meal Buddy card.
9. Candidate list appears after deduplication.
10. Send invite or open chat flow.
11. Chat list sorts correctly.
12. Restaurant card can create another card without hiding date selector.
13. Group table entry opens correct flow if included in demo.

## Known Regression Cases to Protect

- Today Intake shows meals but full nutrition report shows 0.
- Chat message sent but thread does not move to top.
- Back from chat jumps to matched tab.
- Accepted invite appears in chat but not in Meal Buddy/friend list.
- Restaurant-created Meal Buddy card is saved but user cannot find it.
- Previously chatted user appears again as a new candidate.
- Hard-coded non-i18n visible copy appears in touched files.
- Mock data is presented as live evidence.
