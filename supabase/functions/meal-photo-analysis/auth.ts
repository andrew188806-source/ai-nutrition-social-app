import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// MI-E-C4: two-client boundary (§6.2). This file only ever builds the USER-scoped client — the
// one that carries the caller's own JWT, so Storage RLS keeps enforcing ownership exactly as it
// does for every other Mobile-authenticated request. The admin/service-role client lives only in
// persistence.ts, and is never used to read Storage on the caller's behalf.
export type AuthenticatedActor = {
  userId: string;
  userScopedClient: SupabaseClient;
};

export type AuthOutcome =
  | { ok: true; value: AuthenticatedActor }
  | { ok: false; errorCode: "authentication_required" };

// Verifies the caller via a real Supabase Auth round-trip (getUser), not by decoding the JWT
// payload locally and trusting it unverified. gateway JWT verification (config.toml verify_jwt)
// already rejects a structurally invalid/expired JWT before this function even runs; this getUser
// call is what actually resolves *which* authenticated user made the call, verified against
// Supabase Auth's own signature/session check — the same trust boundary every other
// Supabase-Auth-backed endpoint in this repo relies on.
export async function authenticateCaller(
  request: Request,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<AuthOutcome> {
  const authorizationHeader = request.headers.get("Authorization");
  if (!authorizationHeader) return { ok: false, errorCode: "authentication_required" };

  const userScopedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorizationHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await userScopedClient.auth.getUser();
  if (error || !data.user) return { ok: false, errorCode: "authentication_required" };

  return { ok: true, value: { userId: data.user.id, userScopedClient } };
}
