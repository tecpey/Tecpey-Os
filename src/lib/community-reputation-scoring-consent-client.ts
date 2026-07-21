export const COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION =
  "community-reputation-scoring-consent-v1" as const;

export type CommunityReputationScoringConsentClient = {
  enabled: boolean;
  revision: number;
  consentVersion: typeof COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION;
  consentedAt: string | null;
  updatedAt: string;
};

export type CommunityReputationScoringConsentLoadResult =
  | {
      available: true;
      consent: CommunityReputationScoringConsentClient;
    }
  | {
      available: false;
      reason: "unavailable" | "unauthenticated" | "invalid_response";
      consent: null;
    };

export type CommunityReputationScoringConsentMutationResult =
  | {
      ok: true;
      changed: boolean;
      replayed: boolean;
      consent: CommunityReputationScoringConsentClient;
    }
  | {
      ok: false;
      reason:
        | "revision_conflict"
        | "idempotency_conflict"
        | "rate_limited"
        | "unauthenticated"
        | "unavailable"
        | "invalid_response";
    };

const CONSENT_KEYS = [
  "enabled",
  "revision",
  "consentVersion",
  "consentedAt",
  "updatedAt",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function exactIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : null;
}

function parseConsent(
  value: unknown,
): CommunityReputationScoringConsentClient | null {
  const raw = record(value);
  if (!raw || !exactKeys(raw, CONSENT_KEYS)) return null;
  if (
    typeof raw.enabled !== "boolean" ||
    !Number.isSafeInteger(raw.revision) ||
    Number(raw.revision) < 0 ||
    raw.consentVersion !== COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION
  ) {
    return null;
  }

  const consentedAt = raw.consentedAt === null ? null : exactIso(raw.consentedAt);
  const updatedAt = exactIso(raw.updatedAt);
  if (
    (raw.consentedAt !== null && !consentedAt) ||
    !updatedAt ||
    (raw.enabled && consentedAt === null) ||
    (consentedAt !== null && updatedAt < consentedAt)
  ) {
    return null;
  }

  return {
    enabled: raw.enabled,
    revision: Number(raw.revision),
    consentVersion: COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
    consentedAt,
    updatedAt,
  };
}

export function parseCommunityReputationScoringConsentPayload(
  value: unknown,
): CommunityReputationScoringConsentClient | null {
  const root = record(value);
  if (!root || !exactKeys(root, ["ok", "consent"]) || root.ok !== true) {
    return null;
  }
  return parseConsent(root.consent);
}

export function parseCommunityReputationScoringConsentMutationPayload(
  value: unknown,
): {
  consent: CommunityReputationScoringConsentClient;
  changed: boolean;
  replayed: boolean;
} | null {
  const root = record(value);
  if (
    !root ||
    !exactKeys(root, ["ok", "consent", "changed", "replayed"]) ||
    root.ok !== true ||
    typeof root.changed !== "boolean" ||
    typeof root.replayed !== "boolean" ||
    (root.replayed && !root.changed)
  ) {
    return null;
  }
  const consent = parseConsent(root.consent);
  return consent
    ? {
        consent,
        changed: root.changed,
        replayed: root.replayed,
      }
    : null;
}

function parseError(value: unknown): string | null {
  const root = record(value);
  if (!root || root.ok !== false || typeof root.error !== "string") return null;
  return root.error;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function loadFailure(response: Response, payload: unknown): CommunityReputationScoringConsentLoadResult {
  const error = parseError(payload);
  if (response.status === 401 || error === "academy_profile_required") {
    return { available: false, reason: "unauthenticated", consent: null };
  }
  return { available: false, reason: "unavailable", consent: null };
}

export async function loadCommunityReputationScoringConsentClient(): Promise<
  CommunityReputationScoringConsentLoadResult
> {
  try {
    const response = await fetch(
      "/api/community/profile?view=reputation-scoring-consent",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    const payload = await responseJson(response);
    if (!response.ok) return loadFailure(response, payload);
    const consent = parseCommunityReputationScoringConsentPayload(payload);
    return consent
      ? { available: true, consent }
      : { available: false, reason: "invalid_response", consent: null };
  } catch {
    return { available: false, reason: "unavailable", consent: null };
  }
}

export function createCommunityReputationScoringConsentIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("secure_random_unavailable");
  if (typeof cryptoApi.randomUUID === "function") {
    return `community-reputation-consent-${cryptoApi.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `community-reputation-consent-${Array.from(bytes, (entry) =>
    entry.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function mutationFailure(
  response: Response,
  payload: unknown,
): CommunityReputationScoringConsentMutationResult {
  const error = parseError(payload);
  if (
    response.status === 409 &&
    error === "community_reputation_scoring_consent_revision_conflict"
  ) {
    return { ok: false, reason: "revision_conflict" };
  }
  if (response.status === 409 && error === "idempotency_conflict") {
    return { ok: false, reason: "idempotency_conflict" };
  }
  if (response.status === 429 || error === "rate_limited") {
    return { ok: false, reason: "rate_limited" };
  }
  if (response.status === 401 || error === "academy_profile_required") {
    return { ok: false, reason: "unauthenticated" };
  }
  return { ok: false, reason: "unavailable" };
}

export async function updateCommunityReputationScoringConsentClient(input: {
  expectedRevision: number;
  enabled: boolean;
  idempotencyKey?: string;
}): Promise<CommunityReputationScoringConsentMutationResult> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    return { ok: false, reason: "invalid_response" };
  }

  let idempotencyKey: string;
  try {
    idempotencyKey =
      input.idempotencyKey ??
      createCommunityReputationScoringConsentIdempotencyKey();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  try {
    const response = await fetch(
      "/api/community/profile?view=reputation-scoring-consent",
      {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          reputationScoringEnabled: input.enabled,
        }),
      },
    );
    const payload = await responseJson(response);
    if (!response.ok) return mutationFailure(response, payload);
    const parsed = parseCommunityReputationScoringConsentMutationPayload(payload);
    return parsed
      ? { ok: true, ...parsed }
      : { ok: false, reason: "invalid_response" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
