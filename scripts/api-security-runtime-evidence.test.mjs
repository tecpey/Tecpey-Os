import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectAdminAuthorityCall,
  detectAuditCall,
  detectCsrfCall,
  detectDirectNoStoreEvidence,
  detectPrincipalCall,
  detectRedactionCall,
  detectServiceIdentityEvidence,
  detectSessionCookieWrite,
  runtimeEvidenceSource,
} from "./api-security-runtime-evidence.mjs";

describe("handler runtime security evidence", () => {
  it("does not treat imports as runtime calls", () => {
    const source = `
      import { getCanonicalSession } from "@/lib/auth-session";
      import { verifyCsrfOrigin } from "@/lib/csrf";
      import { writeAudit } from "@/lib/security/audit-log";
      import { apiError } from "@/lib/api-validation";
      export async function POST() { return new Response("ok"); }
    `;
    assert.equal(detectPrincipalCall(source), null);
    assert.equal(detectCsrfCall(source), false);
    assert.equal(detectAuditCall(source), false);
    assert.equal(detectRedactionCall(source), false);
  });

  it("does not treat comments as runtime calls", () => {
    const source = `
      export async function POST(req) {
        // verifyCsrfOrigin(req); getCanonicalSession(req); writeAudit({});
        /* apiError("failed", 500); verifyInternalRequest(req); */
        return new Response("ok");
      }
    `;
    assert.doesNotMatch(runtimeEvidenceSource(source), /verifyCsrfOrigin\(req\)/);
    assert.equal(detectPrincipalCall(source), null);
    assert.equal(detectCsrfCall(source), false);
    assert.equal(detectAuditCall(source), false);
    assert.equal(detectRedactionCall(source), false);
    assert.equal(detectServiceIdentityEvidence(source), false);
  });

  it("recognizes actual principal, CSRF, audit and redaction calls", () => {
    const source = `
      export async function POST(req) {
        if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
        const session = await getCanonicalSession(req, { strictRevocation: true });
        await writeAudit({ actorId: session.userId });
        return apiOk({ ok: true });
      }
    `;
    assert.equal(detectPrincipalCall(source), "getCanonicalSession");
    assert.equal(detectCsrfCall(source), true);
    assert.equal(detectAuditCall(source), true);
    assert.equal(detectRedactionCall(source), true);
  });

  it("recognizes actual admin and service identity authority", () => {
    const admin = `const authorization = await authorizeAdminRequest(req, "system.write");`;
    const service = `const auth = request.headers.get("authorization");`;
    assert.equal(detectAdminAuthorityCall(admin), true);
    assert.equal(detectPrincipalCall(admin), "authorizeAdminRequest");
    assert.equal(detectServiceIdentityEvidence(service), true);
  });

  it("does not treat arbitrary authorization prose as service identity", () => {
    const source = `
      // authorization is mandatory and Bearer credentials may be added later
      const message = "authorization pending";
    `;
    assert.equal(detectServiceIdentityEvidence(source), false);
  });

  it("recognizes direct no-store responses and cookie writes only as calls", () => {
    assert.equal(
      detectDirectNoStoreEvidence(`return apiError("failed", 500, undefined, { "Cache-Control": "private, no-store" });`),
      true,
    );
    assert.equal(detectSessionCookieWrite(`response.cookies.set("session", token);`), true);
    assert.equal(detectSessionCookieWrite(`// response.cookies.set("session", token);`), false);
  });
});
