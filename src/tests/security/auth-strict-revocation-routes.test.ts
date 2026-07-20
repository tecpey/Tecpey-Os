import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const direct = [
  "src/app/api/ai-mentor/route.ts",
  "src/app/api/auth/2fa/backup/route.ts",
  "src/app/api/auth/2fa/disable/route.ts",
  "src/app/api/auth/2fa/enroll/route.ts",
  "src/app/api/auth/devices/[id]/route.ts",
  "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  "src/app/api/auth/webauthn/register/verify/route.ts",
  "src/app/api/mentor-memory/route.ts",
  "src/app/api/community/profile/route.ts",
];

describe("high-risk mutation strict revocation boundaries", () => {
  it("requires explicit strict canonical sessions on every direct route", async () => {
    for (const path of direct) {
      const source = await readFile(path, "utf8");
      assert.match(source, /strictRevocation:\s*true/, path);
      assert.doesNotMatch(source, /getCanonicalSession\(req\);/, path);
    }
  });

  it("keeps the AI Mentor compatibility alias on the canonical strict handler", async () => {
    const source = await readFile("src/app/api/ai-mentor-v2/route.ts", "utf8");
    assert.match(source, /POST as canonicalPost/);
    assert.match(source, /return canonicalPost\(req\)/);
  });

  it("uses live admin authority for command-center logout", async () => {
    const source = await readFile(
      "src/app/api/command-center/auth/logout/route.ts",
      "utf8",
    );
    assert.match(source, /loadAdminPrincipal\(req\)/);
    assert.match(source, /revokeAdminSession\(principal\.sessionId/);
  });

  it("requires strict notification identity for consent and preference mutations", async () => {
    const principal = await readFile("src/lib/notifications/principal.ts", "utf8");
    assert.match(principal, /getCanonicalSession\(request/);
    assert.match(principal, /options\.strictRevocation === true/);
    for (const path of [
      "src/app/api/notifications/consent/route.ts",
      "src/app/api/notifications/preferences/route.ts",
    ]) {
      const source = await readFile(path, "utf8");
      assert.match(
        source,
        /getNotificationIdentityFromRequest\(req, \{[\s\S]*strictRevocation: true/,
      );
    }
  });

  it("binds community visibility to the strict session principal", async () => {
    const route = await readFile("src/app/api/community/profile/route.ts", "utf8");
    const authority = await readFile("src/lib/community-career.ts", "utf8");
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /setPublicVisibilityForStudent\(session\.studentId, visibility\)/);
    assert.doesNotMatch(route, /setCurrentPublicVisibility/);
    assert.match(authority, /setPublicVisibilityForStudent/);
    assert.match(authority, /WHERE student_id = \$1::uuid/);
  });
});
