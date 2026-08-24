import {
  createDefaultMealBuddyPushDeviceDependencies,
  processMealBuddyPushDeviceRequest
} from "./handler.ts";
import { buildMealBuddyPushDeviceError } from "./errors.ts";

const dependencies = createDefaultMealBuddyPushDeviceDependencies();
Deno.serve(async (request: Request) => {
  try { return await processMealBuddyPushDeviceRequest(request, dependencies); }
  catch { return buildMealBuddyPushDeviceError("server_unavailable"); }
});
