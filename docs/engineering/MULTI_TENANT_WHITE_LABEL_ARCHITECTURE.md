# Multi-Tenant & White-Label Architecture Plan (#20)

> Status: **Plan / RFC**. This document proposes the phased path to make TecPey
> fully multi-tenant and white-label "by architecture, code and product
> contract" (issue #20). It is grounded in the code as it exists today; every
> "current state" claim below points at a real file so the gap analysis is
> verifiable, not aspirational.

## 1. Purpose & scope

TecPey already has the **data model** of a multi-tenant platform, but the
**runtime** still behaves as a single tenant: tenant identity is carried in the
database and the session, yet most write/read authorities default to one fixed
tenant, there is no request-level tenant resolution from the host, and there is
no white-label (per-tenant branding/product) surface.

This plan turns the existing tenant *data model* into an enforced tenant
*runtime + product contract*, in shippable slices that each keep CI green and
preserve the platform's fail-closed isolation guarantees.

Out of scope here: billing/metering per tenant, and cross-region data
residency. Both are noted as follow-ups but not designed in this pass.

## 2. Current state (grounded)

**Tenant data model — already present.**
- `platform_tenants` (`id`, `slug`, `display_name`, `plan ∈ {free,pro,enterprise}`, `owner_id`, `products[]`) — `src/lib/db-migrate.ts`.
- `platform_workspaces` (sub-unit of a tenant; carries a `settings JSONB`) — `src/lib/db-migrate.ts`.
- `platform_memberships` (user ↔ tenant ↔ workspace ↔ roles) and
  `platform_principal_bindings` (principal ↔ tenant ↔ workspace, `active|revoked`).
- Nearly every domain table carries a `tenant_id` column (risk, exchange,
  withdrawal, crm, offline-sync, reputation, notifications, …).

**Tenant resolution — session-derived, not request-derived.**
- `resolveTenantPrincipalContext({ session, … })` → `resolvePlatformContext(session)`
  → `resolveBoundTenantPrincipal(...)` in `src/lib/security/tenant-principal-context.ts`
  and `src/lib/tenant-service.ts`. Tenant comes from the authenticated
  principal's **membership/binding**, defaulting to `PLATFORM.DEFAULT_TENANT_ID`
  / `PLATFORM.DEFAULT_WORKSPACE_ID`.
- **There is no Next.js middleware and no host/subdomain → tenant mapping.**
  `server.ts` is a network-bootstrap custom server, not a tenant router. A
  request's tenant is therefore only known *after* authentication.

**Isolation — proven where the write path is genuinely multi-tenant.**
- Cross-tenant adversarial proofs exist for exchange orders, withdrawal intents,
  CRM leads, offline-sync, platform memberships, principal bindings,
  api-command receipts, sensitive-audit, risk authority events, and community
  reputation (`src/tests/security/*cross-tenant-isolation*` and the reputation
  integration test). These are enforced by DB predicates + `ON CONFLICT
  (tenant_id, …)` keys, and guarded by the authority-check scripts.

