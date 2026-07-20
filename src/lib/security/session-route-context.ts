import type { NextRequest } from "next/server";
import { PLATFORM } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import type { SessionAuditContext } from "@/lib/security/session-authority";

export function buildSessionAuditContext(input: {
  req: NextRequest;
  userId: string;
  actorType: SessionAuditContext["actorType"];
  action: string;
  evidence?: Record<string, unknown>;
}): SessionAuditContext {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorType: input.actorType,
    actorId: input.userId,
    correlationId: resolveSensitiveAuditCorrelation(
      input.req.headers.get("x-tecpey-request-id"),
    ),
    requestHash: hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType: input.actorType,
      actorId: input.userId,
      action: input.action,
      ...input.evidence,
    }),
  };
}
