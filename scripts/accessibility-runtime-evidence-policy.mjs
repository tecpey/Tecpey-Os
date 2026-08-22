// QA-051 — accessibility runtime evidence authority.
//
// The controlled-launch ledger records QA-051 as BLOCKED_EXTERNAL with the
// machineVerifier "future browser verifier: qa:a11y-runtime:verify". The word
// future is doing the blocking: the checks themselves already run in
// tests/e2e/specs/academy-arena-mentor-accessibility.spec.mjs, but they emit
// Playwright attachments, which live inside a report rather than as evidence
// anyone can verify afterwards. So the control is not blocked on a staging host
// or on capability — it is blocked on nothing recording that the capability ran.
//
// This module is the recording contract. It is deliberately hostile to evidence
// that claims a check happened without showing it: a run covering no surfaces,
// a check missing a viewport, an axe pass that ran no rules, or a digest that
// does not bind to the bytes it names are all findings.

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * How long a bundle stays evidence.
 *
 * `waveAExternalEvidenceTracker.maxEvidenceAgeDays` in
 * config/enterprise-global-product-readiness.json declares 14 days, but nothing
 * enforced it here: a bundle from an unchanged commit verified forever, so a
 * control could rest on a browser run from months ago. The two values are held
 * together by a test rather than by a comment.
 */
export const MAX_EVIDENCE_AGE_DAYS = 14;

/** The Playwright projects in tests/e2e/playwright.config.mjs. */
export const REQUIRED_VIEWPORTS = [
  "chromium-en-desktop",
  "chromium-fa-mobile",
  "firefox-en-mobile",
  "firefox-fa-desktop",
];

/** The five checks QA-051 names, and the artifact each one must produce. */
export const REQUIRED_CHECKS = {
  axe: "axe-results.json",
  keyboard: "keyboard-navigation-report.json",
  focus: "focus-order-report.json",
  contrast: "contrast-report.json",
  reducedMotion: "reduced-motion-report.json",
};

// Evidence is uploaded and read by people who are not the person who produced
// it. Anything that could carry a secret or locate a host has no business in it.
const FORBIDDEN_KEYS = new Set([
  "credential", "credentials", "databaseurl", "hostip", "ipaddress",
  "privatekey", "rawlog", "rawlogs", "secret", "secrets", "token", "tokens",
  "webhookurl", "cookie", "cookies", "authorization",
]);

const FORBIDDEN_STRING_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bsk-[A-Za-z0-9_-]{12,}/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
];

function scanForbidden(node, path, findings) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => scanForbidden(item, `${path}[${index}]`, findings));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        findings.push(`${path}.${key}: evidence must not carry ${key}`);
      }
      scanForbidden(value, `${path}.${key}`, findings);
    }
    return;
  }
  if (typeof node === "string") {
    for (const pattern of FORBIDDEN_STRING_PATTERNS) {
      if (pattern.test(node)) {
        findings.push(`${path}: evidence value matches a forbidden pattern (${pattern})`);
        return;
      }
    }
  }
}

// What each record has to carry beyond its own verdict.
//
// `passed: true` with nothing behind it is the same defect as an empty report,
// one level down: it reports that a check happened instead of showing what the
// check saw. Each entry names the observation the record would be worthless
// without, so a record cannot assert a result it never measured.
const REQUIRED_OBSERVATIONS = {
  keyboard: {
    describe: "the control focus first reached",
    holds: (record) => typeof record.firstStopTag === "string" && record.firstStopTag.length > 0,
  },
  focus: {
    describe: "the focus stops it walked, in order",
    holds: (record) =>
      Array.isArray(record.stops) &&
      record.stops.length > 0 &&
      record.followsDomOrder === true,
  },
  contrast: {
    describe: "the number of contrast violations found",
    holds: (record) => Number.isInteger(record.contrastViolations),
  },
  reducedMotion: {
    describe: "how many elements were still animating",
    holds: (record) => Number.isInteger(record.animatedElements),
  },
  // axe carries ruleTags and criticalOrSeriousCount, both checked below against
  // the numeric claim the control turns on.
};

