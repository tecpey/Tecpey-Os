import { readFile } from "node:fs/promises";

const files = {
  governance: "docs/security/SENSITIVE_MUTATION_AUDIT_GOVERNANCE.md",
  inventory:
    "docs/security/generated/sensitive-mutation-audit-domain-inventory.json",
  policy: "docs/security/AUDIT_DATA_RETENTION_AND_ACCESS_POLICY.md",
};

const [governance, inventorySource, policy] = await Promise.all([
  readFile(files.governance, "utf8"),
  readFile(files.inventory, "utf8"),
  readFile(files.policy, "utf8"),
]);
const inventory = JSON.parse(inventorySource);
const failures = [];

function requireText(sourceName, source, token, reason) {
  if (!source.includes(token)) failures.push(`${files[sourceName]}: ${reason}`);
}

for (const invariant of [
  "sensitive-mutation-audit-governance-v1",
  `${inventory.actions.length} actions`,
  `${inventory.resources.length} resources`,
  "SensitiveMutationAuditAction",
  "SensitiveMutationAuditResource",
  "Transaction-coupled mutation evidence",
  "Durable state/outbox evidence",
  "Operational evidence",
  "Usage state is derived from production source",
  "Reserved values are not silently removed",
  "Actor and scope rules",
  "Metadata rules",
  "Correlation and replay",
  "Historical data boundary",
  "Change procedure",
  "check-sensitive-audit-domain-inventory.mjs",
  "check-retired-security-surface.mjs",
  "Final retention duration requires Legal, Compliance and Privacy approval",
]) {
  requireText(
    "governance",
    governance,
    invariant,
    `missing governance invariant: ${invariant}`,
  );
}

const owners = [
  "identity-security",
  "custody-platform",
  "exchange-platform",
  "notifications",
  "ai-platform",
  "risk-platform",
  "community-platform",
];
for (const owner of owners) {
  requireText(
    "governance",
    governance,
    `\`${owner}\``,
    `domain owner is missing from governance map: ${owner}`,
  );
  if (!inventory.actions.some((entry) => entry.domainOwner === owner)) {
    failures.push(`${files.inventory}: governance owner has no action: ${owner}`);
  }
}

const inventoryOwners = [...new Set(inventory.actions.map((entry) => entry.domainOwner))].sort();
if (
  inventoryOwners.length !== owners.length ||
  owners.some((owner) => !inventoryOwners.includes(owner))
) {
  failures.push(
    `${files.inventory}: action owners must exactly equal the seven typed governance owners`,
  );
}

for (const forbiddenOwner of ["crm-platform"]) {
  if (inventory.actions.some((entry) => entry.domainOwner === forbiddenOwner)) {
    failures.push(
      `${files.inventory}: untyped domain owner must not be invented: ${forbiddenOwner}`,
    );
  }
}

for (const invariant of [
  "audit-data-retention-access-v1",
  "no automatic deletion",
  "There is no public or end-user audit API",
  "No archival or deletion implementation is authorized",
  "Legal",
  "Compliance",
  "Privacy",
]) {
  requireText(
    "policy",
    policy,
    invariant,
    `governed retention policy is missing: ${invariant}`,
  );
}

if (inventory.actions.length !== 59) {
  failures.push(
    `${files.inventory}: expected 59 classified actions, found ${inventory.actions.length}`,
  );
}
if (inventory.resources.length !== 21) {
  failures.push(
    `${files.inventory}: expected 21 classified resources, found ${inventory.resources.length}`,
  );
}

if (failures.length > 0) {
  console.error("Sensitive audit governance document check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Sensitive audit governance map passed: 59 actions, 21 resources, seven real domain owners, evidence modes, change procedure and conservative retention/access authority are synchronized.",
);
