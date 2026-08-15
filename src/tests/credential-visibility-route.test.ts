import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Academy credential visibility route", () => {
  it("keeps the owner mutation inside the complete security boundary", async () => {
    const route = await readFile(
      path.join(ROOT, "src/app/api/academy-credential-visibility/route.ts"),
      "utf8",
    );

    assert.match(route, /verifyCsrfOrigin\(req\)/);
    assert.match(route, /strictRevocation: true/);
    assert.match(route, /namespace: "academy-credential-visibility"/);
    assert.match(route, /readBoundedJsonRequest\(req, \{ maxBytes: 1_024 \}\)/);
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(route, /requiredPrincipalType: "student"/);
    assert.match(route, /scopes: \["academy:learning-events:write"\]/);
    assert.match(route, /requireTenantProduct\(tenantContext\.tenantId, "academy"\)/);
    assert.match(route, /await withTx\(/);
    assert.match(route, /if \(!result\.enabled\).*credential_visibility_unavailable/);
    assert.match(route, /if \(!result\.value\).*credential_not_found/);
    assert.match(route, /\.\.\.result\.value/);
    assert.match(route, /setOwnedAcademyCredentialVisibility\(client/);
    assert.match(route, /writeSensitiveMutationAuditTx\(client/);
    assert.match(route, /action: "academy\.credential\.visibility\.update"/);
    assert.match(route, /const UUID_PATTERN = \/\^\[0-9a-f\]\{8\}/);
    assert.doesNotMatch(
      route,
      /metadata:\s*\{[^}]*replayed:/,
      "an exact replay must preserve identical audit metadata",
    );
    assert.doesNotMatch(route, /withDb\(/, "the mutation must not escape its audit transaction");
  });
});

describe("Academy credential lifecycle routes", () => {
  it("keeps student appeals inside owner scope and sensitive audit", async () => {
    const route = await readFile(
      path.join(ROOT, "src/app/api/academy-credential-appeals/route.ts"),
      "utf8",
    );

    assert.match(route, /verifyCsrfOrigin\(req\)/);
    assert.match(route, /strictRevocation: true/);
    assert.match(route, /namespace: "academy-credential-appeal-open"/);
    assert.match(route, /readBoundedJsonRequest\(req, \{ maxBytes: 2_048 \}\)/);
    assert.match(route, /resolveTenantPrincipalContext\(\{/);
    assert.match(route, /requiredPrincipalType: "student"/);
    assert.match(route, /requireTenantProduct\(tenantContext\.tenantId, "academy"\)/);
    assert.match(route, /appendAcademyCredentialLifecycleEvent\(client/);
    assert.match(route, /eventType: "appeal_opened"/);
    assert.match(route, /actorType: "student"/);
    assert.match(route, /actorId: tenantContext\.principalId/);
    assert.match(route, /writeSensitiveMutationAuditTx\(client/);
    assert.match(route, /action: "academy\.credential\.lifecycle\.update"/);
    assert.match(route, /credential_lifecycle_transition_invalid/);
    assert.doesNotMatch(route, /withDb\(/, "the mutation must not escape its audit transaction");
  });

  it("keeps command-center lifecycle actions behind admin step-up and chain audit", async () => {
    const route = await readFile(
      path.join(ROOT, "src/app/api/command-center/academy-credentials/lifecycle/route.ts"),
      "utf8",
    );

    assert.match(route, /verifyCsrfOrigin\(req\)/);
    assert.match(route, /namespace: "command-center-academy-credential-lifecycle"/);
    assert.match(route, /authorizeAdminRequest\(req, "admin\.roles\.manage", \{/);
    assert.match(route, /stepUpWithinSeconds: 300/);
    assert.match(route, /readBoundedJsonRequest\(req, \{ maxBytes: 4_096 \}\)/);
    assert.match(route, /ACTION_TO_EVENT/);
    assert.match(route, /appendAcademyCredentialLifecycleEvent\(client/);
    assert.match(route, /actorType: "admin"/);
    assert.match(route, /actorId: authorization\.principal\.adminId/);
    assert.match(route, /writeAdminAuditEvent\(client/);
    assert.match(route, /action: `academy\.credential\.lifecycle\.\$\{lifecycleEvent\}`/);
    assert.match(route, /resourceType: "academy_credential"/);
    assert.match(route, /credential_lifecycle_transition_invalid/);
    assert.doesNotMatch(route, /getCanonicalSession\(/, "admin authority must come from the Admin control plane");
  });
});
