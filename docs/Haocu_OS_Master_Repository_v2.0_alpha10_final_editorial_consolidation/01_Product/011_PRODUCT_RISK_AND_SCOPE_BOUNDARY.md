# Product Risk and Scope Boundary

## Purpose

This document identifies product risks before they become engineering, legal, or fundraising problems.

## Major Product Risks

### 1. Over-Scoping the MVP

**Risk**

Haocu includes AI nutrition, food diary, restaurant discovery, social matching, group dining, premium, restaurant admin, ESG, and household planning. Building all at once would slow delivery and confuse users.

**Mitigation**

Use the MVP loop as the boundary:

```text
Analyze -> Save -> Understand -> Recommend -> Optional Social
```

Everything else must be MVP+, beta, or future.

### 2. AI Trust Risk

**Risk**

Food recognition and nutrition estimates may be wrong.

**Mitigation**

- Show candidate choices.
- Provide manual correction.
- Use confidence and assumption language.
- Store correction history.
- Avoid medical-grade claims.

### 3. UI Clutter Risk

**Risk**

Too many features on one screen may make the product look messy and hard to demo.

**Mitigation**

- One primary action per state.
- Move details into secondary pages.
- Use clean cards and clear hierarchy.
- Remove duplicate actions.

### 4. Social Safety Risk

**Risk**

Meal-buddy features may create discomfort, harassment, or mismatched expectations.

**Mitigation**

- Chat-first preference.
- Payment preference.
- Anonymous free card.
- Verification states.
- Report/block/cancel reason flows.
- Group chat expiration rules.

### 5. Premium Trust Risk

**Risk**

If premium blocks too much, users may see Haocu as a paywall product before it proves value.

**Mitigation**

Free users must complete the core loop. Premium expands depth, identity, and capacity.

### 6. Restaurant Data Risk

**Risk**

Restaurant dishes, nutrition, or claims may be inaccurate.

**Mitigation**

- Mark estimates clearly.
- Use review workflow for public claims.
- Keep mock data plausible.
- Avoid presenting unverified data as official.

### 7. Fundraising Narrative Risk

**Risk**

Investors may see the product as too broad or unfocused.

**Mitigation**

Tell the story in layers:

1. MVP consumer loop.
2. Personal taste and food data moat.
3. Restaurant data expansion.
4. ESG/household future platform.

## Scope Boundary Rules

| Feature Type | Boundary |
|---|---|
| Medical advice | Out of product scope unless professionally reviewed. |
| Nutrition estimates | Allowed with confidence and disclaimer language. |
| Meal-buddy social | Allowed only as opt-in and food-intent based. |
| Paid restaurant promotion | Requires labeling and review. |
| Restaurant admin | MVP+ unless needed for demo. |
| Household app | Future phase. |
| ESG operations | Future phase. |
| Multi-photo meal UI | Deferred; data readiness only. |

## Decision Queue

Items requiring founder/product decision before implementation:

1. Exact premium price and billing timing.
2. Whether group table is MVP or MVP+.
3. Minimum identity verification required for real-person card.
4. Whether restaurant admin is demo-only or pilot-ready.
5. How public food ratings should remain private or social.
6. Whether crowdfunding rewards include app access, mascot goods, or restaurant packages.

## Review Queue

Items requiring professional review before public launch:

- privacy policy and data consent;
- nutrition claim wording;
- paid sponsorship labeling;
- safety/reporting process;
- restaurant partner terms;
- patent/trademark scope;
- financial projections used in fundraising.
