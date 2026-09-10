import { mutatePublicWebsite, previewPublicWebsite } from "../../../../../server/restaurant-owner-public-website-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) { return previewPublicWebsite(request); }
export async function POST(request: Request) { return mutatePublicWebsite(request); }
