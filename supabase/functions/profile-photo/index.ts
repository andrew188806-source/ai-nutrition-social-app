import {processPhotoRequest} from './handler.ts';
import {withConsumerBrowserCors} from '../_shared/consumer-browser-cors/index.ts';
Deno.serve(withConsumerBrowserCors(async request=>{try{return await processPhotoRequest(request);}catch{return new Response(JSON.stringify({error:{code:'service_unavailable'}}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}}));
