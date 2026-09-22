import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  hashDeepResearchCommand,
  validDeepResearchIdempotencyKey,
} from "../../lib/ai/deep-research-authority";

const routeSource=readFileSync(join(process.cwd(),"src/app/api/deep-research/route.ts"),"utf8");

describe("deep research API security boundary",()=>{
  it("binds mutations to strict session and server-resolved tenant/workspace authority",()=>{
    assert.match(routeSource,/getCanonicalSession\(req,\{strictRevocation:true\}\)/u);
    assert.match(routeSource,/resolveTenantPrincipalContext\(\{/u);
    assert.match(routeSource,/request:req,requiredPrincipalType:"user"/u);
    assert.match(routeSource,/tenantId:auth\.context\.tenantId,workspaceId:auth\.context\.workspaceId,accountId:auth\.accountId/u);
    assert.doesNotMatch(routeSource,/body\.(?:tenantId|workspaceId|accountId)/u);
  });

  it("enforces CSRF, bounded JSON, principal-scoped rate limits and replay protection on both mutations",()=>{
    assert.equal((routeSource.match(/verifyCsrfOrigin\(req\)/gu)??[]).length,2);
    assert.match(routeSource,/readJsonBody\(req,\{maxBytes:64\*1024\}\)/u);
    assert.match(routeSource,/readJsonBody\(req,\{maxBytes:2\*1024\}\)/u);
    assert.match(routeSource,/identity=\`\$\{auth\.context\.tenantId\}:\$\{auth\.context\.workspaceId\}:\$\{auth\.accountId\}\`/u);
    assert.equal((routeSource.match(/validDeepResearchIdempotencyKey\(req\.headers\.get\("idempotency-key"\)\)/gu)??[]).length,2);
    assert.equal((routeSource.match(/claimDeepResearchCommand\(client,scope\)/gu)??[]).length,2);
    assert.equal((routeSource.match(/completeDeepResearchCommand\(client,scope/gu)??[]).length,2);
  });

  it("keeps command evidence and domain mutation inside the signed tenant transaction",()=>{
    assert.equal((routeSource.match(/withAiTenantTransaction\(/gu)??[]).length,2);
    assert.match(routeSource,/idempotency_key_reused",409/u);
    assert.match(routeSource,/request_in_progress",409/u);
    assert.match(routeSource,/deep_research_run_not_cancellable",409/u);
  });

  it("canonicalizes request hashes and rejects weak idempotency keys",()=>{
    assert.equal(hashDeepResearchCommand({b:2,a:1}),hashDeepResearchCommand({a:1,b:2}));
    assert.equal(validDeepResearchIdempotencyKey("short"),null);
    assert.equal(validDeepResearchIdempotencyKey("valid-key-1234567890"),"valid-key-1234567890");
    assert.equal(validDeepResearchIdempotencyKey("invalid key with spaces"),null);
  });

  it("rejects unknown top-level fields instead of silently accepting authority hints",()=>{
    assert.match(routeSource,/exactKeys\(parsed\.value,CREATE_KEYS\)/u);
    assert.match(routeSource,/exactKeys\(parsed\.value,CANCEL_KEYS\)/u);
    assert.doesNotMatch(routeSource,/CREATE_KEYS[^\n]*(?:tenantId|workspaceId|accountId)/u);
  });
});
