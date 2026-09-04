import {
  handlePlatformAdminBranchStatusMutationRequest,
  handlePlatformAdminBranchStatusPreviewRequest
} from "../../../../../../server/platformAdminBranchStatusRuntime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = Readonly<{ params: Readonly<{ branchId: string }> }>;

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handlePlatformAdminBranchStatusPreviewRequest(request, context.params.branchId);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handlePlatformAdminBranchStatusMutationRequest(request, context.params.branchId);
}
