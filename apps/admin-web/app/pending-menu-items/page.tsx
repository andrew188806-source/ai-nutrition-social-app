import { redirect } from "next/navigation";

export default function LegacyAdminRedirect() {
  redirect("/admin/restaurants/menu-management/pending");
}
