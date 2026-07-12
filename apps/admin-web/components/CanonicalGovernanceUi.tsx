import type { AdminPageState } from "../view-models/admin-governance-view-models";
import { CardGrid, DetailCard, GovernanceNote, MetricGrid } from "./GovernanceUi";

export function PageStatePanel({ state }: { state: AdminPageState }) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 md:grid-cols-4">
      <span>Loading: {state.loading ? "yes" : "no"}</span>
      <span>Filter: {state.filterLabel}</span>
      <span>Search: {state.searchPlaceholder}</span>
      <span>No results: {state.noResultsLabel}</span>
      {state.error ? <span className="text-rose-700">Error: {state.error}</span> : null}
    </div>
  );
}

export function BeforeAfter({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <pre className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">{JSON.stringify(before, null, 2)}</pre>
      <pre className="overflow-auto rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">{JSON.stringify(after, null, 2)}</pre>
    </div>
  );
}

export function DraftTrace({ draftId, auditLogId }: { draftId?: string; auditLogId?: string }) {
  return (
    <GovernanceNote>
      {draftId
        ? `Draft-and-confirm trace: ${draftId}${auditLogId ? ` / audit ${auditLogId}` : ""}. Canonical data is not overwritten by the page action.`
        : "No action draft yet. High-risk actions must create a draft, show before/after data, confirm, then write an audit log."}
    </GovernanceNote>
  );
}

export { CardGrid, DetailCard, GovernanceNote, MetricGrid };
