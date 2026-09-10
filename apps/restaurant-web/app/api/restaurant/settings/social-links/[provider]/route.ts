import {mutatePublicSocial,previewPublicSocial} from "../../../../../../server/restaurant-owner-public-social-links-runtime";
export const dynamic="force-dynamic";export const revalidate=0;
type Context={params:{provider:string}};
export async function GET(request:Request,context:Context){return previewPublicSocial(request,context.params.provider)}
export async function POST(request:Request,context:Context){return mutatePublicSocial(request,context.params.provider)}
