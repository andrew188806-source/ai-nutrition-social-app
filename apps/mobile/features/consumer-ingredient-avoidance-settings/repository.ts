import {
  CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
  CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION,
  CANDIDATE_INGREDIENT_AVOIDANCE_VALUES,
  PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID,
  PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION,
  isCandidateIngredientAvoidanceKey,
  type CandidateIngredientAvoidanceKey
} from "../../../../packages/shared/src/domain/candidate-ingredient-avoidance";
import type { ConsumerAuthPort } from "../consumer-auth";
import {
  READ_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC,
  REPLACE_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC,
  type SupabaseConsumerIngredientAvoidanceSettingsClientLike
} from "./supabaseContracts";
import type {
  ConsumerIngredientAvoidanceSettingsRepository,
  ConsumerIngredientAvoidanceSettingsResult,
  CurrentUserIngredientAvoidanceSettings
} from "./types";

const OPTIONS = Object.freeze(CANDIDATE_INGREDIENT_AVOIDANCE_VALUES.map(({ key, zhTWLabel }) =>
  Object.freeze({ key, label: zhTWLabel })
));
const ORDER = new Map<CandidateIngredientAvoidanceKey, number>(
  OPTIONS.map((option, index) => [option.key, index])
);

export class SupabaseConsumerIngredientAvoidanceSettingsRepository
implements ConsumerIngredientAvoidanceSettingsRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseConsumerIngredientAvoidanceSettingsClientLike
  ) {}

  async loadCurrentUser():
  Promise<ConsumerIngredientAvoidanceSettingsResult<CurrentUserIngredientAvoidanceSettings>> {
    if (!(await this.hasCurrentSession())) {
      return { ok: false, errorCode: "authentication_required" };
    }
    try {
      const response = await this.client.rpc(READ_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC, {});
      if (response.error) return { ok: false, errorCode: "load_failed" };
      const value = parseSettings(response.data);
      return value ? { ok: true, value } : { ok: false, errorCode: "invalid_server_response" };
    } catch {
      return { ok: false, errorCode: "load_failed" };
    }
  }

  async replaceCurrentUser(
    selectedKeys: readonly CandidateIngredientAvoidanceKey[]
  ): Promise<ConsumerIngredientAvoidanceSettingsResult<CurrentUserIngredientAvoidanceSettings>> {
    if (!(await this.hasCurrentSession())) {
      return { ok: false, errorCode: "authentication_required" };
    }
    if (!validSelection(selectedKeys)) return { ok: false, errorCode: "save_failed" };
    try {
      const response = await this.client.rpc(REPLACE_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC, {
        p_source_value_keys: [...selectedKeys]
      });
      if (response.error) return { ok: false, errorCode: "save_failed" };
      const value = parseSettings(response.data);
      return value ? { ok: true, value } : { ok: false, errorCode: "invalid_server_response" };
    } catch {
      return { ok: false, errorCode: "save_failed" };
    }
  }

  private async hasCurrentSession(): Promise<boolean> {
    try {
      const session = await this.authPort.getCurrentSession();
      return session.ok && Boolean(session.value);
    } catch {
      return false;
    }
  }
}

export class DisabledConsumerIngredientAvoidanceSettingsRepository
implements ConsumerIngredientAvoidanceSettingsRepository {
  readonly source = "disabled" as const;
  async loadCurrentUser():
  Promise<ConsumerIngredientAvoidanceSettingsResult<CurrentUserIngredientAvoidanceSettings>> {
    return { ok: false, errorCode: "configuration_error" };
  }
  async replaceCurrentUser():
  Promise<ConsumerIngredientAvoidanceSettingsResult<CurrentUserIngredientAvoidanceSettings>> {
    return { ok: false, errorCode: "configuration_error" };
  }
}

function parseSettings(value: unknown): CurrentUserIngredientAvoidanceSettings | null {
  if (!isRecord(value)) return null;
  if (value.source_vocabulary_id !== PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID
    || value.source_vocabulary_version !== PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION
    || value.taxonomy_id !== CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID
    || value.taxonomy_version !== CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION
    || !Number.isInteger(value.unresolved_selection_count)
    || (value.unresolved_selection_count as number) < 0
    || !Array.isArray(value.ingredient_avoidance_keys)) return null;
  const keys = value.ingredient_avoidance_keys;
  if (keys.some((key) => typeof key !== "string" || !isCandidateIngredientAvoidanceKey(key))) {
    return null;
  }
  const selected = keys as CandidateIngredientAvoidanceKey[];
  if (!validSelection(selected)) return null;
  selected.sort((left, right) => (ORDER.get(left) ?? 99) - (ORDER.get(right) ?? 99));
  return Object.freeze({
    options: OPTIONS,
    selectedIngredientAvoidanceKeys: Object.freeze([...selected]),
    unresolvedSelectionCount: value.unresolved_selection_count as number
  });
}

function validSelection(keys: readonly CandidateIngredientAvoidanceKey[]): boolean {
  return Array.isArray(keys) && keys.length <= OPTIONS.length
    && keys.every((key) => isCandidateIngredientAvoidanceKey(key))
    && new Set(keys).size === keys.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
