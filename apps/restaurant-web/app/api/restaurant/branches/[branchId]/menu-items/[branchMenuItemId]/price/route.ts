import { handleRestaurantOwnerPriceMutationRequest, handleRestaurantOwnerPricePreviewRequest } from "../../../../../../../../server/restaurant-owner-price-runtime";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext=Readonly<{params:Readonly<{branchId:string;branchMenuItemId:string}>}>;
export async function GET(request:Request,context:RouteContext){return handleRestaurantOwnerPricePreviewRequest(request,context.params.branchId,context.params.branchMenuItemId);}
export async function POST(request:Request,context:RouteContext){return handleRestaurantOwnerPriceMutationRequest(request,context.params.branchId,context.params.branchMenuItemId);}
