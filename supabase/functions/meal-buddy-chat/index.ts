import { createDefaultMealBuddyChatDependencies, processMealBuddyChatRequest } from "./handler.ts";
import { buildMealBuddyChatError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";
const dependencies = createDefaultMealBuddyChatDependencies();
Deno.serve(withConsumerBrowserCors(async (request: Request) => { try { return await processMealBuddyChatRequest(request, dependencies); } catch { return buildMealBuddyChatError("server_unavailable"); } }));
