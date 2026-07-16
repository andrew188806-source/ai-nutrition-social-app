import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRestaurantDataSourceConfig } from "../../config/restaurant-data-source";
import { loadRestaurantAccessContext } from "../../runtime/restaurant-access-context";
import { ConfigurationUnavailable, DemoDataMarker, NoActiveAccess, RestaurantChooser, RpcUnavailable } from "../../components/runtime/RuntimeStates";
import { getVerifiedRestaurantClaims } from "../../auth/supabase-server";

export default async function ProtectedRestaurantLayout({ children }: { children: ReactNode }) {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource === "disabled") return <ConfigurationUnavailable />;
  if (config.dataSource === "mock") return <><DemoDataMarker />{children}</>;

  let identity;
  try {
    identity = await getVerifiedRestaurantClaims();
  } catch {
    return <RpcUnavailable />;
  }
  if (!identity) redirect("/login?reason=session");
  let access;
  try {
    access = await loadRestaurantAccessContext();
  } catch {
    return <RpcUnavailable />;
  }
  if (access.state === "missing-identity") redirect("/login?reason=session");
  if (access.state === "invalid-selection") redirect("/restaurant/selection/reset");
  if (access.state === "no-active-access") return <NoActiveAccess />;
  if (access.state === "selection-required") return <RestaurantChooser restaurants={access.restaurants} />;
  return children;
}
