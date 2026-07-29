import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectStrictRevocationCall } from "./api-security-runtime-evidence.mjs";

describe("strict revocation runtime evidence", () => {
  it("rejects import-only and comment-only evidence", () => {
    assert.equal(
      detectStrictRevocationCall(`import { loadAdminPrincipal } from "x";`),
      false,
    );
    assert.equal(
      detectStrictRevocationCall(`// getCanonicalSession(req, { strictRevocation: true });`),
      false,
    );
  });

  it("rejects a canonical session call without strict revocation", () => {
    assert.equal(detectStrictRevocationCall(`await getCanonicalSession(req);`), false);
  });

  it("accepts explicit canonical and live admin authority", () => {
    assert.equal(
      detectStrictRevocationCall(
        `await getCanonicalSession(req, { strictRevocation: true });`,
      ),
      true,
    );
    assert.equal(
      detectStrictRevocationCall(`await loadAdminPrincipal(req);`),
      true,
    );
    assert.equal(
      detectStrictRevocationCall(`await authorizeAdminRequest(req, "admin:read");`),
      true,
    );
  });
});
