export type TasteProfileSourceName =
  | "taste_profile"
  | "nutrition_goals"
  | "dietary_restrictions"
  | "meals"
  | "favorites"
  | "ratings";

type CountedSourceState<TStatus extends string> = {
  status: TStatus;
  evidenceCount: number;
};

export type TasteProfileAvailableSourceState = CountedSourceState<"available">;
export type TasteProfileEmptySourceState = CountedSourceState<"empty"> & { evidenceCount: 0 };
export type TasteProfileDisabledSourceState = CountedSourceState<"disabled"> & {
  evidenceCount: 0;
  reason: "source_disabled";
};
export type TasteProfileUnauthenticatedSourceState = CountedSourceState<"unauthenticated"> & {
  evidenceCount: 0;
  reason: "authentication_required";
};
export type TasteProfileFailedSourceState = CountedSourceState<"failed"> & {
  failureCode: "source_read_failed" | "source_mapping_failed";
};
export type TasteProfileDeferredSourceState = CountedSourceState<"deferred"> & {
  evidenceCount: 0;
  reason: "acl_activation_pending";
};

export type TasteProfileSourceState =
  | TasteProfileAvailableSourceState
  | TasteProfileEmptySourceState
  | TasteProfileDisabledSourceState
  | TasteProfileUnauthenticatedSourceState
  | TasteProfileFailedSourceState
  | TasteProfileDeferredSourceState;

export type TasteProfileSourceStates = Record<TasteProfileSourceName, TasteProfileSourceState>;

export const TASTE_PROFILE_SOURCE_NAMES: readonly TasteProfileSourceName[] = [
  "taste_profile",
  "nutrition_goals",
  "dietary_restrictions",
  "meals",
  "favorites",
  "ratings"
];
