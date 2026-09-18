import { handleCategoryMutation, handlePreviewCategory } from "../../../../../server/restaurant-catalog-authoring-runtime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type RouteContext = Readonly<{ params: Readonly<{ categoryId: string }> }>;
export async function GET(request: Request, context: RouteContext) { return handlePreviewCategory(request, context.params.categoryId); }
export async function POST(request: Request, context: RouteContext) { return handleCategoryMutation(request, context.params.categoryId); }
