import { DashboardShell } from "../../components/DashboardShell";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function RestaurantLoginPage() {
  return <DashboardShell title={zhTW.restaurant.loginTitle} subtitle={zhTW.restaurant.loginSubtitle} />;
}
