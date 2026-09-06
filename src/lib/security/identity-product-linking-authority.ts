import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "../db";
import {
  IDENTITY_LINKING_POLICY_VERSION,
  MENTOR_EXCHANGE_ACCESS_POLICY,
  type TecpeyProductAccount,
} from "../../services/product-authority/identity-linking-authority";

export const IDENTITY_LINK_FINGERPRINT_KEY_ENV =
  "TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1" as const;
export const IDENTITY_LINK_FINGERPRINT_KEY_VERSION = 1 as const;
export const IDENTITY_LINK_DEFAULT_TTL_SECONDS = 600 as const;
export const IDENTITY_LINK_MIN_TTL_SECONDS = 120 as const;
export const IDENTITY_LINK_MAX_TTL_SECONDS = 900 as const;

const DEV_TEST_FINGERPRINT_KEY =
  "tecpey-identity-link-dev-test-key-v1-not-for-production";
const MAX_EXTERNAL_ACCOUNT_REF_LENGTH = 512;
const MAX_REDIRECT_URI_LENGTH = 2_048;

export type MentorExchangeReadScope =
  (typeof MENTOR_EXCHANGE_ACCESS_POLICY.allowedScopes)[number];

export type ProductDataReceivingService = "core" | "mentor";
export type ProductDataPurpose =
  | "account_linking"
  | "mentor_personalization"
  | "mentor_risk_coaching"
  | "cross_product_profile";

export type IdentityLinkingRuntimeErrorCode =
  | "database_unavailable"
  | "fingerprint_key_missing"
  | "fingerprint_key_too_short"
  | "invalid_external_account_ref"
  | "invalid_scope"
  | "too_many_scopes"
  | "invalid_redirect_uri"
  | "redirect_uri_not_allowlisted"
  | "invalid_ttl"
  | "source_and_target_product_must_differ"
  | "product_account_bound_elsewhere"
  | "product_account_ref_mismatch"
  | "product_account_not_active"
  | "ceremony_not_found"
  | "ceremony_expired"
  | "ceremony_state_invalid"
  | "ceremony_target_mismatch"
  | "ceremony_status_invalid"
  | "proof_verifier_invalid"
  | "redirect_uri_mismatch"
  | "idempotency_conflict"
  | "invalid_consent_purpose"
  | "assurance_supersession_required";

export class IdentityLinkingRuntimeError extends Error {
  readonly code: IdentityLinkingRuntimeErrorCode;

  constructor(code: IdentityLinkingRuntimeErrorCode) {
    super(code);
    this.name = "IdentityLinkingRuntimeError";
    this.code = code;
  }
}

function fail(code: IdentityLinkingRuntimeErrorCode): never {
  throw new IdentityLinkingRuntimeError(code);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function assertExternalAccountRef(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_EXTERNAL_ACCOUNT_REF_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_external_account_ref");
  }
  return value;
}

export function resolveIdentityLinkFingerprintKey(options?: {
  envValue?: string | undefined;
  nodeEnv?: string | undefined;
}): Buffer {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  const configured = options?.envValue ?? process.env[IDENTITY_LINK_FINGERPRINT_KEY_ENV];
  const raw = configured?.trim();

  if (!raw) {
    if (nodeEnv === "production") fail("fingerprint_key_missing");
    return Buffer.from(DEV_TEST_FINGERPRINT_KEY, "utf8");
  }

  const key = Buffer.from(raw, "utf8");
  if (key.byteLength < 32) fail("fingerprint_key_too_short");
  return key;
}

export function fingerprintProductAccountRef(input: {
  tenantId: string;
  product: TecpeyProductAccount;
  externalAccountRef: string;
  key?: Buffer;
}): string {
  const accountRef = assertExternalAccountRef(input.externalAccountRef);
  const key = input.key ?? resolveIdentityLinkFingerprintKey();
  return createHmac("sha256", key)
    .update("tecpey:product-account-ref:v1\0", "utf8")
    .update(input.tenantId, "utf8")
    .update("\0", "utf8")
    .update(input.product, "utf8")
    .update("\0", "utf8")
    .update(accountRef, "utf8")
    .digest("hex");
}

