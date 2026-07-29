import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { Redis } from "ioredis";
import { PLATFORM } from "../../lib/platform-config";
import { withDb } from "../../lib/db";
import { prepareRefreshToken } from "../../lib/security/refresh-tokens";
import { admitSessionAuthority } from "../../lib/security/session-authority";
import {
  hashSensitiveAuditRequest,
  type SensitiveMutationAuditEvent,
} from "../../lib/security/sensitive-mutation-audit";
import {
  extractExpFromToken,
  extractJtiFromToken,
  signUnifiedSession,
} from "../../lib/unified-session";

export type BoundSessionFixture = {
  accessToken: string;
  accessJti: string;
  refreshToken: string;
  refreshJti: string;
  familyId: string;
  knownDeviceId: string;
};

export function sessionAudit(
  userId: string,
  action: string,
): Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
> {
  const correlationId = `route-test-${randomUUID()}`;
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorType: "user",
    actorId: userId,
    correlationId,
    requestHash: hashSensitiveAuditRequest({ action, userId, correlationId }),
  };
}

export async function issueBoundSession(input: {
  userId: string;
  deviceInfo: string;
  ip: string;
}): Promise<BoundSessionFixture> {
  const accessToken = await signUnifiedSession({
    accountId: input.userId,
    studentId: null,
    email: `${input.userId}@tecpey.invalid`,
    displayName: "Session Authority Route Test",
    username: `session-${randomUUID()}`,
  });
  const accessJti = extractJtiFromToken(accessToken);
  const accessExp = extractExpFromToken(accessToken);
  assert.ok(accessJti);
  assert.ok(accessExp);

  const familyId = randomUUID();
  const refresh = await prepareRefreshToken({
    userId: input.userId,
    familyId,
    deviceInfo: input.deviceInfo,
    ip: input.ip,
  });
  assert.ok(refresh);

  const admitted = await admitSessionAuthority({
    userId: input.userId,
    access: {
      jti: accessJti,
      userId: input.userId,
      expiresAt: new Date(accessExp * 1000),
    },
    refresh,
    deviceInfo: input.deviceInfo,
    ip: input.ip,
    method: "password",
    audit: sessionAudit(input.userId, "session.issue"),
  });

  return {
    accessToken,
    accessJti,
    refreshToken: admitted.refreshToken,
    refreshJti: refresh.jti,
    familyId,
    knownDeviceId: admitted.knownDeviceId,
  };
}

export async function cleanupBoundSessions(input: {
  userId: string;
  accessJtis: string[];
  redis?: Redis | null;
}): Promise<void> {
  const deleted = await withDb(async (client) => {
    if (input.accessJtis.length > 0) {
      await client.query(
        "DELETE FROM session_revocation_outbox WHERE session_jti = ANY($1::text[])",
        [input.accessJtis],
      );
    }
    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [input.userId]);
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [input.userId]);
    await client.query("DELETE FROM refresh_token_families WHERE user_id = $1", [input.userId]);
    await client.query("DELETE FROM known_devices WHERE user_id = $1", [input.userId]);
    return true;
  });
  assert.equal(deleted.enabled, true);
  if (input.redis && input.accessJtis.length > 0) {
    await input.redis.del(...input.accessJtis.map((jti) => `tecpey:revoked:jti:${jti}`));
  }
}
