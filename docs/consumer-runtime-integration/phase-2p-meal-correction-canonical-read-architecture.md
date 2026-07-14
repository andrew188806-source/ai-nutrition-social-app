# Consumer Runtime Phase 2P

## Meal Correction Canonical Read Architecture

Status: Implementation complete, guard complete, default-smoke-skipped, mock-contract-verified, and freeze-ready.

## Scope

Phase 2P prepares meal corrections as a canonical read domain for the Consumer runtime.

It does not add migrations, deploy migrations, change grants, change RLS policies, create RPCs, invoke RPCs, perform Development live correction reads, perform correction writes, create seed or fixture data, change UI routes, change navigation, cut over local demo stores, or start Phase 2Q.

## Schema Discovery

Frozen Consumer Schema Phase 1.3 contains:

**`public.meal_analyses`** (migration `20260712130500`):

- primary key: `id uuid primary key default gen_random_uuid()`
- owner column: `user_id uuid not null references auth.users(id) on delete cascade`
- meal record linkage: `meal_record_id uuid references meal_records(id) on delete set null` (nullable)
- photo inputs: `source_photo_ids text[] not null default '{}'`
- model identity: `model_name text not null`, `model_version text not null`
- AI output: `estimated_nutrition jsonb not null default '{}'`, `detected_items jsonb not null default '[]'`
- confidence: `confidence_score numeric` (nullable)
- status: `analysis_status text not null default 'completed'`
- timestamps: `analyzed_at timestamptz not null`, `created_at timestamptz not null`
- authenticated SELECT grant: **not present**

**`public.meal_corrections`** (migration `20260712130500`):

- primary key: `id uuid primary key default gen_random_uuid()`
- owner column: `user_id uuid not null references auth.users(id) on delete cascade`
- analysis linkage: `meal_analysis_id uuid not null references meal_analyses(id) on delete cascade` (required)
- item linkage: `meal_record_item_id uuid references meal_record_items(id) on delete set null` (optional)
- correction kind: `correction_type text not null` (unconstrained; no CHECK constraint)
- before state: `before_value jsonb` (nullable; first correction has no prior corrected state)
- after state: `after_value jsonb not null`
- context: `correction_reason text` (nullable), `note text` (nullable)
- timestamps: `corrected_at timestamptz not null`, `created_at timestamptz not null`
- authenticated SELECT grant: **not present**

**`public.meal_record_items.correction_status`**:

- type: `meal_correction_status` enum
- values: `none | pending | confirmed | rejected`
- accessible via the existing authenticated SELECT grant on `public.meal_record_items`

## Linkage Model

Corrections are structurally separate from the original AI analysis result:

```
public.meal_records
  ← public.meal_analyses.meal_record_id   (nullable: analysis may precede record)
      ← public.meal_corrections.meal_analysis_id   (required FK; each correction belongs to exactly one analysis)
           public.meal_corrections.meal_record_item_id → public.meal_record_items   (optional)
```

A correction is always the child of an analysis, never the direct child of a `meal_record`. The original AI output (`estimated_nutrition`, `detected_items`) is stored on `meal_analyses` and is preserved independently of any corrections. A correction row stores the `before_value` and `after_value` so both the original AI estimate and the user-corrected value are structurally available.

## Multiple Revisions

The `meal_corrections` schema does not include a unique constraint preventing multiple corrections for the same `meal_analysis_id` or `meal_record_item_id`. Multiple correction rows for the same analysis are therefore structurally permitted. The schema is conventionally append-oriented: no UPDATE or DELETE RPC on correction rows is implemented. History is immutable by convention, not enforced by constraint.

## Canonical Model

Phase 2P adds the following types to `apps/mobile/features/consumer-meals/types.ts`:

- `ConsumerMealCorrectionSource` — `"disabled" | "mock" | "supabase-prepared"`
- `ConsumerMealCorrectionDetail` — discriminated union on `correctionType`:
  - `"nutrition_override"` — before/after as `ConsumerNutritionSnapshot`
  - `"ingredient_adjustment"` — before/after as string
  - `"portion_adjustment"` — before/after as string
  - `"cooking_adjustment"` — before/after as string
  - `"name_change"` — before/after as string
  - `"unknown"` — escape hatch for unconstrained `correction_type` database values
- `ConsumerMealCorrectionItemOverview` — per-item correction state: `correctionStatus`, nullable `correction`
- `ConsumerMealCorrectionReadInput` — `{ mealRecordId: string }`
- `ConsumerMealCorrectionOverview` — `{ mealRecordId, items, hasAnyCorrections, correctionReadSource }`
- `ConsumerMealCorrectionReadResult` — discriminated union on `status`:
  - `"available"` — overview present
  - `"empty"` — no corrections found for the meal record
  - `"disabled"` — source is disabled
  - `"grant_pending"` — source is supabase-prepared; read grant not yet added
  - `"unauthenticated"` — session missing or expired
  - `"not_found"` — meal record id has no corresponding analysis
  - `"read_failed"` — transport or mapping error
- `ConsumerMealCorrectionRepository` — interface with `getCurrentUserMealCorrectionOverview`

`correctionSource: ConsumerMealCorrectionSource` is added to `ConsumerMealRuntimeFlags`.

