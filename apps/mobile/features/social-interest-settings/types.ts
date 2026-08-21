export type SocialInterestNamespace = "general" | "food";

export const SOCIAL_INTEREST_LIMITS = Object.freeze({ general: 8, food: 5 } as const);

export type SocialInterestOption = Readonly<{
  tagKey: string;
  label: string;
  namespace: SocialInterestNamespace;
  active: boolean;
  selectable: boolean;
  displayOrder: number;
}>;

export type SocialInterestCategory = Readonly<{
  tagKey: string;
  label: string;
  namespace: SocialInterestNamespace;
  displayOrder: number;
  options: readonly SocialInterestOption[];
}>;

export type SocialInterestSettingsSnapshot = Readonly<{
  categories: Readonly<Record<SocialInterestNamespace, readonly SocialInterestCategory[]>>;
  selected: Readonly<Record<SocialInterestNamespace, readonly string[]>>;
}>;

export type SocialInterestSettingsSaveInput = Readonly<{
  generalTagKeys: readonly string[];
  foodTagKeys: readonly string[];
}>;

export type SocialInterestSettingsSaveResult = Readonly<{
  generalTagKeys: readonly string[];
  foodTagKeys: readonly string[];
}>;

export type SocialInterestSettingsErrorCode =
  | "authentication_required"
  | "configuration_error"
  | "load_failed"
  | "save_failed"
  | "invalid_server_response";

export type SocialInterestSettingsResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: SocialInterestSettingsErrorCode };

export interface SocialInterestSettingsRepository {
  readonly source: "supabase-live" | "disabled";
  load(): Promise<SocialInterestSettingsResult<SocialInterestSettingsSnapshot>>;
  save(input: SocialInterestSettingsSaveInput): Promise<SocialInterestSettingsResult<SocialInterestSettingsSaveResult>>;
}

export type SocialInterestSettingsReadyState = Readonly<{
  phase: "ready" | "saving" | "saved" | "save_failed";
  categories: SocialInterestSettingsSnapshot["categories"];
  persisted: SocialInterestSettingsSnapshot["selected"];
  draft: SocialInterestSettingsSnapshot["selected"];
  dirty: boolean;
  limitError: SocialInterestNamespace | null;
  errorCode: SocialInterestSettingsErrorCode | null;
}>;

export type SocialInterestSettingsState =
  | Readonly<{ phase: "signed_out"; errorCode: null }>
  | Readonly<{ phase: "loading"; errorCode: null }>
  | Readonly<{ phase: "load_failed"; errorCode: SocialInterestSettingsErrorCode }>
  | SocialInterestSettingsReadyState;
