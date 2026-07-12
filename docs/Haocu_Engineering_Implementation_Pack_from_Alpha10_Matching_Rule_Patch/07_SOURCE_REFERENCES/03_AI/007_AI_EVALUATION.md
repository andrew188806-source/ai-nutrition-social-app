# AI Evaluation

## Purpose
Define how Haocu measures AI quality before and after launch.

The product should evaluate whether AI helps users complete real flows, not only whether a model identifies food labels correctly.

## Evaluation Levels

### Level 1: Technical Accuracy
Measures whether AI candidates and nutrition estimates are reasonable.

Metrics:

- Top-1 dish candidate acceptance rate.
- Top-3 dish candidate acceptance rate.
- Ingredient recall after correction.
- Calorie estimate error vs verified menu data.
- Macro estimate error vs verified menu data.

### Level 2: Product Utility
Measures whether AI improves user behavior and completion.

Metrics:

- Analysis completion rate.
- Save-to-diary rate.
- Correction completion rate.
- Recommendation click-through rate.
- Meal Buddy card creation rate after analysis.
- Repeat usage frequency.

### Level 3: Trust and Safety
Measures whether AI is understandable, safe, and non-misleading.

Metrics:

- User trust rating.
- Low-confidence correction rate.
- Reported wrong result rate.
- Health claim review issues.
- Support tickets related to AI estimates.

### Level 4: Business Impact
Measures whether AI supports monetization and partner value.

Metrics:

- Premium conversion after AI insight usage.
- Restaurant recommendation conversion.
- Restaurant menu data adoption.
- Cost per successful analysis.
- Retention lift among AI users.

## Test Datasets

### MVP Seed Dataset

- Common Taiwanese breakfast foods.
- Bento/healthy meal boxes.
- Noodles, rice dishes, hot pot, fried foods.
- Drinks and desserts.
- Restaurant menu items from demo restaurants.

### Professional Review Dataset

A nutritionist or food professional should review a representative set of estimates before public marketing claims are made.

## Evaluation Workflow

1. Collect model output and user correction.
2. Compare accepted/corrected result to original estimate.
3. Track repeated error patterns.
4. Improve ranking rules and database entries.
5. Re-test against fixed benchmark set.
6. Document changes in AI evaluation log.

## Launch Thresholds

Suggested MVP thresholds:

- Top-3 candidate useful rate: 70%+ for seed categories.
- Analysis-to-save completion: 50%+ in user testing.
- Critical safety issue rate: 0 known unresolved.
- Average analysis latency: acceptable for demo flow.
- Cost per successful analysis: below internal target.

## Acceptance Criteria

1. AI outputs are logged with version metadata.
2. User corrections are linked to the original AI result.
3. Evaluation dashboard can separate technical errors from UX drop-off.
4. Professional review items are documented before investor/legal use.
