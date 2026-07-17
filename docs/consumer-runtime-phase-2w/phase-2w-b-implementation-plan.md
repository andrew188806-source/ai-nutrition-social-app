# Consumer Runtime Phase 2W-B Implementation Plan

Status: **local implementation and Development validation complete; Freeze candidate, not Frozen**.

## Baseline and boundaries

- Branch: `main`.
- Frozen starting commit: `7a18a5fe75a674266415b14aba7299cd7cc88a28`.
- Phase 2W-A remains Frozen.
- Development migration execution and credential-backed validation are complete; live adapters and UI cutover have not started.
- Production, N4, Phase 2V-F, and Phase 2W-C are outside this work package.

## Local deliverables

1. Review the frozen ratings tables, constraints, indexes, RLS policies, grants, and function inventory.
2. Add one forward-only local migration draft for authenticated owner-scoped SELECT and atomic current-rating writes.
3. Add static guard and contract-smoke coverage without a database connection.
4. Document the read decision, write signatures, linkage rules, ACLs, and remaining Development gates.

## Phase boundary

The migration was executed and validated on the separately authorized Development target. Phase 2W-B does not implement a Supabase adapter, enable a live source, or change Mobile UI/navigation. Phase 2W-C remains outside this work package and has not started.
