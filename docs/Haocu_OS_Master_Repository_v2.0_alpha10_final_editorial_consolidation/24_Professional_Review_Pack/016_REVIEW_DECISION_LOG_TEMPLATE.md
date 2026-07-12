# Review Decision Log Template

## Instructions

Use this template to convert professional review feedback into repository decisions and tasks. Every reviewed issue should have an owner, decision, risk level, and follow-up action.

## Decision Log

| ID | Date | Reviewer Type | Issue | Decision | Risk | Required Action | Owner | Due Date | Status |
|---|---|---|---|---|---|---|---|---|---|
| REV-001 | YYYY-MM-DD | Privacy | Photo retention | Requires revision | High | Add auto-delete setting and privacy copy | Product/Eng | TBD | Open |
| REV-002 | YYYY-MM-DD | Legal | AI disclaimer | Approved with changes | Medium | Update disclaimer component and terms | Legal/Product | TBD | Open |
| REV-003 | YYYY-MM-DD | Security | RLS for chat | Blocker | Critical | Add participant-only RLS tests | Backend | TBD | Open |

## Decision Labels

- `APPROVED`
- `APPROVED_WITH_MINOR_CHANGES`
- `REQUIRES_REVISION`
- `BLOCKER`
- `POST_MVP`
- `OUT_OF_SCOPE`

## Risk Levels

- `Critical`: cannot launch, fundraise, publish, or store real data until resolved.
- `High`: must resolve before public beta or broad external sharing.
- `Medium`: should resolve before scale or paid launch.
- `Low`: can document and revisit.

## Conversion To Engineering Backlog

For every required engineering change, create a ticket in `23_Engineering_Backlog_Pack` format:

- Problem.
- Related review ID.
- Acceptance criteria.
- Data/API/UI impact.
- Test requirement.
- Owner.
- Priority.

## Conversion To Legal / Business Documents

For every required legal or business change:

- Update the relevant repository document.
- Record the decision in this log.
- Mark whether external counsel must re-review.
- Update pitch/crowdfunding/restaurant materials if public-facing language changes.
