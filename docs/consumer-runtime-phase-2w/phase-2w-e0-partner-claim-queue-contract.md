# Phase 2W-E0 Partner Claim Queue Contract

- The authority timestamp is `partner_verified_at`.
- Historical discovery includes only pending observations/candidates/reports whose `lastObservedAt` falls in the inclusive interval `partner_verified_at - 60 days <= lastObservedAt <= partner_verified_at`. `createdAt` never decides historical eligibility.
- Pending evidence with `partner_verified_at < lastObservedAt <= now` belongs only to live intake and is never mixed into the historical page. Existing canonical menu ownership/claim data is outside this discovery window and remains unbounded by 60 days.
- Missing or invalid observation time, future observation time, invalid authority/current time, `partner_verified_at > now`, or `observedAt > lastObservedAt` fails closed. `createdAt` is retained only as the final temporal sorting tie-breaker before the stable ID and never participates in eligibility.
- Pages contain at most 20 items and use a stable cursor; full-load behavior is forbidden. Each item is delivered once per restaurant/branch scope and may be deferred/resumed.
- Branch routing is separate. Ambiguous branch evidence routes to headquarters/admin, never an arbitrary branch.
- Priority is: high-risk closure/discontinuation/wrong-affiliation; exact Place ID or address+phone; exact name+location; multi-user support; high-frequency/recent; similar name+location; name-only.
- Ties sort by distinct verified users descending, last observed descending, confidence descending, created ascending, then stable ID.
- Partner projections exclude user identity, private ratings/meals, precise movement, and unauthorized photo metadata.
- The E0 port is an interface only; no actual queue, delivery mutation, or partner console cutover exists.
