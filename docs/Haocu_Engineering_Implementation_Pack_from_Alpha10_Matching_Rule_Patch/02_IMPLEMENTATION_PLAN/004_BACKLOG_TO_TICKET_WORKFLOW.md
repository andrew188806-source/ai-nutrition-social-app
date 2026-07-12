# 004 Backlog to Ticket Workflow

## Import Files

Use these files directly:

- `02_IMPLEMENTATION_PLAN/ENGINEERING_TICKET_IMPORT_backlog_items.csv`
- `02_IMPLEMENTATION_PLAN/ENGINEERING_TICKET_IMPORT_backlog_items.json`

## Recommended Ticket Labels

- `P0`, `P1`, `P2`
- `mobile`, `backend`, `supabase`, `ai`, `recommendation`, `meal-buddy`, `chat`, `restaurant`, `qa`, `security`, `demo`
- `sprint-1` through `sprint-6`
- `scope-lock`, `needs-founder-decision`, `blocked`, `ready-for-dev`, `ready-for-qa`

## Ticket Rule

Every ticket should contain:

- source document path
- implementation summary
- acceptance criteria
- target sprint
- impacted routes/tables/services
- QA regression cases

## Change Control

If a ticket changes product behavior, add a decision note before coding. If it only fixes engineering correctness while preserving PRD behavior, a normal PR is enough.
