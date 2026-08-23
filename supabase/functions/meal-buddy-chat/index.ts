import { createDefaultMealBuddyChatDependencies, processMealBuddyChatRequest } from "./handler.ts";
import { buildMealBuddyChatError } from "./errors.ts";
const dependencies = createDefaultMealBuddyChatDependencies();
Deno.serve(async (request: Request) => { try { return await processMealBuddyChatRequest(request, dependencies); } catch { return buildMealBuddyChatError("server_unavailable"); } });
