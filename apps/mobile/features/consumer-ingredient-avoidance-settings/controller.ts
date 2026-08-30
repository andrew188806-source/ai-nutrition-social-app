import type { CandidateIngredientAvoidanceKey } from
  "../../../../packages/shared/src/domain/candidate-ingredient-avoidance";
import type {
  ConsumerIngredientAvoidanceSettingsRepository,
  ConsumerIngredientAvoidanceSettingsState,
  CurrentUserIngredientAvoidanceSettings
} from "./types";
import { isConsumerIngredientAvoidanceSettingsReady } from "./types";

export type ConsumerIngredientAvoidanceSettingsListener =
  (state: ConsumerIngredientAvoidanceSettingsState) => void;

const signedOutState: ConsumerIngredientAvoidanceSettingsState =
  Object.freeze({ phase: "signed_out", errorCode: null });

export class ConsumerIngredientAvoidanceSettingsController {
  private readonly listeners = new Set<ConsumerIngredientAvoidanceSettingsListener>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private requestSequence = 0;
  private disposed = false;
  private state: ConsumerIngredientAvoidanceSettingsState = signedOutState;

  constructor(private readonly repository: ConsumerIngredientAvoidanceSettingsRepository) {}

  getState(): ConsumerIngredientAvoidanceSettingsState { return this.state; }

  subscribe(listener: ConsumerIngredientAvoidanceSettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async setActor(actorKey: string | null, actorGeneration: number): Promise<void> {
    if (this.disposed || (actorKey === this.actorKey && actorGeneration === this.actorGeneration)) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    this.requestSequence += 1;
    if (!actorKey) { this.update(signedOutState); return; }
    await this.load();
  }

  async load(): Promise<void> {
    if (this.disposed || !this.actorKey) return;
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "loading", errorCode: null }));
    const result = await this.repository.loadCurrentUser();
    if (!this.isCurrent(request)) return;
    if (!result.ok) {
      this.update(Object.freeze({ phase: "load_failed", errorCode: result.errorCode }));
      return;
    }
    this.update(readyState(result.value));
  }

  toggle(key: CandidateIngredientAvoidanceKey): boolean {
    if (!isConsumerIngredientAvoidanceSettingsReady(this.state) || this.state.phase === "saving") {
      return false;
    }
    const state = this.state;
    if (!state.options.some((option) => option.key === key)) return false;
    const draft = [...state.draft];
    const index = draft.indexOf(key);
    if (index >= 0) draft.splice(index, 1); else draft.push(key);
    draft.sort((left, right) => state.options.findIndex((option) => option.key === left)
      - state.options.findIndex((option) => option.key === right));
    this.update(Object.freeze({
      ...state,
      phase: "ready",
      draft: Object.freeze(draft),
      dirty: !sameKeys(draft, state.persisted),
      errorCode: null
    }));
    return true;
  }

  async save(): Promise<boolean> {
    if (!isConsumerIngredientAvoidanceSettingsReady(this.state)
      || this.state.phase === "saving" || !this.actorKey) return false;
    if (!this.state.dirty) {
      this.update(Object.freeze({ ...this.state, phase: "saved", errorCode: null }));
      return true;
    }
    const request = this.captureRequest();
    const previous = this.state;
    const draft = this.state.draft;
    this.update(Object.freeze({ ...this.state, phase: "saving", errorCode: null }));
    const result = await this.repository.replaceCurrentUser(draft);
    if (!this.isCurrent(request)) return false;
    if (!result.ok || !sameKeys(result.value.selectedIngredientAvoidanceKeys, draft)) {
      this.update(Object.freeze({
        ...previous,
        phase: "save_failed",
        dirty: true,
        errorCode: result.ok ? "invalid_server_response" : result.errorCode
      }));
      return false;
    }
    this.update(Object.freeze({
      phase: "saved",
      options: result.value.options,
      persisted: result.value.selectedIngredientAvoidanceKeys,
      draft: result.value.selectedIngredientAvoidanceKeys,
      unresolvedSelectionCount: result.value.unresolvedSelectionCount,
      dirty: false,
      errorCode: null
    }));
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.requestSequence += 1;
    this.actorKey = null;
    this.listeners.clear();
  }

  private captureRequest() {
    return Object.freeze({
      sequence: ++this.requestSequence,
      actorKey: this.actorKey,
      actorGeneration: this.actorGeneration
    });
  }
  private isCurrent(request: Readonly<{
    sequence: number;
    actorKey: string | null;
    actorGeneration: number;
  }>): boolean {
    return !this.disposed && request.sequence === this.requestSequence
      && request.actorKey === this.actorKey && request.actorGeneration === this.actorGeneration;
  }
  private update(state: ConsumerIngredientAvoidanceSettingsState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function readyState(
  snapshot: CurrentUserIngredientAvoidanceSettings
): ConsumerIngredientAvoidanceSettingsState {
  const selected = Object.freeze([...snapshot.selectedIngredientAvoidanceKeys]);
  return Object.freeze({
    phase: "ready",
    options: snapshot.options,
    persisted: selected,
    draft: selected,
    unresolvedSelectionCount: snapshot.unresolvedSelectionCount,
    dirty: false,
    errorCode: null
  });
}

function sameKeys(
  left: readonly CandidateIngredientAvoidanceKey[],
  right: readonly CandidateIngredientAvoidanceKey[]
): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}
