import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { registerSession } from "./session-store";
import { strictRevocationVerdict } from "./jti-store";

export const EXCHANGE_PRODUCT_SESSION_SECRET_ENV =
  "TECPEY_EXCHANGE_SESSION_SECRET_V1" as const;
export const EXCHANGE_PRODUCT_SESSION_ISSUER = "urn:tecpey:identity" as const;
export const EXCHANGE_PRODUCT_SESSION_AUDIENCE =
  "urn:tecpey:exchange:bff" as const;
export const EXCHANGE_PRODUCT_SESSION_TYP =
  "tecpey-exchange-session+jwt" as const;
export const EXCHANGE_PRODUCT_SESSION_ROLE =
  "exchange_product_session" as const;
export const EXCHANGE_PRODUCT_SESSION_VERSION = 1 as const;
export const EXCHANGE_PRODUCT_SESSION_DEFAULT_TTL_SECONDS = 15 * 60;
export const EXCHANGE_PRODUCT_SESSION_MIN_TTL_SECONDS = 5 * 60;
export const EXCHANGE_PRODUCT_SESSION_MAX_TTL_SECONDS = 30 * 60;
export const EXCHANGE_FINANCIAL_STEP_UP_MAX_AGE_SECONDS = 5 * 60;

const DEV_TEST_SECRET =
  "tecpey-exchange-session-dev-test-secret-v1-not-for-production";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_AMR = new Set([
  "pwd",
  "otp",
  "totp",
  "webauthn",
  "recovery",
  "federated",
]);
const AAL2_METHODS = new Set(["otp", "totp", "webauthn", "recovery"]);

export type ExchangeSessionAssurance = "aal1" | "aal2";
export type ExchangeSessionAmr =
  | "pwd"
  | "otp"
  | "totp"
  | "webauthn"
  | "recovery"
  | "federated";

export type ExchangeProductSession = Readonly<{
  tenantId: string;
  principalId: string;
  exchangeProductAccountId: string;
  assurance: ExchangeSessionAssurance;
  authenticationMethods: readonly ExchangeSessionAmr[];
  authenticatedAt: Date;
  financialStepUpAt: Date | null;
  jti: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type IssuedExchangeProductSession = Readonly<{
  token: string;
  session: ExchangeProductSession;
}>;

export type ExchangeProductSessionErrorCode =
  | "exchange_session_secret_missing"
  | "exchange_session_secret_too_short"
  | "exchange_session_invalid_input"
  | "exchange_session_invalid_ttl"
  | "exchange_session_invalid_amr"
  | "exchange_session_aal2_method_required"
  | "exchange_session_registration_unavailable"
  | "exchange_session_invalid"
  | "exchange_session_revoked"
  | "exchange_session_revocation_unavailable"
  | "exchange_session_assurance_insufficient"
  | "exchange_session_step_up_required"
  | "exchange_session_step_up_stale"
  | "exchange_session_step_up_future"
  | "exchange_session_step_up_precedes_authentication";

export class ExchangeProductSessionError extends Error {
  readonly code: ExchangeProductSessionErrorCode;

  constructor(code: ExchangeProductSessionErrorCode) {
    super(code);
    this.name = "ExchangeProductSessionError";
    this.code = code;
  }
}

function fail(code: ExchangeProductSessionErrorCode): never {
  throw new ExchangeProductSessionError(code);
}

export function resolveExchangeProductSessionSecret(options?: {
  envValue?: string | undefined;
  nodeEnv?: string | undefined;
}): Uint8Array {
  const configured = options?.envValue ?? process.env[EXCHANGE_PRODUCT_SESSION_SECRET_ENV];
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  const raw = configured?.trim();

  if (!raw) {
    if (nodeEnv === "production") fail("exchange_session_secret_missing");
    return new TextEncoder().encode(DEV_TEST_SECRET);
  }

  const secret = new TextEncoder().encode(raw);
  if (secret.byteLength < 32) fail("exchange_session_secret_too_short");
  return secret;
}

export function exchangeSessionRegistryOwner(input: {
  tenantId: string;
  principalId: string;
}): string {
  if (!IDENTIFIER.test(input.tenantId) || !UUID.test(input.principalId)) {
    fail("exchange_session_invalid_input");
  }
  return `exchange:${input.tenantId}:${input.principalId}`;
}

function normalizeAmr(
  input: readonly string[],
  assurance: ExchangeSessionAssurance,
): ExchangeSessionAmr[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4) {
    fail("exchange_session_invalid_amr");
  }
  const normalized = [...new Set(input)].sort();
  if (
    normalized.length < 1 ||
    normalized.some((method) => !ALLOWED_AMR.has(method))
  ) {
    fail("exchange_session_invalid_amr");
  }
  // AAL2 here means a genuinely multi-method browser/BFF authentication event.
  // Merely labelling a single OTP/TOTP/WebAuthn method as AAL2 would let callers
  // manufacture an elevated Exchange session without proving a second method.
  if (
    assurance === "aal2" &&
    (normalized.length < 2 || !normalized.some((method) => AAL2_METHODS.has(method)))
  ) {
    fail("exchange_session_aal2_method_required");
  }
  return normalized as ExchangeSessionAmr[];
}

