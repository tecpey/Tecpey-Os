// PATCH /api/auth/webauthn/credentials/[id]  — rename a credential
// DELETE /api/auth/webauthn/credentials/[id] — revoke a credential

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";
import {
  renameWebAuthnCredential,
  revokeWebAuthnCredential,
  type WebAuthnAuditContext,
} from "@/lib/security/webauthn-credential-authority";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

function actorType(session: Awaited<ReturnType<typeof getCanonicalSession>>) {
  if (session.isAdmin) return "admin" as const;
  return session.userId ? "user" as const : "student" as const;
}

function auditContext(input: {
  req: NextRequest;
  userId: string;
  actorType: WebAuthnAuditContext["actorType"];
  action: "credential.webauthn.rename" | "credential.webauthn.revoke";
  credentialId: string;
  evidence?: Record<string, unknown>;
}): WebAuthnAuditContext {
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
      credentialId: input.credentialId,
      ...input.evidence,
    }),
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/webauthn/credentials/[id] PATCH" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "webauthn-credential-patch",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 2_048,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : null;
    if (!name) return apiError("name_required", 400);

    try {
      const result = await renameWebAuthnCredential({
        id,
        userId,
        name,
        audit: auditContext({
          req,
          userId,
          actorType: actorType(session),
          action: "credential.webauthn.rename",
          credentialId: id,
          evidence: { name },
        }),
      });
      if (!result.ok) return apiError("credential_not_found", 404);
      return apiOk({ renamed: true });
    } catch {
      return apiError("webauthn_service_unavailable", 503);
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/webauthn/credentials/[id] DELETE" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "webauthn-credential-delete",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    try {
      const result = await revokeWebAuthnCredential({
        id,
        userId,
        audit: auditContext({
          req,
          userId,
          actorType: actorType(session),
          action: "credential.webauthn.revoke",
          credentialId: id,
        }),
      });
      if (!result.ok) return apiError("credential_not_found", 404);
      return apiOk({ revoked: true });
    } catch {
      return apiError("webauthn_service_unavailable", 503);
    }
  });
}
