import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHostHeader,
  resolveTenantHostHint,
  type TenantHostBinding,
  type TenantHostLookup,
} from "../../lib/security/tenant-host-resolution";

// P1 of multi-tenancy (#20): the Host header is attacker-controlled, so this
// pins the two things that keep host routing safe:
//  (1) normalization is strict and fail-closed — a malformed or smuggled Host
//      never "cleans up" into a hostname; and
//  (2) resolution produces a hint ONLY for a host that maps to a known tenant
//      domain, never inventing, wildcarding, or escalating.

// A tiny fixed domain table for the tests. Keys are already-normalized hosts,
// exactly as `normalizeHostHeader` produces them.
const domains = new Map<string, TenantHostBinding>([
  ["acme.com", { tenantId: "acme", workspaceId: "acme-main" }],
  ["app.acme.com", { tenantId: "acme", workspaceId: "acme-app" }],
  ["globex.io", { tenantId: "globex" }], // bound to a tenant, no explicit workspace
  ["xn--mnchen-3ya.de", { tenantId: "muc", workspaceId: "muc-main" }], // münchen.de
]);
const lookup: TenantHostLookup = (host) => domains.get(host);

describe("normalizeHostHeader", () => {
  it("lowercases and passes through a plain host", () => {
    assert.equal(normalizeHostHeader("ACME.com"), "acme.com");
  });

  it("strips a :port suffix", () => {
    assert.equal(normalizeHostHeader("acme.com:443"), "acme.com");
  });

  it("strips a single FQDN-root trailing dot", () => {
    assert.equal(normalizeHostHeader("acme.com."), "acme.com");
  });

  it("IDN-canonicalizes unicode to punycode", () => {
    assert.equal(normalizeHostHeader("MÜNCHEN.de"), "xn--mnchen-3ya.de");
    assert.equal(normalizeHostHeader("xn--mnchen-3ya.de"), "xn--mnchen-3ya.de");
  });

  it("REJECTS a userinfo-smuggled host (acme.com@evil.com)", () => {
    // The load-bearing case: a naive parser resolves this to evil.com. We must
    // refuse it outright, not extract a hostname from it.
    assert.equal(normalizeHostHeader("acme.com@evil.com"), null);
  });

  it("REJECTS a path-smuggled host (evil.com/acme.com)", () => {
    assert.equal(normalizeHostHeader("evil.com/acme.com"), null);
  });

  it("rejects hosts containing whitespace or control chars", () => {
    assert.equal(normalizeHostHeader("acme.com\tx"), null);
    assert.equal(normalizeHostHeader("acme .com"), null);
  });

  it("rejects an invalid or non-numeric port", () => {
    assert.equal(normalizeHostHeader("acme.com:notaport"), null);
    assert.equal(normalizeHostHeader("acme.com:0"), null);
    assert.equal(normalizeHostHeader("acme.com:99999"), null);
  });

  it("rejects empty, whitespace-only, and null/undefined", () => {
    assert.equal(normalizeHostHeader(""), null);
    assert.equal(normalizeHostHeader("   "), null);
    assert.equal(normalizeHostHeader(null), null);
    assert.equal(normalizeHostHeader(undefined), null);
  });

  it("handles bracketed IPv6 and rejects a bare multi-colon authority", () => {
    assert.equal(normalizeHostHeader("[::1]:8080"), "[::1]");
    assert.equal(normalizeHostHeader("::1"), null); // bare IPv6 is not a valid Host
  });
});

describe("resolveTenantHostHint", () => {
  it("produces a host hint for a known tenant domain", () => {
    assert.deepEqual(resolveTenantHostHint("acme.com", lookup), {
      hintTenantId: "acme",
      hintWorkspaceId: "acme-main",
      hintSource: "host",
    });
  });

  it("matches case-insensitively and with a port", () => {
    assert.deepEqual(resolveTenantHostHint("APP.Acme.com:443", lookup), {
      hintTenantId: "acme",
      hintWorkspaceId: "acme-app",
      hintSource: "host",
    });
  });

  it("carries a null workspace when the binding pins none", () => {
    assert.deepEqual(resolveTenantHostHint("globex.io", lookup), {
      hintTenantId: "globex",
      hintWorkspaceId: null,
      hintSource: "host",
    });
  });

  it("resolves an IDN host to the same binding as its punycode form", () => {
    assert.deepEqual(resolveTenantHostHint("münchen.de", lookup), {
      hintTenantId: "muc",
      hintWorkspaceId: "muc-main",
      hintSource: "host",
    });
  });

  it("produces NO hint for an unknown host (never invents or wildcards)", () => {
    assert.equal(resolveTenantHostHint("unknown.example", lookup), null);
    // A subdomain not explicitly bound must not inherit its parent's tenant.
    assert.equal(resolveTenantHostHint("evil.acme.com", lookup), null);
  });

  it("produces NO hint for a smuggled or malformed host", () => {
    assert.equal(resolveTenantHostHint("acme.com@evil.com", lookup), null);
    assert.equal(resolveTenantHostHint("evil.com/acme.com", lookup), null);
    assert.equal(resolveTenantHostHint("", lookup), null);
  });

  it("ignores a binding with a blank tenantId", () => {
    const bad: TenantHostLookup = () => ({ tenantId: "  " });
    assert.equal(resolveTenantHostHint("acme.com", bad), null);
  });
});
