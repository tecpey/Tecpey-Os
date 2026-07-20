import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function balancedObject(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function auditMetadataBlock(route: string): string {
  const auditStart = route.indexOf("writeSensitiveMutationAuditTx(");
  assert.ok(auditStart >= 0, "strict audit call must exist");
  const metadataStart = route.indexOf("metadata:", auditStart);
  assert.ok(metadataStart > auditStart, "strict audit metadata must exist");
  const objectStart = route.indexOf("{", metadataStart);
  assert.ok(objectStart > metadataStart, "strict audit metadata object must exist");
  const block = balancedObject(route, objectStart);
  assert.ok(block, "strict audit metadata object must be statically bounded");
  return block;
}

function storedKeyPattern(names: string[]): RegExp {
  return new RegExp(`\\b(?:${names.join("|")})\\s*(?=:|[,}])`);
}

describe("Sensitive mutation route audit boundaries", () => {
  it("binds device-token registration to the strict session and stores only token hashes", async () => {
    const route = await source("src/app/api/device-token/route.ts");
    const metadata = auditMetadataBlock(route);

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const studentId = session\.studentId/);
    assert.doesNotMatch(route, /body\.studentId|body\.userId|body\.actorId/);
    assert.match(route, /withTx\(async \(client\)/);
    assert.match(route, /actorId: studentId/);
    assert.match(route, /resourceId: tokenHash/);
    assert.match(route, /requestHash/);
    assert.match(metadata, /tokenHash/);
    assert.doesNotMatch(metadata, storedKeyPattern(["token"]));
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });

  it("binds conversation migration to the strict session and audits only hashes and counts", async () => {
    const route = await source("src/app/api/mentor-conversations/migrate/route.ts");
    const metadata = auditMetadataBlock(route);

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const studentId = session\.studentId/);
    assert.doesNotMatch(route, /body\.studentId|body\.userId|body\.actorId/);
    assert.match(route, /contentHash: hashSensitiveAuditRequest\(message\.content\)/);
    assert.match(route, /withTx\(async \(client\)/);
    assert.match(route, /actorId: studentId/);
    assert.match(metadata, /attemptedCount/);
    assert.match(metadata, /acceptedCount/);
    assert.match(metadata, /importedCount/);
    assert.match(metadata, /rejectedCount/);
    assert.doesNotMatch(
      metadata,
      storedKeyPattern(["content", "messages", "conversation"]),
    );
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });

  it("writes profile and audit in one transaction without behavioral text in metadata", async () => {
    const route = await source("src/app/api/mentor-profile/recompute/route.ts");
    const metadata = auditMetadataBlock(route);

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const studentId = session\.studentId/);
    assert.doesNotMatch(route, /body\.studentId|body\.userId|body\.actorId/);
    assert.match(route, /withTx\(async \(client\)/);
    assert.match(route, /upsertMentorProfileUpdateTx\(client, studentId, updated\)/);
    assert.match(route, /actorId: studentId/);
    assert.match(metadata, /confidenceScore/);
    assert.match(metadata, /disciplineScore/);
    assert.match(metadata, /weakAreaCount/);
    assert.match(metadata, /strongAreaCount/);
    assert.doesNotMatch(
      metadata,
      storedKeyPattern(["primaryGoal", "weakAreas", "strongAreas"]),
    );
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });

  it("binds API key creation to strict server identity and mandatory audit context", async () => {
    const route = await source("src/app/api/api-keys/route.ts");

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const userId = session\.academyAccountId \?\? session\.studentId \?\? session\.userId/);
    assert.match(route, /tenantId: PLATFORM\.DEFAULT_TENANT_ID/);
    assert.match(route, /resolveSensitiveAuditCorrelation/);
    assert.match(route, /hashSensitiveAuditRequest/);
    assert.match(route, /audit: \{/);
    assert.match(route, /actorId: userId/);
    assert.doesNotMatch(route, /body\.tenantId|body\.userId|body\.actorId/);
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });

  it("binds API key lifecycle changes to strict identity and the transactional authority", async () => {
    const route = await source("src/app/api/api-keys/[id]/route.ts");
    const authority = await source("src/lib/security/api-keys.ts");

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /tenantId: PLATFORM\.DEFAULT_TENANT_ID/);
    assert.match(route, /resolveSensitiveAuditCorrelation/);
    assert.match(route, /hashSensitiveAuditRequest/);
    assert.match(route, /setApiKeyActive\(/);
    assert.match(route, /rotateApiKey\(/);
    assert.match(route, /deleteApiKey\(/);
    assert.doesNotMatch(route, /body\.tenantId|body\.userId|body\.actorId/);
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);

    assert.match(authority, /withTx\(async \(client\)/);
    assert.match(authority, /writeSensitiveMutationAuditTx\(client/);
    for (const action of [
      "api_key.create",
      "api_key.enable",
      "api_key.disable",
      "api_key.rotate",
      "api_key.delete",
    ]) {
      assert.match(authority, new RegExp(action.replace(".", "\\.")));
    }
    assert.match(authority, /credentialFingerprint/);
    assert.doesNotMatch(authority, /metadata:\s*\{[^}]*plaintext/s);
    assert.doesNotMatch(authority, /metadata:\s*\{[^}]*key_hash/s);
  });
});
