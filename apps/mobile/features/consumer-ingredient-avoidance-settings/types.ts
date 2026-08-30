import type { CandidateIngredientAvoidanceKey } from
  "../../../../packages/shared/src/domain/candidate-ingredient-avoidance";

export type ConsumerIngredientAvoidanceOption = Readonly<{
  key: CandidateIngredientAvoidanceKey;
  label: string;
}>;

export type CurrentUserIngredientAvoidanceSettings = Readonly<{
  options: readonly ConsumerIngredientAvoidanceOption[];
  selectedIngredientAvoidanceKeys: readonly CandidateIngredientAvoidanceKey[];
  unresolvedSelectionCount: number;
}>;

export type ConsumerIngredientAvoidanceSettingsErrorCode =
  | "authentication_required"
  | "configuration_error"
  | "load_failed"
  | "save_failed"
  | "invalid_server_response";

export type ConsumerIngredientAvoidanceSettingsResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; errorCode: ConsumerIngredientAvoidanceSettingsErrorCode }>;

export interface ConsumerIngredientAvoidanceSettingsRepository {
  readonly source: "supabase-live" | "disabled";
  loadCurrentUser(): Promise<ConsumerIngredientAvoidanceSettingsResult<CurrentUserIngredientAvoidanceSettings>>;
  replaceCurrentUser(
    selectedKeys: readonly CandidateIngredientAvoidanceKey[]
  ): Promise<ConsumerIngredientAvoidanceSettingsResult<CurrentUserIngredientAvoidanceSettings>>;
}

export type ConsumerIngredientAvoidanceSettingsReadyState = Readonly<{
  phase: "ready" | "saving" | "saved" | "save_failed";
  options: readonly ConsumerIngredientAvoidanceOption[];
  persisted: readonly CandidateIngredientAvoidanceKey[];
  draft: readonly CandidateIngredientAvoidanceKey[];
  unresolvedSelectionCount: number;
  dirty: boolean;
  errorCode: ConsumerIngredientAvoidanceSettingsErrorCode | null;
}>;

export type ConsumerIngredientAvoidanceSettingsState =
  | Readonly<{ phase: "signed_out"; errorCode: null }>
  | Readonly<{ phase: "loading"; errorCode: null }>
  | Readonly<{ phase: "load_failed"; errorCode: ConsumerIngredientAvoidanceSettingsErrorCode }>
  | ConsumerIngredientAvoidanceSettingsReadyState;

export function isConsumerIngredientAvoidanceSettingsReady(
  state: ConsumerIngredientAvoidanceSettingsState
): state is ConsumerIngredientAvoidanceSettingsReadyState {
  return state.phase === "ready" || state.phase === "saving"
    || state.phase === "saved" || state.phase === "save_failed";
}
