import { appendFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const diagnosticsPath = "/tmp/tecpey-withdrawal-admission-tests.log";
const checks = [
  "scripts/check-withdrawal-read-authority.mjs",
  "scripts/check-withdrawal-read-outage-boundary.mjs",
  "scripts/check-withdrawal-admission-authority.mjs",
  "scripts/check-withdrawal-prebroadcast-evidence.mjs",
  "scripts/check-withdrawal-runtime-authority.mjs",
];

await writeFile(
  diagnosticsPath,
  `Withdrawal authority diagnostics\nNode: ${process.version}\n\n`,
  "utf8",
);

let failed = false;
for (const script of checks) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  const output = [
    `=== ${script} ===`,
    result.stdout.trimEnd(),
    result.stderr.trimEnd(),
    `exit=${result.status ?? "signal"}`,
    "",
  ]
    .filter((line, index) => line.length > 0 || index === 4)
    .join("\n");

  process.stdout.write(`${output}\n`);
  await appendFile(diagnosticsPath, `${output}\n`, "utf8");
  if (result.status !== 0) failed = true;
}

if (failed) process.exitCode = 1;
