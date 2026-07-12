# Current Decisions

## Product Decisions
- Haocu remains an AI nutrition + restaurant recommendation app with social meal-buddy features.
- Restaurant recommendation is primary enough for elder/investor explanation; social is supportive but meaningful.
- MVP should stay clean and demo-friendly.
- Taiwan external dining is the initial market context.

## Architecture Decisions
- Expo React Native mobile client.
- Next.js restaurant/admin web surfaces.
- Supabase backend.
- Centralized Traditional Chinese i18n.
- AI analysis uses structured outputs, correction flow, and database-first lookup where possible.

## Business Rule Decisions
- Free and premium limits are defined in PRD.
- Anonymous mascot card for free users; real-person card unlocked for premium/verified context.
- Four-person table is primary; upgrade to six/eight is premium-oriented.
- Meal buddy cards have daily limits and replacement behavior.

## Review Decisions
- Legal/IP, Finance, crowdfunding, restaurant, and investor-facing materials require professional review.
- No new valuation, securities terms, or legal conclusions should be introduced without review.
