import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = {
  context: "src/lib/security/tenant-principal-context.ts",
  migration: "src/lib/db-migrate-tenant-principal-isolation.ts",
  plan: "src/lib/db-migration-plan.ts",
  route: "src/app/api/offline-sync/route.ts",
  authority: "src/lib/offline-sync-authority.ts",
  offlineGuard: "scripts/check-offline-sync-authority.mjs",
  inventory: "docs/security/generated/tenant-principal-isolation-inventory.json",
  exceptions: "docs/security/tenant-principal-isolation-exceptions.json",
  contextTests: "src/tests/security/tenant-principal-context-postgres.test.ts",
  offlineTests: "src/tests/security/offline-sync-authority-postgres.test.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const normalizeSource = (value) => value.replace(/\s+/g, " ").trim();
const normalizedSource = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, normalizeSource(value)]),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!normalizedSource[target].includes(normalizeSource(text))) {
    failures.push(`${files[target]}: ${reason}`);
  }
};
const rejectText = (target, text, reason) => {
  if (normalizedSource[target].includes(normalizeSource(text))) {
    failures.push(`${files[target]}: ${reason}`);
  }
};

try {
  execFileSync(
    process.execPath,
    ["scripts/generate-tenant-principal-isolation-inventory.mjs"],
    { encoding: "utf8", env: { ...process.env, NODE_ENV: "test" } },
  );
} catch (error) {
  failures.push(
    `tenant isolation inventory drift gate failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

for (const invariant of [
  "export type TenantPrincipalContext",
  "available: true",
  "available: false",
  "resolveBoundTenantPrincipal",
  "resolveTenantPrincipalContext",
  "binding_storage_unavailable",
  "binding_missing",
  "binding_revoked",
  "workspace_mismatch",
  "strictRevocation: true",
]) {
  requireText("context", invariant, `canonical context is missing ${invariant}`);
}
requireText(
  "context",
  "FROM platform_principal_bindings binding",
  "context must resolve PostgreSQL principal binding",
);
requireText(
  "context",
  "workspace.tenant_id = binding.tenant_id",
  "context must prove workspace belongs to tenant",
);

for (const invariant of [
  'FILENAME = "0046_tenant_principal_isolation_foundation.sql"',
  "CREATE TABLE IF NOT EXISTS platform_principal_bindings",
  "platform_principal_binding_workspace_fk",
  "platform principal binding identity is immutable",
  "academy_student_default_principal_binding",
  "academy_account_default_principal_binding",
  "offline_sync_commands_principal_binding_fk",
  "learning_events_principal_binding_fk",
  "workspace-primary must belong to tenant tecpey",
]) {
  requireText("migration", invariant, `migration is missing ${invariant}`);
}
requireText(
  "plan",
  "runTenantPrincipalIsolationMigrations",
  "canonical migration plan must execute 0046",
);

for (const invariant of [
  "resolveTenantPrincipalContext({",
  'requiredPrincipalType: "student"',
  'scopes: ["offline-sync:write"]',
  "scope.scope.tenantId !== context.tenantId",
  "scope.scope.studentId !== context.principalId",
  "context,",
  "item: normalized.item",
]) {
  requireText("route", invariant, `Offline Sync route is missing ${invariant}`);
}
rejectText(
  "route",
  "resolvePlatformContext",
  "Offline Sync route cannot use presentation platform fallback as mutation authority",
);
rejectText(
  "route",
  "tenantId: platform.tenantId",
  "route cannot pass an independently resolved tenant ID",
);
rejectText(
  "route",
  "studentId: session.studentId",
  "route cannot pass an independently resolved principal ID",
);

for (const invariant of [
  "export type OfflineSyncAuthorityContext",
  "context: AvailableTenantPrincipalContext",
  'context.principalType !== "student"',
  'context.scopes.includes("offline-sync:write")',
  "const context = input.context",
  "const tenantId = context.tenantId",
  "const studentId = context.principalId",
]) {
  requireText("authority", invariant, `Offline Sync authority is missing ${invariant}`);
}
rejectText(
  "authority",
  "tenantId: string; studentId: string; item: OfflineSyncItem",
  "Offline Sync mutation cannot accept independent tenant/student authority",
);

requireText(
  "offlineGuard",
  "resolveTenantPrincipalContext",
  "existing Offline Sync guard must enforce the canonical context",
);
requireText(
  "offlineGuard",
  "platform_principal_bindings",
  "existing Offline Sync guard must enforce database binding",
);

for (const category of [
  "admin_identity",
  "api_route",
  "browser_storage",
  "object_storage",
  "queue_namespace",
  "redis_namespace",
  "relational_table",
  "service_identity",
]) {
  requireText("inventory", `"${category}"`, `generated inventory is missing ${category}`);
}
for (const field of ["owner", "issue", "expiresOn", "compensatingControl"]) {
  requireText("exceptions", `"${field}"`, `exception registry is missing ${field}`);
}

for (const proof of [
  "resolves matching tenant, workspace and student binding",
  "fails closed for missing, revoked and mismatched bindings",
  "rejects a workspace that belongs to another tenant",
]) {
  requireText("contextTests", proof, `missing context adversarial proof: ${proof}`);
}
for (const proof of [
  "rejects a cross-tenant command row at the composite foreign key",
  "isolates the same client event identity across tenant and principal contexts",
]) {
  requireText("offlineTests", proof, `missing Offline Sync isolation proof: ${proof}`);
}

if (failures.length) {
  console.error("Tenant/principal isolation check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Tenant/principal isolation check passed: reviewed inventory, governed exceptions, typed context, canonical bindings, Offline Sync database FKs and tenant A/B principal A/B evidence are current.",
);
