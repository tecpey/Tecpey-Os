import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRequestTenant,
  type RequestTenantInput,
} from "../../lib/security/request-tenant-resolution";

// P0 of multi-tenancy (#20): the request-tenant resolver is the security core,
// so its precedence and — above all — its "an edge hint can never escalate into
// a tenant the session is not allowed to act in" invariant are pinned here.

const base: Pick<RequestTenantInput, "defaultTenantId" | "defaultWorkspaceId"> = {
  defaultTenantId: "tecpey",
  defaultWorkspaceId: "main",
};

describe("resolveRequestTenant", () => {
  it("honors a host hint that names a session-allowed tenant", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintWorkspaceId: "acme-main",
      hintSource: "host",
      sessionTenantId: "tecpey",
      allowedTenantIds: ["acme"],
    });
    assert.deepEqual(r, { tenantId: "acme", workspaceId: "acme-main", source: "host" });
  });

  it("honors a header hint that names a session-allowed tenant", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: "header",
      sessionTenantId: "acme",
      allowedTenantIds: ["acme"],
    });
    assert.equal(r.tenantId, "acme");
    assert.equal(r.source, "header");
    assert.equal(r.workspaceId, "main"); // falls back to default workspace when hint gives none
  });

  it("REJECTS a spoofed hint for a tenant the session is not allowed to act in", () => {
    // The load-bearing security case: an attacker sets host/header to a foreign
    // tenant. Resolution must ignore it and fall back to the session tenant —
    // never escalate to 'evil-co'.
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "evil-co",
      hintSource: "host",
      sessionTenantId: "tecpey",
      allowedTenantIds: ["tecpey"],
    });
    assert.notEqual(r.tenantId, "evil-co");
    assert.equal(r.tenantId, "tecpey");
    assert.equal(r.source, "session");
  });

  it("ignores a hint with no source (only host/header hints are edge hints)", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: null,
      sessionTenantId: "tecpey",
      allowedTenantIds: ["acme"],
    });
    assert.equal(r.tenantId, "tecpey");
    assert.equal(r.source, "session");
  });

  it("falls back to the session tenant when there is no hint", () => {
    const r = resolveRequestTenant({
      ...base,
      sessionTenantId: "acme",
      sessionWorkspaceId: "acme-eu",
      allowedTenantIds: ["acme"],
    });
    assert.deepEqual(r, { tenantId: "acme", workspaceId: "acme-eu", source: "session" });
  });

  it("fails closed to the platform default for a guest with no session tenant", () => {
    const r = resolveRequestTenant({ ...base });
    assert.deepEqual(r, { tenantId: "tecpey", workspaceId: "main", source: "default" });
  });

  it("treats the session's own tenant as always allowed even if absent from the list", () => {
    // A hint naming the session's own tenant is honored even when allowedTenantIds
    // omits it — the session is, by definition, allowed in its own tenant.
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: "host",
      sessionTenantId: "acme",
      allowedTenantIds: [],
    });
    assert.equal(r.tenantId, "acme");
    assert.equal(r.source, "host");
  });

  it("never lets a hint override into a non-allowed tenant, even for the default host", () => {
    // Default host resolving for a session whose only tenant is the default: a
    // foreign hint must still be dropped.
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: "header",
      sessionTenantId: "tecpey",
      allowedTenantIds: [],
    });
    assert.equal(r.tenantId, "tecpey");
    assert.equal(r.source, "session");
  });
});
