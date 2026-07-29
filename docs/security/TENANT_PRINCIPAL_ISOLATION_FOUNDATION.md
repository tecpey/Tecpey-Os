# Tenant and Principal Isolation Foundation

Status: **P0 implementation contract**  
Issue: **#155**  
Parents: **#109, #100, #20**  
Foundation base: **`9c94fc289f893fd2dd3e1d5d8344d03f0b906e64`**  
Owner: **platform-security / multi-tenant foundation**

## 1. Objective

Every sensitive server mutation must receive one trusted tenant/workspace/principal context. Route payloads, browser storage, queue payloads and fallback platform contexts may not define that authority.

The first production slice applies the foundation to Offline Sync because its command table already contains tenant and student identifiers but previously lacked a database-enforced relationship between them.

## 2. Canonical context

`TenantPrincipalContext` is a discriminated union:

- `available: true` contains tenant, workspace, principal type/ID, roles/scopes, authentication evidence, correlation identity and binding source;
- `available: false` contains a bounded reason such as missing principal, unavailable database, missing binding, revoked binding or workspace mismatch.

A mutation may proceed only with the available variant. `resolvePlatformContext()` remains a presentation/routing helper; its guest fallback is not mutation authority.

## 3. Canonical binding

`platform_principal_bindings` binds:

- tenant;
- workspace belonging to that tenant;
- principal type;
- principal ID;
- active/revoked status;
- source and timestamps.

The default `workspace-primary` workspace is materialized in PostgreSQL so the configured workspace identifier is never a synthetic fallback. Existing Academy students are backfilled into the default tenant/workspace as active student principals.

## 4. Offline Sync production slice

- route resolves a strict session and canonical bound student context;
- signed Offline Sync scope must match the context tenant and principal;
- command authority accepts the typed context instead of independent tenant/student strings;
- `offline_sync_commands` carries generated principal identity columns and a composite foreign key to `platform_principal_bindings`;
- learning events receive the same binding constraint;
- cross-tenant command rows fail at PostgreSQL even when application checks are bypassed.

## 5. Inventory and drift gate

The reviewed machine-readable inventory covers:

- tenant/workspace/membership/binding tables;
- representative tenant-bearing domain tables and API routes;
- Redis namespaces;
- BullMQ queue namespaces;
- browser storage adapters;
- object-storage status;
- Admin and service identities;
- the first enforced Offline Sync slice.

Each reviewed source path has a deterministic SHA-256 digest. The gate regenerates a normalized inventory and rejects:

- missing required categories;
- duplicate IDs;
- missing source files;
- source hash drift;
- unowned or expired exceptions;
- removal of the Offline Sync binding/FK/context invariants.

## 6. Exception registry

Exceptions must contain an owner, issue, reason, compensating control and expiry date. They are temporary design debt, not implicit permission. The gate fails on expired or malformed entries.

Initial exceptions include the global Academy student registry and legacy membership user identity shape. Both are compensated by the new canonical binding and remain tracked under #109/#160.

## 7. Adversarial proof

The reusable PostgreSQL harness creates tenant A/B, workspace A/B and principal A/B. Tests prove:

- matching bindings resolve an available context;
- mismatched or revoked bindings fail closed;
- workspace/tenant mismatch is rejected;
- Offline Sync cross-tenant insertion violates the composite FK;
- tenant A command replay/query cannot read or mutate tenant B evidence;
- same client command identity remains independently scoped by tenant and principal;
- route/source guards reject reintroduction of independent tenant/principal arguments.

## 8. Non-goals

This slice does not migrate every domain table, replace all existing memberships or complete #109. It establishes the reusable context, binding, inventory, exception and test foundation required for subsequent domain migrations.
