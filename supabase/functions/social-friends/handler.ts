import { authenticateCaller } from "../_shared/auth/authenticateCaller.ts";
import { createSocialCandidateRefCipher } from "../_shared/social-candidate-ref/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import { loadMealBuddyRelationshipConfig } from "../meal-buddy-relationship/config.ts";
import type { MealBuddyRelationshipDependencies } from "../meal-buddy-relationship/handler.ts";
import { SocialFriendsService, type FriendRequest } from "./service.ts";
const error = (code: string, status: number) => new Response(JSON.stringify({ error: { code } }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const defaultDependencies: MealBuddyRelationshipDependencies = {
    loadConfig: loadMealBuddyRelationshipConfig, authenticateCaller, createTransport: createDenoSocialRuntimeExecutorTransport
};
export async function parseFriendRequest(request: Request): Promise<FriendRequest | null> {
    if (request.method !== "POST" || new URL(request.url).search)
        return null;
    const reader = request.body?.getReader();
    if (!reader)
        return null;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            bytes += part.value.length;
            if (bytes > 2048) {
                await reader.cancel();
                return null;
            }
            chunks.push(part.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    let raw: unknown;
    try {
        const value = new Uint8Array(bytes);
        let at = 0;
        for (const c of chunks) {
            value.set(c, at);
            at += c.length;
        }
        raw = JSON.parse(new TextDecoder().decode(value));
    }
    catch {
        return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const r = raw as Record<string, unknown>, keys = Object.keys(r).sort().join(",");
    if (keys === "operation" && (r.operation === "settings" || r.operation === "rotate_code"))
        return r as FriendRequest;
    if (keys === "operation,searchable" && r.operation === "set_searchable" && typeof r.searchable === "boolean")
        return r as FriendRequest;
    if (keys === "kind,operation,value" && r.operation === "lookup" && (r.kind === "code" || r.kind === "phone") && typeof r.value === "string" && r.value.length <= 80)
        return r as FriendRequest;
    return null;
}
export async function processSocialFriendsRequest(request: Request, dependencies: MealBuddyRelationshipDependencies = defaultDependencies): Promise<Response> {
    let parsed: FriendRequest | null;
    try {
        parsed = await parseFriendRequest(request);
    }
    catch {
        return error("invalid_request", 400);
    }
    if (!parsed)
        return error("invalid_request", 400);
    const config = dependencies.loadConfig();
    if (!config.ok)
        return error("server_unavailable", 503);
    let auth;
    try {
        auth = await dependencies.authenticateCaller(request, config.value.supabaseUrl, config.value.supabaseAnonKey);
    }
    catch {
        return error("server_unavailable", 503);
    }
    if (!auth.ok)
        return error("authentication_required", 401);
    const transport = dependencies.createTransport();
    try {
        const service = new SocialFriendsService(transport, createSocialCandidateRefCipher(config.value.candidateRefKey));
        const result = await service.execute(auth.value.userId, parsed, dependencies.now?.() ?? new Date());
        return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    catch (e) {
        const code = e && typeof e === "object" && "code" in e ? e.code : null;
        return error(code === "42501" ? "social_access_required" : "server_unavailable", code === "42501" ? 403 : 503);
    }
    finally {
        await transport.close();
    }
}
