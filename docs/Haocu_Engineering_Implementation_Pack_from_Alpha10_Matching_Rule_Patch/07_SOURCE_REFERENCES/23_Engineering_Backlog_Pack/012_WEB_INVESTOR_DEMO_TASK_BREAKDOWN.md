# 012 Web / Investor Demo Task Breakdown

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document defines the engineering tasks needed to support web demo, investor presentation, and external review. The goal is not to overbuild marketing pages; the goal is to make the product demonstrable and credible.

## Demo Principle

Investor demo must be stable, truthful, and easy to repeat. Demo data must be clearly distinguishable from real traction or production data.

## Surfaces

- Public landing/demo page if applicable.
- Mobile web demo via Expo/Vercel.
- Restaurant/admin demo route.
- Founder 3-minute demo path.
- Data room / document index route or static page placeholder.

## Task Group A — Demo Route Hardening

Tasks:

- Define canonical 3-minute route:
  1. Home summary.
  2. AI meal capture/analyze.
  3. Candidate/correction/save.
  4. Today Intake update.
  5. Next meal or restaurant recommendation.
  6. Create Meal Buddy card.
  7. Invite/chat or group table preview.
  8. Restaurant/admin nutrition network preview.
- Create demo seed reset.
- Add visible demo-mode debug only for internal use.
- Ensure refresh does not corrupt route.

Done when:

- Founder can run the full path twice without engineering help.

## Task Group B — Investor Landing / Overview

Tasks:

- Build or update concise web overview if present.
- Position: AI nutrition and restaurant recommendation first; social dining as retention/growth loop.
- Avoid unreviewed medical, securities, patent, or financial claims.
- Clearly mark projected metrics as projections.

Done when:

- Page can be used in a call without contradicting pitch materials.

## Task Group C — Demo Data Labels

Tasks:

- Add `demo` or `sample` labels where appropriate.
- Avoid fake real-user counts.
- Use realistic restaurant/menu examples without implying formal partnership unless true.

Done when:

- Viewer can understand product concept without mistaking sample data for verified traction.

## Task Group D — Review / Data Room Navigation

Tasks:

- Link to or list relevant documents: PRD, AI safety, compliance, finance, pitch, backlog.
- Keep sensitive details out of public route.
- Provide a private data-room index placeholder if needed.

Done when:

- Advisor/investor can be guided to the right document without opening the entire repository during the call.

## Task Group E — Deployment Reliability

Tasks:

- Confirm Vercel/Expo Web deployment path.
- Document environment variables.
- Add rollback note.
- Add smoke test checklist.

Done when:

- Demo URL can be updated deliberately and validated before sharing.

## Investor Demo QA Checklist

- No broken route in 3-minute path.
- Demo seed reset works.
- Mobile viewport readable.
- Traditional Chinese copy is polished.
- Claims are not overstated.
- Meal records, recommendations, and social cards stay consistent.
