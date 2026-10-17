import { defineSocialRuntimeExecutorStatement, type SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import type { SocialCandidateRefCipher } from "../_shared/social-candidate-ref/types.ts";
const BIND_ACTOR = defineSocialRuntimeExecutorStatement<{
    actor_context: string;
}> `select pg_catalog.set_config('request.jwt.claim.sub', $1::text, true) as actor_context`;
const LOOKUP = defineSocialRuntimeExecutorStatement<{
    status: string;
    candidate_user_id: string | null;
    display_name: string | null;
    mascot_avatar_key: string | null;
}> `
 select status,candidate_user_id::text,display_name,mascot_avatar_key from friend_internal.lookup($1::uuid,$2::text,$3::text)
`;
const SETTINGS = defineSocialRuntimeExecutorStatement<{
    value: unknown;
}> `
 select friend_internal.settings($1::uuid,$2::boolean,$3::boolean) as value
`;
export type FriendRequest = {
    operation: "lookup";
    kind: "phone" | "code";
    value: string;
} | {
    operation: "settings";
} | {
    operation: "set_searchable";
    searchable: boolean;
} | {
    operation: "rotate_code";
};
export class SocialFriendsService {
    constructor(private transport: SocialRuntimeExecutorTransport, private cipher: SocialCandidateRefCipher) { }
    async execute(actor: string, request: FriendRequest, now: Date): Promise<unknown> {
        if (request.operation !== "lookup") {
            const rows = await this.transport.withTransaction(async (tx) => { await tx.query(BIND_ACTOR, [actor]); return tx.query(SETTINGS, [actor, request.operation === "set_searchable" ? request.searchable : null, request.operation === "rotate_code"]); });
            if (rows.length !== 1)
                throw Error("friend_settings_cardinality");
            return { policyVersion: "social-friends-v1", settings: rows[0].value };
        }
        // Commit the SQL rate accounting before sealing a response. A crypto/response failure must
        // not refund a directory probe.
        const rows = await this.transport.withTransaction(async (tx) => { await tx.query(BIND_ACTOR, [actor]); return tx.query(LOOKUP, [actor, request.kind, request.value]); });
        if (rows.length !== 1)
            throw Error("friend_lookup_cardinality");
        const row = rows[0];
        if (row.status === "found" && row.candidate_user_id && row.display_name && row.mascot_avatar_key)
            return { policyVersion: "social-friends-v1", status: "found", candidate: { candidateRef: await this.cipher.seal(actor, row.candidate_user_id, now), displayName: row.display_name, mascotAvatarKey: row.mascot_avatar_key } };
        if (row.status !== "not_found" && row.status !== "rate_limited")
            throw Error("friend_lookup_shape");
        return { policyVersion: "social-friends-v1", status: row.status };
    }
}
