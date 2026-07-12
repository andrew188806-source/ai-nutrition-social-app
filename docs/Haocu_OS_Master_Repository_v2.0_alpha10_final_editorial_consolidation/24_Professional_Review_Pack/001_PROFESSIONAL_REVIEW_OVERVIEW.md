# Professional Review Overview

## Objective

Alpha 7B turns the repository into a review-ready packet. The goal is not to ask every reviewer to read the full repository. The goal is to route the correct documents and questions to each reviewer so their feedback becomes actionable.

## Review Priority

### Must Review Before Public Launch

1. Privacy policy, consent flow, data retention, user photo handling, and account deletion.
2. Terms of service, community rules, restaurant terms, and user-generated content rules.
3. Nutrition and AI wording boundaries to avoid medical or treatment claims.
4. Security architecture, Supabase RLS, storage access, chat/photo privacy, and incident response.
5. Fundraising and crowdfunding materials if money is being raised from the public or investors.

### Must Review Before Patent / IP Strategy Is Publicly Disclosed

1. Invention disclosure draft.
2. Prior-art and patentability strategy.
3. IP ownership between founder, contractors, company, and potential assignees.
4. Trademark and brand clearance for Haocu / 好廚 / mascot names.

### Must Review Before Restaurant Partner Pilot

1. Restaurant onboarding agreement.
2. Nutrition-data responsibility and disclaimer.
3. Sponsored recommendation / advertising disclosure rules.
4. Merchant cancellation, refund, dispute, and data-use terms.

### Must Review Before Stage 2 ESG / Surplus Food

1. Food safety and storage obligations.
2. Logistics and cold-chain responsibility.
3. ESG claims substantiation.
4. Insurance coverage and partner liability allocation.

## Expected Output From Reviewers

Every reviewer should return:

- Approved items.
- Required changes.
- Risk level for each unresolved item.
- Suggested wording or clause topics.
- Documents that must be created before launch.
- Engineering changes required.
- Business model changes required.
- Items that can wait until post-MVP.

## Review Routing Map

| Reviewer | Send These Folders | Primary Questions |
|---|---|---|
| Legal/IP counsel | `17_Legal_IP`, `20_Investor_Materials`, `24_Professional_Review_Pack` | IP ownership, patent, trademark, terms, crowdfunding boundary |
| Privacy counsel | `04_Data`, `13_Security`, `14_Compliance`, `24_Professional_Review_Pack` | consent, retention, deletion, photos, chat, analytics, AI data |
| Security reviewer | `06_Architecture`, `08_Backend`, `11_Infrastructure`, `13_Security`, `23_Engineering_Backlog_Pack` | RLS, auth, storage, secrets, incident response |
| Finance/accounting advisor | `16_Business`, `18_Finance`, `20_Investor_Materials` | budget, revenue, expense, runway, accounting, tax |
| Fundraising advisor | `19_Pitch`, `20_Investor_Materials`, `18_Finance` | use of funds, cap table, valuation, securities compliance |
| Restaurant advisor | `16_Business`, `21_External_Artifacts`, `14_Compliance` | restaurant value proposition, onboarding, contracts, nutrition data |
| Insurance broker | `13_Security`, `14_Compliance`, `15_Operations`, `24_Professional_Review_Pack` | cyber, general liability, E&O, D&O, food/social risks |

## Decision Categories

Use these decision labels:

- `APPROVED`: can proceed as written.
- `APPROVED_WITH_MINOR_CHANGES`: can proceed after copy or process edits.
- `REQUIRES_REVISION`: must revise before launch or investor use.
- `BLOCKER`: must not launch or publish until resolved.
- `POST_MVP`: acknowledged but not required before MVP.
- `OUT_OF_SCOPE`: reviewer cannot advise; route to another expert.
