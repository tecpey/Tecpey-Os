// QA-050 — screenshot matrix evidence authority.
//
// The control asks for 175 routes photographed at four viewports and the
// resulting defects triaged. A screenshot is an unusually weak piece of
// evidence: a file exists, so the slot looks covered, and nothing about the
// file says whether the page rendered, errored, redirected somewhere else, or
// came out blank. Worse, the same image can be filed under four different
// routes and the count still comes out right.
//
// So this module checks the things a picture does not say about itself. Every
// slot carries what the browser actually did — the URL it ended on, the status
// it got, the size of the image and its digest — and the digest is what stops
// one screenshot from being filed as several.

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Matches waveAExternalEvidenceTracker.maxEvidenceAgeDays; a test binds them. */
export const MAX_EVIDENCE_AGE_DAYS = 14;

/**
 * A screenshot smaller than this is not a picture of a page.
 *
 * A blank or one-colour PNG compresses to almost nothing, which is exactly what
 * a failed render, an unmounted app or a capture taken before paint produces.
 * The floor is deliberately low — it is here to catch nothing, not to judge
 * design.
 */
export const MIN_SCREENSHOT_BYTES = 5_000;

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
];

function scanForbidden(node, at, findings) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => scanForbidden(item, `${at}[${index}]`, findings));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        findings.push(`${at}.${key}: evidence must not carry ${key}`);
      }
      scanForbidden(value, `${at}.${key}`, findings);
    }
    return;
  }
  if (typeof node === "string") {
    for (const pattern of FORBIDDEN_STRING_PATTERNS) {
      if (pattern.test(node)) {
        findings.push(`${at}: evidence value matches a forbidden pattern (${pattern})`);
        return;
      }
    }
  }
}

/**
 * Findings for one screenshot matrix evidence bundle.
 *
 * @param root         parsed ui-ux-screenshot-matrix.json
 * @param rootDigest   contents of ui-ux-screenshot-matrix.json.sha256
 * @param triage       parsed visual-defect-triage.json
 * @param expectedShape { routeCount, viewportCount, requiredSlots } from the route authority
 * @param expectedRoutes the route patterns the matrix must cover
 * @param viewports    the viewport names the control requires
 * @param digestOf     (name) => sha256 of that artifact's bytes on disk
 * @param expectedSha  the exact commit the evidence must be bound to
 */