**Pinning surface — the migration debt.**
- **37 non-test files reference `PLATFORM.DEFAULT_TENANT_ID`.** Some are correct
  defaults (`getDefaultTenant`), but several are *pins*: the domain ignores any
  caller tenant and always writes the default. The risk domain was the first
  such pin removed (PR #310): `recordRiskDecision` et al. now accept an optional
  `tenantId` that defaults to the platform default — backward-compatible,
  testable, and proven.

**Product gating — global, not yet per-tenant.**
- `src/lib/product-registry.ts` is a **centralized product registry**
  (`PRODUCTS`: exchange, academy, social, mentor, marketplace) with a
  per-product `featureFlag` and `isEnabled()`. Gating today is a **global**
  feature flag, not a per-tenant `products[]` check.
- `src/lib/route-guards.ts` already provides `requireTenant(session)`,
  `requireRole`, `requirePermission`, `requireFeature(flag)`. `requireTenant` is
  explicitly documented as *"a forward-compatible hook for multi-tenant
  enforcement in a future phase"* — i.e. the intended seam this plan fills.

**White-label — absent.**
- No host→tenant mapping, no per-tenant theme/brand/logo/locale config, and the
  product registry is not yet keyed by `platform_tenants.products[]`. Branding is
  global (`/images/tecpey-logo.png`, fixed palette tokens).

## 3. Target architecture

Four layers, from request edge to storage. Each layer already has a partial
foundation; the plan fills the gaps.

### 3.1 Tenant resolution (request edge) — NEW
Add a single **tenant-resolution boundary** that runs before route handlers and
produces a `ResolvedTenant { tenantId, workspaceId, source }`:

1. **Host/subdomain** — `acme.tecpey.ir` or a custom domain → tenant `slug`
   (a `platform_tenant_domains` lookup table: `host TEXT PRIMARY KEY,
   tenant_id, workspace_id, verified_at`).
2. **Explicit header** — `X-Tecpey-Tenant: <slug>` for API/service callers
   (validated against the caller's allowed tenants; never trusted blindly).
3. **Session membership** — the current behavior, as the authenticated fallback.
4. **Default** — `PLATFORM.DEFAULT_TENANT_ID` when nothing else resolves
   (keeps `tecpey.ir` itself working unchanged).

Implementation: a Next.js `middleware.ts` that resolves host→tenant and forwards
it as a **signed** request header the server trusts, *plus* a server-side
`resolveRequestTenant(req, session)` helper that reconciles the header with the
session's allowed tenants (defense-in-depth — the middleware hint is never the
sole authority). Precedence and the "hint ≤ session-allowed" rule are the
security core and must have their own authority test.

### 3.2 Tenant context propagation — EXTEND
Thread `ResolvedTenant` into the existing `AvailableTenantPrincipalContext` so
every authority receives the acting tenant. The **un-pin pattern** is already
established (risk, #310): give each pinned authority an optional `tenantId`
input that defaults to `DEFAULT_TENANT_ID`, then have its callers pass the
resolved tenant. This is done domain-by-domain so each is a small, provable
slice.

### 3.3 Product & policy gating — EXTEND (foundation exists)
Build on `src/lib/product-registry.ts` (the `PRODUCTS` registry) and
`src/lib/route-guards.ts` (`requireTenant`, `requireFeature`), rather than a new
system. `platform_tenants.products[]` and `platform_workspaces.settings` already
exist. Add:
- A pure `isProductEnabledForTenant(tenant, productId)` that ANDs the existing
  global `PRODUCTS[productId].isEnabled()` with the tenant's `products[]` — so a
  product is served only when both the platform flag and the tenant entitlement
  allow it.
- Promote `requireTenant` from the single-tenant hook to a real guard, and add a
  `requireProduct(tenant, productId)` route guard: a tenant without the `academy`
  product does not serve academy routes; without `exchange`, trading is hidden.
  Server-enforced, with the UI merely reflecting it.
- An authority test asserting product gates are server-enforced, not UI-only.

### 3.4 White-label branding — NEW
A per-tenant `branding` document (in `platform_workspaces.settings` or a new
`platform_tenant_branding` table): `displayName`, `logoUrl`, `palette`
(a constrained set of the existing CSS tokens), `defaultLocale`, `supportUrl`,
legal entity strings. Resolved once per request and injected as CSS variables +
a `TenantBrandingProvider` (client context) so components read brand tokens
instead of hardcoded `tecpey` values. Must stay within the existing
`ui:check` / `ui:public:check` token authority (no ad-hoc colors).

## 4. Gap analysis (what to build)

| Layer | Exists | Missing |
|-------|--------|---------|
| Tenant data model | tenants, workspaces, memberships, bindings | `platform_tenant_domains`, optional `platform_tenant_branding` |
| Request resolution | session/membership-derived | host/subdomain + signed-header middleware; `resolveRequestTenant` reconciliation |
| Authority scoping | risk (#310) un-pinned + proven | ~remaining pinned domains among the 37 `DEFAULT_TENANT_ID` files |
| Product gating | `products[]` column, `product-registry.ts` (global flags), `requireTenant`/`requireFeature` guards | per-tenant `isProductEnabledForTenant` + `requireProduct` guard + test |
| White-label | none | branding doc, provider, tokenized theming, per-tenant logo/locale |
| Admin | — | tenant CRUD + domain verification in the admin control plane (#13) |

## 5. Phased execution plan

Each phase is an independently shippable PR that keeps CI green, adds an
adversarial/authority test, and preserves fail-closed behavior. Ordered so the
**security-critical reconciliation lands before** any host-based routing is
trusted.

- **P0 — Tenant resolution contract (no behavior change).**
  Add `resolveRequestTenant(req, session)` returning `{ tenantId, workspaceId,
  source }` with precedence host → header → session → default, and the
  invariant *a resolved tenant must be one the session is allowed to act in*
  (else fall back to session/default, never escalate). Pure + unit-tested,
  including the adversarial "spoofed header for a foreign tenant is rejected"
  case. No middleware wired yet.

- **P1 — `platform_tenant_domains` + middleware hint.**
  Migration for the domain table; `middleware.ts` resolves host→tenant and sets
  a signed hint header; `resolveRequestTenant` consumes it. `tecpey.ir` and
  unknown hosts resolve to the default tenant (zero regression). Golden-Path
  e2e asserts the default host is unchanged.

- **P2..Pn — Un-pin one domain per PR.**
  For each genuinely multi-tenant pinned authority (following the risk #310
  pattern): add optional `tenantId`, pass the resolved tenant from callers, and
  add a cross-tenant proof. One domain per PR keeps each change small and
  reviewable on a money-safety surface.

- **Pn+1 — Product gating.**
  `isProductEnabled` + server-side route guard + test; UI reflects it.

- **Pn+2 — White-label branding.**
  Branding doc + `TenantBrandingProvider` + tokenized theming within the UI
  token authority; per-tenant logo/locale.

- **Pn+3 — Admin tenant management** (bridges into #13).
  Tenant/domain CRUD, domain verification, product/plan management, with the
  admin authority and audit gates.

## 6. Invariants to preserve (non-negotiable)

1. **Fail-closed default.** Anything unresolved is the default tenant, never a
   guessed or escalated one.
2. **The middleware hint is advice, not authority.** Server-side reconciliation
   against the session's allowed tenants is the real boundary and is tested
   adversarially.
3. **Every un-pinned domain ships with a cross-tenant proof** (the #310 method:
   verify-in-code → optional tenantId defaulting to default → adversarial test
   that fails when scoping is removed).
4. **No new hardcoded brand/color.** White-label theming stays inside the
   existing `ui:check` token authority.
5. **Backward compatibility.** Each slice defaults to today's single-tenant
   behavior; `tecpey.ir` is byte-for-byte unaffected until product/branding
   phases deliberately change it.

## 7. First concrete step

Implement **P0** (`resolveRequestTenant` + its adversarial unit test) as the
next PR — it is pure, security-critical, unblocks every later phase, and needs
no migration or middleware. It also gives reviewers the precedence/reconciliation
contract to sign off on before any host routing is trusted.
