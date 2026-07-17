# Phase 2W-E0 Validation Plan

The static guard restricts changes to shared E0 contracts, Phase 2W E0/D evidence docs, package scripts, and E0 test scripts. It verifies frozen migrations/lockfile, no UI/runtime adapters, no database/network vocabulary, required evidence rules, transitions, privacy projection, and empty staged diff.

The in-memory contract smoke compiles the shared E0 package and verifies strong/weak resolution, community and partner escalation, legal/illegal transitions, reversible lifecycle, merge/history, badge expiry and branch scope, trust tiers 1–5, hard filters, report/reward rules, inclusive observation-based 60-day historical eligibility, separate post-verification live intake, invalid/future/contradictory timestamp rejection, page size 20, deterministic priority, single-delivery scope, and consumer/partner projection privacy.

Required local checks: `node --check`, E0 guard/smoke, Phase 2W-A/B/C regressions with native exit 0, root/Mobile/Admin/Restaurant typechecks, canonical audit, `npm ls --depth=0`, `git diff --check`, migration/lock/staged/env metadata checks. No credential-backed or database test is allowed.
