# Consumer Runtime Phase 2U-C-B implementation plan

Phase 2U-C-B prepares N3 as a local migration draft. N3 removes direct `SELECT` from `anon` and `authenticated` on the raw nutrition table and internal published-nutrition view. It does not change either public-safe view.

The approved local scope is limited to the N3 draft, offline validation, deployment and rollback documentation. No remote command, deployment, RLS change, runtime wiring, staging, commit or push is part of this preparation.

After a separate Development deployment approval, validation must establish that both safe views still work through their existing grants and owner-executed dependency chain. Production remains outside this phase.

The frozen Phase 2U-C-A and Phase 2U guards intentionally assert their earlier state of 24 migrations with no N3 draft. They therefore report only those superseded phase-state assertions after this 25th migration is added. They must not be edited to conceal that transition. The Phase 2U-C-B guard replaces those state assertions while also verifying that every frozen Phase 2U-C-A artifact remains unchanged.
