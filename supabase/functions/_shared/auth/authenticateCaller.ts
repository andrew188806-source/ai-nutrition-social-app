import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Canonical server-only authenticated actor boundary. The user-scoped client carries the original
// Authorization header so downstream Storage RLS behavior remains exactly as it was for
// meal-photo-analysis. Actor identity comes only from the verified getUser() result.
export type AuthenticatedActor = {
  userId: string;
  userScopedClient: SupabaseClient;
};

export type AuthOutcome =
  | { ok: true; value: AuthenticatedActor }
  | { ok: false; errorCode: "authentication_required" };

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
