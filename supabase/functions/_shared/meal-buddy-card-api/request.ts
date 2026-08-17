// Any header capable of naming an actor, an owner, a card, a tier, a cap or a clock. The caller
// carries no business authority whatsoever: identity comes only from the verified token, quota only
// from the frozen entitlement resolver, and lifetime only from the card's own dining occasion.
const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id",
  "x-user-id",
  "x-owner-user-id",
  "x-viewer-user-id",
  "x-requesting-user-id",
  "x-card-id",
  "x-source-card-id",
  "x-source-card-ref",
  "x-candidate-card-ref",
  "x-candidate-user-id",
  "x-quota",
  "x-limit",
  "x-cap",
  "x-general-cap",
  "x-restaurant-cap",
  "x-entitlement",
  "x-entitlement-class",
  "x-premium",
  "x-tier",
  "x-plan-code",
  "x-expires-at",
  "x-now",
  "x-clock",
  "x-page",
  "x-page-size",
  "x-cursor",
  "x-offset"
] as const);

export function carriesAuthorityInput(request: Request): boolean {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 0) return true;
  return AUTHORITY_HEADERS.some((name) => request.headers.has(name));
}

export type ParsedBody = { ok: true; value: unknown } | { ok: false };

export async function readJsonBody(request: Request): Promise<ParsedBody> {
  const raw = await request.text();
  if (raw.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

// The list contract is an empty body, exactly as the frozen SR-2D ingress defines it.
export function isEmptyObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).length === 0;
}
