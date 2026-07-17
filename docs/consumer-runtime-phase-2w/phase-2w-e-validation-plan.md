# Phase 2W-E Local Validation Plan

The static guard verifies the approved file boundary, immutable Frozen rating core/adapter/migration/lockfile, explicit composition, target identity rules, required UI states, local-before-canonical submit order, no Favorites/navigation/analysis changes, no direct DML or silent fallback, required documents/scripts, environment metadata, staged-empty state, and absence of generated artifacts.

The UI contract smoke compiles the ratings feature and tests safe restaurant/menu mapping, missing IDs, name-only denial, local-meal-ID isolation, nullable branch, read/write result mapping, duplicate-submit suppression, finite 0–5 validation, and preservation of local completion state across canonical failures. C-20 coverage verifies field-level dirty protection for rating, portion feeling, and would-eat-again; hydration of untouched fields; dirty reset for a new presentation target; rejection of stale-target hydration; and the rule that saved/replaced results do not rehydrate an active form.

Required regressions are Phase 2W-A 26/26, 2W-B 21/21, 2W-C 34/34, and E0 45/45 with native exit zero, plus Root/Mobile/Admin/Restaurant typechecks, canonical audit, `npm ls --depth=0`, `git diff --check`, migration/hash/lockfile checks, and secret/environment/artifact scans. No live, HTTP, SQL, migration, N4, or Production validation is authorized.
