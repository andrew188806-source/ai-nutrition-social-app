import { handleLinkItemToBranch } from "../../../../server/restaurant-catalog-authoring-runtime";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request) { return handleLinkItemToBranch(request); }
