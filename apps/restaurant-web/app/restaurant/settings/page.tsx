import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section } from "../../../components/RestaurantCards";
import { RestaurantOwnerPublicWebsiteControl } from "../../../components/settings/RestaurantOwnerPublicWebsiteControl";
import { RestaurantOwnerPublicSocialLinksControl } from "../../../components/settings/RestaurantOwnerPublicSocialLinksControl";
import { ConfigurationUnavailable } from "../../../components/runtime/RuntimeStates";
import { getRestaurantDataSourceConfig } from "../../../config/restaurant-data-source";

export default function RestaurantSettingsPage() {
  const config = getRestaurantDataSourceConfig();
  if (config.dataSource === "disabled") return <ConfigurationUnavailable />;
  return <DashboardShell title="系統設定" subtitle="管理餐廳層級公開資料。">
    <Section title="餐廳公開資料">
      <Card><RestaurantOwnerPublicWebsiteControl /></Card>
      <Card><RestaurantOwnerPublicSocialLinksControl /></Card>
    </Section>
  </DashboardShell>;
}
