"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import { SELECTED_RESTAURANT_COOKIE } from "../../auth/selection-cookie";
import { getRestaurantDataSourceConfig } from "../../config/restaurant-data-source";

export async function signInRestaurant(formData: FormData) {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource !== "supabase") redirect("/login?error=configuration");
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) redirect("/login?error=credentials");

  let failed = false;
  try {
    const { error } = await createRestaurantSupabaseServerClient().auth.signInWithPassword({ email, password });
    failed = Boolean(error);
  } catch {
    redirect("/login?error=unavailable");
  }
  if (failed) redirect("/login?error=credentials");
  redirect("/restaurant");
}

export async function signOutRestaurant() {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource === "supabase") {
    try {
      await createRestaurantSupabaseServerClient().auth.signOut({ scope: "local" });
    } catch {
      // Continue clearing local selection and leave the protected route.
    }
  }
  cookies().set(SELECTED_RESTAURANT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/restaurant", maxAge: 0 });
  redirect("/login");
}