export function fingerprintProviderSubjectRef(input: {
  tenantId: string;
  providerSubjectRef: string;
  key?: Buffer;
}): string {
  const subjectRef = assertExternalAccountRef(input.providerSubjectRef);
  const key = input.key ?? resolveIdentityLinkFingerprintKey();
  return createHmac("sha256", key)
    .update("tecpey:identity-provider-subject:v1\0", "utf8")
    .update(input.tenantId, "utf8")
    .update("\0", "utf8")
    .update(subjectRef, "utf8")
    .digest("hex");
}

export function canonicalizeMentorExchangeReadScopes(
  scopes: readonly string[],
): MentorExchangeReadScope[] {
  const allowed = new Set<string>(MENTOR_EXCHANGE_ACCESS_POLICY.allowedScopes);
  const unique = [...new Set(scopes)];
  if (unique.length > MENTOR_EXCHANGE_ACCESS_POLICY.allowedScopes.length) {
    fail("too_many_scopes");
  }
  if (unique.some((scope) => !allowed.has(scope))) fail("invalid_scope");
  return unique.sort() as MentorExchangeReadScope[];
}

function normalizeRedirectUri(raw: string): string {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > MAX_REDIRECT_URI_LENGTH) {
    fail("invalid_redirect_uri");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail("invalid_redirect_uri");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.origin === "null"
  ) {
    fail("invalid_redirect_uri");
  }
  return parsed.toString();
}

export function assertExactRedirectUriAllowed(
  rawRedirectUri: string,
  allowedRedirectUris: readonly string[],
): string {
  const normalized = normalizeRedirectUri(rawRedirectUri);
  const allowed = allowedRedirectUris.map(normalizeRedirectUri);
  if (!allowed.includes(normalized)) fail("redirect_uri_not_allowlisted");
  return normalized;
}

function boundedTtlSeconds(ttlSeconds: number | undefined): number {
  const ttl = ttlSeconds ?? IDENTITY_LINK_DEFAULT_TTL_SECONDS;
  if (
    !Number.isInteger(ttl) ||
    ttl < IDENTITY_LINK_MIN_TTL_SECONDS ||
    ttl > IDENTITY_LINK_MAX_TTL_SECONDS
  ) {
    fail("invalid_ttl");
  }
  return ttl;
}

export type PreparedLinkCeremony = Readonly<{
  state: string;
  proofVerifier: string;
  stateHash: string;
  proofChallengeHash: string;
  redirectUri: string;
  redirectUriHash: string;
  requestedScopes: readonly MentorExchangeReadScope[];
  expiresAt: Date;
}>;

export function prepareProductAccountLinkCeremony(input: {
  redirectUri: string;
  allowedRedirectUris: readonly string[];
  scopes: readonly string[];
  ttlSeconds?: number;
  now?: Date;
  stateBytes?: Buffer;
  proofBytes?: Buffer;
}): PreparedLinkCeremony {
  const redirectUri = assertExactRedirectUriAllowed(
    input.redirectUri,
    input.allowedRedirectUris,
  );
  const requestedScopes = canonicalizeMentorExchangeReadScopes(input.scopes);
  const ttl = boundedTtlSeconds(input.ttlSeconds);
  const stateBytes = input.stateBytes ?? randomBytes(32);
  const proofBytes = input.proofBytes ?? randomBytes(32);
  if (stateBytes.byteLength < 32 || proofBytes.byteLength < 32) {
    fail("ceremony_state_invalid");
  }
  const state = stateBytes.toString("base64url");
  const proofVerifier = proofBytes.toString("base64url");
  const now = input.now ?? new Date();

  return Object.freeze({
    state,
    proofVerifier,
    stateHash: sha256Hex(state),
    proofChallengeHash: sha256Hex(proofVerifier),
    redirectUri,
    redirectUriHash: sha256Hex(redirectUri),
    requestedScopes: Object.freeze(requestedScopes),
    expiresAt: new Date(now.getTime() + ttl * 1_000),
  });
}

