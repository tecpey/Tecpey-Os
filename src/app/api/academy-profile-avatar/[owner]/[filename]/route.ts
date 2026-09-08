import { NextRequest, NextResponse } from "next/server";
import {
  profileAvatarOwnerKey,
  readAcademyProfileAvatar,
} from "@/lib/academy-profile-avatar-storage";
import { getCanonicalSession } from "@/lib/auth-session";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const dynamic = "force-dynamic";

function privateResponse(body: BodyInit | null, init: ResponseInit) {
  const response = new NextResponse(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ owner: string; filename: string }> },
) {
  return withObservability(req, { route: "/api/academy-profile-avatar/[owner]/[filename]" }, async () => {
    const url = new URL(req.url);
    if ([...url.searchParams.keys()].length > 0) {
      return privateResponse(null, { status: 400 });
    }

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (session.authorityDegraded || !session.studentId || !session.isAcademyUser) {
      return privateResponse(null, { status: session.authorityDegraded ? 503 : 404 });
    }

    const limited = await rateLimit(req, {
      namespace: "academy-profile-avatar-read",
      identity: session.studentId,
      limit: 240,
      windowMs: 60_000,
    });
    if (!limited.ok) return privateResponse(null, { status: 429 });

    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(
        req.headers.get("x-tecpey-request-id"),
      ),
    });
    if (!tenantContext.available || tenantContext.principalId !== session.studentId) {
      return privateResponse(null, { status: 503 });
    }

    const { owner, filename } = await context.params;
    // The filesystem owner segment is a one-way student-bound key. Requiring it
    // to match the live, tenant-bound session keeps personal profile photos
    // private even if an old URL leaks into logs or browser history.
    if (owner !== profileAvatarOwnerKey(session.studentId)) {
      return privateResponse(null, { status: 404 });
    }

    const asset = await readAcademyProfileAvatar(owner, filename);
    if (!asset) return privateResponse(null, { status: 404 });

    return privateResponse(Uint8Array.from(asset.bytes).buffer, {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
