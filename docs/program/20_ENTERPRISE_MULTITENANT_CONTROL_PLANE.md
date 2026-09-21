# Enterprise SaaS — multi-tenant isolation, white-label and admin control plane

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** builds on existing tenant/workspace/principal/RLS authorities and issue #20 architecture. #699 supplies commercial plan authority when enterprise billing is later enabled.

## Objective
Move from “tenant-aware data model” to an enforceable tenant runtime/product contract and audited enterprise administration.

## Research anchors
AWS SaaS guidance emphasizes that authentication/authorization alone is not tenant isolation, and isolation should be applied through shared mechanisms rather than relying on every developer. PostgreSQL RLS defaults to deny when RLS is enabled with no applicable policy, while table owners/BYPASSRLS require explicit care.

Primary references:
- https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html
- https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-isolation-mindset.html
- https://www.postgresql.org/docs/17/ddl-rowsecurity.html

## Runtime tenant authority
- host/custom-domain → tenant/workspace resolution;
- signed/validated internal tenant hint, reconciled against authenticated membership; request headers are never authority alone;
- unknown/spoofed tenant fails closed;
- tenant context propagated to jobs, queues, caches, AI, notifications and audit logs;
- background workers cannot fall back to default tenant silently.

## Database isolation
- complete registry of every tenant-scoped table;
- close all remaining cross-tenant negative-test gaps;
- RLS/FORCE RLS where appropriate plus application predicates as defense in depth;
- DB roles used by runtime may not have unintended BYPASSRLS/owner bypass;
- migration/test guard fails when new tenant-scoped table is unregistered.

## Product/white-label
- per-tenant product grants AND global platform flags;
- verified custom domains;
- constrained branding tokens/logo/legal/support/default locale;
- FA/EN and accessibility preserved under tenant theming;
- default TecPey host remains regression-safe.

## Enterprise admin control plane
- tenant/workspace/domain lifecycle;
- membership/role/permission management;
- product/plan enablement;
- provider/config readiness without secret exposure;
- audit log for every admin mutation;
- dual-control/step-up for high-risk operations;
- impersonation/support access, if supported, is explicit, time-bounded, user/tenant-visible where policy requires, and audited.

## Isolation tests
- cross-tenant object access;
- spoofed host/header;
- cache-key collision;
- queue/job missing tenant context;
- AI memory/research cross-tenant access;
- admin role escalation;
- custom-domain collision;
- tenant deletion/suspension without data leakage.

## Acceptance
A tenant boundary violation is mechanically prevented and negatively tested across every registered domain. Enterprise/white-label remains launch-disabled until runtime isolation coverage and admin governance are complete.
