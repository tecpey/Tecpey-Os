import type { AiModelProviderId } from "./control-plane-catalog";

export type AiStructuredOutputSpec = Readonly<{
  name: string;
  schema: Readonly<Record<string, unknown>>;
  strict?: boolean;
}>;

const STRUCTURED_OUTPUT_PROVIDERS = new Set<AiModelProviderId>([
  "openai",
  "anthropic",
  "xai",
  "perplexity",
]);

const MAX_SCHEMA_BYTES = 32_768;
const SCHEMA_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function aiProviderSupportsStructuredOutput(
  providerId: AiModelProviderId,
): boolean {
  return STRUCTURED_OUTPUT_PROVIDERS.has(providerId);
}

function normalizedSpec(spec: AiStructuredOutputSpec): Required<AiStructuredOutputSpec> {
  const name = spec.name.trim();
  if (!SCHEMA_NAME.test(name)) {
    throw new Error("ai_structured_output_name_invalid");
  }
  if (!spec.schema || Array.isArray(spec.schema) || typeof spec.schema !== "object") {
    throw new Error("ai_structured_output_schema_invalid");
  }
  const encoded = JSON.stringify(spec.schema);
  if (!encoded || Buffer.byteLength(encoded, "utf8") > MAX_SCHEMA_BYTES) {
    throw new Error("ai_structured_output_schema_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new Error("ai_structured_output_schema_invalid");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("ai_structured_output_schema_invalid");
  }
  return {
    name,
    schema: parsed as Record<string, unknown>,
    strict: spec.strict !== false,
  };
}

function providerIdFromRequest(url: string): AiModelProviderId | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "api.openai.com") return "openai";
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "api.x.ai") return "xai";
  if (host === "api.perplexity.ai") return "perplexity";
  if (host === "openrouter.ai") return "openrouter";
  return null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function parseJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    throw new Error("ai_structured_output_json_body_required");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(init.body);
  } catch {
    throw new Error("ai_structured_output_json_body_required");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("ai_structured_output_json_body_required");
  }
  return parsed as Record<string, unknown>;
}

function withStructuredOutput(
  providerId: AiModelProviderId,
  body: Record<string, unknown>,
  spec: Required<AiStructuredOutputSpec>,
): Record<string, unknown> {
  if (!aiProviderSupportsStructuredOutput(providerId)) {
    throw new Error(`ai_structured_output_provider_unsupported:${providerId}`);
  }

  if (providerId === "anthropic") {
    return {
      ...body,
      output_config: {
        format: {
          type: "json_schema",
          schema: spec.schema,
        },
      },
    };
  }

  if (providerId === "perplexity") {
    return {
      ...body,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: spec.name,
          schema: spec.schema,
        },
      },
    };
  }

  // OpenAI Responses and xAI Responses both accept their structured text
  // contract at text.format. We keep this transformation outside domain code
  // so request shaping remains provider infrastructure.
  return {
    ...body,
    text: {
      ...(body.text && typeof body.text === "object" && !Array.isArray(body.text)
        ? body.text as Record<string, unknown>
        : {}),
      format: {
        type: "json_schema",
        name: spec.name,
        schema: spec.schema,
        strict: spec.strict,
      },
    },
  };
}

/**
 * Decorates the existing provider-router transport with a strict schema
 * contract without reimplementing retries, circuits, tools, privacy headers,
 * response parsing or usage accounting.
 *
 * The returned transport fails before network egress when the selected
 * provider/endpoint cannot satisfy the schema contract.
 */
export function createStructuredOutputFetch(
  structuredOutput: AiStructuredOutputSpec,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  const spec = normalizedSpec(structuredOutput);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    const providerId = providerIdFromRequest(url);
    if (!providerId) throw new Error("ai_structured_output_provider_unknown");
    if (!aiProviderSupportsStructuredOutput(providerId)) {
      throw new Error(`ai_structured_output_provider_unsupported:${providerId}`);
    }
    const body = parseJsonBody(init);
    const governedBody = withStructuredOutput(providerId, body, spec);
    return fetchImpl(input, {
      ...init,
      body: JSON.stringify(governedBody),
    });
  };
}
