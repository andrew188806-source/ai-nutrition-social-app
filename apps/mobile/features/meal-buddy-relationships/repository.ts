import type { ConsumerAuthPort } from "../consumer-auth";
import {
  MEAL_BUDDY_RELATIONSHIP_FUNCTION_NAME,
  type MealBuddyRelationshipApiResponse,
  type MealBuddyRelationshipRequest,
  type SupabaseMealBuddyRelationshipClientLike,
  type SupabaseMealBuddyRelationshipInvokeError
} from "./supabaseContracts";
import {
  MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION,
  type MealBuddyRelationshipErrorCode,
  type MealBuddyRelationshipItem,
  type MealBuddyRelationshipOutcome,
  type MealBuddyRelationshipRepository,
  type MealBuddyRelationshipState
} from "./types";

const STATES = new Set<MealBuddyRelationshipState>([
  "none", "outgoing_pending", "incoming_pending", "accepted"
]);
const KNOWN_SERVER_ERRORS = new Set<MealBuddyRelationshipErrorCode>([
  "authentication_required", "invalid_request", "server_unavailable"
]);

export class SupabaseMealBuddyRelationshipRepository implements MealBuddyRelationshipRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseMealBuddyRelationshipClientLike
  ) {}

  read(candidateRef: string) {
    return this.invoke({ operation: "read", candidateRef }, "read");
  }

  list() {
    return this.invoke({ operation: "list" }, "list");
  }

  send(candidateRef: string) {
    return this.invoke({ operation: "send", candidateRef }, "send");
  }

  accept(relationshipRef: string) {
    return this.invoke({ operation: "accept", relationshipRef }, "accept");
  }

  decline(relationshipRef: string) {
    return this.invoke({ operation: "decline", relationshipRef }, "decline");
  }

  cancel(relationshipRef: string) {
    return this.invoke({ operation: "cancel", relationshipRef }, "cancel");
  }

  private async invoke(
    request: MealBuddyRelationshipRequest,
    operation: MealBuddyRelationshipRequest["operation"]
  ): Promise<MealBuddyRelationshipOutcome> {
    if (!validRequestRef(request)) return failure("invalid_request");
    const session = await this.authPort.getCurrentSession();
    if (!session.ok || !session.value) return failure("authentication_required");

    let response;
    try {
      response = await this.client.functions.invoke<MealBuddyRelationshipApiResponse>(
        MEAL_BUDDY_RELATIONSHIP_FUNCTION_NAME,
        { body: request }
      );
    } catch {
      return failure("network_error");
    }
    if (response.error) return failure(await mapInvokeError(response.error));
    const relationships = validateResponse(response.data, operation);
    return relationships === null
      ? failure("invalid_server_response")
      : Object.freeze({ ok: true as const, value: Object.freeze({ relationships }) });
  }
}

export class DisabledMealBuddyRelationshipRepository implements MealBuddyRelationshipRepository {
  readonly source = "disabled" as const;
  read(_candidateRef: string) { return Promise.resolve(failure("operation_not_enabled")); }
  list() { return Promise.resolve(failure("operation_not_enabled")); }
  send(_candidateRef: string) { return Promise.resolve(failure("operation_not_enabled")); }
  accept(_relationshipRef: string) { return Promise.resolve(failure("operation_not_enabled")); }
  decline(_relationshipRef: string) { return Promise.resolve(failure("operation_not_enabled")); }
  cancel(_relationshipRef: string) { return Promise.resolve(failure("operation_not_enabled")); }
}

function validRequestRef(request: MealBuddyRelationshipRequest): boolean {
  if (request.operation === "list") return true;
  const ref = "candidateRef" in request ? request.candidateRef : request.relationshipRef;
  const prefix = "candidateRef" in request ? "scr1." : "mbr1.";
  return typeof ref === "string" && ref.length > prefix.length && ref.length <= 512 && ref.startsWith(prefix);
}

function validateResponse(
  value: unknown,
  operation: MealBuddyRelationshipRequest["operation"]
): readonly MealBuddyRelationshipItem[] | null {
  if (!isRecord(value) || exactKeys(value, ["policyVersion", "relationships"]) === false) return null;
  if (value.policyVersion !== MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION || !Array.isArray(value.relationships)) return null;

  const refs = new Set<string>();
  const items = [];
  for (const raw of value.relationships) {
    if (!isRecord(raw) || !exactKeys(raw, ["counterpart", "relationshipRef", "state"])
      || !isRecord(raw.counterpart)
      || !exactKeys(raw.counterpart, ["displayName", "mascotAvatarKey"])) return null;
    if (typeof raw.relationshipRef !== "string" || !raw.relationshipRef.startsWith("mbr1.")
      || raw.relationshipRef.length <= 5 || raw.relationshipRef.length > 512
      || typeof raw.state !== "string" || !STATES.has(raw.state as MealBuddyRelationshipState)
      || typeof raw.counterpart.displayName !== "string" || raw.counterpart.displayName.length === 0
      || typeof raw.counterpart.mascotAvatarKey !== "string" || raw.counterpart.mascotAvatarKey.length === 0
      || refs.has(raw.relationshipRef)) return null;
    refs.add(raw.relationshipRef);
    items.push(Object.freeze({
      relationshipRef: raw.relationshipRef,
      state: raw.state as MealBuddyRelationshipState,
      counterpart: Object.freeze({
        displayName: raw.counterpart.displayName,
        mascotAvatarKey: raw.counterpart.mascotAvatarKey
      })
    }));
  }

  if (operation === "list") {
    if (items.some((item) => item.state === "none")) return null;
  } else if (operation === "read") {
    if (items.length > 1 || items.some((item) => item.state === "none")) return null;
  } else {
    if (items.length !== 1) return null;
    const requiredState = operation === "accept" ? "accepted"
      : operation === "decline" || operation === "cancel" ? "none" : null;
    if ((requiredState && items[0]?.state !== requiredState)
      || (operation === "send" && items[0]?.state === "none")) return null;
  }
  return Object.freeze(items);
}

async function mapInvokeError(error: SupabaseMealBuddyRelationshipInvokeError): Promise<MealBuddyRelationshipErrorCode> {
  try {
    const body = await error.context?.json();
    const errorBody = isRecord(body) && isRecord(body.error) ? body.error : null;
    if (errorBody && typeof errorBody.code === "string"
      && KNOWN_SERVER_ERRORS.has(errorBody.code as MealBuddyRelationshipErrorCode)) {
      return errorBody.code as MealBuddyRelationshipErrorCode;
    }
  } catch {
    // Raw transport details are deliberately collapsed below.
  }
  return "server_unavailable";
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(errorCode: MealBuddyRelationshipErrorCode): MealBuddyRelationshipOutcome {
  return Object.freeze({ ok: false as const, errorCode });
}
