// Security marker coverage authority.
//
// Several guards keep a hand-written inventory of the files they protect. That
// arrangement fails silently in one specific way: a *new* file adopts a
// security-critical marker, no inventory is updated, and the marker is then
// guarded by nothing. It is invisible because every guard still passes.
//
// This is not hypothetical. `check-strict-revocation-authority.mjs` enrolled 9
// routes while 43 requested `strictRevocation: true`, so withdrawals and orders
// could have lost strict revocation without any gate failing. The bounded-body
// inventory had drifted past `src/app/api/mentor-preferences/route.ts` the same
// way.
//
// The rule here is deliberately weak but drift-proof: every source file using a
// governed marker must be named by at least one guard. It does not judge what
// the guard asserts — the domain guards do that — it only refuses to let a
// security-critical surface exist with no guard aware of it.

import { readFile, readdir } from "node:fs/promises";

const GOVERNED_MARKERS = [
  "assertCustodyCapability",
  "readBoundedJsonRequest",
  "strictRevocation: true",
  "writeSensitiveMutationAuditTx",
  "resolveTenantPrincipalContext",
];

async function sourceFiles(root) {
  const entries = await readdir(root, { recursive: true });
  return entries
    .map((entry) => `${root}/${entry.replaceAll("\\", "/")}`)
    .filter((file) => /\.tsx?$/.test(file) && !file.startsWith("src/tests/"))
    .sort();
}

const failures = [];

const guardNames = (await readdir("scripts")).filter(
  (file) => file.startsWith("check-") && file.endsWith(".mjs"),
);
const guards = await Promise.all(
  guardNames.map(async (name) => ({
    name,
    text: await readFile(`scripts/${name}`, "utf8"),
  })),
);

const files = await sourceFiles("src");
const contents = new Map(
  await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])),
);

let governed = 0;
for (const marker of GOVERNED_MARKERS) {
  const users = files.filter((file) => contents.get(file).includes(marker));
  if (users.length === 0) {
    failures.push(`marker "${marker}" has no users — the marker or this guard is stale`);
    continue;
  }
  for (const file of users) {
    governed += 1;
    const covered = guards.some((guard) => guard.text.includes(file));
    if (!covered) {
      failures.push(
        `${file}: uses "${marker}" but no scripts/check-*.mjs guard names it`,
      );
    }
  }
}

if (failures.length) {
  console.error("Security marker coverage check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Security marker coverage check passed: ${governed} marker usages across ${GOVERNED_MARKERS.length} governed markers are each named by at least one guard.`,
);
