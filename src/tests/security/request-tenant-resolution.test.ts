import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRequestTenant,
  type RequestTenantInput,
} from "../../lib/security/request-tenant-resolution";

// P0 of multi-tenancy (#20): the request-tenant resolver is the security core,
// so its precedence and two invariants are pinned here:
//  (1) an edge hint can never escalate into a tenant the session is not allowed
//      to act in — including the platform default; and
//  (2) a resolved tenant is only ever paired with a workspace that provably
//      belongs to it (never the global default workspace on a foreign tenant).

const base: Pick<RequestTenantInput, "defaultTenantId" | "defaultWorkspaceId"> = {
  defaultTenantId: "tecpey",
  defaultWorkspaceId: "main",
};

describe("resolveRequestTenant", () => {
  it("honors a host hint that names a session-allowed tenant with its own workspace", () => {
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

  it("borrows the session workspace when an allowed header hint names the session's own tenant", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: "header",
      sessionTenantId: "acme",
      sessionWorkspaceId: "acme-eu",
      allowedTenantIds: ["acme"],
    });
    assert.deepEqual(r, { tenantId: "acme", workspaceId: "acme-eu", source: "header" });
  });

  it("REJECTS a spoofed hint for a tenant the session is not allowed to act in", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "evil-co",
      hintSource: "host",
      sessionTenantId: "tecpey",
      allowedTenantIds: ["tecpey"],
    });
    assert.notEqual(r.tenantId, "evil-co");
    assert.deepEqual(r, { tenantId: "tecpey", workspaceId: "main", source: "session" });
  });

  it("does NOT let a default-tenant hint override a session scoped to another tenant", () => {
    // Codex P2a: the default tenant must not be implicitly hint-allowed. A
    // session allowed only for 'acme' must not be dragged into 'tecpey' by a
    // default-host / X-Tecpey-Tenant: tecpey hint.
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "tecpey",
      hintSource: "header",
      sessionTenantId: "acme",
      sessionWorkspaceId: "acme-1",
      allowedTenantIds: ["acme"],
    });
    assert.equal(r.tenantId, "acme");
    assert.equal(r.source, "session");
    assert.equal(r.workspaceId, "acme-1");
  });

  it("never pairs a resolved tenant with the global default workspace of another tenant", () => {
    // Codex P2b: an allowed 'acme' hint with no workspace cannot borrow 'main'
    // (which belongs to 'tecpey'). With no trustworthy workspace, the hint is
    // dropped and resolution falls back to the session — never {acme, main}.
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: "header",
      sessionTenantId: "tecpey",
      allowedTenantIds: ["acme"],
    });
    assert.notDeepEqual(r, { tenantId: "acme", workspaceId: "main", source: "header" });
    assert.deepEqual(r, { tenantId: "tecpey", workspaceId: "main", source: "session" });
  });

  it("honors an allowed hint for a foreign tenant when it carries its own workspace", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintWorkspaceId: "acme-eu",
      hintSource: "header",
      sessionTenantId: "tecpey",
      allowedTenantIds: ["acme"],
    });
    assert.deepEqual(r, { tenantId: "acme", workspaceId: "acme-eu", source: "header" });
  });

  it("ignores a hint with no source (only host/header hints are edge hints)", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintWorkspaceId: "acme-eu",
      hintSource: null,
      sessionTenantId: "tecpey",
      allowedTenantIds: ["acme"],
    });
    assert.equal(r.tenantId, "tecpey");
    assert.equal(r.source, "session");
  });

  it("falls back to the session tenant + workspace when there is no hint", () => {
    const r = resolveRequestTenant({
      ...base,
      sessionTenantId: "acme",
      sessionWorkspaceId: "acme-eu",
      allowedTenantIds: ["acme"],
    });
    assert.deepEqual(r, { tenantId: "acme", workspaceId: "acme-eu", source: "session" });
  });

  it("fails closed to the platform default pair for a guest with no session tenant", () => {
    const r = resolveRequestTenant({ ...base });
    assert.deepEqual(r, { tenantId: "tecpey", workspaceId: "main", source: "default" });
  });

  it("treats the session's own tenant as always allowed even if absent from the list", () => {
    const r = resolveRequestTenant({
      ...base,
      hintTenantId: "acme",
      hintSource: "host",
      sessionTenantId: "acme",
      sessionWorkspaceId: "acme-1",
      allowedTenantIds: [],
    });
    assert.deepEqual(r, { tenantId: "acme", workspaceId: "acme-1", source: "host" });
  });
});
