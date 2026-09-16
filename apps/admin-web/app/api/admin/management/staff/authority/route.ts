import { handleAdminManagementStaffAuthority } from "../../../../../../server/adminManagementReadRuntime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request): Promise<Response> { return handleAdminManagementStaffAuthority(request); }
