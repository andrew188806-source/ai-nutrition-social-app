import {
  CONSUMER_RETENTION_POLICY_VERSION as VERSION, ELAPSED_DAY_MS,
  FREE_DETAIL_DAYS, PAID_DETAIL_DAYS, freeReviewWindow, monthOrdinal,
  parseRetentionInstant as instant, reportMonthAt
} from "./policy";
import type {
  Acquisition, DetailGrant, Fact, Grant, MonthBinding, MonthlyGrant, Reason,
  ReportPeriod, RetentionEvaluation, RetentionInput, Upgrade
} from "./types";

class InvalidFact extends Error {
  constructor(readonly code: string, readonly field: string) { super(code); }
}
function requireFact(condition: unknown, code: string, field: string): asserts condition {
  if (!condition) throw new InvalidFact(code, field);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown, field: string): number {
  const ms = instant(value); requireFact(ms !== null, "INVALID_INSTANT", field); return ms;
}
function iso(ms: number): string { return new Date(ms).toISOString(); }
function period(value: ReportPeriod, at: number, field: string): void {
  requireFact(object(value) && text(value.timezoneVersion) && value.monthKey === reportMonthAt(at, value.timezone) && freeReviewWindow(value.monthKey), "INVALID_REPORT_PERIOD", field);
}
function acquisition(value: Acquisition, limit: number, field: string): number {
  requireFact(object(value) && text(value.eventId) && ["free", "paid"].includes(value.tier), "INVALID_ACQUISITION", field);
  const at = time(value.at, `${field}.at`);
  requireFact(at <= limit, "FUTURE_EVENT", field); return at;
}
function upgrade(value: Upgrade, start: number, limit: number, field: string): number {
  requireFact(object(value) && text(value.eventId) && value.tier === "paid", "INVALID_UPGRADE", field);
  const at = time(value.at, `${field}.at`);
  requireFact(at >= start && at <= limit, "EVENT_ORDER", field); return at;
}
function upgradeSignature(value: Upgrade): string {
  return JSON.stringify([value.eventId, iso(time(value.at, "event.at")), value.tier, value.reportPeriod?.monthKey ?? null, value.reportPeriod?.timezone ?? null, value.reportPeriod?.timezoneVersion ?? null]);
}
function copyGrant(grant: Grant): Grant {
  if (grant.kind === "detail") return { ...grant, acquisition: { ...grant.acquisition }, ...(grant.extension ? { extension: { ...grant.extension } } : {}) };
  return { ...grant, acquisition: { ...grant.acquisition }, acquisitionPeriod: { ...grant.acquisitionPeriod }, ...(grant.promotion ? { promotion: { ...grant.promotion, ...(grant.promotion.reportPeriod ? { reportPeriod: { ...grant.promotion.reportPeriod } } : {}) } } : {}) };
}

