# Post-Freeze Change Protocol

## Purpose

This protocol defines how to handle changes after Alpha 10 without weakening the freeze.

## Change Categories

| Category | Example | Action |
|---|---|---|
| Editorial correction | Typo, broken path, inconsistent title | Patch as Alpha 10.x if needed. |
| Evidence update | Demo screenshots, user test notes, restaurant LOI | Log externally first; consider Alpha 11 evidence pack. |
| Professional review update | Lawyer redline, privacy review, patent feedback | Create a review-pass version. |
| Engineering implementation update | Actual codebase decisions, sprint results | Create an engineering-build baseline. |
| New product scope | New feature, new module, expanded roadmap | Founder decision required before reopening. |

## Required Change Record

Every post-freeze change should include:

- Date.
- Request owner.
- Change category.
- Files affected.
- Reason.
- Evidence or reviewer source.
- Approval status.
- New version name.

## Do Not Do

- Do not silently overwrite Alpha 10.
- Do not insert new product scope into frozen files.
- Do not upgrade mock data to traction without evidence.
- Do not mark legal/IP/fundraising claims as cleared without professional review.
