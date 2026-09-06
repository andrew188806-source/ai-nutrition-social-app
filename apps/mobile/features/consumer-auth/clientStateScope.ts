// The authenticated actor is the boundary for any client-only Consumer state.
// This module intentionally carries identity metadata only: it never stores a
// session, token, profile, or server response.  Consumers use it to namespace
// demo persistence and to discard module-memory state when identity changes.
export type ConsumerClientStateScope = Readonly<{
  actorKey: string | null;
  actorGeneration: number;
}>;

let scope: ConsumerClientStateScope = Object.freeze({ actorKey: null, actorGeneration: 0 });
const listeners = new Set<(scope: ConsumerClientStateScope) => void>();

export function getConsumerClientStateScope(): ConsumerClientStateScope {
  return scope;
}

export function setConsumerClientStateScope(actorKey: string | null, actorGeneration: number): void {
  const normalizedActorKey = actorKey?.trim() || null;
  if (scope.actorKey === normalizedActorKey && scope.actorGeneration === actorGeneration) return;
  scope = Object.freeze({ actorKey: normalizedActorKey, actorGeneration });
  for (const listener of listeners) listener(scope);
}

export function subscribeConsumerClientStateScope(listener: (scope: ConsumerClientStateScope) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A null return is deliberate: signed-out code must not fall back to a shared
// device key for data that belongs to an authenticated Consumer.
export function consumerUserScopedStorageKey(prefix: string): string | null {
  return scope.actorKey ? `${prefix}.${encodeURIComponent(scope.actorKey)}` : null;
}
