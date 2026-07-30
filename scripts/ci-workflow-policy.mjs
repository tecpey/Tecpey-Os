const EXACT_HEAD_SHA = "${{ github.event.pull_request.head.sha || github.sha }}";
const PULL_REQUEST_HEAD_SHA = "${{ github.event.pull_request.head.sha }}";
const STAGING_RELEASE_SHA = "${{ inputs.release_sha }}";
const MINIMUM_STAGING_RELEASE_SHA = "575fc904f9d87ae51994aa5e59e4c95ab29e628b";
const PINNED_ACTION = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
const REJECTED_PRODUCTION_FIXTURE_MARKER =
  /(?:change[_-]?me|placeholder|replace[_-]?with|your[-_ ]?real|admin-de|wss-dem)/iu;

export const GOVERNED_CI_WORKFLOWS = Object.freeze({
  ".github/workflows/api-security-manifest.yml": {
    jobs: { policy: 10 },
    checkoutSha: EXACT_HEAD_SHA,
    artifactSha: EXACT_HEAD_SHA,
  },
  ".github/workflows/ci.yml": {
    jobs: { hygiene: 10, quality: 60 },
    checkoutSha: EXACT_HEAD_SHA,
    artifactSha: EXACT_HEAD_SHA,
  },
  ".github/workflows/full-suite-diagnostics.yml": {
    jobs: { "full-suite": 15 },
    checkoutSha: PULL_REQUEST_HEAD_SHA,
    artifactSha: EXACT_HEAD_SHA,
  },
  ".github/workflows/sensitive-mutation-audit.yml": {
    jobs: { authority: 15 },
    checkoutSha: EXACT_HEAD_SHA,
    artifactSha: EXACT_HEAD_SHA,
  },
  ".github/workflows/staging-community-challenge-scheduler-evidence.yml": {
    jobs: { "collect-and-verify": 20 },
    checkoutSha: STAGING_RELEASE_SHA,
    artifactSha: STAGING_RELEASE_SHA,
    minimumReleaseSha: MINIMUM_STAGING_RELEASE_SHA,
  },
});

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

function effectiveLines(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("workflow source is empty");
  }
  return source.split(/\r?\n/).flatMap((raw, index) => {
    if (raw.includes("\t")) throw new Error(`line ${index + 1} contains a tab`);
    const uncommented = stripYamlComment(raw).trimEnd();
    if (uncommented.trim().length === 0) return [];
    const indent = uncommented.length - uncommented.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`line ${index + 1} has unsupported indentation`);
    return [{ indent, line: index + 1, text: uncommented.trimStart() }];
  });
}

function blockEnd(lines, startIndex) {
  const indent = lines[startIndex].indent;
  let end = startIndex + 1;
  while (end < lines.length && lines[end].indent > indent) end += 1;
  return end;
}

function scalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function keyValue(text) {
  const separator = text.indexOf(":");
  if (separator < 1) throw new Error(`unsupported YAML node: ${text}`);
  return {
    key: text.slice(0, separator),
    value: scalar(text.slice(separator + 1)),
  };
}

function uniqueIndex(lines, predicate, label) {
  const indexes = lines.flatMap((line, index) => (predicate(line) ? [index] : []));
  if (indexes.length !== 1) throw new Error(`expected exactly one ${label} node`);
  return indexes[0];
}

function directMap(lines, parentIndex, childIndent) {
  const result = {};
  const end = blockEnd(lines, parentIndex);
  for (let index = parentIndex + 1; index < end; index += 1) {
    const line = lines[index];
    if (line.indent !== childIndent) continue;
    const { key, value } = keyValue(line.text);
    if (value === "") continue;
    if (Object.hasOwn(result, key)) throw new Error(`duplicate ${key} node`);
    result[key] = value;
  }
  return result;
}

function parseSteps(lines, jobIndex) {
  const jobEnd = blockEnd(lines, jobIndex);
  const stepsIndex = uniqueIndex(
    lines.slice(jobIndex + 1, jobEnd),
    (line) => line.indent === 4 && line.text === "steps:",
    `${lines[jobIndex].text} steps`,
  ) + jobIndex + 1;
  const stepsEnd = blockEnd(lines, stepsIndex);
  const starts = [];
  for (let index = stepsIndex + 1; index < stepsEnd; index += 1) {
    if (lines[index].indent === 6 && lines[index].text.startsWith("- name:")) {
      starts.push(index);
    }
  }
  return starts.map((start, position) => {
    const end = starts[position + 1] ?? stepsEnd;
    const properties = {};
    for (let index = start + 1; index < end; index += 1) {
      const line = lines[index];
      if (line.indent !== 8) continue;
      const { key, value } = keyValue(line.text);
      if (value === "" && ["env", "with"].includes(key)) {
        properties[key] = directMap(lines.slice(0, end), index, 10);
      } else {
        properties[key] = value;
      }
    }
    return {
      name: scalar(lines[start].text.slice("- name:".length)),
      ...properties,
      effectiveText: lines.slice(start, end).map((line) => line.text).join("\n"),
    };
  });
}

