import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const directRoutes = [
  "src/app/api/academy-auth/route.ts",
  "src/app/api/academy-certificates/route.ts",
  "src/app/api/academy-flashcards/route.ts",
  "src/app/api/academy-lead/route.ts",
  "src/app/api/academy-lesson-assessment/route.ts",
  "src/app/api/academy-reflections/route.ts",
  "src/app/api/academy-simulator-decision/route.ts",
  "src/app/api/academy-specialized-lead/route.ts",
  "src/app/api/academy-student-profile/route.ts",
  "src/app/api/academy-term-progress/route.ts",
  "src/app/api/academy/auth/login/route.ts",
  "src/app/api/academy/auth/register/route.ts",
  "src/app/api/admin/withdrawals/[id]/route.ts",
  "src/app/api/ai-mentor/route.ts",
  "src/app/api/api-keys/route.ts",
  "src/app/api/api-keys/[id]/route.ts",
  "src/app/api/auth/2fa/backup/route.ts",
  "src/app/api/auth/2fa/disable/route.ts",
  "src/app/api/auth/2fa/enroll/route.ts",
  "src/app/api/auth/2fa/verify/route.ts",
  "src/app/api/auth/devices/[id]/route.ts",
  "src/app/api/auth/password/change/route.ts",
  "src/app/api/auth/webauthn/auth/challenge/route.ts",
  "src/app/api/auth/webauthn/auth/verify/route.ts",
  "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  "src/app/api/auth/webauthn/register/verify/route.ts",
  "src/app/api/auth/withdraw/route.ts",
  "src/app/api/auth/withdraw/authorize/route.ts",
  "src/app/api/command-center/auth/bootstrap/challenge/route.ts",
  "src/app/api/command-center/auth/bootstrap/verify/route.ts",
  "src/app/api/command-center/auth/passkey/verify/route.ts",
  "src/app/api/command-center/campaign/route.ts",
  "src/app/api/community/profile/route.ts",
  "src/app/api/device-token/route.ts",
  "src/app/api/learning-events/route.ts",
  "src/app/api/mentor-challenge/route.ts",
  "src/app/api/mentor-conversations/migrate/route.ts",
  "src/app/api/mentor-memory/route.ts",
  "src/app/api/notifications/[id]/route.ts",
  "src/app/api/notifications/consent/route.ts",
  "src/app/api/notifications/preferences/route.ts",
  "src/app/api/notifications/read/route.ts",
  "src/app/api/offline-sync/route.ts",
  "src/app/api/orders/route.ts",
  "src/app/api/trading-arena/route.ts",
  "src/app/api/trading-arena/execution/route.ts",
  "src/app/api/trading-arena/reflections/route.ts",
] as const;

describe("governed mutating request-body boundaries", () => {
  it("routes every affected direct handler through the shared bounded reader", async () => {
    assert.equal(directRoutes.length, 47);
    for (const path of directRoutes) {
      const source = await readFile(path, "utf8");
      assert.match(source, /from "@\/lib\/security\/request-body"/, path);
      assert.match(source, /\breadJsonBody(?:<[^;\n]+>)?\s*\(/, path);
      assert.match(source, /maxBytes:\s*(?:[0-9_]+|MAX_PAYLOAD_BYTES)/, path);
      assert.doesNotMatch(source, /\b(?:req|request)\.json\s*\(/, path);
      assert.doesNotMatch(source, /\b(?:req|request)\.text\s*\(/, path);
    }
  });

  it("keeps the AI Mentor V2 alias body-pass-through only", async () => {
    const source = await readFile("src/app/api/ai-mentor-v2/route.ts", "utf8");
    assert.match(source, /POST as canonicalPost/);
    assert.match(source, /return canonicalPost\(req\)/);
    assert.doesNotMatch(source, /\b(?:req|request)\.(?:json|text)\s*\(/);
  });

  it("implements a streaming byte counter rather than a header-only hint", async () => {
    const source = await readFile("src/lib/security/request-body.ts", "utf8");
    assert.match(source, /request\.body\.getReader\(\)/);
    assert.match(source, /totalBytes \+= value\.byteLength/);
    assert.match(source, /totalBytes > maxBytes/);
    assert.match(source, /reader\.cancel/);
    assert.match(source, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
    assert.match(source, /unsupported_content_encoding/);
    assert.match(source, /unsupported_media_type/);
  });
});
