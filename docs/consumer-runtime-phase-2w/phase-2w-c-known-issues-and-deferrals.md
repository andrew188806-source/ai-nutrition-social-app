# Phase 2W-C Known Issues and Deferrals

- Credential-backed Development adapter validation has passed. The in-memory fake remains the deterministic local contract suite; neither result enables UI cutover or Production.
- Default sources are intentionally unchanged; no UI or navigation path selects Supabase.
- Feedback string length, dislike-reason count/length, and total feedback payload boundaries remain unresolved pre-live hardening. Phase 2W-C does not represent them as solved.
- The adapter relies on the Frozen Phase 2W-B owner RLS and atomic RPC contract. It does not alter the migration, tables, policies, grants, history semantics, or current-row identity.
- `P2W-A-DEP-001` remains OPEN / ACCEPTED / DEFERRED. Dependency manifests and `package-lock.json` are not changed for dependency resolution.
- `P2V-PERF-001` remains OPEN / DEFERRED.
- N4 and Phase 2V-F remain BLOCKED / NOT EXECUTED.
- Production remains untouched.
- UI cutover, live source enablement, credential-backed smoke, and the next phase have not started.

Phase 2W-C is a Development-validated Freeze candidate. It remains not Frozen until an authorized commit succeeds.
