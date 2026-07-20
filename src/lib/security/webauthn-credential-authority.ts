import {
  createHash,
  createVerify,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";

const WEBAUTHN_POLICY_VERSION = "webauthn-credential-v1";
const P256_SPKI_PREFIX = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d03010703420004",
  "hex",
);

export type WebAuthnAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type WebAuthnAuthenticationAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "correlationId" | "requestHash"
>;

export type WebAuthnCredentialView = {
  id: string;
  credentialId: string;
  deviceName: string;
  aaguid: string | null;
  transports: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
};

type RegistrationResponse = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
  type: "public-key";
  transports?: string[];
};

type AuthenticationResponse = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  type: "public-key";
};

type AuthData = {
  rpIdHash: Buffer;
  flags: {
    up: boolean;
    uv: boolean;
    be: boolean;
    bs: boolean;
    at: boolean;
    ed: boolean;
  };
  signCount: number;
  aaguid?: Buffer;
  credentialId?: Buffer;
  credentialPublicKey?: Buffer;
};

type CredentialRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_name: string;
  is_active: boolean;
};

type RegistrationResult =
  | { ok: true; credentialId: string; aaguid: string }
  | { ok: false; reason: string };

type AuthenticationResult =
  | { ok: true; userId: string; credentialId: string }
  | { ok: false; reason: string };

type CredentialMutationResult =
  | { ok: true }
  | { ok: false; status: "not_found" };

