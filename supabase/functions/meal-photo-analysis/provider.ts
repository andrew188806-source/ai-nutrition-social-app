import type {
  MealSourceContext,
  RawMealPhotoAnalysisProviderOutput,
  SupportedMealPhotoMimeType
} from "../_shared/meal-photo-analysis/index.ts";

// MI-E-C4 §8: provider-neutral server-only port. Deliberately contains no Supabase request/
// response object, no database client, no user ID, no Storage path, and no Mobile session state —
// a provider implementation only ever sees already-downloaded, already-validated image bytes plus
// the handful of context fields the prompt actually needs. Orchestration (auth, Storage,
// persistence) lives in handler.ts/persistence.ts, never here.
export type MealPhotoAnalysisProviderInput = {
  imageBytes: Uint8Array;
  mimeType: SupportedMealPhotoMimeType;
  locale: string;
  mealSourceContext: MealSourceContext;
  capturedAt: string;
};

export type MealPhotoAnalysisProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type MealPhotoAnalysisProviderResult = {
  // Opaque, e.g. "openai-gpt-4.1-mini-responses-v1". Never a field Mobile ever sees — the exact
  // value is only ever recorded server-side (meal_analyses.model_name/model_version) and echoed
  // back to Mobile only via the contract's already-opaque analysisEngineVersion string.
  engineVersion: string;
  // Already independently runtime-validated by validateRawProviderOutput before this result is
  // constructed — see openaiProvider.ts/mockProvider — never a provider's raw, unvalidated JSON.
  rawOutput: RawMealPhotoAnalysisProviderOutput;
  usage?: MealPhotoAnalysisProviderUsage;
};

export type MealPhotoAnalysisProviderErrorCode =
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_invalid_response";

export type MealPhotoAnalysisProviderOutcome =
  | { ok: true; value: MealPhotoAnalysisProviderResult }
  | { ok: false; errorCode: MealPhotoAnalysisProviderErrorCode };

export interface MealPhotoAnalysisProvider {
  readonly name: "disabled" | "openai" | "mock";
  analyze(input: MealPhotoAnalysisProviderInput): Promise<MealPhotoAnalysisProviderOutcome>;
}

// Fail-closed default. Config already refuses to load (analysis_disabled) before a provider is
// ever constructed when MEAL_PHOTO_ANALYSIS_PROVIDER=disabled, so this class existing is defense
// in depth — it is the safe object a caller gets if provider construction is ever reached without
// a properly configured live provider, never a code path exercised in normal operation.
export class DisabledMealPhotoAnalysisProvider implements MealPhotoAnalysisProvider {
  readonly name = "disabled" as const;

  async analyze(_input: MealPhotoAnalysisProviderInput): Promise<MealPhotoAnalysisProviderOutcome> {
    return { ok: false, errorCode: "provider_unavailable" };
  }
}

// Injectable for unit/integration tests only — never selected by loadServerConfig's provider
// gate outside of a test harness explicitly constructing it directly.
export type MockMealPhotoAnalysisProviderOptions = {
  result?: MealPhotoAnalysisProviderResult;
  errorCode?: MealPhotoAnalysisProviderErrorCode;
};

export class MockMealPhotoAnalysisProvider implements MealPhotoAnalysisProvider {
  readonly name = "mock" as const;

  constructor(private readonly options: MockMealPhotoAnalysisProviderOptions) {}

  async analyze(_input: MealPhotoAnalysisProviderInput): Promise<MealPhotoAnalysisProviderOutcome> {
    if (this.options.errorCode) return { ok: false, errorCode: this.options.errorCode };
    if (!this.options.result) throw new Error("MockMealPhotoAnalysisProvider requires result or errorCode.");
    return { ok: true, value: this.options.result };
  }
}