## Correction vs. Adjacent Domains

Meal corrections are distinct from and do not overlap with:

- **Planned meal changes** — `ConsumerPlannedMealWriteRepository` (save/update/remove on `public.planned_meals`)
- **Consumption adjustments** — `ConsumerMealConsumptionAdjustment` (completion ratio and actual nutrition override, not linked to `meal_corrections`)
- **Post-meal ratings** — stored on legacy `SavedMealRecord` (not in `meal_corrections`)
- **Favorites** — `public.consumer_favorites` table (separate domain)
- **Recommendation feedback** — `public.recommendation_feedback` table (separate domain)

## Supabase Contracts

Phase 2P adds the following to `apps/mobile/features/consumer-meals/supabaseMealContracts.ts`:

- `SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE = "meal_analyses"`
- `SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE = "meal_corrections"`
- `SUPABASE_CONSUMER_MEAL_CORRECTIONS_SELECT_COLUMNS` — column list for future read grant
- `SupabaseMealAnalysisRowLike` — typed shape of a `meal_analyses` row
- `SupabaseMealCorrectionRowLike` — typed shape of a `meal_corrections` row

No `from(...).select(...)` is called on these tables in Phase 2P.

## Runtime Source Flag

Source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE`

Allowed values:

- `disabled` (default)
- `mock`
- `supabase-prepared`

Default:

- `disabled`

Unknown values fail closed to `disabled` and register a runtime issue.

## Repository Sources

**Disabled source** (`DisabledConsumerMealCorrectionRepository`):

- returns `{ status: "disabled" }`
- creates no client
- performs no network request
- performs no database read or write

**Mock source** (`MockConsumerMealCorrectionRepository`):

- deterministic correction overview for `MOCK_CORRECTED_MEAL_RECORD_ID`
- returns `"empty"` for all other meal record ids
- includes a `"confirmed"` `"nutrition_override"` correction on one item
- no `Math.random()`, no `Date.now()`, no `new Date()`

**Supabase-prepared source** (`SupabasePreparedConsumerMealCorrectionRepository`):

- records the future query tables: `SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE`, `SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE`
- records the future select columns: `SUPABASE_CONSUMER_MEAL_CORRECTIONS_SELECT_COLUMNS`
- returns `{ status: "grant_pending", errorCode: "correction_read_grant_pending" }` for all inputs
- creates no Supabase client
- calls no `.from(...)`, no `.select(...)`, no `.rpc(...)`
- activates only when explicitly opted in via `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE=supabase-prepared`

## Grant Gap

`public.meal_analyses` and `public.meal_corrections` have no authenticated SELECT grant in the active migration set. The existing `20260713040100` grant migration covers only `public.meal_records` and `public.meal_record_items`.

The supabase-prepared repository therefore fails closed with `correction_read_grant_pending`. No live correction read is possible until the grant is added.

## No Write Path

No write path for meal corrections is implemented in Phase 2P. There is no `ConsumerMealCorrectionWriteRepository`, no correction insert RPC, and no correction mutation service. Corrections are the output of AI model invocations that exist outside the Consumer Runtime scope.

## No Training Pipeline

No training pipeline, embedding computation, model fine-tuning, automatic export, or data collection for model retraining exists in the Consumer Runtime. Phase 2P does not implement or reference any such pipeline.

## Verification

Scripts:

- `npm run test:consumer-phase2p`
- `npm run test:consumer-phase2p-smoke`
- `npm run test:consumer-phase2p-mock-smoke`

Default smoke:

- `SKIPPED`
- no client
- no sign-in
- no network
- no database read
- no database write
- no RPC
- no credentials printed
- phase 2Q not started

Mock-contract smoke verifies:

- disabled repository returns `"disabled"` status
- mock repository returns canonical `ConsumerMealCorrectionOverview` for known id
- mock repository returns `"empty"` for unknown id
- `ConsumerMealCorrectionDetail` discriminated union shape
- supabase-prepared repository returns `"grant_pending"` with `"correction_read_grant_pending"` error code
- service delegates correctly to repository
- no client, network, database read, database write, or RPC

## Non-Goals

- No migration.
- No grant or RLS change.
- No authenticated SELECT on `meal_analyses` or `meal_corrections`.
- No Development live correction read.
- No correction write or RPC.
- No direct Supabase query.
- No UI layout or navigation change.
- No training pipeline, embeddings, automatic export, or model retraining.
- No planned meal changes.
- No consumption adjustment writes.
- No ratings, favorites, or recommendation feedback runtime.
- No seed, fixture, bootstrap, or production operation.
- No push.
- No Phase 2Q.

## Phase 2Q Prerequisites

A future Development live correction-read phase would require, before activation, all of the following:

- a forward-only migration granting authenticated SELECT on `public.meal_analyses` and `public.meal_corrections`
- RLS ownership verification confirming `auth.uid() = user_id` on both tables
- a live Supabase adapter implementing the join from `meal_records` through `meal_analyses` to `meal_corrections`
- an explicit development-only live read opt-in flag
- explicit live read smoke confirming available and empty correction results
- confirmation that the discriminated union correctly maps all observed `correction_type` values
- verification that the original AI estimate (`estimated_nutrition`) is preserved and readable alongside any correction
- no write and no production boundary