function boundedTtl(ttlSeconds: number | undefined): number {
  const ttl = ttlSeconds ?? EXCHANGE_PRODUCT_SESSION_DEFAULT_TTL_SECONDS;
  if (
    !Number.isInteger(ttl) ||
    ttl < EXCHANGE_PRODUCT_SESSION_MIN_TTL_SECONDS ||
    ttl > EXCHANGE_PRODUCT_SESSION_MAX_TTL_SECONDS
  ) {
    fail("exchange_session_invalid_ttl");
  }
  return ttl;
}

function seconds(value: Date): number {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) fail("exchange_session_invalid_input");
  return Math.floor(timestamp / 1000);
}

function validateIdentity(input: {
  tenantId: string;
  principalId: string;
  exchangeProductAccountId: string;
}): void {
  if (
    !IDENTIFIER.test(input.tenantId) ||
    !UUID.test(input.principalId) ||
    !UUID.test(input.exchangeProductAccountId)
  ) {
    fail("exchange_session_invalid_input");
  }
}

type SessionAuthorityDependencies = Readonly<{
  now: () => Date;
  randomJti: () => string;
  register: typeof registerSession;
  revocationVerdict: typeof strictRevocationVerdict;
  resolveSecret: () => Uint8Array;
}>;

const DEFAULT_DEPENDENCIES: SessionAuthorityDependencies = Object.freeze({
  now: () => new Date(),
  randomJti: () => randomUUID(),
  register: registerSession,
  revocationVerdict: strictRevocationVerdict,
  resolveSecret: () => resolveExchangeProductSessionSecret(),
});

