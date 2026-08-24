import type { ConsumerAuthPort } from "../consumer-auth";
import {
  MEAL_BUDDY_PUSH_FUNCTION_NAME,
  type MealBuddyPushApiRequest,
  type MealBuddyPushApiResponse,
  type SupabaseMealBuddyPushClientLike,
  type SupabaseMealBuddyPushInvokeError
} from "./supabaseContracts";
import {
  MEAL_BUDDY_PUSH_POLICY_VERSION,
  type MealBuddyPushErrorCode,
  type MealBuddyPushOutcome,
  type MealBuddyPushPlatform,
  type MealBuddyPushRepository
} from "./types";

const KNOWN_SERVER_ERRORS = new Set<MealBuddyPushErrorCode>([
  "authentication_required", "invalid_request", "server_unavailable"
]);
const MIN_INSTALL = 8;
const MAX_INSTALL = 200;
const MIN_TOKEN = 8;
const MAX_TOKEN = 400;

export class SupabaseMealBuddyPushRepository implements MealBuddyPushRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseMealBuddyPushClientLike
  ) {}

  register(installId: string, platform: MealBuddyPushPlatform, pushToken: string) {
    if (!validInstall(installId) || !validToken(pushToken)
      || (platform !== "ios" && platform !== "android")) {
      return Promise.resolve(failure("invalid_request"));
    }
    return this.invoke({ operation: "register", installId, platform, pushToken });
  }

  disable(installId: string) {
    if (!validInstall(installId)) return Promise.resolve(failure("invalid_request"));
    return this.invoke({ operation: "disable", installId });
  }

  private async invoke(request: MealBuddyPushApiRequest): Promise<MealBuddyPushOutcome> {
    // The owner is never named in the body: it is the verified session subject, server-side.
    const session = await this.authPort.getCurrentSession();
    if (!session.ok || !session.value) return failure("authentication_required");

    let response;
    try {
      response = await this.client.functions.invoke<MealBuddyPushApiResponse>(
        MEAL_BUDDY_PUSH_FUNCTION_NAME, { body: request }
      );
    } catch {
      return failure("network_error");
    }
    if (response.error) return failure(await mapInvokeError(response.error));
    const value = response.data;
    if (!isRecord(value) || Object.keys(value).sort().join(",") !== "policyVersion,registered") {
      return failure("invalid_server_response");
    }
    if (value.policyVersion !== MEAL_BUDDY_PUSH_POLICY_VERSION || typeof value.registered !== "boolean") {
      return failure("invalid_server_response");
    }
    return Object.freeze({ ok: true as const, registered: value.registered });
  }
}

export class DisabledMealBuddyPushRepository implements MealBuddyPushRepository {
  readonly source = "disabled" as const;
  register(_installId: string, _platform: MealBuddyPushPlatform, _pushToken: string) {
    return Promise.resolve(failure("operation_not_enabled"));
  }
  disable(_installId: string) { return Promise.resolve(failure("operation_not_enabled")); }
}

function validInstall(value: unknown): value is string {
  return typeof value === "string" && value.length >= MIN_INSTALL && value.length <= MAX_INSTALL
    && /^[A-Za-z0-9._:-]+$/.test(value);
}
function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= MIN_TOKEN && value.length <= MAX_TOKEN
    && !/[\s]/.test(value);
}
async function mapInvokeError(error: SupabaseMealBuddyPushInvokeError): Promise<MealBuddyPushErrorCode> {
  try {
    const body = await error.context?.json();
    const errorBody = isRecord(body) && isRecord(body.error) ? body.error : null;
    if (errorBody && typeof errorBody.code === "string"
      && KNOWN_SERVER_ERRORS.has(errorBody.code as MealBuddyPushErrorCode)) {
      return errorBody.code as MealBuddyPushErrorCode;
    }
  } catch {
    // Raw transport detail is deliberately collapsed below; no provider internal reaches the user.
  }
  return "server_unavailable";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failure(errorCode: MealBuddyPushErrorCode): MealBuddyPushOutcome {
  return Object.freeze({ ok: false as const, errorCode });
}