type ProductAccountRow = {
  id: string;
  principal_id: string;
  product_account_ref_hash: string;
  fingerprint_key_version: number;
  status: "active" | "suspended" | "disputed" | "closed";
};

export async function ensureProductAccountBindingTx(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    product: TecpeyProductAccount;
    externalAccountRef: string;
    bindingSource: "native" | "account_linking" | "recovery_review";
    key?: Buffer;
  },
): Promise<{ id: string; fingerprint: string }> {
  const fingerprint = fingerprintProductAccountRef({
    tenantId: input.tenantId,
    product: input.product,
    externalAccountRef: input.externalAccountRef,
    key: input.key,
  });

  const exact = await client.query<ProductAccountRow>(
    `SELECT id, principal_id, product_account_ref_hash,
            fingerprint_key_version, status
       FROM platform_product_accounts
      WHERE tenant_id = $1 AND product = $2 AND product_account_ref_hash = $3
      LIMIT 1
      FOR UPDATE`,
    [input.tenantId, input.product, fingerprint],
  );
  const exactRow = exact.rows[0];
  if (exactRow) {
    if (exactRow.principal_id !== input.principalId) {
      fail("product_account_bound_elsewhere");
    }
    if (exactRow.status !== "active") fail("product_account_not_active");
    if (exactRow.fingerprint_key_version !== IDENTITY_LINK_FINGERPRINT_KEY_VERSION) {
      fail("product_account_ref_mismatch");
    }
    return { id: exactRow.id, fingerprint };
  }

  const current = await client.query<ProductAccountRow>(
    `SELECT id, principal_id, product_account_ref_hash,
            fingerprint_key_version, status
       FROM platform_product_accounts
      WHERE tenant_id = $1 AND principal_id = $2 AND product = $3
        AND status <> 'closed'
      ORDER BY bound_at DESC
      LIMIT 1
      FOR UPDATE`,
    [input.tenantId, input.principalId, input.product],
  );
  if (current.rows[0]) {
    if (current.rows[0].status !== "active") fail("product_account_not_active");
    fail("product_account_ref_mismatch");
  }

  try {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO platform_product_accounts
         (tenant_id, principal_id, product, product_account_ref_hash,
          fingerprint_key_version, binding_source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.tenantId,
        input.principalId,
        input.product,
        fingerprint,
        IDENTITY_LINK_FINGERPRINT_KEY_VERSION,
        input.bindingSource,
      ],
    );
    return { id: inserted.rows[0].id, fingerprint };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") fail("product_account_bound_elsewhere");
    throw error;
  }
}

export type StartedProductAccountLink = Readonly<{
  linkTransactionId: string;
  state: string;
  proofVerifier: string;
  expiresAt: Date;
  requestedScopes: readonly MentorExchangeReadScope[];
}>;

