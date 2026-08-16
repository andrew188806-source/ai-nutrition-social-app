import {
  createDefaultSocialCandidateListDependencies,
  processSocialCandidateListRequest
} from "./handler.ts";
import { buildSocialCandidateListError } from "./errors.ts";

const dependencies = createDefaultSocialCandidateListDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processSocialCandidateListRequest(request, dependencies);
  } catch {
    return buildSocialCandidateListError("server_unavailable");
  }
});
