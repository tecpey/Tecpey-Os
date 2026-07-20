import { readJsonBody } from "@/lib/security/request-body";
// PATCH /api/auth/webauthn/credentials/[id]  — rename a credential
// DELETE /api/auth/webauthn/credentials/[id]  — revoke a credential

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { renameCredential, revokeCredential } from "@/lib/security/webauthn";
import { writeAudit } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/webauthn/credentials/[id] PATCH" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "webauthn-credential-patch", limit: 20, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 8_192,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : null;
    if (!name) return apiError("name_required", 400);

    const ok = await renameCredential(id, userId, name);
    if (!ok) return apiError("credential_not_found", 404);

    writeAudit({
      actorId: userId,
      action: "admin_action",
      ip: getClientIp(req),
      metadata: { event: "webauthn_credential_renamed", credentialId: id, newName: name },
    });

    return apiOk({ renamed: true });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/webauthn/credentials/[id] DELETE" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "webauthn-credential-delete", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const ok = await revokeCredential(id, userId);
    if (!ok) return apiError("credential_not_found", 404);

    writeAudit({
      actorId: userId,
      action: "admin_action",
      ip: getClientIp(req),
      metadata: { event: "webauthn_credential_revoked", credentialId: id },
    });

    return apiOk({ revoked: true });
  });
}
