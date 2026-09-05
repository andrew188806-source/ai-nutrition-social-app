import { mutateMenuItemDisplayName, previewMenuItemDisplayName } from "../../../../../../../../server/restaurant-owner-menu-item-display-name-runtime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: { branchId: string; branchMenuItemId: string } };
export async function GET(request: Request, context: Context) { return previewMenuItemDisplayName(request, context.params.branchId, context.params.branchMenuItemId); }
export async function POST(request: Request, context: Context) { return mutateMenuItemDisplayName(request, context.params.branchId, context.params.branchMenuItemId); }
