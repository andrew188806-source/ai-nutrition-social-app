# Privacy / Data Protection Review Brief

## Review Goal

Confirm whether Haocu's data collection, storage, consent, retention, deletion, analytics, AI processing, social features, photo handling, and restaurant/admin workflows are acceptable for MVP launch.

## High-Risk Data Categories

- Meal photos and uploaded images.
- Nutrition estimates and dietary patterns.
- Health goals and body-related preferences.
- Location or nearby restaurant context.
- Social cards, anonymous/real-person profile mode, verification status.
- Chat messages and group-table participation.
- Payment/subscription status.
- Restaurant-admin uploaded menu and nutrition data.
- Analytics events and conversion funnels.

## Questions For Privacy Counsel

### Consent and Notice

- What consents are required before photo upload, AI analysis, nutrition estimate, meal-history storage, social card generation, matching, chat, and analytics?
- Should consent be granular by feature or bundled into onboarding?
- What copy must appear before users upload meal photos?
- What is the correct way to explain AI limitations and data use?

### Data Retention

- Is the free-tier 14-day storage window acceptable?
- How should premium saved records, top lists, and user ratings be retained?
- What retention schedule should apply to chat messages, group-table rooms, deleted profiles, restaurant admin records, and audit logs?
- What deletion/anonymization approach should be used for analytics?

### Photos and AI Processing

- Can meal photos contain people, receipts, location cues, or sensitive items?
- Should photos be auto-deleted after analysis unless the user saves them?
- What policy is needed for AI vendor processing?
- What data must not be used for model training without explicit consent?

### Social / Matching / Chat

- What age restrictions or safety warnings are needed for meeting strangers for meals?
- How should anonymous vs verified profile modes be disclosed?
- What user-blocking, reporting, moderation, and law-enforcement request process is required?
- What retention rule applies to one-on-one chat and group-table chat?

### Cross-Border / Vendor Processing

- Are there restrictions on storing or processing Taiwan user data with US-based infrastructure or AI vendors?
- What vendor agreements or data-processing addenda are required?
- What should be disclosed in the privacy policy?

## Engineering Follow-Up Items Likely Needed

- Consent records table.
- Privacy settings screen.
- Account deletion workflow.
- Photo deletion workflow.
- Data export request process.
- AI vendor logging toggle or boundary.
- Analytics minimization policy.
- Admin access audit log.

## Supporting Documents

- `04_Data/007_DATA_GOVERNANCE.md`
- `04_Data/014_PRIVACY_CONSENT_AUDIT_SCHEMA.md`
- `13_Security/004_PHOTO_STORAGE_SECURITY.md`
- `14_Compliance/001_COMPLIANCE_OVERVIEW.md`
- `14_Compliance/002_PRIVACY_DATA_PROTECTION.md`
- `14_Compliance/006_DATA_RETENTION_POLICY.md`
- `23_Engineering_Backlog_Pack/009_DATABASE_SUPABASE_TASK_BREAKDOWN.md`