export function screenshotMatrixFindings({
  root,
  rootDigest,
  triage,
  expectedShape,
  expectedRoutes,
  viewports,
  digestOf,
  expectedSha = null,
  now = new Date(),
  maxAgeDays = MAX_EVIDENCE_AGE_DAYS,
}) {
  const findings = [];

  if (!root || typeof root !== "object") {
    return ["ui-ux-screenshot-matrix.json is missing or not an object"];
  }

  if (root.schemaVersion !== 1) findings.push("schemaVersion must be 1");
  if (root.evidenceClass !== "ui-ux-screenshot-matrix-v1") {
    findings.push('evidenceClass must be "ui-ux-screenshot-matrix-v1"');
  }
  if (!ISO_INSTANT.test(String(root.generatedAt ?? ""))) {
    findings.push("generatedAt must be an ISO-8601 UTC instant");
  } else {
    const ageDays = (now.getTime() - Date.parse(root.generatedAt)) / 86_400_000;
    if (ageDays > maxAgeDays) {
      findings.push(`evidence is ${Math.floor(ageDays)} days old — the governed limit is ${maxAgeDays}`);
    }
    if (ageDays < -1) findings.push(`generatedAt ${root.generatedAt} is in the future`);
  }
  if (!COMMIT_SHA.test(String(root.sourceCommitSha ?? ""))) {
    findings.push("sourceCommitSha must be a 40-character commit sha");
  } else if (expectedSha && root.sourceCommitSha !== expectedSha) {
    findings.push(`sourceCommitSha ${root.sourceCommitSha} is not the exact head ${expectedSha}`);
  }

  const declaredDigest = String(rootDigest ?? "").trim().split(/\s+/)[0];
  if (!SHA256.test(declaredDigest)) {
    findings.push("ui-ux-screenshot-matrix.json.sha256 must contain a sha256 digest");
  } else if (typeof digestOf === "function" && digestOf("root") !== declaredDigest) {
    findings.push("the recorded root digest does not match the evidence bytes");
  }

  const slots = Array.isArray(root.slots) ? root.slots : null;
  if (!slots) {
    findings.push("slots must be an array — the matrix is the evidence");
    return findings;
  }
  if (slots.length === 0) {
    findings.push("slots is empty — the capture photographed nothing");
    return findings;
  }

  // Shape. The ledger's 700 is routeCount times viewportCount, and all three
  // have to agree with the routes actually present.
  if (expectedShape) {
    if (root.routeCount !== expectedShape.routeCount) {
      findings.push(
        `routeCount says ${root.routeCount} but the application has ${expectedShape.routeCount} routes`,
      );
    }
    if (root.requiredSlots !== expectedShape.requiredSlots) {
      findings.push(
        `requiredSlots says ${root.requiredSlots} but ${expectedShape.routeCount} routes across ` +
          `${expectedShape.viewportCount} viewports is ${expectedShape.requiredSlots}`,
      );
    }
    if (slots.length !== expectedShape.requiredSlots) {
      findings.push(
        `the matrix holds ${slots.length} slots but the control requires ${expectedShape.requiredSlots}`,
      );
    }
  }

  const requiredViewports = Array.isArray(viewports) ? viewports : [];
  const seen = new Map();
  const digestOwners = new Map();

  for (const [index, slot] of slots.entries()) {
    const at = `slots[${index}]`;
    if (!slot || typeof slot !== "object") {
      findings.push(`${at} is not a slot`);
      continue;
    }
    if (typeof slot.route !== "string" || !slot.route) {
      findings.push(`${at}.route must name the route pattern captured`);
      continue;
    }
    if (!requiredViewports.includes(slot.viewport)) {
      findings.push(`${at}.viewport ${slot.viewport} is not one of ${requiredViewports.join(", ")}`);
      continue;
    }

    const key = `${slot.route}@${slot.viewport}`;
    if (seen.has(key)) findings.push(`${key} is captured more than once`);
    seen.set(key, true);

    // What the browser did. A screenshot cannot say any of this about itself.
    //
    // A route may legitimately answer with something other than 200 — an
    // unknown credential id really is a 404, and that not-found page is a
    // public surface worth photographing. The status it is allowed to return is
    // declared per route, so an accidental 404 somewhere else is still a
    // finding rather than being waved through.
    const expectedStatus = Number.isInteger(slot.expectStatus) ? slot.expectStatus : 200;
    if (slot.httpStatus !== expectedStatus) {
      findings.push(
        `${key}: captured with HTTP ${slot.httpStatus}, not the declared ${expectedStatus}`,
      );
    }
    const landed = typeof slot.finalUrl === "string" ? slot.finalUrl : null;
    if (!landed) {
      findings.push(`${key}: finalUrl must record where the browser ended up`);
    } else if (slot.expectRedirectTo) {
      if (!landed.startsWith(slot.expectRedirectTo)) {
        findings.push(
          `${key}: declared a redirect to ${slot.expectRedirectTo} but landed on ${landed}`,
        );
      }
    } else if (typeof slot.requestedUrl === "string" && landed !== slot.requestedUrl) {
      // An undeclared redirect means the file is a picture of a different page
      // than the one it is filed under.
      findings.push(
        `${key}: requested ${slot.requestedUrl} but landed on ${landed} with no declared redirect`,
      );
    }

    if (!SHA256.test(String(slot.sha256 ?? ""))) {
      findings.push(`${key}.sha256 must be the digest of the captured image`);
    } else {
      // One image filed under several slots would keep the count correct while
      // covering a fraction of the matrix.
      //
      // Identical images are not always a lie, though: two routes that both
      // redirect to the sign-in page genuinely produce the same picture. So a
      // repeat is a finding unless both slots declared they would land in the
      // same place, which is the only way it is honestly the same page twice.
      const previous = digestOwners.get(slot.sha256);
      if (previous) {
        const bothLandedWhereDeclared =
          Boolean(slot.expectRedirectTo) &&
          slot.expectRedirectTo === previous.expectRedirectTo;
        if (!bothLandedWhereDeclared) {
          findings.push(
            `${key} has the same image as ${previous.key} — one screenshot cannot cover two slots`,
          );
        }
      } else {
        digestOwners.set(slot.sha256, { key, expectRedirectTo: slot.expectRedirectTo ?? null });
      }
    }

    if (!Number.isInteger(slot.bytes) || slot.bytes < MIN_SCREENSHOT_BYTES) {
      findings.push(
        `${key}: ${slot.bytes} bytes is below ${MIN_SCREENSHOT_BYTES} — a blank or failed render`,
      );
    }
    if (!Number.isInteger(slot.width) || !Number.isInteger(slot.height) || slot.width < 1 || slot.height < 1) {
      findings.push(`${key}: width and height must record the captured image size`);
    }
  }

  // Coverage: every route at every viewport. A high slot count means nothing if
  // it is one route photographed 700 times.
  if (Array.isArray(expectedRoutes)) {
    for (const route of expectedRoutes) {
      for (const viewport of requiredViewports) {
        if (!seen.has(`${route}@${viewport}`)) {
          findings.push(`no capture for ${route} at ${viewport}`);
        }
      }
    }
  }

  // Triage. The control closes on "zero unresolved P0/P1 visual defects", which
  // is only meaningful if the register exists and says so explicitly.
  if (!triage || typeof triage !== "object") {
    findings.push("visual-defect-triage.json is missing or not an object");
  } else {
    const defects = Array.isArray(triage.defects) ? triage.defects : null;
    if (!defects) {
      findings.push("visual-defect-triage.json must carry a defects array, even when empty");
    } else {
      for (const [index, defect] of defects.entries()) {
        const at = `visual-defect-triage.json[${index}]`;
        if (!defect || typeof defect !== "object") {
          findings.push(`${at} is not a defect record`);
          continue;
        }
        if (!["P0", "P1", "P2", "P3"].includes(defect.severity)) {
          findings.push(`${at}.severity must be P0, P1, P2 or P3`);
        }
        if (typeof defect.route !== "string" || !defect.route) {
          findings.push(`${at}.route must name where the defect is`);
        }
        if (!["open", "resolved", "accepted"].includes(defect.status)) {
          findings.push(`${at}.status must be open, resolved or accepted`);
        }
        // The closure criterion is zero *unresolved* P0/P1 defects, and
        // "accepted" is not resolved — it is a decision to live with the
        // defect. Rejecting only `open` would let a P0 be filed as accepted
        // and still have the verifier announce zero unresolved defects, which
        // is the criterion answering a question it was not asked. Lower
        // severities may be accepted; these two have to be fixed.
        if (
          (defect.severity === "P0" || defect.severity === "P1") &&
          defect.status !== "resolved"
        ) {
          findings.push(
            `${at}: ${defect.severity} defect on ${defect.route} is ${defect.status}, not resolved — QA-050 closes on zero`,
          );
        }
      }
      if (triage.reviewedSlots !== slots.length) {
        findings.push(
          `visual-defect-triage.json reviewed ${triage.reviewedSlots} slots but the matrix holds ${slots.length}`,
        );
      }
    }
  }

  scanForbidden(root, "evidence", findings);
  scanForbidden(triage, "visual-defect-triage.json", findings);

  return findings;
}

export function assertScreenshotMatrix(input) {
  const findings = screenshotMatrixFindings(input);
  if (findings.length) throw new Error(findings.join("\n"));
}
