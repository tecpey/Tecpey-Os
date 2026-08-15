import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("Community public credential projection", () => {
  it("publishes only active credentials explicitly marked public in the profile scope", async () => {
    const authority = await readFile(
      path.join(ROOT, "src/lib/community-profile-authority.ts"),
      "utf8",
    );

    assert.match(authority, /FROM academy_credential_current_state scoped/);
    assert.match(authority, /scoped\.tenant_id = profile\.tenant_id/);
    assert.match(authority, /scoped\.workspace_id = profile\.workspace_id/);
    assert.match(authority, /scoped\.student_id = profile\.student_id/);
    assert.match(authority, /scoped\.lifecycle_state IN \('issued', 'reinstated'\)/);
    assert.match(authority, /scoped\.visibility = 'public'/);
    assert.match(authority, /ORDER BY scoped\.issued_at DESC, scoped\.id DESC\s+LIMIT 24/);
    assert.doesNotMatch(
      authority,
      /'evidence',\s*credential\.evidence/,
      "private issuance evidence must never enter the public projection",
    );
  });

  it("renders the governed projection rather than inferring medals from a count", async () => {
    const page = await readFile(
      path.join(ROOT, "src/app/student/[studentId]/page.tsx"),
      "utf8",
    );

    assert.match(page, /profile\.publicCredentials\.map/);
    assert.match(page, /credential\.titleFa/);
    assert.match(page, /credential\.issuer/);
    assert.match(page, /credential\.issuedAt/);
    assert.match(page, /فقط مواردی نمایش داده می‌شوند/);
  });
});
