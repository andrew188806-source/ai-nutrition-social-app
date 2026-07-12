# 01 Product

This section defines the product-level truth for Haocu. It explains what the product is, who it serves, why it exists, which features are in scope, and how the MVP should be judged.

The Product section is the bridge between founder strategy and implementation detail. Engineering, design, AI, restaurant operations, fundraising, and legal review should all use this section before reading more specialized documents.

## Product Source of Truth

Haocu is a Taiwan food-context AI product that combines:

1. AI-assisted meal analysis.
2. Personal nutrition summaries.
3. Restaurant and dish recommendation.
4. Optional meal-buddy social matching.
5. Restaurant participation through structured menu and nutrition data.
6. Future operations expansion into restaurant supply-chain and household nutrition support.

The MVP must remain focused on the first four items while keeping the data model ready for the later phases.

## Documents

| File | Purpose | Primary Audience |
|---|---|---|
| `001_PRODUCT_VISION.md` | Product thesis, mission, positioning, and long-term direction. | Founder, CTO, investors, product lead |
| `002_TARGET_USERS.md` | Core personas, user needs, jobs-to-be-done, and excluded users. | Product, UX, marketing |
| `003_PRODUCT_PRINCIPLES.md` | Decision principles for design, feature tradeoffs, and product tone. | Product, design, engineering |
| `004_FEATURE_MAP.md` | Functional map of MVP, MVP+, future features, and dependencies. | Engineering, PM, QA |
| `005_MVP_SCOPE.md` | Clear MVP boundary, release gate, and scope-control rules. | Founder, PM, engineering |
| `006_USER_JOURNEYS.md` | End-to-end journeys for analysis, diary, restaurant, social, and premium flows. | UX, engineering, QA |
| `007_MONETIZATION_AND_PREMIUM_STRATEGY.md` | Free vs premium design, restaurant monetization, crowdfunding bridge, and guardrails. | Founder, business, product |
| `008_SUCCESS_METRICS.md` | Activation, retention, AI quality, social, restaurant, and safety metrics. | Founder, data, investors |
| `009_GROWTH_LOOP.md` | Growth loops through meal records, social invitations, restaurants, mascots, and crowdfunding. | Growth, marketing, investor materials |
| `010_PRODUCT_ROADMAP.md` | Product evolution from demo to MVP, beta, GA, and future phases. | Founder, CTO, investors |
| `011_PRODUCT_RISK_AND_SCOPE_BOUNDARY.md` | Product risks, mitigation, and review boundaries. | Founder, PM, legal, QA |
| `012_RESTAURANT_PRODUCT_STRATEGY.md` | Restaurant-facing product logic and how restaurant data supports the consumer app. | Restaurant ops, business, engineering |

## Required Consistency Rules

- Product scope must not conflict with `02_PRD`, `03_AI`, `04_Data`, or `05_UI`.
- MVP and MVP+ must be clearly separated.
- Haocu must not be described as a medical product.
- Social features must be opt-in and safety-aware.
- Restaurant nutrition claims must be reviewed before public production use.
- The user experience must remain clean, spacious, and demo-friendly.
