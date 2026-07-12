# 021 Sensitive Information Exclusion List

> Repository Status: Haocu OS Master Repository v2.0 Alpha 8.  
> Purpose: Clean investor / advisor / accelerator / restaurant-partner data room.  
> Boundary: External-readable summary only. Not legal, tax, accounting, securities, nutrition, medical, patent, privacy, or investment advice. Sensitive internal drafts and unreviewed details are intentionally excluded.

## Purpose

This list defines what should be excluded from the clean investor data room unless there is a specific reason, professional review, and appropriate confidentiality protection.

## Excluded Categories

### 1. Raw Legal / IP Drafts

Exclude:

- patent disclosure drafts
- claim strategy notes
- trademark clearance assumptions
- private counsel questions that reveal strategy
- unreviewed legal conclusions

Safe summary:

“IP strategy is under review and may include brand, trade secret, corrected data workflow, and counsel-reviewed patent/trademark options.”

### 2. Private Financial Details

Exclude:

- founder personal finances
- private debt or loan discussions
- bank details
- unreviewed valuation math
- cap table drafts not ready for investors
- contractor negotiation details

Safe summary:

“Funding plan is milestone-based and exact terms require finance/legal review.”

### 3. Security / Infrastructure Details

Exclude:

- credentials, API keys, tokens, database URLs
- detailed vulnerability notes
- internal security architecture that creates attack risk
- incident response internals not needed by first-round reviewers

Safe summary:

“Security, privacy, RLS, access control, and data governance are included in the implementation and review backlog.”

### 4. Personal Data / User Data

Exclude:

- real user records
- private messages
- exact location trails
- identity verification data
- food diary records tied to identifiable individuals
- unconsented screenshots

Safe summary:

“Pilot evidence will be aggregated or anonymized before external sharing.”

### 5. Internal Founder Brainstorming

Exclude:

- raw ideation notes
- contradictory early positioning drafts
- private worries not converted into risk mitigation
- unprioritized feature dumps

Safe summary:

“MVP scope is documented and future phases are staged.”

### 6. Unreviewed Claims

Exclude or revise:

- guaranteed weight loss or health outcomes
- medical-sounding diet claims
- guaranteed restaurant traffic
- guaranteed matching/social outcomes
- guaranteed investment returns
- definitive patent protection claims

Safe summary:

“Claims will be reviewed before public launch or fundraising publication.”

## Redaction Rule

If a detail does not help the external reader make a decision at the current stage, do not include it. If it may create legal, IP, privacy, security, financial, or negotiation risk, summarize it at a higher level or hold it for later diligence.

## Clean Data Room Standard

The clean data room should be clear enough to build confidence and restrained enough to preserve leverage, confidentiality, and professional-review discipline.
