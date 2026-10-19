import type { ConsumerAuthPort } from "../consumer-auth";
export type FriendRequest = {
    operation: "settings";
} | {
    operation: "rotate_code";
} | {
    operation: "set_searchable";
    searchable: boolean;
} | {
    operation: "lookup";
    kind: "phone" | "code";
    value: string;
};
export type FriendSettings = Readonly<{
    searchable: boolean;
    inviteCode: string;
}>;
export type FriendCandidate = Readonly<{
    candidateRef: string;
    displayName: string;
    mascotAvatarKey: string;
}>;
export type FriendResult = {
    settings: FriendSettings;
} | {
    status: "not_found" | "rate_limited";
} | {
    status: "found";
    candidate: FriendCandidate;
};
export type FriendClient = {
    auth: {
        getSession(): Promise<{
            data: {
                session: {
                    access_token: string;
                    user: {
                        id: string;
                    };
                } | null;
            };
            error: unknown;
        }>;
    };
    functions: {
        invoke(name: string, options: {
            body: FriendRequest;
            headers: Record<string, string>;
            timeout: number;
        }): Promise<{
            data: unknown;
            error: unknown;
        }>;
    };
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, s: string) => Object.keys(v).sort().join(",") === s;
export function parseFriendResult(v: unknown): FriendResult | null {
    if (!object(v) || v.policyVersion !== "social-friends-v1")
        return null;
    if (keys(v, "policyVersion,settings") && object(v.settings) && keys(v.settings, "inviteCode,searchable") && typeof v.settings.searchable === "boolean" && typeof v.settings.inviteCode === "string" && /^[a-f0-9]{32}$/.test(v.settings.inviteCode))
        return { settings: { searchable: v.settings.searchable, inviteCode: v.settings.inviteCode } };
    if (keys(v, "policyVersion,status") && (v.status === "not_found" || v.status === "rate_limited"))
        return { status: v.status };
    if (keys(v, "candidate,policyVersion,status") && v.status === "found" && object(v.candidate) && keys(v.candidate, "candidateRef,displayName,mascotAvatarKey")) {
        const c = v.candidate;
        if (typeof c.candidateRef === "string" && c.candidateRef.startsWith("scr1.") && c.candidateRef.length > 5 && c.candidateRef.length <= 512 && typeof c.displayName === "string" && c.displayName.length > 0 && typeof c.mascotAvatarKey === "string" && c.mascotAvatarKey.length > 0)
            return { status: "found", candidate: { candidateRef: c.candidateRef, displayName: c.displayName, mascotAvatarKey: c.mascotAvatarKey } };
    }
    return null;
}
export class SocialFriendsRepository {
    constructor(private auth: ConsumerAuthPort, private client: FriendClient) { }
    async execute(actorKey: string, request: FriendRequest): Promise<FriendResult> {
        const session = await this.auth.getCurrentSession();
        if (!session.ok || !session.value || session.value.user.userId !== actorKey)
            throw Error("authentication_required");
        const sdk = await this.client.auth.getSession();
        const captured = sdk.data.session;
        if (sdk.error || !captured || captured.user.id !== actorKey)
            throw Error("authentication_required");
        const token = captured.access_token;
        // Pin the captured actor JWT: a concurrent SDK account switch must not mutate the new actor.
        const response = await this.client.functions.invoke("social-friends", { body: request, headers: { Authorization: "Bearer " + token }, timeout: 15000 });
        if (response.error)
            throw Error("friend_request_failed");
        const result = parseFriendResult(response.data);
        if (!result)
            throw Error("invalid_server_response");
        if ((request.operation === "lookup") === ("settings" in result))
            throw Error("invalid_server_response");
        return result;
    }
}
let binding: {
    auth: ConsumerAuthPort;
    client: FriendClient;
} | null = null;
export const bindSocialFriendsRuntime = (auth: ConsumerAuthPort, client: FriendClient) => { binding = { auth, client }; };
export const clearSocialFriendsRuntime = () => { binding = null; };
export const getSocialFriendsRepository = () => binding ? new SocialFriendsRepository(binding.auth, binding.client) : null;
