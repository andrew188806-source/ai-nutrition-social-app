# Phase 2U-C-A Development handoff runbook

## Current state

This repository state is preparation only. Codex did not deploy a migration, execute a remote command, run a credential-backed smoke, or touch Production. Restaurant Web active pages still use mock data.

The local draft is `20260715030000_restaurant_public_published_nutrition_v1.sql`. It creates only the public-safe projection and its view grants. It does not revoke upstream or raw nutrition access and does not alter RLS.

## Claude handoff

In an approved Development environment:

1. Reconfirm the frozen branch, HEAD, clean expected baseline and linked migration alignment.
2. Review the N2R SQL and deploy only the approved migration to Development.
3. Run `validation-queries.sql` as read-only validation.
4. Verify both anon and authenticated SELECT behavior on the safe view.
5. Verify the response contains exactly the 13 public fields and preserves nullable values.
6. Run the credential-backed Restaurant read smoke against Development only.
7. Capture non-secret evidence and complete Freeze review.

Do not use a browser `service_role` client. Do not treat an authenticated session as restaurant ownership. Logs/audit behavior is **UNVERIFIED** because this preparation performs no deployment or credential-backed request.

N3 is not created here. Any revoke of raw or internal nutrition grants requires separate Phase 2U-C-B approval after the public cutover is proven. Owner/internal wiring remains **BLOCKED PENDING TENANT OWNERSHIP**.
