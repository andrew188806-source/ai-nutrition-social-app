# AI Prompting and Model Orchestration

## Purpose
Define how Haocu should orchestrate AI services and prompts while keeping product behavior predictable, reviewable, and cost-controlled.

## Architecture Principle
AI should be treated as a service component, not scattered inside UI code.

The mobile app should call backend endpoints. Backend orchestration decides whether to use database lookup, model inference, nutrition estimation, or manual fallback.

## Orchestration Flow

1. Receive analysis request.
2. Validate user quota and photo asset.
3. Fetch context candidates from database.
4. Decide whether visual model is needed.
5. Run vision analysis if needed.
6. Merge database candidates and model candidates.
7. Estimate nutrition.
8. Generate explanation copy.
9. Store AI run and candidate records.
10. Return UI-friendly response.

## Prompt Boundaries

Prompts should ask for structured output, not free-form advice.

Required output fields:

- dish candidates
- visible ingredients
- cooking signals
- portion assumptions
- confidence
- uncertainty notes
- safety flags

Prompts should not ask the model to provide medical diagnosis or individualized disease treatment.

## Structured Output Example

```json
{
  "dish_candidates": [
    {
      "display_name": "雞胸健康餐盒",
      "confidence": "medium",
      "reason": "visible chicken breast, rice, egg, vegetables",
      "ingredients": ["chicken breast", "rice", "egg", "greens"],
      "portion_assumptions": ["medium rice", "large protein"],
      "needs_user_confirmation": true
    }
  ],
  "safety_flags": []
}
```

## Versioning

Every AI output should store:

- model provider
- model name/version when available
- prompt template version
- orchestration version
- nutrition rules version
- created timestamp

## Cost Controls

- Skip vision call when menu item is explicitly selected.
- Use smaller/faster model for classification when sufficient.
- Cache repeated restaurant/menu analyses.
- Batch non-urgent admin nutrition estimation.
- Track cost per successful saved meal.

## Failure Handling

| Failure | Fallback |
|---|---|
| Vision model timeout | Return pending/manual entry. |
| Structured output invalid | Retry once with strict schema. |
| Nutrition calculation missing | Use database fallback or manual entry. |
| Safety flag triggered | Suppress unsafe advice and show general copy. |

## Acceptance Criteria

1. AI prompt versions are stored with each analysis.
2. UI never directly calls third-party AI services in MVP.
3. Analysis can complete through manual fallback.
4. Model output is schema-validated before display.
5. Cost and latency are monitored per analysis path.
