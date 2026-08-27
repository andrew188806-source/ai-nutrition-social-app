import { parseGeoPoint } from "../geo-api/index.ts";
import { NEXT_MEAL_GEO_OFFER_LIMIT_DEFAULT, NEXT_MEAL_GEO_OFFER_LIMIT_MAX } from "./policy.ts";
import type { NextMealGeoParsedRequest } from "./types.ts";

const ALLOWED_KEYS = new Set(["latitude", "longitude", "candidatePoolLimit"]);

export async function parseNextMealGeoRequest(request: Request): Promise<
  { ok: true; value: NextMealGeoParsedRequest } | { ok: false }
> {
  let body: unknown;
  try { body = await request.json(); } catch { return { ok: false }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) return { ok: false };
  const point = parseGeoPoint(record.latitude, record.longitude);
  if (!point.ok) return { ok: false };
  const requestedLimit = record.candidatePoolLimit ?? NEXT_MEAL_GEO_OFFER_LIMIT_DEFAULT;
  if (typeof requestedLimit !== "number" || !Number.isInteger(requestedLimit)
    || requestedLimit <= 0 || requestedLimit > NEXT_MEAL_GEO_OFFER_LIMIT_MAX) return { ok: false };
  return {
    ok: true,
    value: Object.freeze({ origin: point.value, candidatePoolLimit: requestedLimit })
  };
}
