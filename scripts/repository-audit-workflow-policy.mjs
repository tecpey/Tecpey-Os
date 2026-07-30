const EXACT_SHA_EXPRESSION = "${{ github.event.pull_request.head.sha || github.sha }}";
const PINNED_ACTION = /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}(?:\s+#\s+v?\S+)?$/i;
const EXPECTED_STEP_NAMES = [
  "Checkout exact source",
  "Verify exact checkout",
  "Setup Node.js",
  "Verify permanent audit authority",
  "Generate exact tracked-path manifest",
  "Verify exact denominator and evidence",
  "Run manifest policy tests",
  "Upload immutable manifest evidence",
];
const GOVERNED_JOB_PROPERTIES = new Set(["name", "runs-on", "timeout-minutes", "steps"]);

function stripYamlComment(line) {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (doubleQuoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (!doubleQuoted && character === "'") {
      singleQuoted = !singleQuoted;
      continue;
    }
    if (!singleQuoted && character === '"') {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (
      character === "#" &&
      !singleQuoted &&
      !doubleQuoted &&
      (index === 0 || /\s/.test(line[index - 1]))
    ) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }
  return value;
}

function yamlLines(workflowSource) {
  const lines = [];
  for (const [index, rawLine] of workflowSource.split(/\r?\n/).entries()) {
    if (rawLine.includes("\t")) {
      throw new Error(`workflow YAML line ${index + 1} contains a tab`);
    }
    const uncommented = stripYamlComment(rawLine).trimEnd();
    if (uncommented.trim().length === 0) continue;
    const indent = uncommented.length - uncommented.trimStart().length;
    if (indent % 2 !== 0) {
      throw new Error(`workflow YAML line ${index + 1} has unsupported indentation`);
    }
    lines.push({
      indent,
      line: index + 1,
      text: uncommented.trimStart(),
    });
  }
  return lines;
}

function blockEnd(lines, startIndex) {
  const indent = lines[startIndex].indent;
  let index = startIndex + 1;
  while (index < lines.length && lines[index].indent > indent) index += 1;
  return index;
}

function singleNode(lines, predicate, label) {
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => predicate(line));
  if (matches.length !== 1) {
    throw new Error(`workflow YAML must contain exactly one ${label} node`);
  }
  return matches[0].index;
}

function keyValue(text) {
  const separator = text.indexOf(":");
  if (separator < 1) throw new Error(`unsupported workflow YAML node: ${text}`);
  const key = text.slice(0, separator);
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error(`unsupported workflow YAML key: ${key}`);
  }
  return {
    key,
    rawValue: text.slice(separator + 1),
  };
}

function parseDirectMap(lines, startIndex, directIndent) {
  const result = {};
  const end = blockEnd(lines, startIndex);
  for (let index = startIndex + 1; index < end; index += 1) {
    const line = lines[index];
    if (line.indent !== directIndent) {
      throw new Error(`unsupported nested YAML under ${lines[startIndex].text}`);
    }
    const { key, rawValue } = keyValue(line.text);
    if (rawValue.trim().length === 0 || Object.hasOwn(result, key)) {
      throw new Error(`workflow YAML map has an invalid ${key} entry`);
    }
    result[key] = parseScalar(rawValue);
  }
  return result;
}

