import { handlePlatformAdminAuditRequest } from "../../../../server/platformAdminAuditRuntime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  return handlePlatformAdminAuditRequest(request);
}
