import { handleItemMutation, handlePreviewItem } from "../../../../../server/restaurant-catalog-authoring-runtime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type RouteContext = Readonly<{ params: Readonly<{ itemId: string }> }>;
export async function GET(request: Request, context: RouteContext) { return handlePreviewItem(request, context.params.itemId); }
export async function POST(request: Request, context: RouteContext) { return handleItemMutation(request, context.params.itemId); }
