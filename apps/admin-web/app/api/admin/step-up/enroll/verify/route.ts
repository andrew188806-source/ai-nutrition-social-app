import { handleAdminStepUpEnrollVerify } from "../../../../../../server/adminStepUpRuntime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request): Promise<Response> { return handleAdminStepUpEnrollVerify(request); }
