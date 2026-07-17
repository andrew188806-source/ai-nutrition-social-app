import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PortionFeeling } from "../analysis/types";
import type { ConsumerRatingService } from "./consumerRatingService";
import type { ConsumerRatingTargetMapping } from "./consumerRatingTargetMapper";
import type {
  ConsumerCreateOrReplaceRatingInput,
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRatingRecord,
  ConsumerCurrentRestaurantRatingRecord,
  ConsumerRatingReadResult,
  ConsumerRatingTarget,
  ConsumerRatingWriteResult
} from "./types";

export type ConsumerRatingUiStatus =
  | "idle"
  | "loading"
  | "missing"
  | "available"
  | "saving"
  | "saved"
  | "replaced"
  | "disabled"
  | "unauthenticated"
  | "target_unavailable"
  | "failed";

export type ConsumerRatingUiState = {
  status: ConsumerRatingUiStatus;
  localCompletionSaved: boolean;
  ratingValue?: number;
  portionFeeling?: string | null;
  repurchaseIntent?: string | null;
};

export type ConsumerRatingMealCompletionInput = {
  rating: number;
  portionFeeling: PortionFeeling;
  wouldEatAgain: boolean;
};

export type ConsumerRatingFormHydrationState = {
  identity: string;
  values: ConsumerRatingMealCompletionInput;
  dirty: {
    rating: boolean;
    portionFeeling: boolean;
    wouldEatAgain: boolean;
  };
};

export type ConsumerRatingFormHydrationAction =
  | { type: "reset"; identity: string; values?: Partial<ConsumerRatingMealCompletionInput> }
  | { type: "hydrate"; identity: string; values: Partial<ConsumerRatingMealCompletionInput> }
  | { type: "edit_rating"; value: number }
  | { type: "edit_portion"; value: PortionFeeling }
  | { type: "edit_would_eat_again"; value: boolean };

export type ConsumerRatingInitialHydration = {
  identity: string;
  values: Partial<ConsumerRatingMealCompletionInput>;
};

type RatingReadResult =
  | ConsumerRatingReadResult<ConsumerCurrentRestaurantRatingRecord>
  | ConsumerRatingReadResult<ConsumerCurrentMenuItemRatingRecord>;

const idleState: ConsumerRatingUiState = { status: "idle", localCompletionSaved: false };

export function createConsumerRatingFormHydrationState(
  identity: string,
  values: Partial<ConsumerRatingMealCompletionInput> = {}
): ConsumerRatingFormHydrationState {
  return {
    identity,
    values: {
      rating: values.rating ?? 0,
      portionFeeling: values.portionFeeling ?? "justRight",
      wouldEatAgain: values.wouldEatAgain ?? true
    },
    dirty: { rating: false, portionFeeling: false, wouldEatAgain: false }
  };
}

export function reduceConsumerRatingFormHydration(
  state: ConsumerRatingFormHydrationState,
  action: ConsumerRatingFormHydrationAction
): ConsumerRatingFormHydrationState {
  if (action.type === "reset") return createConsumerRatingFormHydrationState(action.identity, action.values);
  if (action.type === "hydrate") {
    if (action.identity !== state.identity) return state;
    return {
      ...state,
      values: {
        rating: !state.dirty.rating && action.values.rating !== undefined ? action.values.rating : state.values.rating,
        portionFeeling: !state.dirty.portionFeeling && action.values.portionFeeling !== undefined
          ? action.values.portionFeeling
          : state.values.portionFeeling,
        wouldEatAgain: !state.dirty.wouldEatAgain && action.values.wouldEatAgain !== undefined
          ? action.values.wouldEatAgain
          : state.values.wouldEatAgain
      }
    };
  }
  if (action.type === "edit_rating") {
    return { ...state, values: { ...state.values, rating: action.value }, dirty: { ...state.dirty, rating: true } };
  }
  if (action.type === "edit_portion") {
    return { ...state, values: { ...state.values, portionFeeling: action.value }, dirty: { ...state.dirty, portionFeeling: true } };
  }
  return {
    ...state,
    values: { ...state.values, wouldEatAgain: action.value },
    dirty: { ...state.dirty, wouldEatAgain: true }
  };
}

export function mapConsumerRatingReadResult(result: RatingReadResult): ConsumerRatingUiState {
  if (result.status === "available") return availableState(result.record);
  if (result.status === "missing") return { status: "missing", localCompletionSaved: false };
  if (result.status === "disabled") return { status: "disabled", localCompletionSaved: false };
  if (result.status === "unauthenticated") return { status: "unauthenticated", localCompletionSaved: false };
  return { status: "failed", localCompletionSaved: false };
}

export function mapConsumerRatingWriteResult(result: ConsumerRatingWriteResult, localCompletionSaved: boolean): ConsumerRatingUiState {
  if (result.status === "saved" || result.status === "replaced") {
    return { ...availableState(result.record), status: result.status, localCompletionSaved };
  }
  if (result.status === "disabled") return { status: "disabled", localCompletionSaved };
  if (result.status === "unauthenticated") return { status: "unauthenticated", localCompletionSaved };
  return { status: "failed", localCompletionSaved };
}

