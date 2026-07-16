import { redirect } from "next/navigation";
import { getRestaurantDataSourceConfig } from "../../config/restaurant-data-source";
import { getVerifiedRestaurantClaims } from "../../auth/supabase-server";
import { LoginForm } from "./LoginForm";
import { ConfigurationUnavailable } from "../../components/runtime/RuntimeStates";

export default async function RestaurantLoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource === "disabled") return <ConfigurationUnavailable />;
  if (config.dataSource === "mock") redirect("/restaurant");
  if (config.dataSource === "supabase" && (await getVerifiedRestaurantClaims())) redirect("/restaurant");
  return <LoginForm error={searchParams?.error} />;
}
