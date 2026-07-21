import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const files = {
  authority: "src/lib/security/withdrawal-read-authority.ts",
  admission: "src/lib/security/withdrawal-admission-service.ts",
  cancellation: "src/lib/security/withdrawal-cancel-authority.ts",
  replay: "src/lib/security/withdrawal-replay-authority.ts",
  userCollection: "src/app/api/auth/withdraw/route.ts",
  userDetail: "src/app/api/auth/withdraw/[id]/route.ts",
  adminCollection: "src/app/api/admin/withdrawals/route.ts",
  adminDetail: "src/app/api/admin/withdrawals/[id]/route.ts",
  postgresTest:
    "src/tests/security/withdrawal-admission-read-authority-postgres.test.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ]),
  ),
);

const failures = [];

function requireText(target, token, reason) {
  if (!content[target].includes(token)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (content[target].includes(token)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

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

for (const invariant of [
  'import "server-only"',
  '"withdrawal-read-authority-v1"',
  "export type WithdrawalState",
  "export type WithdrawalRecord",
  "export type WithdrawalReadResult",
  "export type WithdrawalListResult",
  "WITHDRAWAL_PROJECTION_COLUMNS",
  "amount::text AS amount",
  "amount_usd::text AS amount_usd",
  "compliance_checked_at::text AS compliance_checked_at",
  "created_at::text AS created_at",
  "export async function readWithdrawal(",
  "AND user_id = $2",
  "export async function listUserWithdrawalsStrict(",
  "ORDER BY created_at DESC, id DESC",
  "export async function listPendingReviewWithdrawalsStrict(",
  "state IN ('pending', 'compliance_review')",
  "ORDER BY created_at ASC, id ASC",
  "Number.isSafeInteger(value)",
  "Math.min(Math.max(value, 1), maximum)",
  'reason: "withdrawal_storage_unavailable"',
]) {
  requireText("authority", invariant, `read authority invariant is missing: ${invariant}`);
}

for (const forbidden of [
  "SELECT *",
  "INSERT INTO",
  "UPDATE withdrawals",
  "DELETE FROM",
  "writeAudit",
  "notifyWithdrawal",
  "trackAuthEvent",
  "evaluateWithdrawalCompliance",
  "getStrictWithdrawalRiskLevel",
  "wallet_ledger",
  "localStorage",
  "sessionStorage",
  "Math.random",
]) {
  rejectText(
    "authority",
    forbidden,
    `read authority contains forbidden mutation/browser behavior: ${forbidden}`,
  );
}

for (const [target, invariant] of [
  ["admission", 'from "./withdrawal-read-authority"'],
  ["cancellation", 'from "./withdrawal-read-authority"'],
  ["replay", 'from "./withdrawal-read-authority"'],
  ["userCollection", 'from "@/lib/security/withdrawal-read-authority"'],
  ["userDetail", 'from "@/lib/security/withdrawal-read-authority"'],
  ["adminCollection", 'from "@/lib/security/withdrawal-read-authority"'],
  ["adminDetail", 'from "@/lib/security/withdrawal-read-authority"'],
]) {
  requireText(target, invariant, "active withdrawal consumer must use the dedicated read authority");
}

rejectText(
  "admission",
  "listUserWithdrawalsStrict",
  "user-list projection must not remain in the mutation service",
);
requireText(
  "admission",
  "const read = await readWithdrawal(",
  "admission receipt must use the strict read result",
);
requireText(
  "admission",
  "if (!read.ok || !read.withdrawal)",
  "admission must fail closed when committed evidence cannot be read",
);
requireText(
  "cancellation",
  "if (!read.ok || !read.withdrawal)",
  "cancellation receipt must fail closed when projection is unavailable",
);
requireText(
  "replay",
  'if (!read.ok) return { status: "unavailable" }',
  "replay must distinguish storage outage from absence",
);

for (const target of ["userDetail", "adminDetail"]) {
  requireText(
    target,
    "if (!read.ok) return apiError(read.reason, 503)",
    "detail route must expose storage outage as 503",
  );
  requireText(
    target,
    'return apiError("withdrawal_not_found", 404)',
    "detail route must preserve true not-found semantics",
  );
}
requireText(
  "adminCollection",
  "if (!result.ok) return apiError(result.reason, 503)",
  "Admin collection must not fabricate an empty queue on storage outage",
);
requireText(
  "userCollection",
  "if (!result.ok) return apiError(result.reason, 503)",
  "user collection must fail closed on storage outage",
);

for (const evidence of [
  "enforces owner scope without fabricating a missing record",
  "bounds user pagination and returns only the requested principal",
  "filters the Admin review queue and preserves deterministic oldest-first order",
  "assert.deepEqual(denied, { ok: true, withdrawal: null })",
  "assert.equal(returnedIds.includes(ids.newest), false)",
]) {
  requireText(
    "postgresTest",
    evidence,
    `PostgreSQL read-authority evidence is missing: ${evidence}`,
  );
}

const sourcePaths = await listSourceFiles("src");
for (const path of sourcePaths) {
  const normalizedPath = relative(".", path).split(sep).join("/");
  if (normalizedPath === "src/lib/security/withdrawal-service.ts") continue;
  const source = await readFile(path, "utf8");
  if (
    /(?:import|export)[\s\S]*?["'][^"']*withdrawal-service["']/.test(source) ||
    /require\s*\([^)]*withdrawal-service/.test(source)
  ) {
    failures.push(
      `${normalizedPath}: active dependency on mixed legacy withdrawal-service is forbidden`,
    );
  }
}

if (failures.length > 0) {
  console.error("Withdrawal read authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Withdrawal read authority passed: explicit projections, owner isolation, bounded pagination, deterministic ordering, strict outage semantics and zero active imports from the mixed legacy withdrawal service are enforced.",
);
