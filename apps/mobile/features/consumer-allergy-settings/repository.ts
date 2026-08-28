import {
  CANDIDATE_ALLERGEN_TAXONOMY_ID,
  CANDIDATE_ALLERGEN_TAXONOMY_VERSION,
  CANDIDATE_ALLERGEN_VALUES,
  PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID,
  PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_VERSION,
  isCandidateAllergenKey,
  type CandidateAllergenKey
} from "../../../../packages/shared/src/domain/candidate-allergen";
import type { ConsumerAuthPort } from "../consumer-auth";
import {
  READ_CURRENT_USER_ALLERGY_SETTINGS_RPC,
  REPLACE_CURRENT_USER_ALLERGY_SETTINGS_RPC,
  type SupabaseConsumerAllergySettingsClientLike
} from "./supabaseContracts";
import type {
  ConsumerAllergySettingsRepository,
  ConsumerAllergySettingsResult,
  CurrentUserAllergySettings
} from "./types";

const OPTIONS = Object.freeze(CANDIDATE_ALLERGEN_VALUES.map(({ key, zhTWLabel }) =>
  Object.freeze({ key, label: zhTWLabel })
));
const ORDER = new Map<CandidateAllergenKey, number>(OPTIONS.map((option, index) => [option.key, index]));

export class SupabaseConsumerAllergySettingsRepository implements ConsumerAllergySettingsRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseConsumerAllergySettingsClientLike
  ) {}

  async loadCurrentUser(): Promise<ConsumerAllergySettingsResult<CurrentUserAllergySettings>> {
    if (!(await this.hasCurrentSession())) return { ok: false, errorCode: "authentication_required" };
    try {
      const response = await this.client.rpc(READ_CURRENT_USER_ALLERGY_SETTINGS_RPC, {});
      if (response.error) return { ok: false, errorCode: "load_failed" };
      const value = parseSettings(response.data);
      return value ? { ok: true, value } : { ok: false, errorCode: "invalid_server_response" };
    } catch {
      return { ok: false, errorCode: "load_failed" };
    }
  }

  async replaceCurrentUser(
    selectedAllergenKeys: readonly CandidateAllergenKey[]
  ): Promise<ConsumerAllergySettingsResult<CurrentUserAllergySettings>> {
    if (!(await this.hasCurrentSession())) return { ok: false, errorCode: "authentication_required" };
    if (!validSelection(selectedAllergenKeys)) return { ok: false, errorCode: "save_failed" };
    try {
      const response = await this.client.rpc(REPLACE_CURRENT_USER_ALLERGY_SETTINGS_RPC, {
        p_source_value_keys: [...selectedAllergenKeys]
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

export class DisabledConsumerAllergySettingsRepository implements ConsumerAllergySettingsRepository {
  readonly source = "disabled" as const;
  async loadCurrentUser(): Promise<ConsumerAllergySettingsResult<CurrentUserAllergySettings>> {
    return { ok: false, errorCode: "configuration_error" };
  }
  async replaceCurrentUser(): Promise<ConsumerAllergySettingsResult<CurrentUserAllergySettings>> {
    return { ok: false, errorCode: "configuration_error" };
  }
}

function parseSettings(value: unknown): CurrentUserAllergySettings | null {
  if (!isRecord(value)) return null;
  if (value.source_vocabulary_id !== PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID
    || value.source_vocabulary_version !== PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_VERSION
    || value.taxonomy_id !== CANDIDATE_ALLERGEN_TAXONOMY_ID
    || value.taxonomy_version !== CANDIDATE_ALLERGEN_TAXONOMY_VERSION
    || !Number.isInteger(value.unresolved_selection_count)
    || (value.unresolved_selection_count as number) < 0
    || !Array.isArray(value.allergen_keys)) return null;
  const keys = value.allergen_keys;
  if (keys.some((key) => typeof key !== "string" || !isCandidateAllergenKey(key))) return null;
  const selected = keys as CandidateAllergenKey[];
  if (!validSelection(selected)) return null;
  selected.sort((left, right) => (ORDER.get(left) ?? 99) - (ORDER.get(right) ?? 99));
  return Object.freeze({
    options: OPTIONS,
    selectedAllergenKeys: Object.freeze([...selected]),
    unresolvedSelectionCount: value.unresolved_selection_count as number
  });
}

function validSelection(keys: readonly CandidateAllergenKey[]): boolean {
  return Array.isArray(keys) && keys.length <= OPTIONS.length
    && keys.every((key) => isCandidateAllergenKey(key))
    && new Set(keys).size === keys.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
