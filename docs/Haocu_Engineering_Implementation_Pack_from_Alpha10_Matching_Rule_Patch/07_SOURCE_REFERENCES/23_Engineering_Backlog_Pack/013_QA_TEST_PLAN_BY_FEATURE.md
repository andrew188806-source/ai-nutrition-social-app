# 013 QA Test Plan by Feature

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This QA plan maps MVP features to manual and future automated tests.

## Test Severity

- Blocker: app crash, broken demo path, data loss, privacy/security issue.
- Critical: core MVP flow broken or inconsistent.
- Major: important feature incorrect but workaround exists.
- Minor: visual/text issue not blocking demo.

## Global Smoke Test

- [ ] App launches.
- [ ] Home loads.
- [ ] AI Analysis entry opens capture/upload state.
- [ ] Demo analysis returns candidates.
- [ ] User can save meal.
- [ ] Today Intake updates.
- [ ] Full nutrition report matches saved meals.
- [ ] Recommendation updates.
- [ ] Meal Buddy card can be created.
- [ ] Candidate list loads.
- [ ] Invite/chat flow works.
- [ ] Restaurant list/detail loads.
- [ ] Group table entry opens correct page.
- [ ] Demo seed reset works.

## AI Analysis Tests

### AI-01 Candidate Selection

Steps:

1. Start AI analysis.
2. Use demo photo/mock result.
3. Select second candidate.
4. Save.

Expected:

- Saved record uses selected candidate values.
- No duplicate record created.

### AI-02 Manual Correction

Steps:

1. Start AI analysis.
2. Choose “以上皆非 / 手動輸入”.
3. Edit dish name, portion, nutrition.
4. Save.

Expected:

- Corrected values appear in Today Intake and Diary.
- Correction feedback/debug event exists.

### AI-03 State Retention

Steps:

1. Reach analysis result.
2. Navigate away.
3. Return to AI Analysis.

Expected:

- Same result screen remains unless user intentionally resets.

## Meal Record / Intake Tests

### MEAL-01 Multi-Meal Same Day

Steps:

1. Save three meals for today.
2. Open Home summary.
3. Open full nutrition report.

Expected:

- Totals match across Home and report.
- Report is not zero.

### MEAL-02 Planned Dinner

Steps:

1. Add planned dinner.
2. Open Today Intake.

Expected:

- Planned dinner displays as planned.
- Eaten total does not count it unless confirmed.

## Recommendation Tests

### REC-01 Intake-Aware Recommendation

Steps:

1. Save high-calorie meal.
2. View next-meal recommendation.
3. Reset and save protein-light meal.
4. View recommendation again.

Expected:

- Recommendation reason changes.

### REC-02 Restaurant Filter

Steps:

1. Open restaurant list.
2. Change meal type/search/type filter.
3. Select `都可以`.

Expected:

- Results update without broken navigation.
- `都可以` returns broad results.

## Meal Buddy Tests

### BUDDY-01 Create from AI

Steps:

1. Save AI meal.
2. Tap create Meal Buddy card.
3. Open Meal Buddy.

Expected:

- Created card visible in `我的飯友卡`.
- Card references saved meal.

### BUDDY-02 Create from Restaurant

Steps:

1. Open restaurant card.
2. Select date under/near card.
3. Create Meal Buddy card.

Expected:

- Created card visible.
- Date/restaurant/dish correct.
- Date selector was not hidden at bottom.

### BUDDY-03 Chat Sort

Steps:

1. Open chat list.
2. Send message in non-top chat.
3. Return to chat list.

Expected:

- Updated chat is first.
- Return tab is chat, not matched tab.

### BUDDY-04 Accept Invitation

Steps:

1. Accept invitation from a candidate.
2. Open friends/matched view.
3. Open chat.

Expected:

- User appears in matched/friend list.
- Chat remains connected.

## Group Table Tests

### GROUP-01 Entry

Steps:

1. Tap `多人飯局`.

Expected:

- Opens group table list, not one-to-one chat.

### GROUP-02 Participant Card

Steps:

1. Open a group table.
2. Tap participant.

Expected:

- Correct social/community card opens.

## Restaurant/Admin Tests

### REST-01 Restaurant Card CTA

Steps:

1. Open restaurant detail.
2. Tap recommended dish CTA.

Expected:

- CTA asks to create Meal Buddy card.
- Duplicate CTA is absent.

### ADMIN-01 Menu CRUD

Steps:

1. Create menu item in admin.
2. Set nutrition values.
3. Approve/demo-publish.
4. Open consumer restaurant page.

Expected:

- Menu item appears with nutrition and source status.

## Security / Privacy QA

- [ ] Real profile photo rules match premium/verification state.
- [ ] Private profile fields are not shown in candidate list.
- [ ] Demo logs do not expose sensitive free-text.
- [ ] RLS is enabled before Supabase external testing.

## Release QA Checklist

- [ ] Typecheck passes.
- [ ] Manual global smoke passes.
- [ ] P0 regression cases pass.
- [ ] Demo seed reset passes.
- [ ] No unreviewed medical/financial/legal claims in UI.
- [ ] Known limitations documented.
