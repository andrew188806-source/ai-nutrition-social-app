import {
  createDefaultSocialCandidateProvenanceDependencies,
  processSocialCandidateProvenanceRequest
} from "./handler.ts";
import { buildSocialCandidateProvenanceError } from "./errors.ts";

const dependencies = createDefaultSocialCandidateProvenanceDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processSocialCandidateProvenanceRequest(request, dependencies);
  } catch {
    return buildSocialCandidateProvenanceError("server_unavailable");
  }
});
