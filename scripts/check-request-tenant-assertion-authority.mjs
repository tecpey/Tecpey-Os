// Request-edge tenant assertion authority (multi-tenant #20, roadmap 7.1.3).
//
// The Host header is attacker-controlled and it now reaches tenant resolution.
// Two properties carry the weight, and both are the kind that can be deleted in
// one line while every behavioural test still passes:
//
//  1. A hint is checked against the principal's OWN active bindings. Passing the
//     hint back as its own allow-list, or dropping the allow-list entirely, turns
//     advice into authority.
//  2. Only a "host" result is an assertion. Returning a discarded hint's fallback
//     as an assertion would harden a ranking into a filter and take a legitimate
//     principal offline.
//
// The behavioural proofs live in request-tenant-assertion-postgres.test.ts. This
// guard pins the shape those proofs depend on, so a rewrite cannot quietly move
// the security decision somewhere the proofs no longer observe.

import { readFile } from "node:fs/promises";

const files = {
  assertion: "src/lib/security/request-tenant-assertion.ts",
  principalContext: "src/lib/security/tenant-principal-context.ts",
  hostResolution: "src/lib/security/tenant-host-resolution.ts",
  requestResolution: "src/lib/security/request-tenant-resolution.ts",
  directory: "src/lib/security/tenant-domain-directory.ts",
  proof: "src/tests/security/request-tenant-assertion-postgres.test.ts",
  wiringGuard: "src/tests/security/tenant-request-wiring-guard.test.ts",
  csrf: "src/lib/csrf.ts",
  csrfProof: "src/tests/security/csrf-tenant-domain-postgres.test.ts",
  csrfAwaitGuard: "src/tests/security/csrf-await-guard.test.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [
      key,
      await readFile(file, "utf8"),
    ]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const failures = [];

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function refuseText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

// 1. The allow-list is the principal's own bindings — never the hint itself.
requireText(
  "assertion",
  "allowedTenantIds: bindings.map((binding) => binding.tenant_id)",
  "the hint must be checked against the principal's own active bindings",
);
refuseText(
  "assertion",
  "allowedTenantIds: [hint.hintTenantId]",
  "a hint must never be its own allow-list — that makes advice authority",
);

// 2. Those bindings must be active and their workspace must belong to the tenant.
requireText(
  "assertion",
  "AND binding.status = 'active'",
  "a revoked binding must not admit a host hint",
);
requireText(
  "assertion",
  "JOIN platform_workspaces workspace ON workspace.id = binding.workspace_id AND workspace.tenant_id = binding.tenant_id",
  "a binding's workspace must provably belong to its tenant",
);

// 3. Only a host result is an assertion.
requireText(
  "assertion",
  'if (resolved.source !== "host") return null;',
  "only a honored host hint may be returned as an assertion",
);
requireText(
  "assertion",
  "if (resolved.tenantId !== hint.hintTenantId)",
  "a host-sourced result naming a different tenant than the hint must be refused",
);

// 4. An unavailable directory must not fall back to a stale cache.
requireText(
  "assertion",
  "cachedDirectory = null; return null;",
  "an unreachable directory must clear the cache rather than keep routing on old bindings",
);

// 5. The assertion reaches the binding filter, which is what actually scopes the
//    query. If these stop being wired to preferredTenantId the whole chain is
//    decorative.
requireText(
  "principalContext",
  "preferredTenantId: assertedTenantId",
  "the asserted tenant must reach the binding filter",
);
requireText(
  "principalContext",
  "preferredWorkspaceId: assertedWorkspaceId",
  "the asserted workspace must reach the binding filter",
);
requireText(
  "principalContext",
  "resolveRequestTenantAssertion({",
  "tenant resolution must consult the request's asserted tenant",
);

// 6. The pure layers this depends on must keep their fail-closed shape.
requireText(
  "requestResolution",
  "if (hintTenantId && hintSource && allowed.has(hintTenantId))",
  "an edge hint must be honored only when it names an allowed tenant",
);
requireText(
  "hostResolution",
  "const FORBIDDEN_HOST_CHARS = /[/\\\\@?#%\\s]/",
  "host smuggling characters must be refused rather than cleaned up",
);
requireText(
  "directory",
  "SELECT host, tenant_id, workspace_id FROM platform_tenant_domains",
  "platform_tenant_domains must remain the single host->tenant authority",
);

// 7. The proofs must keep asserting both directions, and the wiring guard must
//    keep sweeping the tree rather than a fixed list.
requireText(
  "proof",
  "refuses to let a foreign tenant's host reach that tenant",
  "the adversarial case must remain",
);
requireText(
  "proof",
  "still refuses the foreign tenant if the allow-list is bypassed entirely",
  "the defense-in-depth case must remain",
);
requireText(
  "wiringGuard",
  "async function routeFiles(dir",
  "the wiring guard must sweep the API tree, not a fixed route list",
);

// 8. CSRF may recognize a tenant's own domain as same-site, but only its own.
//    Each of these was probed by deletion; each one alone admits a real attack.
requireText(
  "csrf",
  "if (!originHost || !requestHost || originHost !== requestHost) return false;",
  "the Origin must name the host the request was addressed to, or one bound tenant can CSRF another",
);
requireText(
  "csrf",
  "return lookup(originHost) !== null;",
  "an Origin matching an arbitrary Host proves nothing without the domain directory",
);
requireText(
  "csrf",
  "if (origin !== originUrl.origin) return false;",
  "the Origin must be a bare serialized origin — URL parsing silently drops userinfo",
);
requireText(
  "csrf",
  'if (process.env.NODE_ENV === "production" && originUrl.protocol !== "https:")',
  "a downgraded origin must not be treated as the tenant's own domain",
);
requireText(
  "csrf",
  "export async function verifyCsrfOrigin(",
  "verifyCsrfOrigin must stay async, or the await sweep guards nothing",
);
requireText(
  "csrfProof",
  "refuses one bound tenant domain posting to another",
  "the cross-tenant CSRF case must remain",
);
requireText(
  "csrfAwaitGuard",
  "awaits verifyCsrfOrigin at every call site",
  "a forgotten await disables CSRF silently and nothing else catches it",
);

if (failures.length > 0) {
  console.error(
    "Request tenant assertion authority failed:\n- " + failures.join("\n- "),
  );
  process.exit(1);
}

console.log(
  "Request tenant assertion authority passed: a host hint is checked against the principal's own active bindings, only an honored host result becomes an assertion, an unavailable directory refuses rather than serving a stale cache, the assertion reaches the binding filter, and the adversarial and wiring proofs remain in place.",
);
