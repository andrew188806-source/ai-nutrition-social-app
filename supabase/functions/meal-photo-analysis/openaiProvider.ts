import { validateRawProviderOutput } from "../_shared/meal-photo-analysis/index.ts";
import { buildMealPhotoAnalysisPrompt, MEAL_PHOTO_ANALYSIS_PROVIDER_OUTPUT_JSON_SCHEMA } from "./prompt.ts";
import type {
  MealPhotoAnalysisProvider,
  MealPhotoAnalysisProviderInput,
  MealPhotoAnalysisProviderOutcome
} from "./provider.ts";

// MI-E-C4 §9: OpenAI Responses API provider. Uses image input + strict Structured Outputs — never
// Assistants/Threads, never conversation persistence, never background mode, never a public image
// URL, never natural-language JSON parsing. store:false is set on every request (§9.3). The base64
// data URL built here exists only in this function's memory for the duration of one request — it
// is never logged, never written to any database, and never sent to any endpoint other than
// OpenAI's Responses API.
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type OpenAiMealPhotoAnalysisProviderOptions = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  // Injectable only so tests can exercise this class's own request-building/response-parsing
  // logic without a real network call — production always uses the real global fetch.
  fetchImpl?: typeof fetch;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Extracts the structured-output JSON text from a Responses API payload without assuming any
// particular SDK convenience property (this file talks to the raw HTTP API directly, not the
// OpenAI SDK) — walks the documented output array shape defensively and fails closed
// (provider_invalid_response) if the expected structure isn't present, rather than guessing.
function extractStructuredOutputText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord.type !== "message") continue;
    const content = itemRecord.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const partRecord = part as Record<string, unknown>;
      if ((partRecord.type === "output_text" || partRecord.type === "text") && typeof partRecord.text === "string") {
        return partRecord.text;
      }
    }
  }
  return null;
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class OpenAiMealPhotoAnalysisProvider implements MealPhotoAnalysisProvider {
  readonly name = "openai" as const;

  constructor(private readonly options: OpenAiMealPhotoAnalysisProviderOptions) {}

  async analyze(input: MealPhotoAnalysisProviderInput): Promise<MealPhotoAnalysisProviderOutcome> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const prompt = buildMealPhotoAnalysisPrompt(input.locale, input.mealSourceContext);
    const dataUrl = `data:${input.mimeType};base64,${toBase64(input.imageBytes)}`;

    const requestBody = {
      model: this.options.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: dataUrl }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          ...MEAL_PHOTO_ANALYSIS_PROVIDER_OUTPUT_JSON_SCHEMA
        }
      },
      // MI-E-C4 §9.3 data minimization — no conversation, no background mode, no Files API.
      store: false
    };

    const attempt = async (): Promise<{ kind: "success"; payload: unknown } | { kind: "error"; status: number } | { kind: "timeout" }> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        if (!response.ok) return { kind: "error", status: response.status };
        const payload = await response.json();
        return { kind: "success", payload };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return { kind: "timeout" };
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };

    // At most one bounded retry, and only for genuinely transient conditions (429/5xx/timeout) —
    // never for a 400-class request/schema error, and never more than once, so a client retry can
    // never trigger unbounded provider calls.
    let result = await attempt();
    if (result.kind === "timeout") {
      return { ok: false, errorCode: "provider_timeout" };
    }
    if (result.kind === "error" && isTransientHttpStatus(result.status)) {
      result = await attempt();
    }

    if (result.kind === "timeout") return { ok: false, errorCode: "provider_timeout" };
    if (result.kind === "error") {
      if (result.status === 429) return { ok: false, errorCode: "provider_rate_limited" };
      if (result.status >= 500) return { ok: false, errorCode: "provider_unavailable" };
      // Any other non-2xx (e.g. 400 invalid request) is not retried and is not a "response we got
      // back but couldn't parse" — it's still safest classified as provider_unavailable to the
      // caller, since the raw status/body is never surfaced to Mobile regardless.
      return { ok: false, errorCode: "provider_unavailable" };
    }

    const structuredText = extractStructuredOutputText(result.payload);
    if (!structuredText) return { ok: false, errorCode: "provider_invalid_response" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(structuredText);
    } catch {
      return { ok: false, errorCode: "provider_invalid_response" };
    }

    // Structured Outputs' own strict-schema guarantee is never trusted as a substitute for this
    // independent local validation (MI-E-C4 §4/§9.2).
    const validated = validateRawProviderOutput(parsed);
    if (!validated.ok) return { ok: false, errorCode: "provider_invalid_response" };

    const usageRaw = (result.payload as Record<string, unknown>)?.usage as Record<string, unknown> | undefined;
    const usage = usageRaw
      ? {
          inputTokens: typeof usageRaw.input_tokens === "number" ? usageRaw.input_tokens : undefined,
          outputTokens: typeof usageRaw.output_tokens === "number" ? usageRaw.output_tokens : undefined,
          totalTokens: typeof usageRaw.total_tokens === "number" ? usageRaw.total_tokens : undefined
        }
      : undefined;

    return {
      ok: true,
      value: {
        engineVersion: `openai-${this.options.model}-responses-v1`,
        rawOutput: validated.value,
        usage
      }
    };
  }
}
