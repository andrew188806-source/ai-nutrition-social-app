# RA-2I — Governed Restaurant Owner public-contact authority (phone, website, social links)

> Written retroactively during Restaurant Phase R1 (documentation closure). This describes the
> **current implemented contract**, derived directly from migration and repository source — it does
> not claim any specific historical acceptance run took place; see "Current test evidence" per
> sub-round for exactly what exists to verify it.

RA-2I is four sub-rounds sharing one theme — public contact/link fields — but two different
authority shapes:

| Sub-round | Field | Scope | Migration |
| --- | --- | --- | --- |
| P1A | branch public phone | branch | `20260910010000_restaurant_owner_branch_public_phone_authority.sql` |
| P1B | restaurant public website | restaurant | `20260910020000_restaurant_owner_public_website_authority.sql` |
| P2 | restaurant public social links | restaurant | `20260910030000_restaurant_owner_public_social_links_authority.sql` |
| R2 | server-only URL mutation lockdown | restaurant (P1B + P2 only) | `20260910050000_restaurant_url_server_only_mutation_authority.sql` |

## P1A — branch public phone

`public.restaurant_branches.public_phone` (+ `public_phone_version`). `NULL` means unpublished.
Contract: outer `btrim`, 1–32 characters after trim (no further format/digit validation at the DB
layer — this is a display string, not a validated phone number). Permission key
`branch.profile.public_phone.write`, scope `restaurant`, Owner only. Preview
`restaurant_owner_preview_branch_public_phone_v1(text,text)`, mutation
`restaurant_owner_set_branch_public_phone_v1(text,text,text,text,bigint)` — both `SECURITY DEFINER`,
`authenticated`-callable directly (never locked down to `service_role` — P1A never needed the R2
lockdown because a phone string carries no URL-parsing surface).

UI: `apps/restaurant-web/components/branch/RestaurantOwnerBranchPublicPhoneControl.tsx`, on
`/restaurant/locations`.

## P1B — restaurant public website

`public.restaurants.public_website_url`. `NULL` means unpublished. Original `v1` mutation RPC
(`restaurant_owner_set_public_website_v1`) was `authenticated`-callable at first, then **locked down**
by R2 (below) — `EXECUTE` revoked from `authenticated`, superseded by a `service_role`-only `v2`.

## P2 — restaurant public social links

New table `public.restaurant_public_social_links` (`restaurant_id`, `provider`, url/version
columns), one row per `(restaurant_id, provider)`. `provider` is a closed enum:
`instagram | facebook | line | threads | tiktok | youtube` — enforced both by a table `CHECK` and
independently re-checked inline in every RPC. Same `v1`-then-locked-down-to-`v2` shape as P1B.

## R2 — why website/social-link writes are `service_role`-only

R2's own migration header states the reason directly: *"canonical URL writes must cross the
Restaurant Web WHATWG URL boundary. Browser roles retain preview authority but cannot invoke either
mutation family."* — URL well-formedness is validated using the JavaScript/WHATWG `URL` parser in
the Next.js server layer (not re-implemented as a Postgres regex), so the mutation path is
deliberately pushed behind a trusted server hop rather than being directly browser-callable like
every other RA-2 field.

Practical shape: `restaurant_owner_set_public_website_v2` / `restaurant_owner_set_public_social_link_v2`
both take an explicit `p_actor_auth_user_id uuid` (rather than deriving the actor from the caller's
own JWT, since the caller here is the trusted Next.js server, not the owner's browser session
directly) — the function independently re-verifies that actor is an enabled, active-member owner
before proceeding, and sets `restaurant.url_mutation_actor` via `set_config` so the existing forced
RLS policies still see a real, verified actor for the duration of the call. `EXECUTE` on both `v2`
functions is granted to `service_role` only; the `v1` functions' `EXECUTE` was revoked from
`authenticated` in this same migration (preview RPCs are unaffected and remain directly
`authenticated`-callable).

UI: both fields are edited on `/restaurant/settings`
(`RestaurantOwnerPublicWebsiteControl.tsx`, `RestaurantOwnerPublicSocialLinksControl.tsx`), submitting
through Next.js Route Handlers (`app/api/restaurant/settings/public-website/route.ts`,
`app/api/restaurant/settings/social-links/[provider]/route.ts`) that hold the `service_role` key
server-side and call the `v2` RPCs — never directly from the browser. This is the intended,
already-correctly-wired shape, not a gap.

## Current test evidence

Each sub-round has its own guard/smoke/mutations/postgres-apply family, registered as:

```
npm run test:restaurant-owner-branch-public-phone-ra-2i-p1a[-smoke|-mutations|-postgres]
npm run test:restaurant-owner-public-website-ra-2i-p1b[-smoke|-mutations|-postgres]
npm run test:restaurant-owner-public-social-links-ra-2i-p2[-smoke|-mutations|-postgres]
npm run test:restaurant-url-mutation-authority-ra-2i-r2[-smoke|-mutations|-postgres]
```

Each `-postgres` gate needs its own `RA2I*_PG_BIN`/`RA2I*_PG_MODULES` env pair (check the individual
script) and reports `skipped` without them. Each `-guard` script is a **frozen single-round** check —
expected to report FAIL once later rounds have landed on top of it; that is normal frozen-round
behavior, not a regression, and none of these guards should ever be loosened to force green.
