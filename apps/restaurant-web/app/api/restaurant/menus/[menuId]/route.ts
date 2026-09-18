import { handleMenuMutation, handlePreviewMenu } from "../../../../../server/restaurant-catalog-authoring-runtime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type RouteContext = Readonly<{ params: Readonly<{ menuId: string }> }>;
export async function GET(request: Request, context: RouteContext) { return handlePreviewMenu(request, context.params.menuId); }
export async function POST(request: Request, context: RouteContext) { return handleMenuMutation(request, context.params.menuId); }
