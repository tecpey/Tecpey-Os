import { createHmac, timingSafeEqual } from "node:crypto";

const OFFLINE_SCOPE_VERSION = 1;
const OFFLINE_SCOPE_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const CLOCK_SKEW_MS = 5 * 60 * 1_000;

export type OfflineSyncScope = {
  version: 1;
  tenantId: string;
  studentId: string;
  issuedAt: number;
  expiresAt: number;
};

export type OfflineSyncScopeVerification =
  | { status: "valid"; scope: OfflineSyncScope }
  | { status: "invalid" | "expired" | "unavailable" };

function scopeSecret(): Buffer | null {
  const raw = process.env.TECPEY_OFFLINE_SYNC_SECRET?.trim();
  if (raw && raw.length >= 32) return Buffer.from(raw, "utf8");
  if (process.env.NODE_ENV !== "production") {
    return Buffer.from("tecpey-dev-offline-scope-secret-32chars", "utf8");
  }
  return null;
}

function signature(encodedPayload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function validIdentity(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function issueOfflineSyncScope(input: {
  tenantId: string;
  studentId: string;
  now?: number;
}): { token: string; expiresAt: string } | null {
  const secret = scopeSecret();
  if (!secret) return null;
  if (!validIdentity(input.tenantId, 120) || !validIdentity(input.studentId, 80)) {
    return null;
  }

  const issuedAt = input.now ?? Date.now();
  const payload: OfflineSyncScope = {
    version: OFFLINE_SCOPE_VERSION,
    tenantId: input.tenantId,
    studentId: input.studentId,
    issuedAt,
    expiresAt: issuedAt + OFFLINE_SCOPE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${encoded}.${signature(encoded, secret)}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyOfflineSyncScope(
  token: string,
  now = Date.now(),
): OfflineSyncScopeVerification {
  const secret = scopeSecret();
  if (!secret) return { status: "unavailable" };
  if (typeof token !== "string" || token.length < 40 || token.length > 2_048) {
    return { status: "invalid" };
  }

  const [encoded, submitted, extra] = token.split(".");
  if (!encoded || !submitted || extra) return { status: "invalid" };
  const expected = signature(encoded, secret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const submittedBuffer = Buffer.from(submitted, "utf8");
  if (
    expectedBuffer.length !== submittedBuffer.length ||
    !timingSafeEqual(expectedBuffer, submittedBuffer)
  ) {
    return { status: "invalid" };
  }

  let parsed: Partial<OfflineSyncScope>;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { status: "invalid" };
  }

  if (
    parsed.version !== OFFLINE_SCOPE_VERSION ||
    !validIdentity(parsed.tenantId, 120) ||
    !validIdentity(parsed.studentId, 80) ||
    !Number.isSafeInteger(parsed.issuedAt) ||
    !Number.isSafeInteger(parsed.expiresAt) ||
    parsed.expiresAt! <= parsed.issuedAt! ||
    parsed.expiresAt! - parsed.issuedAt! > OFFLINE_SCOPE_TTL_MS + CLOCK_SKEW_MS ||
    parsed.issuedAt! > now + CLOCK_SKEW_MS
  ) {
    return { status: "invalid" };
  }
  if (parsed.expiresAt! <= now) return { status: "expired" };

  return {
    status: "valid",
    scope: parsed as OfflineSyncScope,
  };
}
