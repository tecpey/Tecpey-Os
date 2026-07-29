import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readSecretScanningBaseline } from "./secret-scanning-baseline.mjs";

const EXACT_SHA_EXPRESSION = "${{ github.event.pull_request.head.sha || github.sha }}";
const PINNED_ACTION = /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}(?:\s+#\s+v?\S+)?$/i;
const EXPECTED_STEPS = [
  "Checkout exact source and full history",
  "Verify exact checkout",
  "Setup Node.js",
  "Verify permanent secret-scanning authority",
  "Run secret-scanning policy tests",
  "Scan all reachable Git history",
  "Upload redacted immutable evidence",
];

function countExactLine(source, expected) {
  return source.split(/\r?\n/).filter((line) => line === expected).length;
}

function requireExactlyOne(findings, source, expected, finding) {
  if (countExactLine(source, expected) !== 1) findings.push(finding);
}

export function secretScanningWorkflowFindings(workflowSource) {
  const findings = [];
  if (typeof workflowSource !== "string" || workflowSource.length === 0) {
    return ["secret-scanning workflow source is empty"];
  }

  requireExactlyOne(
    findings,
    workflowSource,
    "permissions:",
    "workflow permissions must be one top-level mapping",
  );
  requireExactlyOne(
    findings,
    workflowSource,
    "  contents: read",
    "workflow permissions must grant only contents: read",
  );
  if (/^\s{2,}permissions\s*:/m.test(workflowSource)) {
    findings.push("job-level or nested permissions are forbidden");
  }
  if (/^\s*GITHUB_SHA\s*:/m.test(workflowSource)) {
    findings.push("reserved GITHUB_SHA must not be overridden");
  }
  if (/^\s*continue-on-error\s*:\s*true\s*$/m.test(workflowSource)) {
    findings.push("secret-scanning failures must not continue on error");
  }

  const stepNames = workflowSource
    .split(/\r?\n/)
    .map((line) => /^\s{6}- name: (.+)$/.exec(line)?.[1])
    .filter(Boolean);
  if (JSON.stringify(stepNames) !== JSON.stringify(EXPECTED_STEPS)) {
    findings.push("workflow must retain the exact governed step sequence");
  }

  for (const line of workflowSource.split(/\r?\n/)) {
    const uses = /^\s+uses:\s+(.+)$/.exec(line)?.[1];
    if (uses && !PINNED_ACTION.test(uses)) {
      findings.push(`action is not pinned to a full commit SHA: ${uses}`);
    }
  }

  for (const [line, finding] of [
    [
      `          ref: ${EXACT_SHA_EXPRESSION}`,
      "checkout must bind to the pull-request head SHA or push SHA",
    ],
    ["          fetch-depth: 0", "checkout must fetch complete history"],
    ["          fetch-tags: true", "checkout must fetch tags"],
    ["          persist-credentials: false", "checkout credentials must not persist"],
    [
      `          EXPECTED_SHA: ${EXACT_SHA_EXPRESSION}`,
      "checkout verification must receive the exact expected SHA",
    ],
    [
      '        run: test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
      "checkout verification command is missing",
    ],
    [
      "        run: npm run security:secrets:check",
      "permanent secret-scanning authority guard is missing",
    ],
    [
      "        run: npm run test:secret-scanning",
      "secret-scanning policy tests are missing",
    ],
    [
      `          TECPEY_SECRET_SCAN_SOURCE_SHA: ${EXACT_SHA_EXPRESSION}`,
      "secret scanner must receive the exact source SHA",
    ],
    ["        run: bash scripts/run-secret-scan.sh", "governed secret scanner is missing"],
    ["        if: ${{ always() }}", "redacted evidence must upload even after scan failure"],
    [
      `          name: secret-scanning-${EXACT_SHA_EXPRESSION}`,
      "artifact name must include the exact source SHA",
    ],
    [
      "          path: artifacts/secret-scanning/**",
      "artifact upload path must remain bounded",
    ],
    ["          if-no-files-found: error", "missing secret-scanning evidence must fail"],
    ["          retention-days: 30", "secret-scanning evidence retention must remain 30 days"],
  ]) {
    requireExactlyOne(findings, workflowSource, line, finding);
  }

  return findings;
}

export function secretScanningRunnerFindings(runnerSource, baseline) {
  const findings = [];
  if (typeof runnerSource !== "string" || runnerSource.length === 0) {
    return ["secret-scanning runner source is empty"];
  }
  const expectedContracts = [
    `readonly GITLEAKS_VERSION="${baseline.scanner.version}"`,
    `readonly GITLEAKS_RELEASE_COMMIT="${baseline.scanner.releaseCommit}"`,
    `readonly GITLEAKS_LINUX_X64_SHA256="${baseline.scanner.linuxX64ArchiveSha256}"`,
    `readonly GITLEAKS_DEFAULT_CONFIG_SHA256="${baseline.scanner.defaultConfigSha256}"`,
    'readonly expected_sha="${TECPEY_SECRET_SCAN_SOURCE_SHA:?TECPEY_SECRET_SCAN_SOURCE_SHA is required}"',
    'readonly artifact_dir="${TECPEY_SECRET_SCAN_ARTIFACT_DIR:-artifacts/secret-scanning}"',
    'if [[ "$artifact_dir" != "artifacts/secret-scanning" ]]; then',
    'tar --no-same-owner -xzf "$archive_path" -C "$temporary_directory" gitleaks',
    'node scripts/secret-scanning-baseline.mjs --output="$ignore_path"',
    '  --config "$config_path" \\',
    '  --gitleaks-ignore-path "$ignore_path" \\',
    "  --log-opts='--all' \\",
    '  --report-path "$artifact_dir/findings.redacted.json" \\',
    "  --redact \\",
    '  --source-tree="$(git rev-parse HEAD^{tree})" \\',
  ];
  for (const contract of expectedContracts) {
    if (!runnerSource.split(/\r?\n/).includes(contract)) {
      findings.push(`runner contract is missing: ${contract}`);
    }
  }
  if (
    runnerSource
      .split(/\r?\n/)
      .filter((line) => line.trim() === "sha256sum --check --status").length !== 2
  ) {
    findings.push("both downloaded scanner and config digests must be verified");
  }
  if (!runnerSource.includes("github-pat")) {
    findings.push("detector self-test must require the github-pat rule");
  }
  if (runnerSource.includes("--no-redact")) {
    findings.push("secret scanner must never disable redaction");
  }
  return findings;
}

export function assertSecretScanningAuthority({
  workflowSource,
  runnerSource,
  packageJson,
  ciSource,
  baseline,
}) {
  const findings = [
    ...secretScanningWorkflowFindings(workflowSource),
    ...secretScanningRunnerFindings(runnerSource, baseline),
  ];
  if (packageJson.scripts?.["security:secrets:check"] !== "node scripts/check-secret-scanning-authority.mjs") {
    findings.push("package security:secrets:check command is missing or changed");
  }
  if (
    packageJson.scripts?.["test:secret-scanning"] !==
    "node --test scripts/secret-scanning-baseline.test.mjs scripts/secret-scanning-authority.test.mjs"
  ) {
    findings.push("package test:secret-scanning command is missing or changed");
  }
  if (
    !ciSource.includes("      - name: Secret-scanning authority guard\n        run: npm run security:secrets:check")
  ) {
    findings.push("primary CI must enforce the permanent secret-scanning authority");
  }
  if (findings.length > 0) {
    throw new Error(`Secret-scanning authority failed:\n- ${findings.join("\n- ")}`);
  }
}

function runCli() {
  const baseline = readSecretScanningBaseline();
  assertSecretScanningAuthority({
    workflowSource: fs.readFileSync(".github/workflows/secret-scanning.yml", "utf8"),
    runnerSource: fs.readFileSync("scripts/run-secret-scan.sh", "utf8"),
    packageJson: JSON.parse(fs.readFileSync("package.json", "utf8")),
    ciSource: fs.readFileSync(".github/workflows/ci.yml", "utf8"),
    baseline,
  });
  console.log(
    `Secret-scanning authority: Gitleaks ${baseline.scanner.version}, ${baseline.findings.length} exact reviewed identities`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
