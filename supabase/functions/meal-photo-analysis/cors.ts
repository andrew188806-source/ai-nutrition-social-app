// Browser-origin allowlist for the meal-photo-analysis Edge Function.
//
// The list of permitted browser origins is CONFIGURATION (a Function secret/config value, never a
// secret itself and never a repository-tracked hostname). Contract:
//   MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS = "<origin>[,<origin>...]"   (commas and/or whitespace)
// - An origin is exactly `scheme://host[:port]`: https, or http for a loopback host only. No path,
//   query, fragment, userinfo or wildcard. A single trailing slash is tolerated and stripped.
// - Comparison is exact against the browser's `Origin` header (case-insensitive on the configured value).
// - Missing, empty or wholly-invalid configuration authorizes NO browser origin (fail closed).
//   Non-browser callers (no Origin header) are unaffected: the gateway JWT check and the handler's own
//   authentication remain the access control; CORS only tells a browser whether it may read a response.
// - Invalid entries are ignored, never widened: "*", "null", bare hosts and URLs with paths cannot
//   authorize anything.
export const MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV = "MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS" as const;

const HTTPS_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;
const LOOPBACK_HTTP_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

export function parseAllowedOrigins(raw: string | null | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  if (!raw) return origins;
  for (const entry of raw.split(/[\s,]+/)) {
    const value = entry.trim().replace(/\/$/, "").toLowerCase();
    if (value && (HTTPS_ORIGIN.test(value) || LOOPBACK_HTTP_ORIGIN.test(value))) origins.add(value);
  }
  return origins;
}

export function isAllowedOrigin(origin: string | null, allowed: ReadonlySet<string>): boolean {
  return origin !== null && allowed.has(origin);
}
