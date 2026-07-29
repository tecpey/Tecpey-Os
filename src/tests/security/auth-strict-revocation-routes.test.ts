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

  it("uses live admin authority and atomic durable revocation for command-center logout", async () => {
    const source = await readFile(
      "src/app/api/command-center/auth/logout/route.ts",
      "utf8",
    );
    assert.match(source, /loadAdminPrincipal\(req\)/);
    assert.match(source, /withTx\(async \(client\) =>/);
    assert.match(source, /UPDATE admin_sessions[\s\S]*revoked_at = NOW\(\)/);
    assert.match(source, /WHERE id = \$2::uuid AND revoked_at IS NULL/);
    assert.match(source, /principal\.sessionId/);
    assert.match(source, /writeAdminAuditEvent\(client/);
  });

  it("requires strict notification identity for consent and preference mutations", async () => {
    const principal = await readFile("src/lib/notifications/principal.ts", "utf8");
    assert.match(principal, /getCanonicalSession\(request/);
    assert.match(principal, /options\.strictRevocation === true/);
    assert.match(principal, /resolveNotificationPrincipal/);
    for (const path of [
      "src/app/api/notifications/consent/route.ts",
      "src/app/api/notifications/preferences/route.ts",
    ]) {
      const source = await readFile(path, "utf8");
      assert.match(
        source,
        /getNotificationIdentityFromRequest\(req, \{[\s\S]*?strictRevocation: true[\s\S]*?\}\)/,
      );
    }
  });

  it("binds Community consent to strict canonical tenant and principal authority", async () => {
    const route = await readFile("src/app/api/community/profile/route.ts", "utf8");
    const authority = await readFile(
      "src/lib/community-profile-authority.ts",
      "utf8",
    );
    const adapter = await readFile("src/lib/community-career.ts", "utf8");

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(route, /scopes: \["community:profile:write"\]/);
    assert.match(route, /updateCommunityProfileConsent\(\{/);
    assert.match(route, /req\.headers\.get\("idempotency-key"\)/);
    assert.doesNotMatch(route, /setPublicVisibilityForStudent/);
    assert.doesNotMatch(route, /setCurrentPublicVisibility/);

    assert.match(authority, /AvailableTenantPrincipalContext/);
    assert.match(authority, /withTx\(async \(client\) =>/);
    assert.match(authority, /writeSensitiveMutationAuditTx\(client/);
    assert.match(authority, /action: "community\.profile\.consent\.update"/);
    assert.match(authority, /expectedRevision/);

    assert.match(adapter, /loadOwnedCommunityProfile/);
    assert.match(adapter, /loadPublicCommunityProfile/);
    assert.doesNotMatch(adapter, /CREATE TABLE IF NOT EXISTS/);
    assert.doesNotMatch(adapter, /community-career\.local\.json/);
    assert.doesNotMatch(adapter, /simulator_snapshot/);
  });
});
