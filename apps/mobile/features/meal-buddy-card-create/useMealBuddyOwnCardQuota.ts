// PC-1 B1: the canonical card quota for the current actor, read once per actor/session generation.
// `loading` and `failed` are explicit states so no screen can render a fabricated zero; a successful
// create updates the quota straight from the create response's own `quota` block.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMealBuddyOwnCardQuotaRepository,
  type MealBuddyOwnCardQuotaRepository
} from "./ownCardQuota";
import type { MealBuddyOwnCardQuota } from "./types";

export type MealBuddyOwnCardQuotaState =
  | Readonly<{ phase: "disabled" }>
  | Readonly<{ phase: "loading" }>
  | Readonly<{ phase: "ready"; quota: MealBuddyOwnCardQuota }>
  | Readonly<{ phase: "failed" }>;

export function useMealBuddyOwnCardQuota(
  actorKey: string | null,
  actorGeneration: number,
  repositoryFactory: () => MealBuddyOwnCardQuotaRepository = createMealBuddyOwnCardQuotaRepository
) {
  const repository = useMemo(() => (actorKey ? repositoryFactory() : null), [actorKey, actorGeneration, repositoryFactory]);
  const [state, setState] = useState<MealBuddyOwnCardQuotaState>(() => (actorKey ? { phase: "loading" } : { phase: "disabled" }));
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    const request = ++sequence.current;
    if (!repository) { setState({ phase: "disabled" }); return; }
    setState({ phase: "loading" });
    const result = await repository.readQuota();
    // A newer actor, generation or reload owns the state.
    if (request !== sequence.current) return;
    setState(result.ok ? { phase: "ready", quota: result.value } : { phase: "failed" });
  }, [repository]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => { sequence.current += 1; }, []);

  // A create response carries the server's post-create quota; use it directly. Only when that block
  // is absent or invalid is a canonical re-read needed.
  const applyFromCreate = useCallback((quota: MealBuddyOwnCardQuota | null) => {
    if (quota) {
      sequence.current += 1;
      setState({ phase: "ready", quota });
      return;
    }
    void reload();
  }, [reload]);

  return Object.freeze({ state, reload, applyFromCreate });
}
