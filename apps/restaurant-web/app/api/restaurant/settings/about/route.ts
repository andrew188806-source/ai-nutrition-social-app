import { mutateRestaurantAbout, previewRestaurantAbout } from "../../../../../server/restaurant-owner-about-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) { return previewRestaurantAbout(request); }
export async function POST(request: Request) { return mutateRestaurantAbout(request); }