export function buildConsumerRatingWriteInput(
  target: ConsumerRatingTarget,
  completion: ConsumerRatingMealCompletionInput
): ConsumerCreateOrReplaceRatingInput {
  const feedback = {
    ratingValue: completion.rating,
    portionFeeling: completion.portionFeeling,
    repurchaseIntent: completion.wouldEatAgain ? "yes" : "no"
  } as const;
  return target.kind === "menu_item"
    ? { target, ...feedback }
    : { target, ...feedback };
}

export function getConsumerRatingInitialValues(state: ConsumerRatingUiState): Partial<ConsumerRatingMealCompletionInput> {
  if (state.status !== "available") return {};
  return {
    rating: state.ratingValue,
    portionFeeling: isPortionFeeling(state.portionFeeling) ? state.portionFeeling : undefined,
    wouldEatAgain: state.repurchaseIntent === "yes" ? true : state.repurchaseIntent === "no" ? false : undefined
  };
}

export function getConsumerRatingUiMessageKey(state: ConsumerRatingUiState): ConsumerRatingUiStatus {
  return state.status;
}

export function createConsumerRatingSubmissionCoordinator(service: ConsumerRatingService) {
  let saving = false;
  return {
    get isSaving() {
      return saving;
    },
    async submit(
      target: ConsumerRatingTarget,
      completion: ConsumerRatingMealCompletionInput,
      localCompletionSaved: boolean,
      onState: (state: ConsumerRatingUiState) => void
    ): Promise<boolean> {
      if (saving) return false;
      saving = true;
      onState({ status: "saving", localCompletionSaved });
      try {
        const result = await service.createOrReplaceCurrentUserRating(buildConsumerRatingWriteInput(target, completion));
        onState(mapConsumerRatingWriteResult(result, localCompletionSaved));
        return true;
      } catch {
        onState({ status: "failed", localCompletionSaved });
        return true;
      } finally {
        saving = false;
      }
    }
  };
}

export function useConsumerRatingUiModel(input: {
  service: ConsumerRatingService | null;
  target: ConsumerRatingTargetMapping;
  uiIdentity: string | null;
  enabled: boolean;
}) {
  const [state, setState] = useState<ConsumerRatingUiState>(idleState);
  const [initialHydration, setInitialHydration] = useState<ConsumerRatingInitialHydration | null>(null);
  const readGeneration = useRef(0);
  const coordinator = useMemo(
    () => input.service ? createConsumerRatingSubmissionCoordinator(input.service) : null,
    [input.service]
  );

  useEffect(() => {
    const generation = ++readGeneration.current;
    setInitialHydration(null);
    if (!input.enabled) {
      setState(idleState);
      return;
    }
    if (input.target.status === "target_unavailable") {
      setState({ status: "target_unavailable", localCompletionSaved: false });
      return;
    }
    if (!input.service || !input.uiIdentity) {
      setState({ status: "failed", localCompletionSaved: false });
      return;
    }
    setState({ status: "loading", localCompletionSaved: false });
    const read = input.target.target.kind === "restaurant"
      ? input.service.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: input.target.target.restaurantId })
      : input.service.getCurrentUserMenuItemRating({ kind: "menu_item", menuItemId: input.target.target.menuItemId });
    read
      .then((result) => {
        if (readGeneration.current !== generation) return;
        const nextState = mapConsumerRatingReadResult(result);
        setState(nextState);
        if (nextState.status === "available") {
          setInitialHydration({ identity: input.uiIdentity!, values: getConsumerRatingInitialValues(nextState) });
        }
      })
      .catch(() => {
        if (readGeneration.current === generation) setState({ status: "failed", localCompletionSaved: false });
      });
    return () => {
      if (readGeneration.current === generation) readGeneration.current += 1;
    };
  }, [input.enabled, input.service, input.target, input.uiIdentity]);

  const markLocalCompletionSaved = useCallback((saved: boolean) => {
    setState((current) => ({ ...current, localCompletionSaved: saved }));
  }, []);

  const save = useCallback(async (completion: ConsumerRatingMealCompletionInput, localCompletionSaved: boolean) => {
    if (input.target.status === "target_unavailable") {
      setState((current) => ({ status: "target_unavailable", localCompletionSaved: current.localCompletionSaved }));
      return false;
    }
    if (!coordinator) {
      setState((current) => ({ status: "failed", localCompletionSaved: current.localCompletionSaved }));
      return false;
    }
    return coordinator.submit(input.target.target, completion, localCompletionSaved, setState);
  }, [coordinator, input.target]);

  return {
    state,
    initialHydration,
    markLocalCompletionSaved,
    save
  };
}

function availableState(record: ConsumerCurrentRatingRecord): ConsumerRatingUiState {
  return {
    status: "available",
    localCompletionSaved: false,
    ratingValue: record.ratingValue,
    portionFeeling: record.portionFeeling,
    repurchaseIntent: record.repurchaseIntent
  };
}

function isPortionFeeling(value: string | null | undefined): value is PortionFeeling {
  return value === "tooMuch" || value === "justRight" || value === "tooLittle";
}
