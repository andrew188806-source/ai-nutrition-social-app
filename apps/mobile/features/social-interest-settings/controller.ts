import {
  SOCIAL_INTEREST_LIMITS,
  type SocialInterestNamespace,
  type SocialInterestSettingsRepository,
  type SocialInterestSettingsSaveResult,
  type SocialInterestSettingsSnapshot,
  type SocialInterestSettingsState
} from "./types";

export type SocialInterestSettingsListener = (state: SocialInterestSettingsState) => void;

const signedOutState: SocialInterestSettingsState = Object.freeze({ phase: "signed_out", errorCode: null });

export class SocialInterestSettingsController {
  private readonly listeners = new Set<SocialInterestSettingsListener>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private requestSequence = 0;
  private disposed = false;
  private state: SocialInterestSettingsState = signedOutState;

  constructor(private readonly repository: SocialInterestSettingsRepository) {}

  getState(): SocialInterestSettingsState {
    return this.state;
  }

  subscribe(listener: SocialInterestSettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async setActor(actorKey: string | null, actorGeneration: number): Promise<void> {
    if (this.disposed) return;
    if (actorKey === this.actorKey && actorGeneration === this.actorGeneration) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    this.requestSequence += 1;
    if (!actorKey) {
      this.update(signedOutState);
      return;
    }
    await this.load();
  }

  async load(): Promise<void> {
    if (this.disposed || !this.actorKey) return;
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "loading", errorCode: null }));
    const result = await this.repository.load();
    if (!this.isCurrent(request)) return;
    if (!result.ok) {
      this.update(Object.freeze({ phase: "load_failed", errorCode: result.errorCode }));
      return;
    }
    this.update(readyState(result.value));
  }

  toggle(namespace: SocialInterestNamespace, tagKey: string): boolean {
    if (!isReady(this.state) || this.state.phase === "saving") return false;
    const option = this.state.categories[namespace]
      .flatMap((category) => category.options)
      .find((candidate) => candidate.tagKey === tagKey);
    if (!option || !option.selectable) return false;

    const current = [...this.state.draft[namespace]];
    const index = current.indexOf(tagKey);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      if (!option.active) return false;
      if (current.length >= SOCIAL_INTEREST_LIMITS[namespace]) {
        this.update(Object.freeze({ ...this.state, phase: "ready", limitError: namespace, errorCode: null }));
        return false;
      }
      current.push(tagKey);
    }

    const draft = Object.freeze({
      general: Object.freeze(namespace === "general" ? current : [...this.state.draft.general]),
      food: Object.freeze(namespace === "food" ? current : [...this.state.draft.food])
    });
    this.update(Object.freeze({
      ...this.state,
      phase: "ready",
      draft,
      dirty: !sameSelection(draft, this.state.persisted),
      limitError: null,
      errorCode: null
    }));
    return true;
  }

  async save(): Promise<boolean> {
    if (!isReady(this.state) || this.state.phase === "saving" || !this.actorKey) return false;
    if (!this.state.dirty) {
      this.update(Object.freeze({ ...this.state, phase: "saved", limitError: null, errorCode: null }));
      return true;
    }

    const request = this.captureRequest();
    const draft = this.state.draft;
    const categories = this.state.categories;
    const persisted = this.state.persisted;
    this.update(Object.freeze({ ...this.state, phase: "saving", limitError: null, errorCode: null }));
    const result = await this.repository.save({
      generalTagKeys: draft.general,
      foodTagKeys: draft.food
    });
    if (!this.isCurrent(request)) return false;
    if (!result.ok || !saveMatchesDraft(result.value, draft, categories)) {
      this.update(Object.freeze({
        phase: "save_failed",
        categories,
        persisted,
        draft,
        dirty: true,
        limitError: null,
        errorCode: result.ok ? "invalid_server_response" : result.errorCode
      }));
      return false;
    }

    const selected = Object.freeze({
      general: Object.freeze([...result.value.generalTagKeys]),
      food: Object.freeze([...result.value.foodTagKeys])
    });
    this.update(Object.freeze({
      phase: "saved",
      categories,
      persisted: selected,
      draft: selected,
      dirty: false,
      limitError: null,
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
    const sequence = ++this.requestSequence;
    return Object.freeze({ sequence, actorKey: this.actorKey, actorGeneration: this.actorGeneration });
  }

  private isCurrent(request: Readonly<{ sequence: number; actorKey: string | null; actorGeneration: number }>) {
    return !this.disposed
      && request.sequence === this.requestSequence
      && request.actorKey === this.actorKey
      && request.actorGeneration === this.actorGeneration;
  }

  private update(state: SocialInterestSettingsState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function readyState(snapshot: SocialInterestSettingsSnapshot): SocialInterestSettingsState {
  const selected = Object.freeze({
    general: Object.freeze([...snapshot.selected.general]),
    food: Object.freeze([...snapshot.selected.food])
  });
  return Object.freeze({
    phase: "ready",
    categories: snapshot.categories,
    persisted: selected,
    draft: selected,
    dirty: false,
    limitError: null,
    errorCode: null
  });
}

function saveMatchesDraft(
  result: SocialInterestSettingsSaveResult,
  draft: SocialInterestSettingsSnapshot["selected"],
  categories: SocialInterestSettingsSnapshot["categories"]
): boolean {
  for (const namespace of ["general", "food"] as const) {
    const returned = namespace === "general" ? result.generalTagKeys : result.foodTagKeys;
    const allowed = new Set(categories[namespace].flatMap((category) => category.options.map((option) => option.tagKey)));
    if (returned.some((key) => !allowed.has(key))) return false;
    if (!sameSet(returned, draft[namespace])) return false;
  }
  return true;
}

function sameSelection(
  left: SocialInterestSettingsSnapshot["selected"],
  right: SocialInterestSettingsSnapshot["selected"]
) {
  return sameSet(left.general, right.general) && sameSet(left.food, right.food);
}

function sameSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function isReady(state: SocialInterestSettingsState): state is Extract<SocialInterestSettingsState, { phase: "ready" | "saving" | "saved" | "save_failed" }> {
  return state.phase === "ready" || state.phase === "saving" || state.phase === "saved" || state.phase === "save_failed";
}
