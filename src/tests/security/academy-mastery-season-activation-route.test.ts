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
    const authority = await source("src/lib/academy-mastery-seasons-authority.ts");

    assert.match(route, /export async function POST\(req: NextRequest\)/);
    assert.match(route, /verifyCsrfOrigin\(req\)/);
    assert.match(route, /getCanonicalSession\(req, \{ strictRevocation: true \}\)/);
    assert.match(route, /scopes: \["academy:mastery-seasons:write"\]/);
    assert.match(route, /requireTenantProduct\(tenantContext\.tenantId, "academy"\)/);
    assert.match(route, /readBoundedJsonRequest<Record<string, unknown>>\(req, \{/);
    assert.match(route, /maxBytes: 2_048/);
    assert.match(route, /req\.headers\.get\("Idempotency-Key"\)/);
    assert.match(route, /withTx\(async \(client\) =>/);
    assert.match(route, /academy_mastery_activation_command/);
    assert.match(route, /academy_mastery_season_activation/);
    assert.match(route, /activateAcademyMasterySeason\(\{/);
    assert.match(route, /tenantContext\.principalId/);
    assert.match(route, /mastery_core_terms_incomplete/);
    assert.match(route, /mastery_ranking_consent_required/);
    assert.match(route, /mastery_idempotency_key_conflict/);
    assert.match(route, /noStore\(apiOk\(/);
    assert.match(authority, /COUNT\(DISTINCT term_number\)/);
    assert.match(authority, /term_number BETWEEN 1 AND 7/);
    assert.match(authority, /passedCoreTerms !== 7/);
    assert.match(authority, /recommendation\.season\.kind === "cohort-league" && !state\.rankingConsent/);
    assert.match(authority, /e\.idempotency_key = \$5/);
    assert.match(authority, /assignmentFromSnapshot\(row\.replay_assignment\)/);
    assert.match(authority, /mastery_idempotency_key_conflict/);
    assert.match(authority, /result: \{[\s\S]*assignment,/);
  });

  it("keeps activation identity ephemeral and server-backed in the client", async () => {
    const client = await source("src/components/academy/AcademyMasterySeasonsClientStatus.tsx");

    assert.match(client, /crypto\.randomUUID\(\)/);
    assert.match(client, /"Idempotency-Key"/);
    assert.match(client, /method: "POST"/);
    assert.match(client, /setLoadState\(\{ status: "ready", state: payload\.state \}\)/);
    assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB/);
    assert.match(client, /recommendation\.season\.kind !== "cohort-league" \|\| loadState\.state\.rankingConsent/);
    assert.match(client, /mastery_ranking_consent_required/);
    assert.match(client, /aria-live="polite"/);
    assert.match(client, /focus-visible:ring-2/);
    assert.match(client, /motion-reduce:animate-none/);
  });
});