function parseWorkflow(source) {
  const lines = effectiveLines(source);
  const permissionsIndex = uniqueIndex(
    lines,
    (line) => line.indent === 0 && line.text === "permissions:",
    "top-level permissions",
  );
  const jobsIndex = uniqueIndex(
    lines,
    (line) => line.indent === 0 && line.text === "jobs:",
    "top-level jobs",
  );
  const jobsEnd = blockEnd(lines, jobsIndex);
  const jobs = {};
  for (let index = jobsIndex + 1; index < jobsEnd; index += 1) {
    const line = lines[index];
    if (line.indent !== 2 || !/^[A-Za-z0-9_-]+:$/.test(line.text)) continue;
    const name = line.text.slice(0, -1);
    const direct = directMap(lines, index, 4);
    jobs[name] = {
      timeoutMinutes: direct["timeout-minutes"],
      steps: parseSteps(lines, index),
      env: (() => {
        const end = blockEnd(lines, index);
        const envIndexes = [];
        for (let child = index + 1; child < end; child += 1) {
          if (lines[child].indent === 4 && lines[child].text === "env:") {
            envIndexes.push(child);
          }
        }
        if (envIndexes.length > 1) {
          throw new Error(`expected at most one ${name}: job environment node`);
        }
        return envIndexes.length === 1
          ? directMap(lines, envIndexes[0], 6)
          : {};
      })(),
    };
  }
  return {
    permissions: directMap(lines, permissionsIndex, 2),
    jobs,
  };
}

function exactObject(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function workflowFindings(path, source, contract) {
  const findings = [];
  let workflow;
  try {
    workflow = parseWorkflow(source);
  } catch (error) {
    return [`${path}: invalid governed YAML structure: ${error instanceof Error ? error.message : String(error)}`];
  }

  if (!exactObject(workflow.permissions, { contents: "read" })) {
    findings.push(`${path}: permissions must be exactly contents: read`);
  }
  if (
    !exactObject(
      Object.fromEntries(Object.entries(workflow.jobs).map(([name, job]) => [name, job.timeoutMinutes])),
      contract.jobs,
    )
  ) {
    findings.push(`${path}: every governed job must retain its exact bounded timeout`);
  }

  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
  const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  if (
    !checkout ||
    checkout.with?.ref !== contract.checkoutSha ||
    checkout.with?.["persist-credentials"] !== false
  ) {
    findings.push(`${path}: checkout must bind to the governed exact SHA without persisted credentials`);
  }

  for (const step of steps) {
    if (step.uses && !PINNED_ACTION.test(step.uses)) {
      findings.push(`${path}: action is not pinned to a full commit SHA: ${step.uses}`);
    }
  }

  const uploads = steps.filter((step) => step.uses?.startsWith("actions/upload-artifact@"));
  if (uploads.length === 0) {
    findings.push(`${path}: governed evidence upload step is missing`);
  }
  for (const upload of uploads) {
    if (typeof upload.with?.name !== "string" || !upload.with.name.includes(contract.artifactSha)) {
      findings.push(`${path}: artifact ${upload.name} is not bound to the exact evidence SHA`);
    }
    if (
      path === ".github/workflows/ci.yml" &&
      upload.if === "${{ failure() }}" &&
      upload.with?.["if-no-files-found"] !== "ignore"
    ) {
      findings.push(
        `${path}: conditional failure diagnostics must ignore a missing artifact when its producer was skipped`,
      );
    }
  }

  const setupNode = steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
  if (!setupNode || setupNode.with?.["node-version"] !== "22") {
    findings.push(`${path}: Node.js setup must retain the governed major version`);
  }
  const npmVerification = steps.find((step) => /^Verify npm(?: major)? version$/.test(step.name));
  if (
    !npmVerification ||
    !npmVerification.effectiveText.includes("npm --version") ||
    !npmVerification.effectiveText.includes("10")
  ) {
    findings.push(`${path}: npm 10 runtime verification is missing`);
  }

  if (path === ".github/workflows/ci.yml") {
    const quality = workflow.jobs.quality;
    const productionContract = quality?.steps.find(
      (step) => step.name === "Production environment contract",
    );
    if (
      productionContract?.env?.NODE_ENV !== "production" ||
      productionContract?.run !== "npm run env:check"
    ) {
      findings.push(`${path}: production environment contract must execute env:check in production mode`);
    }
    for (const [key, value] of Object.entries(quality?.env ?? {})) {
      if (
        typeof value === "string" &&
        REJECTED_PRODUCTION_FIXTURE_MARKER.test(value)
      ) {
        findings.push(`${path}: production contract fixture ${key} contains a rejected placeholder marker`);
      }
    }
  }

  if (contract.minimumReleaseSha) {
    const releaseVerification = steps.find(
      (step) => step.name === "Verify selected commit belongs to main",
    );
    if (
      releaseVerification?.env?.MINIMUM_RELEASE_SHA !== contract.minimumReleaseSha ||
      !releaseVerification.effectiveText.includes(
        'git merge-base --is-ancestor "$MINIMUM_RELEASE_SHA" "$RELEASE_SHA"',
      ) ||
      !releaseVerification.effectiveText.includes(
        'git merge-base --is-ancestor "$RELEASE_SHA" origin/main',
      )
    ) {
      findings.push(`${path}: staging release must be on main and at or after the approved baseline`);
    }
  }
  return findings;
}

export function ciWorkflowPolicyFindings(sources) {
  const findings = [];
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    return ["governed workflow source map is missing"];
  }
  const actualPaths = Object.keys(sources).sort();
  const expectedPaths = Object.keys(GOVERNED_CI_WORKFLOWS).sort();
  if (!exactObject(actualPaths, expectedPaths)) {
    findings.push("governed workflow source map must contain the exact expected path set");
  }
  for (const [path, contract] of Object.entries(GOVERNED_CI_WORKFLOWS)) {
    findings.push(...workflowFindings(path, sources[path], contract));
  }
  return findings;
}

export function assertCiWorkflowPolicy(sources) {
  const findings = ciWorkflowPolicyFindings(sources);
  if (findings.length > 0) {
    throw new Error(`CI workflow evidence authority failed:\n- ${findings.join("\n- ")}`);
  }
}