export async function startProductAccountLinkingTx(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    sourceProduct: TecpeyProductAccount;
    sourceExternalAccountRef: string;
    targetProduct: TecpeyProductAccount;
    targetExternalAccountRef: string;
    redirectUri: string;
    allowedRedirectUris: readonly string[];
    scopes: readonly string[];
    ttlSeconds?: number;
    key?: Buffer;
    prepared?: PreparedLinkCeremony;
  },
): Promise<StartedProductAccountLink> {
  if (input.sourceProduct === input.targetProduct) {
    fail("source_and_target_product_must_differ");
  }

  const prepared = input.prepared ?? prepareProductAccountLinkCeremony({
    redirectUri: input.redirectUri,
    allowedRedirectUris: input.allowedRedirectUris,
    scopes: input.scopes,
    ttlSeconds: input.ttlSeconds,
  });
  const source = await ensureProductAccountBindingTx(client, {
    tenantId: input.tenantId,
    principalId: input.principalId,
    product: input.sourceProduct,
    externalAccountRef: input.sourceExternalAccountRef,
    bindingSource: "native",
    key: input.key,
  });
  const targetFingerprint = fingerprintProductAccountRef({
    tenantId: input.tenantId,
    product: input.targetProduct,
    externalAccountRef: input.targetExternalAccountRef,
    key: input.key,
  });

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO product_account_link_transactions
       (tenant_id, principal_id, source_product_account_id,
        source_product, target_product, target_account_ref_hash,
        target_fingerprint_key_version, state_hash, proof_challenge_hash,
        redirect_uri_hash, requested_scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.tenantId,
      input.principalId,
      source.id,
      input.sourceProduct,
      input.targetProduct,
      targetFingerprint,
      IDENTITY_LINK_FINGERPRINT_KEY_VERSION,
      prepared.stateHash,
      prepared.proofChallengeHash,
      prepared.redirectUriHash,
      [...prepared.requestedScopes],
      prepared.expiresAt,
    ],
  );

  return Object.freeze({
    linkTransactionId: inserted.rows[0].id,
    state: prepared.state,
    proofVerifier: prepared.proofVerifier,
    expiresAt: prepared.expiresAt,
    requestedScopes: prepared.requestedScopes,
  });
}

export async function startProductAccountLinking(
  input: Parameters<typeof startProductAccountLinkingTx>[1],
): Promise<StartedProductAccountLink> {
  const result = await withTx((client) => startProductAccountLinkingTx(client, input));
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}

type LinkRow = {
  id: string;
  principal_id: string;
  source_product: TecpeyProductAccount;
  target_product: TecpeyProductAccount;
  target_account_ref_hash: string;
  target_fingerprint_key_version: number;
  proof_challenge_hash: string;
  redirect_uri_hash: string;
  requested_scopes: string[];
  status: string;
  expires_at: Date;
  target_product_account_id: string | null;
};

async function lockLinkByStateTx(
  client: PoolClient,
  tenantId: string,
  state: string,
): Promise<LinkRow> {
  if (typeof state !== "string" || state.length < 40 || state.length > 160) {
    fail("ceremony_state_invalid");
  }
  const result = await client.query<LinkRow>(
    `SELECT id, principal_id, source_product, target_product,
            target_account_ref_hash, target_fingerprint_key_version,
            proof_challenge_hash, redirect_uri_hash, requested_scopes,
            status, expires_at, target_product_account_id
       FROM product_account_link_transactions
      WHERE tenant_id = $1 AND state_hash = $2
      LIMIT 1
      FOR UPDATE`,
    [tenantId, sha256Hex(state)],
  );
  const row = result.rows[0];
  if (!row) fail("ceremony_not_found");
  if (new Date(row.expires_at).getTime() <= Date.now()) fail("ceremony_expired");
  return row;
}

