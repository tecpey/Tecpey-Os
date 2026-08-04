// Host-header → tenant hint resolution (multi-tenant P1, issue #20).
//
// The request edge names a tenant two ways: an explicit X-Tecpey-Tenant header
// or the *host* the browser connected to (a custom domain / subdomain a
// white-label tenant owns). This module turns an untrusted `Host` header into
// the host-sourced hint that `resolveRequestTenant` consumes — and nothing
// more. It is a PURE function: the host→tenant binding is injected as a
// `lookup` callback (backed later by `platform_tenant_domains`), so the
// security-critical parsing can be exhaustively unit-tested before any host
// routing — or any database — is trusted.
//
// The `Host` header is attacker-controlled and a classic smuggling surface, so
// normalization is deliberately strict and fail-closed:
//  - A header that is not a bare `host[:port]` (contains a path, userinfo `@`,
//    whitespace, control chars, or other authority punctuation) is REJECTED —
//    never "cleaned up" into a hostname, because cleanup is exactly how
//    `acme.com@evil.com` or `evil.com/acme.com` smuggle a different host past a
//    naive parser.
//  - The host is lowercased and IDN-canonicalized to its ASCII/punycode form,
//    so `MÜNCHEN.de`, `münchen.de`, and `xn--mnchen-3ya.de` resolve to the one
//    key the binding table stores.
//  - A host with no binding yields NO hint (null). This function never invents
//    a tenant, never falls back to a wildcard, and never escalates — an unknown
//    or spoofed host simply produces no hint, and `resolveRequestTenant` then
//    proceeds from the authenticated session.

import { domainToASCII } from "node:url";

/** A host→tenant binding, as the domain table (or any injected source) sees it. */
export type TenantHostBinding = {
  tenantId: string;
  /** The workspace this host is bound to, if the binding pins one. */
  workspaceId?: string | null;
};

/**
 * Resolves an already-normalized host to its binding, or null/undefined when
 * the host is not a known tenant domain. Injected so this layer stays pure and
 * DB-free; the caller passes the host EXACTLY as `normalizeHostHeader` returns
 * it (lowercased, punycode, no port, no trailing dot).
 */
export type TenantHostLookup = (
  host: string,
) => TenantHostBinding | null | undefined;

/** The host-sourced hint shape `resolveRequestTenant` accepts. */
export type TenantHostHint = {
  hintTenantId: string;
  hintWorkspaceId: string | null;
  hintSource: "host";
};

// A valid Host header authority is `host[:port]` only. Anything with these
// characters is not a bare host — it is a malformed or smuggled value, and we
// refuse to interpret it rather than risk a parser disagreeing about which part
// is the hostname.
const FORBIDDEN_HOST_CHARS = /[/\\@?#%\s]/;

/** Ports are 1–5 digits; we only strip a suffix that is unambiguously a port. */
const PORT_SUFFIX = /:(\d{1,5})$/;

/**
 * Canonicalize an untrusted `Host` header to the single key a binding lookup
 * should use, or null when the header is absent, malformed, or cannot be a
 * tenant domain. Fail-closed: when in doubt, return null (no hint) rather than a
 * best-effort hostname.
 */
export function normalizeHostHeader(rawHost: string | null | undefined): string | null {
  if (typeof rawHost !== "string") return null;
  const trimmed = rawHost.trim();
  if (!trimmed) return null;

  // IPv6 literals arrive bracketed (`[::1]` / `[::1]:8080`). They are never
  // tenant domains here; handle them explicitly so the bracket colons are not
  // mistaken for a port separator, then let the lookup miss.
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    if (close === -1) return null;
    const inner = trimmed.slice(1, close);
    const after = trimmed.slice(close + 1);
    // Anything after `]` must be a valid `:port` and nothing else.
    if (after !== "") {
      const portOnly = after.match(/^:(\d{1,5})$/);
      if (!portOnly) return null;
      const port = Number(portOnly[1]);
      if (port < 1 || port > 65535) return null;
    }
    if (!inner || FORBIDDEN_HOST_CHARS.test(inner)) return null;
    return `[${inner.toLowerCase()}]`;
  }

  // Reject smuggling vectors BEFORE any parsing: a bare host has none of these.
  if (FORBIDDEN_HOST_CHARS.test(trimmed)) return null;

  // Strip a single trailing `:port`. A remaining colon means a bare IPv6 or a
  // malformed authority — reject it rather than guess.
  let host = trimmed;
  const portMatch = host.match(PORT_SUFFIX);
  if (portMatch) {
    const port = Number(portMatch[1]);
    if (port < 1 || port > 65535) return null;
    host = host.slice(0, host.length - portMatch[0].length);
  }
  if (host.includes(":")) return null;
  if (!host) return null;

  // Strip a single FQDN-root trailing dot (`acme.com.` == `acme.com`).
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host || host.endsWith(".")) return null; // reject `acme.com..`

  // Lowercase + IDN→ASCII/punycode. domainToASCII returns "" for anything it
  // considers invalid, which is our final fail-closed gate.
  const ascii = domainToASCII(host);
  if (!ascii) return null;
  return ascii;
}

/**
 * Turn an untrusted `Host` header into the host-sourced tenant hint, using the
 * injected binding lookup. Returns null when the host is malformed or names no
 * known tenant domain — in which case there is simply no hint and
 * `resolveRequestTenant` continues from the session. A hint produced here is
 * still only ADVICE: `resolveRequestTenant` honors it only if it names a
 * session-allowed tenant, so a valid-but-foreign host can never escalate.
 */
export function resolveTenantHostHint(
  rawHost: string | null | undefined,
  lookup: TenantHostLookup,
): TenantHostHint | null {
  const host = normalizeHostHeader(rawHost);
  if (host === null) return null;

  const binding = lookup(host);
  if (!binding || typeof binding.tenantId !== "string" || !binding.tenantId.trim()) {
    return null;
  }

  const workspaceId =
    typeof binding.workspaceId === "string" && binding.workspaceId.trim()
      ? binding.workspaceId.trim()
      : null;

  return {
    hintTenantId: binding.tenantId.trim(),
    hintWorkspaceId: workspaceId,
    hintSource: "host",
  };
}