function parseSteps(lines, stepsIndex) {
  const steps = [];
  const end = blockEnd(lines, stepsIndex);
  let currentStep = null;
  let currentSection = null;

  for (let index = stepsIndex + 1; index < end; index += 1) {
    const line = lines[index];
    if (line.indent === 6) {
      const match = /^-\s+name:\s+(.+)$/.exec(line.text);
      if (!match) throw new Error(`workflow step line ${line.line} must begin with a name`);
      currentStep = { name: parseScalar(match[1]) };
      currentSection = null;
      steps.push(currentStep);
      continue;
    }
    if (!currentStep) throw new Error("workflow step property appears before a named step");
    if (line.indent === 8) {
      const { key, rawValue } = keyValue(line.text);
      if (!["env", "run", "uses", "with"].includes(key)) {
        throw new Error(`workflow step ${currentStep.name} has unsupported property ${key}`);
      }
      if (Object.hasOwn(currentStep, key)) {
        throw new Error(`workflow step ${currentStep.name} repeats ${key}`);
      }
      if (rawValue.trim().length === 0) {
        if (key !== "env" && key !== "with") {
          throw new Error(`workflow step ${currentStep.name} has unsupported map ${key}`);
        }
        currentStep[key] = {};
        currentSection = key;
      } else {
        currentStep[key] = parseScalar(rawValue);
        currentSection = null;
      }
      continue;
    }
    if (line.indent === 10 && currentSection) {
      const { key, rawValue } = keyValue(line.text);
      if (rawValue.trim().length === 0 || Object.hasOwn(currentStep[currentSection], key)) {
        throw new Error(`workflow step ${currentStep.name} has invalid ${currentSection}.${key}`);
      }
      currentStep[currentSection][key] = parseScalar(rawValue);
      continue;
    }
    throw new Error(`workflow step ${currentStep.name} has unsupported YAML structure`);
  }
  return steps;
}

function parseWorkflow(workflowSource) {
  const lines = yamlLines(workflowSource);
  const permissionNodes = lines.filter((line) => line.text.startsWith("permissions:"));
  if (
    permissionNodes.length !== 1 ||
    permissionNodes[0].indent !== 0 ||
    permissionNodes[0].text !== "permissions:"
  ) {
    throw new Error("workflow permissions must be one top-level mapping");
  }
  const permissionsIndex = lines.indexOf(permissionNodes[0]);
  const permissions = parseDirectMap(lines, permissionsIndex, 2);

  const jobsIndex = singleNode(
    lines,
    (line) => line.indent === 0 && line.text === "jobs:",
    "top-level jobs",
  );
  const jobsEnd = blockEnd(lines, jobsIndex);
  const jobNodes = lines
    .slice(jobsIndex + 1, jobsEnd)
    .filter((line) => line.indent === 2);
  if (jobNodes.length !== 1 || jobNodes[0].text !== "manifest:") {
    throw new Error("workflow YAML must contain exactly the governed manifest job");
  }
  const manifestIndex = singleNode(
    lines.slice(jobsIndex + 1, jobsEnd),
    (line) => line.indent === 2 && line.text === "manifest:",
    "jobs.manifest",
  ) + jobsIndex + 1;
  const manifestEnd = blockEnd(lines, manifestIndex);
  const seenJobProperties = new Set();
  for (const line of lines.slice(manifestIndex + 1, manifestEnd)) {
    if (line.indent !== 4) continue;
    const { key } = keyValue(line.text);
    if (!GOVERNED_JOB_PROPERTIES.has(key)) {
      throw new Error(`jobs.manifest has unsupported property ${key}`);
    }
    if (seenJobProperties.has(key)) {
      throw new Error(`jobs.manifest repeats ${key}`);
    }
    seenJobProperties.add(key);
  }
  const stepsIndex = singleNode(
    lines.slice(manifestIndex + 1, manifestEnd),
    (line) => line.indent === 4 && line.text === "steps:",
    "jobs.manifest.steps",
  ) + manifestIndex + 1;

  const reservedShaOverride = lines.some((line, index) => {
    if (line.text !== "env:") return false;
    const end = blockEnd(lines, index);
    return lines
      .slice(index + 1, end)
      .some((child) => child.text.startsWith("GITHUB_SHA:"));
  });

  return {
    permissions,
    reservedShaOverride,
    steps: parseSteps(lines, stepsIndex),
  };
}

function exactObject(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(value) === JSON.stringify(expected)
  );
}

