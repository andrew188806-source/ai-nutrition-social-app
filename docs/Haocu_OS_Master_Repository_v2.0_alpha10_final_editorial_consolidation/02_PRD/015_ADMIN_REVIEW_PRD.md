# Admin Review PRD

## Objective

Define internal review queues for restaurant verification, nutrition disclosure, ads/sponsorships, safety reports, and audit-sensitive actions.

## Review Queues

1. Restaurant verification.
2. Nutrition claim review.
3. User-reported content/safety.
4. Sponsored placement review.
5. Mascot/IP asset review.
6. Professional/legal review queue.

## Functional Requirements

1. Admin can see pending review items.
2. Admin can approve, reject, request changes, or escalate.
3. Review decision stores actor, timestamp, reason, and evidence.
4. Public surfaces reflect review status.
5. Review items can be filtered by type and urgency.

## Status Values

- `pending`
- `approved`
- `rejected`
- `needs_changes`
- `escalated`

## Data Dependencies

- `admin_users`
- `review_items`
- `review_decisions`
- `audit_logs`
- `restaurants`
- `restaurant_dishes`
- `reports`
- `sponsored_content`

## API Dependencies

- `GET /admin/review-items`
- `POST /admin/review-items/{id}/decision`
- `GET /admin/audit-logs`

## Acceptance Criteria

1. Review decisions are auditable.
2. Nutrition and sponsored content are not public as reviewed until approved.
3. Restaurant verification state is clear.
4. Safety reports can be escalated.
5. Review system supports professional handoff.
