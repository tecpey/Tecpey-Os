import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function auditCallBlock(route: string): string {
  const start = route.indexOf("writeSensitiveMutationAuditTx(");
  assert.ok(start >= 0, "strict audit call must exist");
  const end = route.indexOf("\n      });", start);
  assert.ok(end > start, "strict audit call must be statically bounded");
  return route.slice(start, end + "\n      });".length);
}

describe("Sensitive mutation route audit boundaries", () => {
  it("binds device-token registration to the strict session and stores only token hashes", async () => {
    const route = await source("src/app/api/device-token/route.ts");
    const audit = auditCallBlock(route);

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const studentId = session\.studentId/);
    assert.doesNotMatch(route, /body\.studentId|body\.userId|body\.actorId/);
    assert.match(route, /withTx\(async \(client\)/);
    assert.match(audit, /actorId: studentId/);
    assert.match(audit, /resourceId: tokenHash/);
    assert.match(audit, /requestHash/);
    assert.match(audit, /metadata:[\s\S]*tokenHash/);
    assert.doesNotMatch(audit, /\btoken\s*[,}]/);
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });

  it("binds conversation migration to the strict session and audits only hashes and counts", async () => {
    const route = await source("src/app/api/mentor-conversations/migrate/route.ts");
    const audit = auditCallBlock(route);

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const studentId = session\.studentId/);
    assert.doesNotMatch(route, /body\.studentId|body\.userId|body\.actorId/);
    assert.match(route, /contentHash: hashSensitiveAuditRequest\(message\.content\)/);
    assert.match(route, /withTx\(async \(client\)/);
    assert.match(audit, /actorId: studentId/);
    assert.match(audit, /attemptedCount/);
    assert.match(audit, /acceptedCount/);
    assert.match(audit, /importedCount/);
    assert.match(audit, /rejectedCount/);
    assert.doesNotMatch(audit, /\bcontent\b|\bmessages\b|\bconversation\b/);
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });

  it("writes profile and audit in one transaction without behavioral text in metadata", async () => {
    const route = await source("src/app/api/mentor-profile/recompute/route.ts");
    const audit = auditCallBlock(route);

    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /const studentId = session\.studentId/);
    assert.doesNotMatch(route, /body\.studentId|body\.userId|body\.actorId/);
    assert.match(route, /withTx\(async \(client\)/);
    assert.match(route, /upsertMentorProfileUpdateTx\(client, studentId, updated\)/);
    assert.match(audit, /actorId: studentId/);
    assert.match(audit, /confidenceScore/);
    assert.match(audit, /disciplineScore/);
    assert.match(audit, /weakAreaCount/);
    assert.match(audit, /strongAreaCount/);
    assert.doesNotMatch(audit, /\bprimaryGoal\b|\bweakAreas\b|\bstrongAreas\b/);
    assert.doesNotMatch(route, /\bwriteAudit\s*\(/);
  });
});
