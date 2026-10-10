import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
export function isConsumerDemoHost(input: { environment?: string; url?: string; hostname?: string }) {
  return input.environment === "development" &&
    input.url === "https://msbgnnoorsoefuiwluye.supabase.co" &&
    ["haocu-demo.vercel.app", "localhost", "127.0.0.1"].includes(input.hostname ?? "");
}
export function isConsumerDemoClientAllowed() {
  const location = (globalThis as unknown as { location?: { hostname?: string } }).location;
  return isConsumerDemoHost({ environment: process.env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT,
    url: getSupabaseConsumerEnvironment().url, hostname: location?.hostname });
}
