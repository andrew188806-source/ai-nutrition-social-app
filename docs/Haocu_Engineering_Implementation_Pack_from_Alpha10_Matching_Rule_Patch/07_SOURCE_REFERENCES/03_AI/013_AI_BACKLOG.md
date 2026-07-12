# AI Backlog

## Epic AI-01: Photo Meal Analysis

### Story AI-01-01: Upload/capture photo and create AI run
Acceptance criteria:
- User can submit a photo from camera or upload.
- Backend creates `ai_analysis_run`.
- Photo is linked to the user and analysis run.

### Story AI-01-02: Return top 3 dish candidates
Acceptance criteria:
- Response includes up to 3 candidates.
- Candidate includes display name, ingredients, confidence, and assumptions.
- Low-confidence outputs invite correction.

### Story AI-01-03: Manual fallback
Acceptance criteria:
- User can select “none of the above.”
- User can manually enter dish and nutrition-related fields.

## Epic AI-02: Database-First Analysis

### Story AI-02-01: Restaurant/menu candidate retrieval
Acceptance criteria:
- Analysis launched from restaurant context uses menu candidates first.
- Exact selected menu item bypasses unnecessary visual guesswork.

### Story AI-02-02: Candidate merge ranking
Acceptance criteria:
- Database and visual candidates are merged into one ranked list.
- Ranking source is stored for debugging.

## Epic AI-03: Nutrition Estimation

### Story AI-03-01: Macro calculation
Acceptance criteria:
- Estimate calories, protein, carbs, fat, and fiber.
- Store confidence and estimation source.

### Story AI-03-02: Portion correction
Acceptance criteria:
- User can change portion assumptions.
- Updated values recalculate meal record.

## Epic AI-04: Feedback Loop

### Story AI-04-01: Store original vs corrected result
Acceptance criteria:
- Original AI output remains unchanged.
- Corrected result powers diary/recommendations.

### Story AI-04-02: Correction analytics
Acceptance criteria:
- Correction events are emitted.
- Product can identify repeated error patterns.

## Epic AI-05: Recommendation AI

### Story AI-05-01: Next meal recommendation
Acceptance criteria:
- Recommendation uses today’s corrected intake.
- Output includes short reason and CTA.

### Story AI-05-02: Restaurant recommendation
Acceptance criteria:
- Ranking uses taste, nutrition, location, and context.
- Restaurant card includes recommended dish.

### Story AI-05-03: Meal Buddy recommendation
Acceptance criteria:
- Candidate count respects free/Premium limit.
- Compatibility reason is shown.

## Epic AI-06: Monitoring and Governance

### Story AI-06-01: AI run logging
Acceptance criteria:
- Model version, prompt version, latency, source, and confidence stored.

### Story AI-06-02: Cost dashboard
Acceptance criteria:
- Internal dashboard can estimate cost per successful saved meal.
