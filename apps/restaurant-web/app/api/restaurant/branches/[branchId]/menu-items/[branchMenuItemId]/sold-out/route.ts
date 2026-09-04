import {
  handleRestaurantOwnerSoldOutMutationRequest,
  handleRestaurantOwnerSoldOutPreviewRequest
} from "../../../../../../../../server/restaurant-owner-sold-out-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = Readonly<{
  params: Readonly<{ branchId: string; branchMenuItemId: string }>;
}>;

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleRestaurantOwnerSoldOutPreviewRequest(
    request, context.params.branchId, context.params.branchMenuItemId
  );
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleRestaurantOwnerSoldOutMutationRequest(
    request, context.params.branchId, context.params.branchMenuItemId
  );
}