export async function verifyTargetProductAccountTx(
  client: PoolClient,
  input: {
    tenantId: string;
    state: string;
    targetExternalAccountRef: string;
    key?: Buffer;
  },
): Promise<{
  linkTransactionId: string;
  principalId: string;
  targetProductAccountId: string;
  requestedScopes: readonly MentorExchangeReadScope[];
}> {
  const link = await lockLinkByStateTx(client, input.tenantId, input.state);
  if (link.status !== "pending") fail("ceremony_status_invalid");

  const targetFingerprint = fingerprintProductAccountRef({
    tenantId: input.tenantId,
    product: link.target_product,
    externalAccountRef: input.targetExternalAccountRef,
    key: input.key,
  });
  if (
    link.target_fingerprint_key_version !== IDENTITY_LINK_FINGERPRINT_KEY_VERSION ||
    !safeHexEqual(targetFingerprint, link.target_account_ref_hash)
  ) {
    fail("ceremony_target_mismatch");
  }

  const target = await ensureProductAccountBindingTx(client, {
    tenantId: input.tenantId,
    principalId: link.principal_id,
    product: link.target_product,
    externalAccountRef: input.targetExternalAccountRef,
    bindingSource: "account_linking",
    key: input.key,
  });
  await client.query(
    `UPDATE product_account_link_transactions
        SET target_product_account_id = $3, status = 'target_verified'
      WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, link.id, target.id],
  );

  return {
    linkTransactionId: link.id,
    principalId: link.principal_id,
    targetProductAccountId: target.id,
    requestedScopes: canonicalizeMentorExchangeReadScopes(link.requested_scopes),
  };
}

export async function verifyTargetProductAccount(
  input: Parameters<typeof verifyTargetProductAccountTx>[1],
) {
  const result = await withTx((client) => verifyTargetProductAccountTx(client, input));
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}

export async function approveProductAccountLinkTx(
  client: PoolClient,
  input: { tenantId: string; state: string },
): Promise<{ linkTransactionId: string; principalId: string }> {
  const link = await lockLinkByStateTx(client, input.tenantId, input.state);
  if (link.status !== "target_verified" || !link.target_product_account_id) {
    fail("ceremony_status_invalid");
  }
  await client.query(
    `UPDATE product_account_link_transactions SET status = 'approved'
      WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, link.id],
  );
  return { linkTransactionId: link.id, principalId: link.principal_id };
}

export async function approveProductAccountLink(
  input: Parameters<typeof approveProductAccountLinkTx>[1],
) {
  const result = await withTx((client) => approveProductAccountLinkTx(client, input));
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}

