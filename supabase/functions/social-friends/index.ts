import { processSocialFriendsRequest } from "./handler.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";
Deno.serve(withConsumerBrowserCors((request: Request) => processSocialFriendsRequest(request)));
