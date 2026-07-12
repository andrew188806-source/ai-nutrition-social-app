# AI Monitoring and Cost Control

## Purpose
Ensure AI features are observable, reliable, and financially sustainable.

AI cost must be treated as a unit economics variable. A useful AI experience that is too expensive per active user can break the business model.

## Monitoring Dimensions

### Product Metrics

- analysis started
- analysis completed
- candidate accepted
- correction saved
- meal saved
- Meal Buddy card created
- recommendation clicked

### Quality Metrics

- top candidate acceptance rate
- top 3 acceptance rate
- manual entry rate
- low confidence rate
- repeated correction patterns
- reported wrong result count

### System Metrics

- latency per stage
- timeout rate
- retry rate
- schema validation failure
- photo upload failure
- storage failure

### Cost Metrics

- cost per AI run
- cost per successful saved meal
- cost per active user
- cost by model/provider
- cost by feature path

## Cost Reduction Levers

1. Database-first lookup.
2. Skip vision call when selected menu item is known.
3. Cache repeated dish/menu analysis.
4. Use lower-cost model for simple classification.
5. Limit free-tier usage by daily quota.
6. Run admin enrichment jobs asynchronously.
7. Track abuse and unusual upload frequency.

## Alert Conditions

- AI completion rate drops below target.
- Average latency exceeds demo threshold.
- Cost per successful analysis exceeds internal budget.
- Manual entry rate spikes for a category.
- Safety flag rate increases.
- Provider errors or quota issues appear.

## Dashboard Requirements

MVP internal dashboard should show:

- analysis funnel
- candidate acceptance
- correction fields
- cost estimate
- latency distribution
- top failed categories
- restaurant/menu lookup ratio

## Acceptance Criteria

1. Every AI run has traceable cost and latency metadata where possible.
2. AI usage can be limited by plan and quota.
3. Failures do not block manual meal logging.
4. Product team can identify high-error dish categories.
5. Engineering team can identify expensive model paths.
