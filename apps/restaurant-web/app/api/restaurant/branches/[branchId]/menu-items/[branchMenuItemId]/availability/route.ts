import {
  handleRestaurantOwnerAvailabilityMutationRequest,
  handleRestaurantOwnerAvailabilityPreviewRequest
} from "../../../../../../../../server/restaurant-owner-availability-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = Readonly<{
  params: Readonly<{ branchId: string; branchMenuItemId: string }>;
}>;

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleRestaurantOwnerAvailabilityPreviewRequest(
    request, context.params.branchId, context.params.branchMenuItemId
  );
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleRestaurantOwnerAvailabilityMutationRequest(
    request, context.params.branchId, context.params.branchMenuItemId
  );
}
