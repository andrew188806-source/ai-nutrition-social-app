import { handleAdminManagerPresetPreview } from "../../../../../../server/adminManagerPresetReadRuntime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request): Promise<Response> {
  return handleAdminManagerPresetPreview(request);
}
