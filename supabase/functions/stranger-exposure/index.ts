import {processStrangerExposureRequest} from './handler.ts';
import {withConsumerBrowserCors} from '../_shared/consumer-browser-cors/index.ts';
Deno.serve(withConsumerBrowserCors(async request=>{try{return await processStrangerExposureRequest(request);}catch{return new Response(JSON.stringify({error:'service_unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});}}));
