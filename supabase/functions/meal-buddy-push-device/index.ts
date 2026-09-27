import {
  createDefaultMealBuddyPushDeviceDependencies,
  processMealBuddyPushDeviceRequest
} from "./handler.ts";
import { buildMealBuddyPushDeviceError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultMealBuddyPushDeviceDependencies();
Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try { return await processMealBuddyPushDeviceRequest(request, dependencies); }
  catch { return buildMealBuddyPushDeviceError("server_unavailable"); }
}));