function checkRecords(report) {
  // Reports are arrays of per-surface, per-viewport records. Anything else is
  // not a report, and treating it as an empty one would pass silently.
  return Array.isArray(report) ? report : null;
}

/**
 * Findings for one accessibility runtime evidence bundle.
 *
 * @param root        parsed accessibility-runtime-evidence.json
 * @param rootDigest  contents of accessibility-runtime-evidence.json.sha256
 * @param reports     { axe, keyboard, focus, contrast, reducedMotion } parsed
 * @param digestOf    (checkName) => sha256 of that report's bytes on disk
 * @param expectedSha the exact commit the evidence must be bound to, or null
 * @param now         the instant to age the bundle against
 * @param maxAgeDays  how old the bundle may be, in days
 */
export function accessibilityRuntimeEvidenceFindings({
  root,
  rootDigest,
  reports,
  digestOf,
  expectedSha = null,
  now = new Date(),
  maxAgeDays = MAX_EVIDENCE_AGE_DAYS,
}) {
  const findings = [];

  if (!root || typeof root !== "object") {
    return ["accessibility-runtime-evidence.json is missing or not an object"];
  }

  if (root.schemaVersion !== 1) findings.push("schemaVersion must be 1");
  if (root.evidenceClass !== "accessibility-runtime-evidence-v1") {
    findings.push('evidenceClass must be "accessibility-runtime-evidence-v1"');
  }
  if (!ISO_INSTANT.test(String(root.generatedAt ?? ""))) {
    findings.push("generatedAt must be an ISO-8601 UTC instant");
  } else {
    const ageDays = (now.getTime() - Date.parse(root.generatedAt)) / 86_400_000;
    if (ageDays > maxAgeDays) {
      findings.push(
        `evidence is ${Math.floor(ageDays)} days old — the governed limit is ${maxAgeDays}`,
      );
    }
    if (ageDays < -1) {
      // A bundle dated in the future is not fresh, it is wrong.
      findings.push(`generatedAt ${root.generatedAt} is in the future`);
    }
  }
  if (!COMMIT_SHA.test(String(root.sourceCommitSha ?? ""))) {
    findings.push("sourceCommitSha must be a 40-character commit sha");
  } else if (expectedSha && root.sourceCommitSha !== expectedSha) {
    findings.push(
      `sourceCommitSha ${root.sourceCommitSha} is not the exact head ${expectedSha}`,
    );
  }

  const declaredDigest = String(rootDigest ?? "").trim().split(/\s+/)[0];
  if (!SHA256.test(declaredDigest)) {
    findings.push("accessibility-runtime-evidence.json.sha256 must contain a sha256 digest");
  } else if (typeof digestOf === "function" && digestOf("root") !== declaredDigest) {
    findings.push("the recorded root digest does not match the evidence bytes");
  }

  // Viewport coverage. RTL and LTR at both form factors is the whole point of
  // the control; three of four is not "mostly covered", it is a gap.
  const viewports = Array.isArray(root.viewports) ? [...root.viewports].sort() : null;
  if (!viewports) {
    findings.push("viewports must be an array");
  } else {
    const expected = [...REQUIRED_VIEWPORTS].sort();
    if (JSON.stringify(viewports) !== JSON.stringify(expected)) {
      findings.push(
        `viewports must be exactly ${expected.join(", ")} — got ${viewports.join(", ") || "(none)"}`,
      );
    }
  }

  const checks = root.checks && typeof root.checks === "object" ? root.checks : null;
  if (!checks) {
    findings.push("checks must be an object naming every required check");
    return findings;
  }

  for (const [name, artifact] of Object.entries(REQUIRED_CHECKS)) {
    const entry = checks[name];
    if (!entry || typeof entry !== "object") {
      findings.push(`checks.${name} is missing — QA-051 requires all five checks`);
      continue;
    }
    if (entry.artifact !== artifact) {
      findings.push(`checks.${name}.artifact must be ${artifact}`);
    }
    if (!SHA256.test(String(entry.sha256 ?? ""))) {
      findings.push(`checks.${name}.sha256 must be a sha256 digest`);
    } else if (typeof digestOf === "function" && digestOf(name) !== entry.sha256) {
      findings.push(`checks.${name}.sha256 does not match the bytes of ${artifact}`);
    }

    const records = checkRecords(reports?.[name]);
    if (records === null) {
      findings.push(`${artifact} is missing or is not an array of records`);
      continue;
    }
    // A check that observed nothing is the failure this whole module exists to
    // prevent: it passes every downstream assertion while proving nothing.
    if (records.length === 0) {
      findings.push(`${artifact} contains no records — the check observed nothing`);
      continue;
    }
    if (entry.surfaces !== records.length) {
      findings.push(
        `checks.${name}.surfaces says ${entry.surfaces} but ${artifact} holds ${records.length} records`,
      );
    }

    const covered = new Set(records.map((record) => record?.viewport));
    for (const viewport of REQUIRED_VIEWPORTS) {
      if (!covered.has(viewport)) {
        findings.push(`${artifact} has no record for viewport ${viewport}`);
      }
    }
    for (const [index, record] of records.entries()) {
      if (!record || typeof record !== "object") {
        findings.push(`${artifact}[${index}] is not a record`);
        continue;
      }
      if (typeof record.surface !== "string" || !record.surface) {
        findings.push(`${artifact}[${index}].surface must name the surface checked`);
      }
      if (record.passed !== true && record.passed !== false) {
        findings.push(`${artifact}[${index}].passed must be a boolean`);
      } else if (record.passed === false) {
        // A bundle is offered as evidence that the control holds. A record that
        // says the check failed is a fact about the run worth keeping, but it
        // is not evidence of a pass.
        findings.push(
          `${artifact}[${index}] records a failed check for ${record.surface} on ${record.viewport}`,
        );
      }
      const observation = REQUIRED_OBSERVATIONS[name];
      if (observation && !observation.holds(record)) {
        findings.push(`${artifact}[${index}] must record ${observation.describe}`);
      }
    }
  }

  // axe carries the one numeric claim the control turns on, so it gets the
  // strictest treatment: the rule set actually run has to be recorded, or a run
  // with every rule disabled would report zero violations and look like a pass.
  const axe = checks.axe;
  const axeRecords = checkRecords(reports?.axe) ?? [];
  if (axe && typeof axe === "object") {
    if (axe.criticalOrSerious !== 0) {
      findings.push(
        `checks.axe.criticalOrSerious must be 0 — got ${axe.criticalOrSerious}`,
      );
    }
    const declared = axeRecords.reduce(
      (total, record) => total + (Number(record?.criticalOrSeriousCount) || 0),
      0,
    );
    if (declared !== 0) {
      findings.push(`axe-results.json reports ${declared} critical or serious violations`);
    }
    for (const [index, record] of axeRecords.entries()) {
      const tags = record?.ruleTags;
      if (!Array.isArray(tags) || tags.length === 0) {
        findings.push(
          `axe-results.json[${index}].ruleTags must record the rule set that ran`,
        );
      }
    }
  }

  scanForbidden(root, "evidence", findings);
  for (const [name, report] of Object.entries(reports ?? {})) {
    scanForbidden(report, REQUIRED_CHECKS[name] ?? name, findings);
  }

  return findings;
}

export function assertAccessibilityRuntimeEvidence(input) {
  const findings = accessibilityRuntimeEvidenceFindings(input);
  if (findings.length) throw new Error(findings.join("\n"));
}