export function repositoryAuditWorkflowFindings(workflowSource) {
  const findings = [];
  if (typeof workflowSource !== "string" || workflowSource.length === 0) {
    return ["workflow source is empty"];
  }
  let workflow;
  try {
    workflow = parseWorkflow(workflowSource);
  } catch (error) {
    return [
      `workflow YAML structure is invalid: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  if (!exactObject(workflow.permissions, { contents: "read" })) {
    findings.push(
      "workflow permissions must be exactly one top-level contents: read grant",
    );
  }
  if (workflow.reservedShaOverride) {
    findings.push("reserved GITHUB_SHA must not be overridden");
  }
  if (
    JSON.stringify(workflow.steps.map((step) => step.name)) !==
    JSON.stringify(EXPECTED_STEP_NAMES)
  ) {
    findings.push("workflow must retain the exact governed step sequence");
  }

  const stepsByName = new Map(workflow.steps.map((step) => [step.name, step]));
  const checkout = stepsByName.get("Checkout exact source");
  if (
    !checkout ||
    !/^actions\/checkout@[0-9a-f]{40}$/.test(checkout.uses ?? "") ||
    !exactObject(checkout.with, {
      ref: EXACT_SHA_EXPRESSION,
      "persist-credentials": false,
    })
  ) {
    findings.push("checkout must bind to the pull-request head SHA or push SHA");
    findings.push("checkout credentials must not persist");
  }

  const checkoutVerification = stepsByName.get("Verify exact checkout");
  if (
    !checkoutVerification ||
    checkoutVerification.run !== 'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"' ||
    !exactObject(checkoutVerification.env, { EXPECTED_SHA: EXACT_SHA_EXPRESSION })
  ) {
    findings.push("checkout verification must compare the effective exact source SHA");
  }

  const nodeSetup = stepsByName.get("Setup Node.js");
  if (
    !nodeSetup ||
    !/^actions\/setup-node@[0-9a-f]{40}$/.test(nodeSetup.uses ?? "") ||
    !exactObject(nodeSetup.with, { "node-version": "22" })
  ) {
    findings.push("Node.js setup must be pinned and use the governed version");
  }

  const authority = stepsByName.get("Verify permanent audit authority");
  if (!authority || authority.run !== "npm run audit:manifest:check") {
    findings.push("workflow authority guard is missing");
  }

  const generation = stepsByName.get("Generate exact tracked-path manifest");
  if (
    !generation ||
    generation.run !== "npm run audit:manifest" ||
    !exactObject(generation.env, { TECPEY_AUDIT_SOURCE_SHA: EXACT_SHA_EXPRESSION })
  ) {
    findings.push("manifest generation must receive the exact expected source SHA");
  }

  const verification = stepsByName.get("Verify exact denominator and evidence");
  if (
    !verification ||
    verification.run !== "npm run audit:manifest:verify" ||
    !exactObject(verification.env, { TECPEY_AUDIT_SOURCE_SHA: EXACT_SHA_EXPRESSION })
  ) {
    findings.push("exact manifest verification is missing");
  }

  const policyTests = stepsByName.get("Run manifest policy tests");
  if (!policyTests || policyTests.run !== "npm run test:audit-manifest") {
    findings.push("manifest policy test command is missing");
  }

  const upload = stepsByName.get("Upload immutable manifest evidence");
  if (
    !upload ||
    !/^actions\/upload-artifact@[0-9a-f]{40}$/.test(upload.uses ?? "") ||
    !exactObject(upload.with, {
      name: `repository-audit-manifest-${EXACT_SHA_EXPRESSION}`,
      path: "artifacts/repository-audit/repository-manifest.json",
      "if-no-files-found": "error",
      "retention-days": 30,
    })
  ) {
    findings.push("artifact name must include the exact source SHA");
  }

  for (const step of workflow.steps) {
    if (step.uses && !PINNED_ACTION.test(step.uses)) {
      findings.push(`action is not pinned to a full commit SHA: ${step.uses}`);
    }
  }
  return findings;
}

export function assertRepositoryAuditWorkflow(workflowSource) {
  const findings = repositoryAuditWorkflowFindings(workflowSource);
  if (findings.length > 0) {
    throw new Error(`Repository audit workflow authority failed:\n- ${findings.join("\n- ")}`);
  }
}
