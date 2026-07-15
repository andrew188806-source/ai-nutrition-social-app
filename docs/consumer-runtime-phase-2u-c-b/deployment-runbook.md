# Phase 2U-C-B Development deployment runbook

## Before deployment

1. Reconfirm the approved frozen commit and clean expected worktree.
2. Confirm Development has 24 aligned migrations and N3 is absent.
3. Review the N3 draft and verify it contains only the two approved `REVOKE SELECT` statements.
4. Run the local Phase 2U-C-B guard and contract smoke.

## Separately approved deployment

Deployment is not performed by this preparation. In an approved Development environment, deploy only `20260715040000_revoke_raw_nutrition_direct_read_access.sql` and do not operate on Production.

After deployment, run the read-only validation queries. Verify direct raw/internal reads are denied to both `anon` and `authenticated`; the restaurant safe view remains readable by both roles; the consumer safe view remains authenticated-only; and the owner-executed dependency chain continues to function.

Capture only non-secret evidence. Do not print credentials, tokens, sessions, project identifiers or row payloads.