function getRpConfig(): { rpId: string; origins: string[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const customRpId = process.env.WEBAUTHN_RP_ID;
  if (customRpId) {
    return {
      rpId: customRpId,
      origins: (process.env.WEBAUTHN_ORIGINS ?? siteUrl)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
  try {
    const url = new URL(siteUrl);
    return { rpId: url.hostname, origins: [url.origin] };
  } catch {
    return { rpId: "localhost", origins: ["http://localhost:3000"] };
  }
}

function assertAuditActor(userId: string, audit: WebAuthnAuditContext): void {
  if (!userId || audit.actorId !== userId) {
    throw new Error("webauthn_audit_actor_mismatch");
  }
  if (!["student", "user", "admin"].includes(audit.actorType)) {
    throw new Error("webauthn_audit_actor_type_invalid");
  }
}

export function fingerprintWebAuthnCredential(credentialId: string): string {
  return createHash("sha256")
    .update("tecpey-webauthn-credential-v1\0")
    .update(credentialId)
    .digest("hex");
}

function fingerprintLabel(label: string): string {
  return createHash("sha256")
    .update("tecpey-webauthn-label-v1\0")
    .update(label)
    .digest("hex");
}

class CborReader {
  private position = 0;

  constructor(private readonly buffer: Buffer) {}

  private readLength(additionalInfo: number): number {
    if (additionalInfo < 24) return additionalInfo;
    if (additionalInfo === 24) return this.buffer[this.position++];
    if (additionalInfo === 25) {
      const value = this.buffer.readUInt16BE(this.position);
      this.position += 2;
      return value;
    }
    throw new Error("unsupported_cbor_length");
  }

  readItem(): unknown {
    const byte = this.buffer[this.position++];
    const majorType = byte >> 5;
    const additionalInfo = byte & 0x1f;
    if (majorType === 0) return this.readLength(additionalInfo);
    if (majorType === 1) return -1 - this.readLength(additionalInfo);
    if (majorType === 2) {
      const length = this.readLength(additionalInfo);
      const bytes = this.buffer.subarray(this.position, this.position + length);
      this.position += length;
      return Buffer.from(bytes);
    }
    if (majorType === 5) {
      const count = this.readLength(additionalInfo);
      const map = new Map<number, unknown>();
      for (let index = 0; index < count; index += 1) {
        const key = this.readItem();
        const value = this.readItem();
        if (typeof key === "number") map.set(key, value);
      }
      return map;
    }
    throw new Error("unsupported_cbor_type");
  }
}

function coseToSpkiDer(coseBytes: Buffer): Buffer | null {
  try {
    const decoded = new CborReader(coseBytes).readItem();
    if (!(decoded instanceof Map)) return null;
    const keyType = decoded.get(1);
    const algorithm = decoded.get(3);
    const x = decoded.get(-2);
    const y = decoded.get(-3);
    if (keyType !== 2 || algorithm !== -7) return null;
    if (!(x instanceof Buffer) || !(y instanceof Buffer)) return null;
    if (x.length !== 32 || y.length !== 32) return null;
    return Buffer.concat([P256_SPKI_PREFIX, x, y]);
  } catch {
    return null;
  }
}

function parseAuthenticatorData(buffer: Buffer): AuthData | null {
  if (buffer.length < 37) return null;
  const rpIdHash = buffer.subarray(0, 32);
  const flagByte = buffer[32];
  const flags = {
    up: Boolean(flagByte & 0x01),
    uv: Boolean(flagByte & 0x04),
    be: Boolean(flagByte & 0x08),
    bs: Boolean(flagByte & 0x10),
    at: Boolean(flagByte & 0x40),
    ed: Boolean(flagByte & 0x80),
  };
  const signCount = buffer.readUInt32BE(33);
  let offset = 37;
  let aaguid: Buffer | undefined;
  let credentialId: Buffer | undefined;
  let credentialPublicKey: Buffer | undefined;
  if (flags.at) {
    if (buffer.length < offset + 18) return null;
    aaguid = buffer.subarray(offset, offset + 16);
    offset += 16;
    const credentialLength = buffer.readUInt16BE(offset);
    offset += 2;
    if (buffer.length < offset + credentialLength) return null;
    credentialId = buffer.subarray(offset, offset + credentialLength);
    offset += credentialLength;
    credentialPublicKey = buffer.subarray(offset);
  }
  return {
    rpIdHash,
    flags,
    signCount,
    aaguid,
    credentialId,
    credentialPublicKey,
  };
}

function extractAuthDataFromAttestationObject(buffer: Buffer): Buffer {
  const keyBytes = Buffer.from([
    0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61,
  ]);
  for (let index = 0; index < buffer.length - keyBytes.length - 3; index += 1) {
    if (!buffer.subarray(index, index + keyBytes.length).equals(keyBytes)) continue;
    const valueOffset = index + keyBytes.length;
    const header = buffer[valueOffset];
    if ((header >> 5) !== 2) continue;
    const additionalInfo = header & 0x1f;
    let length: number;
    let dataStart: number;
    if (additionalInfo < 24) {
      length = additionalInfo;
      dataStart = valueOffset + 1;
    } else if (additionalInfo === 24) {
      length = buffer[valueOffset + 1];
      dataStart = valueOffset + 2;
    } else if (additionalInfo === 25) {
      length = buffer.readUInt16BE(valueOffset + 1);
      dataStart = valueOffset + 3;
    } else {
      continue;
    }
    if (dataStart + length <= buffer.length) {
      return buffer.subarray(dataStart, dataStart + length);
    }
  }
  throw new Error("authenticator_data_not_found");
}

function verifyEs256Signature(input: {
  spkiDer: Buffer;
  authenticatorData: Buffer;
  clientDataJsonRaw: Buffer;
  signature: Buffer;
}): boolean {
  try {
    const clientDataHash = createHash("sha256")
      .update(input.clientDataJsonRaw)
      .digest();
    const verifier = createVerify("SHA256");
    verifier.update(Buffer.concat([input.authenticatorData, clientDataHash]));
    return verifier.verify(
      { key: input.spkiDer, format: "der", type: "spki" },
      input.signature,
    );
  } catch {
    return false;
  }
}

async function rejectRegistration(
  audit: WebAuthnAuditContext,
  userId: string,
  reason: string,
  resourceId = userId,
): Promise<RegistrationResult> {
  const result = await withTx(async (client) => {
    await writeSensitiveMutationAuditTx(client, {
      ...audit,
      action: "credential.webauthn.register",
      resourceType: "credential_webauthn",
      resourceId,
      outcome: "rejected",
      metadata: {
        policyVersion: WEBAUTHN_POLICY_VERSION,
        reason,
      },
    });
    return { ok: false, reason } as const;
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function recordWebAuthnRegistrationRejection(input: {
  userId: string;
  reason: string;
  audit: WebAuthnAuditContext;
}): Promise<void> {
  assertAuditActor(input.userId, input.audit);
  await rejectRegistration(input.audit, input.userId, input.reason);
}

export async function registerVerifiedWebAuthnCredential(input: {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceName: string;
  aaguid: string | null;
  transports: string[];
  backupEligible: boolean;
  backupState: boolean;
  audit: WebAuthnAuditContext;
}): Promise<RegistrationResult> {
  assertAuditActor(input.userId, input.audit);
  const credentialFingerprint = fingerprintWebAuthnCredential(input.credentialId);
  const result = await withTx(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO webauthn_credentials
         (user_id, credential_id, public_key, counter, device_name, aaguid, transports)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (credential_id) DO NOTHING
       RETURNING id`,
      [
        input.userId,
        input.credentialId,
        input.publicKey,
        input.counter,
        input.deviceName.slice(0, 100),
        input.aaguid,
        input.transports.slice(0, 16),
      ],
    );
    const insertedId = inserted.rows[0]?.id;
    if (!insertedId) {
      const existing = await client.query<{ id: string }>(
        `SELECT id
           FROM webauthn_credentials
          WHERE credential_id = $1
          LIMIT 1
          FOR UPDATE`,
        [input.credentialId],
      );
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "credential.webauthn.register",
        resourceType: "credential_webauthn",
        resourceId: existing.rows[0]?.id ?? credentialFingerprint,
        outcome: "rejected",
        metadata: {
          policyVersion: WEBAUTHN_POLICY_VERSION,
          reason: "credential_conflict",
          credentialFingerprint,
        },
      });
      return { ok: false, reason: "credential_conflict" } as const;
    }

    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.webauthn.register",
      resourceType: "credential_webauthn",
      resourceId: insertedId,
      outcome: "success",
      metadata: {
        policyVersion: WEBAUTHN_POLICY_VERSION,
        credentialFingerprint,
        initialCounter: input.counter,
        transportCount: input.transports.length,
        aaguidPresent: Boolean(input.aaguid),
        backupEligible: input.backupEligible,
        backupState: input.backupState,
      },
    });
    return { ok: true, credentialId: input.credentialId, aaguid: input.aaguid ?? "" } as const;
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function verifyAndRegisterWebAuthnCredential(input: {
  userId: string;
  expectedChallenge: string;
  response: RegistrationResponse;
  deviceName?: string;
  audit: WebAuthnAuditContext;
}): Promise<RegistrationResult> {
  assertAuditActor(input.userId, input.audit);
  if (!input.response || input.response.type !== "public-key") {
    return rejectRegistration(input.audit, input.userId, "invalid_credential_type");
  }

  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
  let rawClientData: Buffer;
  try {
    rawClientData = Buffer.from(input.response.response.clientDataJSON, "base64url");
    if (rawClientData.length === 0 || rawClientData.length > 16_384) {
      return rejectRegistration(input.audit, input.userId, "invalid_client_data_json");
    }
    clientData = JSON.parse(rawClientData.toString("utf8"));
  } catch {
    return rejectRegistration(input.audit, input.userId, "invalid_client_data_json");
  }

  const { rpId, origins } = getRpConfig();
  if (clientData.type !== "webauthn.create") {
    return rejectRegistration(input.audit, input.userId, "wrong_type");
  }
  if (clientData.challenge !== input.expectedChallenge) {
    return rejectRegistration(input.audit, input.userId, "invalid_challenge");
  }
  if (typeof clientData.origin !== "string" || !origins.includes(clientData.origin)) {
    return rejectRegistration(input.audit, input.userId, "origin_mismatch");
  }

  let authenticatorDataBuffer: Buffer;
  try {
    const attestationObject = Buffer.from(
      input.response.response.attestationObject,
      "base64url",
    );
    if (attestationObject.length === 0 || attestationObject.length > 131_072) {
      return rejectRegistration(input.audit, input.userId, "invalid_attestation_object");
    }
    authenticatorDataBuffer = extractAuthDataFromAttestationObject(attestationObject);
  } catch {
    return rejectRegistration(input.audit, input.userId, "invalid_attestation_object");
  }

  const authData = parseAuthenticatorData(authenticatorDataBuffer);
  if (!authData) return rejectRegistration(input.audit, input.userId, "invalid_auth_data");
  const expectedRpIdHash = createHash("sha256").update(rpId).digest();
  if (!timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
    return rejectRegistration(input.audit, input.userId, "rp_id_mismatch");
  }
  if (!authData.flags.up) {
    return rejectRegistration(input.audit, input.userId, "user_not_present");
  }
  if (!authData.flags.uv) {
    return rejectRegistration(input.audit, input.userId, "user_not_verified");
  }
  if (!authData.credentialId || !authData.credentialPublicKey) {
    return rejectRegistration(input.audit, input.userId, "no_credential_data");
  }
  if (!coseToSpkiDer(authData.credentialPublicKey)) {
    return rejectRegistration(input.audit, input.userId, "unsupported_key_algorithm");
  }

  const credentialId = authData.credentialId.toString("base64url");
  if (
    input.response.rawId !== credentialId ||
    input.response.id !== credentialId
  ) {
    return rejectRegistration(input.audit, input.userId, "credential_id_mismatch");
  }
  const aaguid = authData.aaguid?.toString("hex") ?? null;
  return registerVerifiedWebAuthnCredential({
    userId: input.userId,
    credentialId,
    publicKey: authData.credentialPublicKey.toString("base64url"),
    counter: authData.signCount,
    deviceName: (input.deviceName ?? "Authenticator").slice(0, 100),
    aaguid,
    transports: Array.isArray(input.response.transports)
      ? input.response.transports.filter((value): value is string => typeof value === "string")
      : [],
    backupEligible: authData.flags.be,
    backupState: authData.flags.bs,
    audit: input.audit,
  });
}

async function rejectAuthenticationTx(
  client: PoolClient,
  credential: CredentialRow,
  audit: WebAuthnAuthenticationAuditContext,
  reason: string,
): Promise<AuthenticationResult> {
  await writeSensitiveMutationAuditTx(client, {
    ...audit,
    actorType: "user",
    actorId: credential.user_id,
    action: "credential.webauthn.authenticate",
    resourceType: "credential_webauthn",
    resourceId: credential.id,
    outcome: "rejected",
    metadata: {
      policyVersion: WEBAUTHN_POLICY_VERSION,
      reason,
      credentialFingerprint: fingerprintWebAuthnCredential(credential.credential_id),
    },
  });
  return { ok: false, reason };
}

async function applyCounterTransitionTx(
  client: PoolClient,
  credential: CredentialRow,
  nextCounter: number,
  audit: WebAuthnAuthenticationAuditContext,
): Promise<AuthenticationResult> {
  const credentialFingerprint = fingerprintWebAuthnCredential(credential.credential_id);
  const counterRollback =
    (credential.counter !== 0 || nextCounter !== 0) &&
    nextCounter <= credential.counter;
  if (counterRollback) {
    await writeSensitiveMutationAuditTx(client, {
      ...audit,
      actorType: "user",
      actorId: credential.user_id,
      action: "credential.webauthn.counter_rollback",
      resourceType: "credential_webauthn",
      resourceId: credential.id,
      outcome: "rejected",
      metadata: {
        policyVersion: WEBAUTHN_POLICY_VERSION,
        credentialFingerprint,
        storedCounter: credential.counter,
        receivedCounter: nextCounter,
        cloneSuspected: true,
      },
    });
    return { ok: false, reason: "counter_rollback" };
  }

  await client.query(
    `UPDATE webauthn_credentials
        SET counter = $1,
            last_used_at = NOW()
      WHERE id = $2`,
    [nextCounter, credential.id],
  );
  await writeSensitiveMutationAuditTx(client, {
    ...audit,
    actorType: "user",
    actorId: credential.user_id,
    action: "credential.webauthn.authenticate",
    resourceType: "credential_webauthn",
    resourceId: credential.id,
    outcome: "success",
    metadata: {
      policyVersion: WEBAUTHN_POLICY_VERSION,
      credentialFingerprint,
      previousCounter: credential.counter,
      nextCounter,
    },
  });
  return {
    ok: true,
    userId: credential.user_id,
    credentialId: credential.credential_id,
  };
}

export async function commitVerifiedWebAuthnCounterTransition(input: {
  credentialId: string;
  expectedUserId?: string | null;
  nextCounter: number;
  audit: WebAuthnAuthenticationAuditContext;
}): Promise<AuthenticationResult> {
  const result = await withTx(async (client) => {
    const credentialResult = await client.query<CredentialRow>(
      `SELECT id, user_id, credential_id, public_key, counter, device_name, is_active
         FROM webauthn_credentials
        WHERE credential_id = $1
          AND is_active = TRUE
        LIMIT 1
        FOR UPDATE`,
      [input.credentialId],
    );
    const credential = credentialResult.rows[0];
    if (!credential) return { ok: false, reason: "credential_not_found" } as const;
    if (input.expectedUserId && input.expectedUserId !== credential.user_id) {
      return rejectAuthenticationTx(client, credential, input.audit, "user_mismatch");
    }
    return applyCounterTransitionTx(client, credential, input.nextCounter, input.audit);
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function verifyAndAdvanceWebAuthnAuthentication(input: {
  expectedChallenge: string;
  expectedUserId?: string | null;
  response: AuthenticationResponse;
  audit: WebAuthnAuthenticationAuditContext;
}): Promise<AuthenticationResult> {
  if (!input.response || input.response.type !== "public-key") {
    return { ok: false, reason: "invalid_credential_type" };
  }

  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
  let rawClientData: Buffer;
  try {
    rawClientData = Buffer.from(input.response.response.clientDataJSON, "base64url");
    if (rawClientData.length === 0 || rawClientData.length > 16_384) {
      return { ok: false, reason: "invalid_client_data_json" };
    }
    clientData = JSON.parse(rawClientData.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_client_data_json" };
  }

  const { rpId, origins } = getRpConfig();
  if (clientData.type !== "webauthn.get") return { ok: false, reason: "wrong_type" };
  if (clientData.challenge !== input.expectedChallenge) {
    return { ok: false, reason: "invalid_challenge" };
  }
  if (typeof clientData.origin !== "string" || !origins.includes(clientData.origin)) {
    return { ok: false, reason: "origin_mismatch" };
  }
  if (
    typeof input.response.rawId !== "string" ||
    input.response.rawId.length === 0 ||
    input.response.rawId.length > 2_000 ||
    input.response.id !== input.response.rawId
  ) {
    return { ok: false, reason: "credential_id_mismatch" };
  }

  const result = await withTx(async (client) => {
    const credentialResult = await client.query<CredentialRow>(
      `SELECT id, user_id, credential_id, public_key, counter, device_name, is_active
         FROM webauthn_credentials
        WHERE credential_id = $1
          AND is_active = TRUE
        LIMIT 1
        FOR UPDATE`,
      [input.response.rawId],
    );
    const credential = credentialResult.rows[0];
    if (!credential) return { ok: false, reason: "credential_not_found" } as const;
    if (input.expectedUserId && input.expectedUserId !== credential.user_id) {
      return rejectAuthenticationTx(client, credential, input.audit, "user_mismatch");
    }

    let authenticatorDataBuffer: Buffer;
    let signature: Buffer;
    try {
      authenticatorDataBuffer = Buffer.from(
        input.response.response.authenticatorData,
        "base64url",
      );
      signature = Buffer.from(input.response.response.signature, "base64url");
    } catch {
      return rejectAuthenticationTx(client, credential, input.audit, "invalid_auth_data");
    }
    if (
      authenticatorDataBuffer.length === 0 ||
      authenticatorDataBuffer.length > 16_384 ||
      signature.length === 0 ||
      signature.length > 2_048
    ) {
      return rejectAuthenticationTx(client, credential, input.audit, "invalid_auth_data");
    }

    const authData = parseAuthenticatorData(authenticatorDataBuffer);
    if (!authData) {
      return rejectAuthenticationTx(client, credential, input.audit, "invalid_auth_data");
    }
    const expectedRpIdHash = createHash("sha256").update(rpId).digest();
    if (!timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
      return rejectAuthenticationTx(client, credential, input.audit, "rp_id_mismatch");
    }
    if (!authData.flags.up) {
      return rejectAuthenticationTx(client, credential, input.audit, "user_not_present");
    }
    if (!authData.flags.uv) {
      return rejectAuthenticationTx(client, credential, input.audit, "user_not_verified");
    }

    const spkiDer = coseToSpkiDer(Buffer.from(credential.public_key, "base64url"));
    if (!spkiDer) {
      return rejectAuthenticationTx(
        client,
        credential,
        input.audit,
        "unsupported_key_algorithm",
      );
    }
    if (!verifyEs256Signature({
      spkiDer,
      authenticatorData: authenticatorDataBuffer,
      clientDataJsonRaw: rawClientData,
      signature,
    })) {
      return rejectAuthenticationTx(client, credential, input.audit, "signature_invalid");
    }

    return applyCounterTransitionTx(client, credential, authData.signCount, input.audit);
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function listWebAuthnCredentials(
  userId: string,
): Promise<WebAuthnCredentialView[]> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      credential_id: string;
      device_name: string;
      aaguid: string | null;
      transports: string[];
      created_at: Date;
      last_used_at: Date | null;
      is_active: boolean;
    }>(
      `SELECT id, credential_id, device_name, aaguid, transports,
              created_at, last_used_at, is_active
         FROM webauthn_credentials
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      credentialId: row.credential_id,
      deviceName: row.device_name,
      aaguid: row.aaguid,
      transports: row.transports,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      isActive: row.is_active,
    }));
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function renameWebAuthnCredential(input: {
  id: string;
  userId: string;
  name: string;
  audit: WebAuthnAuditContext;
}): Promise<CredentialMutationResult> {
  assertAuditActor(input.userId, input.audit);
  const normalizedName = input.name.trim().slice(0, 100);
  const result = await withTx(async (client) => {
    const selected = await client.query<{
      id: string;
      credential_id: string;
      device_name: string;
    }>(
      `SELECT id, credential_id, device_name
         FROM webauthn_credentials
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        FOR UPDATE`,
      [input.id, input.userId],
    );
    const credential = selected.rows[0];
    if (!credential) return { ok: false, status: "not_found" } as const;
    await client.query(
      `UPDATE webauthn_credentials
          SET device_name = $1
        WHERE id = $2`,
      [normalizedName, credential.id],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.webauthn.rename",
      resourceType: "credential_webauthn",
      resourceId: credential.id,
      outcome: "success",
      metadata: {
        policyVersion: WEBAUTHN_POLICY_VERSION,
        credentialFingerprint: fingerprintWebAuthnCredential(credential.credential_id),
        previousLabelFingerprint: fingerprintLabel(credential.device_name),
        nextLabelFingerprint: fingerprintLabel(normalizedName),
      },
    });
    return { ok: true } as const;
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function revokeWebAuthnCredential(input: {
  id: string;
  userId: string;
  audit: WebAuthnAuditContext;
}): Promise<CredentialMutationResult> {
  assertAuditActor(input.userId, input.audit);
  const result = await withTx(async (client) => {
    const selected = await client.query<{
      id: string;
      credential_id: string;
    }>(
      `SELECT id, credential_id
         FROM webauthn_credentials
        WHERE id = $1
          AND user_id = $2
          AND is_active = TRUE
        LIMIT 1
        FOR UPDATE`,
      [input.id, input.userId],
    );
    const credential = selected.rows[0];
    if (!credential) return { ok: false, status: "not_found" } as const;
    await client.query(
      `UPDATE webauthn_credentials
          SET is_active = FALSE
        WHERE id = $1`,
      [credential.id],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.webauthn.revoke",
      resourceType: "credential_webauthn",
      resourceId: credential.id,
      outcome: "success",
      metadata: {
        policyVersion: WEBAUTHN_POLICY_VERSION,
        credentialFingerprint: fingerprintWebAuthnCredential(credential.credential_id),
      },
    });
    return { ok: true } as const;
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}
