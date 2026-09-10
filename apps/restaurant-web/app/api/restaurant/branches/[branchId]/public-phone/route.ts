import {
  mutateBranchPublicPhone,
  previewBranchPublicPhone
} from "../../../../../../server/restaurant-owner-branch-public-phone-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: { branchId: string } };

export async function GET(request: Request, context: Context) {
  return previewBranchPublicPhone(request, context.params.branchId);
}

export async function POST(request: Request, context: Context) {
  return mutateBranchPublicPhone(request, context.params.branchId);
}