export function createExchangeProductSessionAuthority(
  overrides: Partial<SessionAuthorityDependencies> = {},
) {
  const deps: SessionAuthorityDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...overrides,
  };

  async function issue(input: {
    tenantId: string;
    principalId: string;
    exchangeProductAccountId: string;
    assurance: ExchangeSessionAssurance;
    authenticationMethods: readonly string[];
    authenticatedAt?: Date;
    financialStepUpAt?: Date | null;
    ttlSeconds?: number;
    deviceInfo?: string;
    ip?: string;
  }): Promise<IssuedExchangeProductSession> {
    validateIdentity(input);
    const assurance = input.assurance;
    if (assurance !== "aal1" && assurance !== "aal2") {
      fail("exchange_session_invalid_input");
    }
    const amr = normalizeAmr(input.authenticationMethods, assurance);
    const ttl = boundedTtl(input.ttlSeconds);
    const now = deps.now();
    const nowSeconds = seconds(now);
    const authenticatedAt = input.authenticatedAt ?? now;
    const authenticatedAtSeconds = seconds(authenticatedAt);
    const stepUpAt = input.financialStepUpAt ?? null;
    const stepUpAtSeconds = stepUpAt ? seconds(stepUpAt) : null;

    if (authenticatedAtSeconds > nowSeconds + 30) {
      fail("exchange_session_invalid_input");
    }
    if (stepUpAtSeconds !== null) {
      if (stepUpAtSeconds > nowSeconds + 30) fail("exchange_session_step_up_future");
      if (stepUpAtSeconds < authenticatedAtSeconds) {
        fail("exchange_session_step_up_precedes_authentication");
      }
      if (assurance !== "aal2") fail("exchange_session_assurance_insufficient");
    }

    const jti = deps.randomJti();
    if (!UUID.test(jti)) fail("exchange_session_invalid_input");
    const expiresAtSeconds = nowSeconds + ttl;
    const secret = deps.resolveSecret();

    const token = await new SignJWT({
      role: EXCHANGE_PRODUCT_SESSION_ROLE,
      v: EXCHANGE_PRODUCT_SESSION_VERSION,
      tenant_id: input.tenantId,
      exchange_product_account_id: input.exchangeProductAccountId,
      assurance,
      amr,
      auth_time: authenticatedAtSeconds,
      financial_step_up_at: stepUpAtSeconds,
    })
      .setProtectedHeader({ alg: "HS256", typ: EXCHANGE_PRODUCT_SESSION_TYP })
      .setIssuer(EXCHANGE_PRODUCT_SESSION_ISSUER)
      .setAudience(EXCHANGE_PRODUCT_SESSION_AUDIENCE)
      .setSubject(input.principalId)
      .setJti(jti)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(secret);

    const registered = await deps.register({
      jti,
      userId: exchangeSessionRegistryOwner(input),
      deviceInfo: (input.deviceInfo ?? "exchange-bff-session").slice(0, 500),
      ip: (input.ip ?? "unknown").slice(0, 80),
      expiresAt: new Date(expiresAtSeconds * 1000),
    });
    if (!registered) fail("exchange_session_registration_unavailable");

    return Object.freeze({
      token,
      session: Object.freeze({
        tenantId: input.tenantId,
        principalId: input.principalId,
        exchangeProductAccountId: input.exchangeProductAccountId,
        assurance,
        authenticationMethods: Object.freeze(amr),
        authenticatedAt: new Date(authenticatedAtSeconds * 1000),
        financialStepUpAt:
          stepUpAtSeconds === null ? null : new Date(stepUpAtSeconds * 1000),
        jti,
        issuedAt: new Date(nowSeconds * 1000),
        expiresAt: new Date(expiresAtSeconds * 1000),
      }),
    });
  }

  async function verify(token: string): Promise<ExchangeProductSession> {
    if (typeof token !== "string" || token.length < 80 || token.length > 8_192) {
      fail("exchange_session_invalid");
    }

    try {
      const secret = deps.resolveSecret();
      const { payload, protectedHeader } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
        issuer: EXCHANGE_PRODUCT_SESSION_ISSUER,
        audience: EXCHANGE_PRODUCT_SESSION_AUDIENCE,
        clockTolerance: 5,
      });
      if (protectedHeader.typ !== EXCHANGE_PRODUCT_SESSION_TYP) {
        fail("exchange_session_invalid");
      }
      if (
        payload.role !== EXCHANGE_PRODUCT_SESSION_ROLE ||
        payload.v !== EXCHANGE_PRODUCT_SESSION_VERSION ||
        typeof payload.sub !== "string" ||
        typeof payload.tenant_id !== "string" ||
        typeof payload.exchange_product_account_id !== "string" ||
        (payload.assurance !== "aal1" && payload.assurance !== "aal2") ||
        !Array.isArray(payload.amr) ||
        typeof payload.auth_time !== "number" ||
        (payload.financial_step_up_at !== null &&
          typeof payload.financial_step_up_at !== "number") ||
        typeof payload.jti !== "string" ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        fail("exchange_session_invalid");
      }

      validateIdentity({
        tenantId: payload.tenant_id,
        principalId: payload.sub,
        exchangeProductAccountId: payload.exchange_product_account_id,
      });
      const assurance = payload.assurance as ExchangeSessionAssurance;
      const amr = normalizeAmr(payload.amr as string[], assurance);
      if (!UUID.test(payload.jti)) fail("exchange_session_invalid");

      let verdict: Awaited<ReturnType<typeof strictRevocationVerdict>>;
      try {
        verdict = await deps.revocationVerdict(payload.jti);
      } catch {
        fail("exchange_session_revocation_unavailable");
      }
      if (verdict === "unavailable") fail("exchange_session_revocation_unavailable");
      if (verdict === "revoked") fail("exchange_session_revoked");

      return Object.freeze({
        tenantId: payload.tenant_id,
        principalId: payload.sub,
        exchangeProductAccountId: payload.exchange_product_account_id,
        assurance,
        authenticationMethods: Object.freeze(amr),
        authenticatedAt: new Date(payload.auth_time * 1000),
        financialStepUpAt:
          payload.financial_step_up_at === null
            ? null
            : new Date(payload.financial_step_up_at * 1000),
        jti: payload.jti,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
      });
    } catch (error) {
      if (error instanceof ExchangeProductSessionError) throw error;
      fail("exchange_session_invalid");
    }
  }

  function assertFinancialStepUp(
    session: ExchangeProductSession,
    options?: { maxAgeSeconds?: number; now?: Date },
  ): void {
    if (session.assurance !== "aal2") {
      fail("exchange_session_assurance_insufficient");
    }
    if (!session.financialStepUpAt) fail("exchange_session_step_up_required");

    const maxAge = options?.maxAgeSeconds ?? EXCHANGE_FINANCIAL_STEP_UP_MAX_AGE_SECONDS;
    if (!Number.isInteger(maxAge) || maxAge < 60 || maxAge > 10 * 60) {
      fail("exchange_session_invalid_input");
    }
    const nowSeconds = seconds(options?.now ?? deps.now());
    const stepUpSeconds = seconds(session.financialStepUpAt);
    const authSeconds = seconds(session.authenticatedAt);
    if (stepUpSeconds > nowSeconds + 30) fail("exchange_session_step_up_future");
    if (stepUpSeconds < authSeconds) {
      fail("exchange_session_step_up_precedes_authentication");
    }
    if (nowSeconds - stepUpSeconds > maxAge) {
      fail("exchange_session_step_up_stale");
    }
  }

  return Object.freeze({ issue, verify, assertFinancialStepUp });
}

export const exchangeProductSessionAuthority =
  createExchangeProductSessionAuthority();
