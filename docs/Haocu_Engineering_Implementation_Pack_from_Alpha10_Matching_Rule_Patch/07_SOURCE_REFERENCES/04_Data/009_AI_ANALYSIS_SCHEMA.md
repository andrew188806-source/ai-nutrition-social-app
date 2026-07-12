# AI Analysis Schema

## Purpose
Define data structures for AI runs, candidates, model metadata, and analysis-to-meal linkage.

## `ai_analysis_runs`

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | uuid | Yes | Primary key. |
| user_id | uuid | Yes | FK users.id. |
| source_type | enum | Yes | camera, upload, restaurant_card, recommendation. |
| photo_asset_id | uuid | No | Primary photo. |
| restaurant_id | uuid | No | Context. |
| menu_item_id | uuid | No | Context. |
| meal_type | enum | No | User-selected meal type. |
| status | enum | Yes | pending, completed, failed, manual_fallback. |
| model_provider | text | No |  |
| model_name | text | No |  |
| prompt_version | text | No |  |
| orchestration_version | text | Yes |  |
| latency_ms | int | No |  |
| estimated_cost | numeric | No |  |
| error_code | text | No |  |
| created_at | timestamptz | Yes |  |
| completed_at | timestamptz | No |  |

## `ai_candidates`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| ai_analysis_run_id | uuid | FK. |
| rank | int | Candidate rank. |
| dish_name | text | Candidate display name. |
| restaurant_id | uuid | Optional candidate source. |
| menu_item_id | uuid | Optional candidate source. |
| confidence_level | enum | high, medium, low. |
| confidence_score | numeric | Internal only. |
| visible_ingredients | jsonb |  |
| portion_assumptions | jsonb |  |
| cooking_signals | jsonb |  |
| candidate_source | enum | database, visual_ai, user_history, hybrid. |
| nutrition_estimate_id | uuid | FK nutrition_estimates. |
| selected_by_user | boolean |  |

## `ai_analysis_feedback`

Tracks user selection/rejection.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| ai_analysis_run_id | uuid | FK. |
| selected_candidate_id | uuid | Optional. |
| feedback_type | enum | accepted, corrected, none_of_above, manual_entry, abandoned. |
| correction_summary | jsonb |  |
| created_at | timestamptz |  |

## State Flow

```text
pending
  ├─ completed → candidate selected → meal record saved
  ├─ completed → none of above → manual/corrected meal record
  ├─ failed → manual_fallback
  └─ abandoned
```

## Acceptance Criteria

1. Every AI analysis has status and version metadata.
2. Candidate source is stored for database-first evaluation.
3. User selection is linked to the analysis run.
4. Failed analysis can still produce manual meal record.
5. AI cost and latency can be monitored.
