declare const process: { env: Record<string, string | undefined> };
// Configuration must point to this router's auth-callback route, including a registered native scheme.
export function configuredConsumerAuthRedirect(raw = process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_REDIRECT_URL): string | null {
  try {
    const u = new URL(raw?.trim() ?? "");
    const web = (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) && u.pathname === "/auth-callback";
    const native = u.protocol === "haocu:" && u.hostname === "auth-callback" && ["", "/"].includes(u.pathname);
    return (web || native) && !u.username && !u.password && !u.search && !u.hash ? u.toString() : null;
  } catch { return null; }
}
export function confirmationCodeFromUrl(url: string, redirect: string | null): string | null {
  if (!redirect) return null;
  try {
    const u = new URL(url), expected = new URL(redirect);
    if (u.protocol !== expected.protocol || u.host !== expected.host || u.pathname !== expected.pathname || u.hash || u.username || u.password || u.searchParams.has("error")) return null;
    const code = u.searchParams.get("code");
    return code && u.searchParams.getAll("code").length === 1 && code.length <= 2048 ? code : null;
  } catch { return null; }
}
