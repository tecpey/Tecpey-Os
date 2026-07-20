// POST /api/auth/webauthn/register/verify
// Verify the authenticator response and transactionally persist the credential
// with mandatory append-only evidence.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";
import {
  recordWebAuthnRegistrationRejection,
  verifyAndRegisterWebAuthnCredential,
  type WebAuthnAuditContext,
} from "@/lib/security/webauthn-credential-authority";
import {
  consumeWebAuthnCeremonyChallenge,
  extractWebAuthnClientChallenge,
} from "@/lib/security/webauthn-ceremony";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
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
  responseEvidence: unknown;
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
      action: "credential.webauthn.register",
      responseEvidence: input.responseEvidence,
    }),
  };
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/register/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "webauthn-reg-verify",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 131_072,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const audit = auditContext({
      req,
      userId,
      actorType: actorType(session),
      responseEvidence: body.response ?? null,
    });
    const challenge = extractWebAuthnClientChallenge(
      body.response?.response?.clientDataJSON,
      "webauthn.create",
    );
    const ceremony = challenge
      ? await consumeWebAuthnCeremonyChallenge(challenge, "registration")
      : null;

    if (!challenge || !ceremony || ceremony.userId !== userId) {
      trackAuthEvent("webauthn_failed");
      try {
        await recordWebAuthnRegistrationRejection({
          userId,
          reason: "invalid_challenge",
          audit,
        });
      } catch {
        return apiError("webauthn_service_unavailable", 503);
      }
      return apiError("invalid_challenge", 400);
    }

    try {
      const result = await verifyAndRegisterWebAuthnCredential({
        userId,
        expectedChallenge: challenge,
        response: body.response,
        deviceName: body.deviceName,
        audit,
      });
      if (!result.ok) {
        trackAuthEvent("webauthn_failed");
        return apiError(result.reason, 400);
      }

      trackAuthEvent("webauthn_registered");
      return apiOk({ credentialId: result.credentialId, aaguid: result.aaguid });
    } catch {
      return apiError("webauthn_service_unavailable", 503);
    }
  });
}
