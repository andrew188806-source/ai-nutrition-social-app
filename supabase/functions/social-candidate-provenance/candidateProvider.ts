import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../_shared/social-runtime-transport/executorTransactionTransport.ts";

type CandidateRow = Readonly<{ candidate_user_id: string }>;

const CANONICAL_CANDIDATE_POOL = defineSocialRuntimeExecutorStatement<CandidateRow>`
  select candidate_user_id
  from social_internal.canonical_candidate_pool($1::uuid) as candidate_user_id
`;

export const SOCIAL_CANDIDATE_POOL_HARD_MAXIMUM = 256 as const;

export type CanonicalSocialCandidateProvider = Readonly<{
  getCanonicalSocialCandidates(actorUserId: string): Promise<readonly string[]>;
  close(): Promise<void>;
}>;

export function createCanonicalSocialCandidateProvider(
  transport: SocialRuntimeExecutorTransport = createDenoSocialRuntimeExecutorTransport()
): CanonicalSocialCandidateProvider {
  return Object.freeze({
    async getCanonicalSocialCandidates(actorUserId: string): Promise<readonly string[]> {
      if (!actorUserId) throw new Error("authenticated_actor_required");
      const rows = await transport.withTransaction((transaction) =>
        transaction.query(CANONICAL_CANDIDATE_POOL, [actorUserId])
      );
      if (rows.length > SOCIAL_CANDIDATE_POOL_HARD_MAXIMUM) {
        throw new Error("candidate_pool_contract_violated");
      }
      return Object.freeze(rows.map((row) => row.candidate_user_id));
    },
    async close(): Promise<void> {
      await transport.close();
    }
  });
}
