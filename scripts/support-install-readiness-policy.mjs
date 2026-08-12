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
  const requiredScripts = {
    "support:bundle": "bash scripts/create-support-deployment-bundle.sh",
    "support:bundle:verify": "node scripts/verify-support-deployment-bundle.mjs",
    "support:install:rehearse": "node scripts/rehearse-support-deployment-install.mjs",
    "support:install:check": "node scripts/check-support-install-readiness-authority.mjs",
  };
  for (const [scriptName, command] of Object.entries(requiredScripts)) {
    if (scripts[scriptName] !== command) {
      findings.push(`package.json script ${scriptName} must be exactly: ${command}`);
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
