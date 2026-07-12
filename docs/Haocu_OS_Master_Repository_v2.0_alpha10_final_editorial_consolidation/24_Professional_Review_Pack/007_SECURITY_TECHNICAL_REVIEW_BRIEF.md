# Security / Technical Review Brief

## Review Goal

Validate Haocu's MVP security posture before real user photos, chats, social cards, restaurant data, premium status, and admin workflows are connected to production infrastructure.

## Architecture Areas To Review

- Supabase Auth.
- Row Level Security policies.
- User profiles and social cards.
- Meal records and meal photos.
- Chat and group-table messages.
- Restaurant admin permissions.
- Admin review and moderation permissions.
- Storage buckets and signed URLs.
- Edge Functions and service-role isolation.
- AI vendor integration.
- Analytics events.
- Secrets management.
- Backup, logging, incident response.

## Security Questions

### Auth / Authorization

- Are consumer, restaurant admin, internal admin, and service-role permissions separated correctly?
- Are RLS policies strict enough to prevent users from reading other users' meal records, photos, chats, or premium status?
- Can restaurant admins access only their own restaurant data?
- Can internal admins perform moderation with audit logging?

### Storage

- Are meal photos private by default?
- Are signed URLs short-lived?
- Are uploaded images size-limited and type-checked?
- Are photo deletion and account deletion technically enforceable?

### Chat / Social Safety

- Can a user read chat messages only when they are an authorized participant?
- Are group-table messages deleted or retained according to policy?
- Is reporting/blocking enforceable?
- Is abuse moderation auditable?

### AI / Edge Functions

- Are AI keys stored only server-side?
- Are service-role keys never exposed to the client?
- Are prompts protected from leaking system/private data?
- Are vendor logs and payloads minimized?

### Operational Security

- Is there a minimum incident-response plan?
- Are admin actions logged?
- Are environments separated between demo/staging/production?
- Are backups and restores tested?

## Required Security Review Outputs

- RLS pass/fail table.
- Storage policy pass/fail table.
- Top 10 security blockers.
- Launch minimum controls.
- Post-MVP controls.
- Incident response and breach notification recommendations.

## Supporting Documents

- `13_Security/001_SECURITY_OVERVIEW.md`
- `13_Security/002_AUTH_SECURITY.md`
- `13_Security/003_RLS_POLICY_SECURITY.md`
- `13_Security/004_PHOTO_STORAGE_SECURITY.md`
- `13_Security/005_CHAT_SOCIAL_SAFETY_SECURITY.md`
- `13_Security/007_AI_SECURITY.md`
- `13_Security/009_INCIDENT_RESPONSE.md`
- `11_Infrastructure/001_INFRASTRUCTURE_OVERVIEW.md`
- `23_Engineering_Backlog_Pack/009_DATABASE_SUPABASE_TASK_BREAKDOWN.md`