export async function completeProductAccountLinkTx(
  client: PoolClient,
  input: {
    tenantId: string;
    state: string;
    proofVerifier: string;
    redirectUri: string;
    allowedRedirectUris: readonly string[];
  },
): Promise<{
  linkTransactionId: string;
  principalId: string;
  exchangeProductAccountId: string;
  requestedScopes: readonly MentorExchangeReadScope[];
}> {
  const link = await lockLinkByStateTx(client, input.tenantId, input.state);
  if (link.status !== "approved" || !link.target_product_account_id) {
    fail("ceremony_status_invalid");
  }
  if (
    typeof input.proofVerifier !== "string" ||
    input.proofVerifier.length < 40 ||
    !safeHexEqual(sha256Hex(input.proofVerifier), link.proof_challenge_hash)
  ) {
    fail("proof_verifier_invalid");
  }
  const redirectUri = assertExactRedirectUriAllowed(
    input.redirectUri,
    input.allowedRedirectUris,
  );
  if (!safeHexEqual(sha256Hex(redirectUri), link.redirect_uri_hash)) {
    fail("redirect_uri_mismatch");
  }

  await client.query(
    `UPDATE product_account_link_transactions SET status = 'completed'
      WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, link.id],
  );

  const account = await client.query<{ id: string }>(
    `SELECT id FROM platform_product_accounts
      WHERE tenant_id = $1 AND principal_id = $2 AND product = 'exchange'
        AND status = 'active'
      ORDER BY bound_at DESC LIMIT 1`,
    [input.tenantId, link.principal_id],
  );
  const exchangeProductAccountId = account.rows[0]?.id;
  if (!exchangeProductAccountId) fail("product_account_not_active");

  return {
    linkTransactionId: link.id,
    principalId: link.principal_id,
    exchangeProductAccountId,
    requestedScopes: canonicalizeMentorExchangeReadScopes(link.requested_scopes),
  };
}

export async function completeProductAccountLink(
  input: Parameters<typeof completeProductAccountLinkTx>[1],
) {
  const result = await withTx((client) => completeProductAccountLinkTx(client, input));
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}

export type IdentityAssuranceStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "expired"
  | "revoked";

export async function appendIdentityAssuranceTx(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    exchangeProductAccountId: string;
    status: IdentityAssuranceStatus;
    assuranceLevel: string;
    jurisdiction: string;
    policyVersion?: string;
    providerSubjectRef?: string;
    verifiedAt?: Date;
    expiresAt?: Date;
    supersedesId?: string;
    key?: Buffer;
  },
): Promise<{ id: string; eventSequence: string }> {
  if ((input.status === "revoked" || input.status === "expired") && !input.supersedesId) {
    fail("assurance_supersession_required");
  }
  const providerHash = input.providerSubjectRef
    ? fingerprintProviderSubjectRef({
        tenantId: input.tenantId,
        providerSubjectRef: input.providerSubjectRef,
        key: input.key,
      })
    : null;
  const verifiedAt = input.status === "verified"
    ? input.verifiedAt ?? new Date()
    : input.verifiedAt ?? null;

  const inserted = await client.query<{ id: string; event_sequence: string }>(
    `INSERT INTO identity_assurance_records
       (tenant_id, principal_id, exchange_product_account_id,
        provider_subject_ref_hash, provider_fingerprint_key_version,
        status, assurance_level, jurisdiction, policy_version,
        verified_at, expires_at, supersedes_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, event_sequence::text`,
    [
      input.tenantId,
      input.principalId,
      input.exchangeProductAccountId,
      providerHash,
      providerHash ? IDENTITY_LINK_FINGERPRINT_KEY_VERSION : null,
      input.status,
      input.assuranceLevel,
      input.jurisdiction,
      input.policyVersion ?? IDENTITY_LINKING_POLICY_VERSION,
      verifiedAt,
      input.expiresAt ?? null,
      input.supersedesId ?? null,
    ],
  );
  return {
    id: inserted.rows[0].id,
    eventSequence: inserted.rows[0].event_sequence,
  };
}

export async function appendIdentityAssurance(
  input: Parameters<typeof appendIdentityAssuranceTx>[1],
) {
  const result = await withTx((client) => appendIdentityAssuranceTx(client, input));
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}

function assertPurposeForService(
  receivingService: ProductDataReceivingService,
  purpose: ProductDataPurpose,
): void {
  const valid = receivingService === "mentor"
    ? purpose === "mentor_personalization" || purpose === "mentor_risk_coaching"
    : purpose === "account_linking" || purpose === "cross_product_profile";
  if (!valid) fail("invalid_consent_purpose");
}

type ConsentEventRow = {
  id: string;
  event_sequence: string;
  link_transaction_id: string;
  exchange_product_account_id: string;
  receiving_service: ProductDataReceivingService;
  purpose: ProductDataPurpose;
  scope: MentorExchangeReadScope;
  status: "granted" | "revoked";
  policy_version: string;
  jurisdiction: string | null;
  expires_at: Date | null;
};

export async function appendProductDataConsentTx(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    linkTransactionId: string;
    exchangeProductAccountId: string;
    receivingService: ProductDataReceivingService;
    purpose: ProductDataPurpose;
    scope: string;
    status: "granted" | "revoked";
    correlationId: string;
    idempotencyKey: string;
    jurisdiction?: string;
    expiresAt?: Date;
    policyVersion?: string;
  },
): Promise<{ id: string; eventSequence: string; replayed: boolean }> {
  const [scope] = canonicalizeMentorExchangeReadScopes([input.scope]);
  assertPurposeForService(input.receivingService, input.purpose);

  const existing = await client.query<ConsentEventRow>(
    `SELECT id, event_sequence::text, link_transaction_id,
            exchange_product_account_id, receiving_service, purpose, scope,
            status, policy_version, jurisdiction, expires_at
       FROM product_data_consent_events
      WHERE tenant_id = $1 AND principal_id = $2 AND idempotency_key = $3
      LIMIT 1`,
    [input.tenantId, input.principalId, input.idempotencyKey],
  );
  const row = existing.rows[0];
  const policyVersion = input.policyVersion ?? IDENTITY_LINKING_POLICY_VERSION;
  if (row) {
    const same =
      row.link_transaction_id === input.linkTransactionId &&
      row.exchange_product_account_id === input.exchangeProductAccountId &&
      row.receiving_service === input.receivingService &&
      row.purpose === input.purpose &&
      row.scope === scope &&
      row.status === input.status &&
      row.policy_version === policyVersion &&
      (row.jurisdiction ?? null) === (input.jurisdiction ?? null) &&
      (row.expires_at?.toISOString() ?? null) === (input.expiresAt?.toISOString() ?? null);
    if (!same) fail("idempotency_conflict");
    return { id: row.id, eventSequence: row.event_sequence, replayed: true };
  }

  const inserted = await client.query<{ id: string; event_sequence: string }>(
    `INSERT INTO product_data_consent_events
       (tenant_id, principal_id, link_transaction_id,
        exchange_product_account_id, receiving_service, purpose, scope,
        status, policy_version, jurisdiction, correlation_id,
        idempotency_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, event_sequence::text`,
    [
      input.tenantId,
      input.principalId,
      input.linkTransactionId,
      input.exchangeProductAccountId,
      input.receivingService,
      input.purpose,
      scope,
      input.status,
      policyVersion,
      input.jurisdiction ?? null,
      input.correlationId,
      input.idempotencyKey,
      input.expiresAt ?? null,
    ],
  );
  return {
    id: inserted.rows[0].id,
    eventSequence: inserted.rows[0].event_sequence,
    replayed: false,
  };
}

export async function appendProductDataConsent(
  input: Parameters<typeof appendProductDataConsentTx>[1],
) {
  const result = await withTx((client) => appendProductDataConsentTx(client, input));
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}

export type MentorExchangeAuthorizationSnapshot = Readonly<{
  connected: boolean;
  exchangeProductAccountId: string | null;
  scopes: readonly MentorExchangeReadScope[];
  assurance: null | Readonly<{
    status: "verified";
    assuranceLevel: string;
    jurisdiction: string;
    verifiedAt: Date;
    expiresAt: Date | null;
  }>;
}>;

export async function readMentorExchangeAuthorizationSnapshot(
  input: { tenantId: string; principalId: string },
): Promise<MentorExchangeAuthorizationSnapshot> {
  const result = await withDb(async (client) => {
    const consents = await client.query<{
      exchange_product_account_id: string;
      scope: MentorExchangeReadScope;
    }>(
      `SELECT exchange_product_account_id, scope
         FROM product_data_effective_consents
        WHERE tenant_id = $1 AND principal_id = $2
          AND receiving_service = 'mentor'
        ORDER BY scope ASC`,
      [input.tenantId, input.principalId],
    );
    const assurance = await client.query<{
      assurance_level: string;
      jurisdiction: string;
      verified_at: Date;
      expires_at: Date | null;
      exchange_product_account_id: string;
    }>(
      `SELECT assurance_level, jurisdiction, verified_at, expires_at,
              exchange_product_account_id
         FROM identity_effective_assurance
        WHERE tenant_id = $1 AND principal_id = $2
        LIMIT 1`,
      [input.tenantId, input.principalId],
    );

    const accountIds = new Set(consents.rows.map((row) => row.exchange_product_account_id));
    const exchangeProductAccountId = accountIds.size === 1
      ? [...accountIds][0]
      : assurance.rows[0]?.exchange_product_account_id ?? null;
    const scopes = canonicalizeMentorExchangeReadScopes(
      consents.rows.map((row) => row.scope),
    );
    const assuranceRow = assurance.rows[0];
    return Object.freeze({
      connected: Boolean(exchangeProductAccountId && scopes.length > 0),
      exchangeProductAccountId,
      scopes: Object.freeze(scopes),
      assurance: assuranceRow
        ? Object.freeze({
            status: "verified" as const,
            assuranceLevel: assuranceRow.assurance_level,
            jurisdiction: assuranceRow.jurisdiction,
            verifiedAt: new Date(assuranceRow.verified_at),
            expiresAt: assuranceRow.expires_at ? new Date(assuranceRow.expires_at) : null,
          })
        : null,
    });
  });
  if (!result.enabled) fail("database_unavailable");
  return result.value;
}
