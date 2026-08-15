import {
  createDefaultSocialCandidateTasteDependencies,
  processSocialCandidateTasteRequest
} from "./handler.ts";
import { buildSocialCandidateTasteError } from "./errors.ts";

const dependencies = createDefaultSocialCandidateTasteDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processSocialCandidateTasteRequest(request, dependencies);
  } catch {
    return buildSocialCandidateTasteError("server_unavailable");
  }
});
