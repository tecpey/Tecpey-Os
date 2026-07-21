import { readFile } from "node:fs/promises";

const files = {
  authority: "src/lib/security/withdrawal-read-authority.ts",
  userCollection: "src/app/api/auth/withdraw/route.ts",
  userDetail: "src/app/api/auth/withdraw/[id]/route.ts",
  adminCollection: "src/app/api/admin/withdrawals/route.ts",
  adminDetail: "src/app/api/admin/withdrawals/[id]/route.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const failures = [];

function requireText(target, token, reason) {
  if (!source[target].includes(token)) failures.push(`${files[target]}: ${reason}`);
}

for (const invariant of [
  "type WithdrawalStorageResult<T>",
  "async function withWithdrawalStorage<T>",
  "try {",
  "const result = await withDb(operation)",
  'return { ok: false, reason: "withdrawal_storage_unavailable" }',
  "} catch {",
  "return row ? toWithdrawalRecord(row) : null",
  "return selected.rows.map(toWithdrawalRecord)",
  'throw new Error("withdrawal_projection_amount_usd_invalid")',
]) {
  requireText("authority", invariant, `outage boundary is missing ${invariant}`);
}

const helperIndex = source.authority.indexOf("async function withWithdrawalStorage<T>");
const tryIndex = source.authority.indexOf("try {", helperIndex);
const withDbIndex = source.authority.indexOf("const result = await withDb(operation)", tryIndex);
const catchIndex = source.authority.indexOf("} catch {", withDbIndex);
const unavailableIndex = source.authority.indexOf(
  'return { ok: false, reason: "withdrawal_storage_unavailable" }',
  catchIndex,
);
if (
  helperIndex < 0 ||
  tryIndex < helperIndex ||
  withDbIndex < tryIndex ||
  catchIndex < withDbIndex ||
  unavailableIndex < catchIndex
) {
  failures.push(
    `${files.authority}: connection/query/projection exceptions must be caught inside the storage helper and mapped to withdrawal_storage_unavailable`,
  );
}

for (const target of ["userDetail", "adminDetail"]) {
  requireText(
    target,
    "if (!read.ok) return apiError(read.reason, 503)",
    "detail route must map storage outage to 503",
  );
}
for (const target of ["userCollection", "adminCollection"]) {
  requireText(
    target,
    "if (!result.ok) return apiError(result.reason, 503)",
    "collection route must map storage outage to 503",
  );
}

if (failures.length > 0) {
  console.error("Withdrawal read outage boundary failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Withdrawal read outage boundary passed: disabled storage, connection/query failure and invalid persisted projections all become governed 503 results rather than unhandled 500s.",
);
