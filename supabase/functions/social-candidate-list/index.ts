import {
  createDefaultSocialCandidateListDependencies,
  processSocialCandidateListRequest
} from "./handler.ts";
import { buildSocialCandidateListError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultSocialCandidateListDependencies();

Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try {
    return await processSocialCandidateListRequest(request, dependencies);
  } catch {
    return buildSocialCandidateListError("server_unavailable");
  }
}));
