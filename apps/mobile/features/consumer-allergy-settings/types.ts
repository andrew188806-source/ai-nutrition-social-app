import type { CandidateAllergenKey } from "../../../../packages/shared/src/domain/candidate-allergen";

export type ConsumerAllergyOption = Readonly<{
  key: CandidateAllergenKey;
  label: string;
}>;

export type CurrentUserAllergySettings = Readonly<{
  options: readonly ConsumerAllergyOption[];
  selectedAllergenKeys: readonly CandidateAllergenKey[];
  unresolvedSelectionCount: number;
}>;

export type ConsumerAllergySettingsErrorCode =
  | "authentication_required"
  | "configuration_error"
  | "load_failed"
  | "save_failed"
  | "invalid_server_response";

export type ConsumerAllergySettingsResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; errorCode: ConsumerAllergySettingsErrorCode }>;

export interface ConsumerAllergySettingsRepository {
  readonly source: "supabase-live" | "disabled";
  loadCurrentUser(): Promise<ConsumerAllergySettingsResult<CurrentUserAllergySettings>>;
  replaceCurrentUser(
    selectedAllergenKeys: readonly CandidateAllergenKey[]
  ): Promise<ConsumerAllergySettingsResult<CurrentUserAllergySettings>>;
}

export type ConsumerAllergySettingsReadyState = Readonly<{
  phase: "ready" | "saving" | "saved" | "save_failed";
  options: readonly ConsumerAllergyOption[];
  persisted: readonly CandidateAllergenKey[];
  draft: readonly CandidateAllergenKey[];
  unresolvedSelectionCount: number;
  dirty: boolean;
  errorCode: ConsumerAllergySettingsErrorCode | null;
}>;

export type ConsumerAllergySettingsState =
  | Readonly<{ phase: "signed_out"; errorCode: null }>
  | Readonly<{ phase: "loading"; errorCode: null }>
  | Readonly<{ phase: "load_failed"; errorCode: ConsumerAllergySettingsErrorCode }>
  | ConsumerAllergySettingsReadyState;

export function isConsumerAllergySettingsReady(
  state: ConsumerAllergySettingsState
): state is ConsumerAllergySettingsReadyState {
  return state.phase === "ready" || state.phase === "saving"
    || state.phase === "saved" || state.phase === "save_failed";
}
