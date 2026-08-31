import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

describe("Academy Mastery Season activation boundary", () => {
  it("admits activation only through the governed authenticated transaction", async () => {
    const route = await source("src/app/api/academy-mastery-seasons/activate/route.ts");

    assert.match(route, /export async function POST\(req: NextRequest\)/);
    assert.match(route, /verifyCsrfOrigin\(req\)/);
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /scopes: \["academy:mastery-seasons:write"\]/);
    assert.match(route, /requireTenantProduct\(tenantContext\.tenantId, "academy"\)/);
    assert.match(route, /readBoundedJsonRequest<Record<string, unknown>>\(req, \{/);
    assert.match(route, /maxBytes: 2_048/);
    assert.match(route, /req\.headers\.get\("idempotency-key"\)/);
    assert.match(route, /withTx\(async \(client\) =>/);
    assert.match(route, /pg_advisory_xact_lock/);
    assert.match(route, /activateAcademyMasterySeason\(\{/);
    assert.match(route, /tenantContext\.principalId/);
    assert.match(route, /mastery_core_terms_incomplete/);
    assert.match(route, /noStore\(apiOk\(/);
  });

  it("keeps activation identity ephemeral and server-backed in the client", async () => {
    const client = await source("src/components/academy/AcademyMasterySeasonsClientStatus.tsx");

    assert.match(client, /crypto\.randomUUID\(\)/);
    assert.match(client, /"Idempotency-Key"/);
    assert.match(client, /method: "POST"/);
    assert.match(client, /setLoadState\(\{ status: "ready", state: payload\.state \}\)/);
    assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB/);
    assert.match(client, /aria-live="polite"/);
    assert.match(client, /focus-visible:ring-2/);
    assert.match(client, /motion-reduce:animate-none/);
  });
});