/** No IO or authority acquisition. Invalid/missing provenance never becomes an inferred grant. */
export function evaluateConsumerRetention(input: RetentionInput): RetentionEvaluation {
  const base: RetentionEvaluation = {
    policyVersion: VERSION, retentionStatus: "unknown", visibilityStatus: "unknown",
    originalRecordedAt: null, retainedUntil: null, monthBinding: null,
    grantTransitionProposal: { kind: "pending", grant: null, persisted: false }, reasons: [], purgeAllowed: false
  };
  try {
    requireFact(object(input), "INVALID_INPUT", "input");
    requireFact(input.policyVersion === VERSION, "POLICY_VERSION", "policyVersion");
    requireFact(text(input.actorId) && text(input.resourceId), "IDENTITY_MISSING", "identity");
    const now = time(input.evaluationInstant, "evaluationInstant");
    // Per-evaluation evidence only; this is not an authority or a persisted registry.
    const zoneByVersion = new Map<string, string>();
    function bindTimezone(value: ReportPeriod, field: string): void {
      // Called only after the existing explicit-zone validation. Intl resolves
      // supported aliases; equal current offsets alone do not imply equal zones.
      const canonical = new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).resolvedOptions().timeZone;
      const previous = zoneByVersion.get(value.timezoneVersion);
      requireFact(previous === undefined || previous === canonical, "TIMEZONE_VERSION_CONFLICT", field);
      zoneByVersion.set(value.timezoneVersion, canonical);
    }
    function fact<T>(value: Fact<T> | undefined, field: string, current = false): T {
      requireFact(object(value) && object(value.binding), "FACT_MISSING", field);
      const b = value.binding;
      requireFact(b.provenance === "resolved" && text(b.sourceIdentity) && text(b.sourceRevision), "PROVENANCE_UNKNOWN", field);
      requireFact(b.actorId === input.actorId && b.resourceId === input.resourceId, "IDENTITY_MISMATCH", field);
      const asOf = time(b.factAsOf, `${field}.factAsOf`);
      requireFact(asOf <= now && (!current || asOf === now), "FACT_TIME", field);
      return value.value;
    }
    const material = fact(input.materialState, "materialState", true);
    const protection = fact(input.protection, "protection", true);
    const core = fact(input.coreEligibility, "coreEligibility", true);
    const rights = fact(input.rightsState, "rightsState", true);
    requireFact(["present", "collapsed", "deleted", "unknown"].includes(material), "INVALID_STATE", "materialState");
    requireFact(["none", "saved_meal", "unknown"].includes(protection), "INVALID_STATE", "protection");
    requireFact(["allow", "deny", "unknown"].includes(core) && ["clear", "deletion_required", "unknown"].includes(rights), "INVALID_STATE", "eligibility");
    const entitlement = fact(input.currentEntitlement, "currentEntitlement", true);
    requireFact(object(entitlement) && ["free", "paid"].includes(entitlement.tier), "ENTITLEMENT_UNKNOWN", "currentEntitlement");
    const from = time(entitlement.validFrom, "entitlement.validFrom");
    const until = entitlement.validUntil === null ? null : time(entitlement.validUntil, "entitlement.validUntil");
    requireFact(from <= now && (until === null || (until >= from && now <= until)), "ENTITLEMENT_VALIDITY", "currentEntitlement");
    requireFact(object(input.action) && ["evaluate", "create", "upgrade"].includes(input.action.kind), "INVALID_ACTION", "action");
    requireFact(["detail", "monthly"].includes(input.resourceKind), "INVALID_RESOURCE_KIND", "resourceKind");
    let t0: number | null = null, binding: MonthBinding | null = null;
    let active: ReportPeriod | null = null;
    if (input.resourceKind === "detail") {
      t0 = time(fact(input.originalRecordedAt, "originalRecordedAt"), "originalRecordedAt");
      requireFact(t0 <= now, "FUTURE_ANCHOR", "originalRecordedAt");
      requireFact(t0 <= time(input.originalRecordedAt!.binding.factAsOf, "originalRecordedAt.factAsOf"), "EVENT_AFTER_FACT", "originalRecordedAt");
    } else {
      binding = fact(input.monthBinding, "monthBinding");
      requireFact(object(binding) && binding.reportId === input.resourceId && text(binding.monthBindingVersion) && text(binding.timezoneVersion) && binding.collision === false && monthOrdinal(binding.monthKey) !== null && reportMonthAt(now, binding.timezone), "MONTH_BINDING", "monthBinding");
      bindTimezone(binding, "monthBinding");
      active = fact(input.activeReportPeriod, "activeReportPeriod", true);
      period(active, now, "activeReportPeriod");
      bindTimezone(active, "activeReportPeriod");
      requireFact(monthOrdinal(binding.monthKey)! <= monthOrdinal(active.monthKey)!, "FUTURE_MONTH", "monthBinding");
    }
    const inWindow = (p: ReportPeriod): boolean => !!binding && !!freeReviewWindow(p.monthKey)?.includes(binding.monthKey);
    function validateGrant(g: Grant): Grant {
      requireFact(object(g) && g.policyVersion === VERSION && g.kind === input.resourceKind, "GRANT_BINDING", "acquiredGrant");
      const acquired = acquisition(g.acquisition, now, "grant.acquisition");
      const grantAsOf = time(input.acquiredGrant!.binding.factAsOf, "grant.factAsOf");
      requireFact(acquired <= grantAsOf, "EVENT_AFTER_FACT", "acquiredGrant");
      if (g.kind === "detail") {
        requireFact(time(g.originalRecordedAt, "grant.anchor") === t0 && acquired === t0, "ANCHOR_MISMATCH", "acquiredGrant");
        let days = g.acquisition.tier === "paid" ? PAID_DETAIL_DAYS : FREE_DETAIL_DAYS;
        if (g.extension !== undefined) {
          const u = upgrade(g.extension, acquired, grantAsOf, "grant.extension");
          requireFact(g.extension.eventId !== g.acquisition.eventId && g.acquisition.tier === "free" && u < t0! + FREE_DETAIL_DAYS * ELAPSED_DAY_MS, "INVALID_EXTENSION", "acquiredGrant");
          days = PAID_DETAIL_DAYS;
        }
        requireFact(time(g.retainedUntil, "grant.retainedUntil") === t0! + days * ELAPSED_DAY_MS, "DEADLINE_MISMATCH", "acquiredGrant");
      } else {
        requireFact(binding && ["reportId", "monthKey", "timezone", "timezoneVersion", "monthBindingVersion"].every(key => g[key as keyof MonthlyGrant] === binding![key as keyof MonthBinding]), "MONTH_GRANT_MISMATCH", "acquiredGrant");
        period(g.acquisitionPeriod, acquired, "grant.acquisitionPeriod");
        bindTimezone(g.acquisitionPeriod, "grant.acquisitionPeriod");
        requireFact(inWindow(g.acquisitionPeriod), "ACQUISITION_WINDOW", "acquiredGrant");
        let permanent = g.acquisition.tier === "paid";
        if (g.promotion !== undefined) {
          const u = upgrade(g.promotion, acquired, grantAsOf, "grant.promotion");
          requireFact(g.acquisition.tier === "free" && g.promotion.eventId !== g.acquisition.eventId && g.promotion.reportPeriod, "INVALID_PROMOTION", "acquiredGrant");
          period(g.promotion.reportPeriod, u, "grant.promotion.reportPeriod");
          bindTimezone(g.promotion.reportPeriod, "grant.promotion.reportPeriod");
          requireFact(inWindow(g.promotion.reportPeriod), "PROMOTION_WINDOW", "acquiredGrant"); permanent = true;
        }
        requireFact(g.permanent === permanent, "PERMANENT_MISMATCH", "acquiredGrant");
      }
      return copyGrant(g);
    }
    let acquired: Grant | null = input.acquiredGrant === undefined ? null : validateGrant(fact(input.acquiredGrant, "acquiredGrant"));
    let proposal: RetentionEvaluation["grantTransitionProposal"] = { kind: "noop", grant: acquired, persisted: false };
    const reasons: Reason[] = [];
    if (input.action.kind === "create") {
      requireFact(acquired === null && input.action.newResource === true && material === "present", "NOT_NEW_RESOURCE", "action.create");
      requireFact(core === "allow" && rights === "clear" && protection === "none", "CREATE_ELIGIBILITY_PENDING", "action.create");
      const a = fact(input.action.acquisition, "action.acquisition");
      const at = acquisition(a, now, "action.acquisition");
      requireFact(at <= time(input.action.acquisition.binding.factAsOf, "acquisition.factAsOf"), "EVENT_AFTER_FACT", "action.acquisition");
      let grant: Grant;
      if (t0 !== null) {
        requireFact(at === t0, "ANCHOR_MISMATCH", "action.acquisition");
        grant = { kind: "detail", policyVersion: VERSION, originalRecordedAt: iso(t0), acquisition: { ...a }, retainedUntil: iso(t0 + (a.tier === "paid" ? PAID_DETAIL_DAYS : FREE_DETAIL_DAYS) * ELAPSED_DAY_MS) };
      } else {
        requireFact(binding && input.action.reportPeriod, "REPORT_PERIOD_MISSING", "action.create");
        period(input.action.reportPeriod, at, "action.reportPeriod");
        bindTimezone(input.action.reportPeriod, "action.reportPeriod");
        requireFact(inWindow(input.action.reportPeriod), "ACQUISITION_WINDOW", "action.create");
        grant = { kind: "monthly", policyVersion: VERSION, reportId: binding.reportId, monthKey: binding.monthKey, timezone: binding.timezone, timezoneVersion: binding.timezoneVersion, monthBindingVersion: binding.monthBindingVersion, acquisition: { ...a }, acquisitionPeriod: { ...input.action.reportPeriod }, permanent: a.tier === "paid" };
      }
      proposal = { kind: "create", grant, persisted: false };
      reasons.push({ code: "GRANT_NOT_PERSISTED", field: "action.create" });
    } else {
      requireFact(acquired !== null, "HISTORICAL_GRANT_MISSING", "acquiredGrant");
      if (input.action.kind === "upgrade") {
        requireFact(Array.isArray(input.action.events) && input.action.events.length > 0, "EVENTS_MISSING", "action.events");
        let planned = copyGrant(acquired), previousAt = time(acquired.acquisition.at, "grant.acquisition.at");
        const seen = new Map<string, string>();
        const remembered = acquired.kind === "detail" ? acquired.extension : acquired.promotion;
        if (remembered) { seen.set(remembered.eventId, upgradeSignature(remembered)); previousAt = time(remembered.at, "previous.at"); }
        for (const event of input.action.events) {
          const u = fact<Upgrade>(event, "action.events");
          const at = upgrade(u, time(acquired.acquisition.at, "grant.acquisition.at"), now, "action.events");
          requireFact(at <= time(event.binding.factAsOf, "event.factAsOf") && u.eventId !== acquired.acquisition.eventId, "EVENT_AFTER_FACT", "action.events");
          if (planned.kind === "monthly") { requireFact(u.reportPeriod, "REPORT_PERIOD_MISSING", "action.events"); period(u.reportPeriod, at, "event.reportPeriod"); bindTimezone(u.reportPeriod, "event.reportPeriod"); }
          const signature = upgradeSignature(u);
          if (seen.has(u.eventId)) { requireFact(seen.get(u.eventId) === signature, "EVENT_CONFLICT", "action.events"); continue; }
          requireFact(at >= previousAt, "EVENT_ORDER", "action.events"); previousAt = at; seen.set(u.eventId, signature);
          if (material !== "present" || rights !== "clear" || core !== "allow" || protection !== "none") { reasons.push({ code: "TRANSITION_BLOCKED", field: "action.events" }); continue; }
          if (planned.kind === "detail") {
            if (at < time(planned.retainedUntil, "planned.retainedUntil")) {
              const end = iso(t0! + PAID_DETAIL_DAYS * ELAPSED_DAY_MS);
              if (time(end, "planned.end") > time(planned.retainedUntil, "planned.retainedUntil")) {
                planned = { ...planned, retainedUntil: end, extension: { ...u } };
                proposal = { kind: "extend", grant: planned, persisted: false };
              }
            } else reasons.push({ code: "UPGRADE_AT_OR_AFTER_EXPIRY", field: "action.events" });
          } else if (!planned.permanent && inWindow(u.reportPeriod!)) {
            planned = { ...planned, permanent: true, promotion: { ...u, reportPeriod: { ...u.reportPeriod! } } };
            proposal = { kind: "promote", grant: planned, persisted: false };
          } else if (!planned.permanent) reasons.push({ code: "UPGRADE_OUTSIDE_WINDOW", field: "action.events" });
        }
      }
    }
    const retentionStatus = !acquired ? "unknown" : acquired.kind === "detail" ? (now < time(acquired.retainedUntil, "grant.retainedUntil") ? "within_acquired_term" : "due") : acquired.permanent ? "permanent" : inWindow(active!) ? "within_acquired_term" : "due";
    let visibilityStatus: RetentionEvaluation["visibilityStatus"] = "unknown";
    if (material === "collapsed" || material === "deleted") visibilityStatus = "material_unavailable";
    else if (rights === "deletion_required") visibilityStatus = "rights_restricted";
    else if (core === "deny") visibilityStatus = "core_denied";
    else if (material === "unknown" || rights === "unknown" || core === "unknown" || protection !== "none") reasons.push({ code: "STATE_OR_PROTECTION_PENDING", field: "state" });
    else if (retentionStatus === "due") visibilityStatus = "expired";
    else if (acquired) {
      const visible = t0 !== null ? now < t0 + (entitlement.tier === "paid" ? PAID_DETAIL_DAYS : FREE_DETAIL_DAYS) * ELAPSED_DAY_MS : entitlement.tier === "paid" || inWindow(active!);
      visibilityStatus = visible ? "visible" : "hidden_by_current_tier";
    }
    return { ...base, retentionStatus, visibilityStatus, originalRecordedAt: t0 === null ? null : iso(t0), retainedUntil: acquired?.kind === "detail" ? iso(time(acquired.retainedUntil, "grant.retainedUntil")) : null, monthBinding: binding ? { ...binding } : null, grantTransitionProposal: proposal, reasons };
  } catch (error) {
    if (!(error instanceof InvalidFact)) throw error;
    return { ...base, reasons: [{ code: error.code, field: error.field }] };
  }
}
