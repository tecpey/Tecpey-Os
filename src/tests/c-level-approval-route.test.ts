import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

describe("C-level approval command-center route", () => {
  it("exposes request and review workflow for Academy credential lifecycle approvals", async () => {
    const route = await readFile(
      path.join(ROOT, "src/app/api/command-center/c-level-approvals/route.ts"),
      "utf8",
    );
    const authority = await readFile(
      path.join(ROOT, "src/lib/c-level-control-authority.ts"),
      "utf8",
    );

    assert.match(route, /export async function POST\(req: NextRequest\)/);
    assert.match(route, /export async function PATCH\(req: NextRequest\)/);
    assert.match(route, /authorizeAdminRequest\(req, "admin\.roles\.manage", \{/);
    assert.match(route, /stepUpWithinSeconds: 300/);
    assert.match(route, /requestCLevelApprovalTx\(client/);
    assert.match(route, /reviewCLevelApprovalTx\(client/);
    assert.match(route, /C_LEVEL_CONTROLLED_ACTIONS/);
    assert.match(route, /writeAdminAuditEvent\(client/);
    assert.doesNotMatch(route, /auth_provider\./);
    assert.match(authority, /"academy_credential\.lifecycle_sensitive"/);
  });
});
