function requireText(findings, source, expected, message) {
  const normalizedSource = source.replace(/\s+/g, " ");
  const normalizedExpected = expected.replace(/\s+/g, " ");
  if (!source.includes(expected) && !normalizedSource.includes(normalizedExpected)) {
    findings.push(message);
  }
}

function reject(findings, source, pattern, message) {
  if (pattern.test(source)) findings.push(message);
}

function requireOrdered(findings, source, tokens, message) {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor + 1);
    if (index < 0) {
      findings.push(`${message}: missing ${token}`);
      return;
    }
    if (index <= cursor) {
      findings.push(message);
      return;
    }
    cursor = index;
  }
}

function packageScripts(packageJsonSource) {
  try {
    return JSON.parse(packageJsonSource).scripts ?? {};
  } catch {
    return {};
  }
}

function uncommentedTableSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .map((line) => line.replace(/\s+\/\/.*$/, ""))
    .join("\n");
}

/**
 * The script commands the rehearsal pins, read out of the rehearsal itself.
 *
 * Returns null when the table cannot be found, which is treated as a finding: a
 * rehearsal whose pins cannot be inspected cannot be cross-checked either.
 */
function rehearsalPinnedScripts(rehearsalSource) {
  const table = /Object\.entries\(\{([\s\S]*?)\}\)\)\s*\{/.exec(rehearsalSource);
  if (!table) return null;
  const entries = [
    ...uncommentedTableSource(table[1]).matchAll(
      /"?([A-Za-z:][\w:.-]*)"?\s*:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g,
    ),
  ].map((match) => [match[1], match[2]]);
  return entries.length ? Object.fromEntries(entries) : null;
}

// Names only. The commands themselves live in package.json and the pins live in
// the rehearsal; repeating the commands here would make this a third copy of the
// same facts, which is the drift this check exists to catch.
const REHEARSAL_MUST_PIN = [
  "support:bundle",
  "support:bundle:verify",
  "support:install:rehearse",
  "support:install:check",
  "env:check",
  "build",
  "health",
];

export function supportInstallReadinessFindings({
  packageJson,
  bundleCreator,
  bundleVerifier,
  rehearsal,
  readinessContract,
  handoff,
  workflow,
}) {
  const findings = [];
  const scripts = packageScripts(packageJson);

  // The rehearsal fails a support bundle when package.json does not match its
  // pinned commands exactly, and it runs only in a workflow_dispatch workflow. So
  // editing one of those scripts breaks every bundle with nothing on a branch
  // saying so — which is how extending env:check in #518 nearly shipped. That one
  // pin was then guarded on its own; the other six were not. Cross-check the whole
  // table here, where branch CI already reads both files.
  const pinned = rehearsalPinnedScripts(rehearsal);
  if (!pinned) {
    findings.push(
      "support install rehearsal must pin package.json scripts in an inspectable table",
    );
  } else {
    for (const name of REHEARSAL_MUST_PIN) {
      if (!(name in pinned)) {
        findings.push(`support install rehearsal must pin the ${name} script`);
      }
    }
    for (const [name, command] of Object.entries(pinned)) {
      if (scripts[name] !== command) {
        findings.push(
          `package.json script ${name} has drifted from the support bundle rehearsal pin.\n` +
            `  rehearsal expects: ${command}\n` +
            `  package.json has:  ${scripts[name] ?? "(missing)"}`,
        );
      }
    }
  }

  for (const token of [
    "docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md",
    "scripts/rehearse-support-deployment-install.mjs",
    "scripts/check-support-install-readiness-authority.mjs",
    "scripts/support-install-readiness-policy.mjs",
    "support:install:rehearse",
  ]) {
    requireText(
      findings,
      bundleCreator,
      token,
      `support bundle manifest must include ${token}`,
    );
    requireText(
      findings,
      bundleVerifier,
      token,
      `support bundle verifier must require ${token}`,
    );
  }

  for (const token of [
    "verify-support-deployment-bundle.mjs",
    "mkdtemp",
    "unzip",
    "Unsafe bundle entry path",
    ".env.production",
    "SUPPORT_BUNDLE_MANIFEST.txt",
    "Clean-Room Install Rehearsal",
    "bash scripts/ubuntu24-preflight.sh candidate",
    "bash scripts/ubuntu24-preflight.sh migrate",
    "bash scripts/ubuntu24-preflight.sh runtime",
  ]) {
    requireText(findings, rehearsal, token, `support install rehearsal missing ${token}`);
  }
  reject(
    findings,
    rehearsal,
    /execFileSync\((["'])bash\1/,
    "support install rehearsal must not execute bundled shell scripts",
  );
  reject(
    findings,
    rehearsal,
    /execFileSync\((["'])npm\1/,
    "support install rehearsal must not execute bundled npm scripts",
  );

  for (const token of [
    "Clean-Room Install Rehearsal",
    "npm run support:install:rehearse -- tecpey-deployment-RELEASE_SHA.zip tecpey-deployment-RELEASE_SHA.zip.sha256",
    "No staging or server access is required for this rehearsal.",
    "This rehearsal does not run build, migration, runtime, database, Redis, or Nginx commands.",
  ]) {
    requireText(findings, handoff, token, `support handoff missing ${token}`);
    requireText(findings, readinessContract, token, `support readiness contract missing ${token}`);
  }
  requireOrdered(
    findings,
    handoff,
    [
      "npm run support:install:rehearse -- tecpey-deployment-RELEASE_SHA.zip tecpey-deployment-RELEASE_SHA.zip.sha256",
      "sha256sum -c tecpey-deployment-RELEASE_SHA.zip.sha256",
      "sudo -u tecpey unzip tecpey-deployment-RELEASE_SHA.zip -d /var/www/tecpey-candidates",
      "bash scripts/ubuntu24-preflight.sh candidate",
      "bash scripts/ubuntu24-preflight.sh migrate",
      "bash scripts/ubuntu24-preflight.sh runtime",
    ],
    "support handoff must order rehearsal before recipient checksum, unpack, candidate, migration and runtime checks",
  );

  for (const token of [
    "npm run support:bundle:verify",
    "npm run support:install:rehearse --",
  ]) {
    requireText(findings, workflow, token, `support deployment bundle workflow missing ${token}`);
  }
  requireOrdered(
    findings,
    workflow,
    [
      "Verify support deployment bundle",
      "Rehearse support install package",
      "Write support artifact notice",
      "Upload support deployment artifact",
    ],
    "support workflow must rehearse the package before writing and uploading the artifact",
  );

  return findings;
}

export function assertSupportInstallReadiness(sources) {
  const findings = supportInstallReadinessFindings(sources);
  if (findings.length) {
    throw new Error(findings.join("\n"));
  }
}
