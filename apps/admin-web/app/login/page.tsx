import { AdminShell } from "../../components/AdminShell";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function AdminLoginPage() {
  return <AdminShell title={zhTW.admin.loginTitle} subtitle={zhTW.admin.loginSubtitle} />;
}
