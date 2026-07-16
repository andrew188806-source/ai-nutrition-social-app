"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { selectedRestaurantCookieOptions, SELECTED_RESTAURANT_COOKIE } from "../../auth/selection-cookie";
import { getRestaurantDataSourceConfig } from "../../config/restaurant-data-source";
import { getVerifiedRestaurantClaims } from "../../auth/supabase-server";
import { createRestaurantOwnerRpcRepository } from "../../repositories/supabase/restaurant-owner-rpc-repository";

export async function selectRestaurant(formData: FormData) {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource !== "supabase" || !(await getVerifiedRestaurantClaims())) redirect("/login?reason=session");
  const requested = formData.get("restaurantId");
  if (typeof requested !== "string" || !requested) redirect("/restaurant");
  const authorized = await createRestaurantOwnerRpcRepository().listRestaurants();
  if (!authorized.some((restaurant) => restaurant.id === requested)) redirect("/restaurant");
  cookies().set(SELECTED_RESTAURANT_COOKIE, requested, selectedRestaurantCookieOptions(config.isProduction));
  redirect("/restaurant");
}
