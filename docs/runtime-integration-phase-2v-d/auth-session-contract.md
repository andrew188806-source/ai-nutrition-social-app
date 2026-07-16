# Phase 2V-D Auth and Session Contract

## Identity

Email/password sign-in runs only in a Server Action through `signInWithPassword`. Middleware and the protected Restaurant layout call `getClaims()`; `getSession().user` is not an authorization input. Credentials, sessions and tokens are never logged or passed to Client Components.

## Cookies

Supabase SSR owns session cookies through Next 14 `getAll`/`setAll`. The selected restaurant cookie is server-written, HTTP-only, SameSite Lax, production Secure, path-scoped and revalidated by the restaurants RPC on every request. Sign-out clears both the Supabase session and selected restaurant cookie.

## Authority

Authentication proves identity only. Active membership and tenant scope come from Phase 2V-C RPCs. Middleware never decides restaurant membership. Zero active memberships show a generic denial; lifecycle and cross-tenant existence are not disclosed.

One authorized restaurant is selected deterministically. Multiple restaurants require an explicit selection unless the cookie matches the current RPC result. A stale cookie is cleared through the selection reset endpoint before the chooser is shown.
