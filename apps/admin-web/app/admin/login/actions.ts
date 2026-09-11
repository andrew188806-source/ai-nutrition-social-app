"use server";

import { redirect } from "next/navigation";
import { getAdminAuthConfig } from "../../../config/admin-auth";
import { resolveVerifiedAdminContext } from "../../../auth/admin-context";
import { decideAdminSessionGate } from "../../../auth/admin-session-gate";
import { createAdminSupabaseServerClient } from "../../../auth/supabase-server";

async function clearAdminSession(client: ReturnType<typeof createAdminSupabaseServerClient>): Promise<void> {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The next protected request still performs a fresh server-side gate.
  }
}

export async function signInAdmin(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string"
    || typeof password !== "string"
    || email.length < 1
    || email.length > 320
    || password.length < 1
    || password.length > 4096
  ) redirect("/admin/login?error=credentials");

  const config = getAdminAuthConfig();
  if (config.state !== "ready") redirect("/admin/login?error=configuration");

  const client = createAdminSupabaseServerClient(config);
  let signInFailed = false;
  try {
    const result = await client.auth.signInWithPassword({ email, password });
    signInFailed = Boolean(result.error);
  } catch {
    await clearAdminSession(client);
    redirect("/admin/login?error=unavailable");
  }
  if (signInFailed) {
    await clearAdminSession(client);
    redirect("/admin/login?error=credentials");
  }

  const context = await resolveVerifiedAdminContext(client);
  const decision = decideAdminSessionGate(context);
  if (decision.state === "allow") redirect("/admin");

  await clearAdminSession(client);
  if (decision.state === "authority_unavailable" || decision.state === "redirect_login") {
    redirect("/admin/login?error=unavailable");
  }
  redirect("/admin/login?error=not_admin");
}

export async function signOutAdmin() {
  const config = getAdminAuthConfig();
  if (config.state === "ready") {
    await clearAdminSession(createAdminSupabaseServerClient(config));
  }
  redirect("/admin/login");
}
