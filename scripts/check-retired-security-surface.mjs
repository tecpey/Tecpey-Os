import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

async function listSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

function normalized(path) {
  return relative(".", path).split(sep).join("/");
}

const failures = [];
const deletedModules = ["withdrawal-service", "api-key-auth", "audit-log"];
const deletedSymbols = [
  "validateSignedApiKeyRequest",
  "hasApiKeyHeaders",
  "getAuditLog",
  "createWithdrawalRequest",
  "adminActOnWithdrawal",
  "cancelWithdrawal",
];

for (const path of await listSourceFiles("src")) {
  const sourcePath = normalized(path);
  if (
    sourcePath.includes("/tests/") ||
    sourcePath.includes("/stubs/") ||
    sourcePath.includes("/fixtures/")
  ) {
    continue;
  }

  const source = await readFile(path, "utf8");

  if (/\bwriteAudit\s*\(/.test(source)) {
    failures.push(`${sourcePath}: retired writeAudit caller is forbidden`);
  }

  for (const deletedModule of deletedModules) {
    const escaped = deletedModule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(`from\\s+["'][^"']*${escaped}["']`).test(source) ||
      new RegExp(`import\\s*\\([^)]*${escaped}`).test(source) ||
      new RegExp(`require\\s*\\([^)]*${escaped}`).test(source) ||
      new RegExp(`export\\s+[\\s\\S]*?from\\s+["'][^"']*${escaped}["']`).test(source)
    ) {
      failures.push(
        `${sourcePath}: deleted legacy module ${deletedModule} must not be loaded or re-exported`,
      );
    }
  }

  for (const deletedSymbol of deletedSymbols) {
    if (new RegExp(`\\b${deletedSymbol}\\b`).test(source)) {
      failures.push(
        `${sourcePath}: deleted legacy symbol ${deletedSymbol} must remain absent`,
      );
    }
  }

  if (/x-tecpey-(?:apikey|timestamp|signature)/i.test(source)) {
    failures.push(
      `${sourcePath}: launch-disabled signed API authentication headers are forbidden`,
    );
  }
}

if (failures.length > 0) {
  console.error("Retired security surface check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Retired security surface passed: all production src directories reject legacy audit writers, deleted Withdrawal entrypoints, signed API adapters, CommonJS/dynamic imports and signed-auth headers.",
);
