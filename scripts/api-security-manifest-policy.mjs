const METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const FINDING_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const OWNER_PATTERN = /^[a-z0-9][a-z0-9._/-]{1,100}$/i;
const ISSUE_PATTERN = /^(?:#\d+|https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function findingKey(route, method, finding) {
  return `${method} ${route} :: ${finding}`;
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function groupedExceptionId(groupId, method, route) {
  const routeId = route
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${groupId}:${method.toLowerCase()}:${routeId}`;
}

function validateManifestShape(manifest) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion must equal 1");
  if (manifest?.authority !== "generated-from-src-app-api-route-ts") errors.push("manifest.authority is invalid");
  if (!Array.isArray(manifest?.routes)) errors.push("manifest.routes must be an array");

  const operations = new Set();
  for (const [index, entry] of (manifest?.routes ?? []).entries()) {
    const prefix = `manifest.routes[${index}]`;
    if (typeof entry.route !== "string" || !entry.route.startsWith("/api/")) {
      errors.push(`${prefix}.route must be an /api path`);
    }
    if (!METHODS.has(entry.method)) errors.push(`${prefix}.method is invalid`);
    if (!Array.isArray(entry.findings)) errors.push(`${prefix}.findings must be an array`);
    const operationKey = `${entry.method} ${entry.route}`;
    if (operations.has(operationKey)) errors.push(`duplicate operation: ${operationKey}`);
    operations.add(operationKey);
    for (const finding of entry.findings ?? []) {
      if (typeof finding !== "string" || !FINDING_PATTERN.test(finding)) {
        errors.push(`${operationKey} has invalid finding: ${String(finding)}`);
      }
    }
  }
  return errors;
}

function validateSharedMetadata(value, prefix) {
  const errors = [];
  if (typeof value.issue !== "string" || !ISSUE_PATTERN.test(value.issue)) {
    errors.push(`${prefix}.issue must be #number or a GitHub issue URL`);
  }
  if (typeof value.reason !== "string" || value.reason.trim().length < 20) {
    errors.push(`${prefix}.reason must contain at least 20 characters`);
  }
  if (!Array.isArray(value.compensatingControls) || value.compensatingControls.length === 0) {
    errors.push(`${prefix}.compensatingControls must be a non-empty array`);
  } else if (value.compensatingControls.some((item) => typeof item !== "string" || item.trim().length < 10)) {
    errors.push(`${prefix}.compensatingControls contains an invalid entry`);
  }
  if (typeof value.expiresOn !== "string" || !validDate(value.expiresOn)) {
    errors.push(`${prefix}.expiresOn must be a real YYYY-MM-DD date`);
  }
  return errors;
}

function validateException(exception, index) {
  const errors = [];
  const prefix = `exceptions[${index}]`;
  if (!exception || typeof exception !== "object" || Array.isArray(exception)) return [`${prefix} must be an object`];
  if (typeof exception.id !== "string" || !/^[a-z0-9][a-z0-9._:-]{5,160}$/i.test(exception.id)) {
    errors.push(`${prefix}.id is invalid`);
  }
  if (typeof exception.route !== "string" || !exception.route.startsWith("/api/") || exception.route.includes("*")) {
    errors.push(`${prefix}.route must be an exact /api path without wildcards`);
  }
  if (!METHODS.has(exception.method)) errors.push(`${prefix}.method is invalid`);
  if (typeof exception.finding !== "string" || !FINDING_PATTERN.test(exception.finding)) {
    errors.push(`${prefix}.finding is invalid`);
  }
  if (typeof exception.owner !== "string" || !OWNER_PATTERN.test(exception.owner)) {
    errors.push(`${prefix}.owner is invalid`);
  }
  errors.push(...validateSharedMetadata(exception, prefix));
  return errors;
}

function expandRegistry(registry, errors) {
  if (!registry || typeof registry !== "object") {
    errors.push("exception registry must be an object");
    return [];
  }

  if (registry.schemaVersion === 1 && Array.isArray(registry.exceptions)) return registry.exceptions;

  if (registry.schemaVersion !== 2 || !Array.isArray(registry.groups)) {
    errors.push("exception registry must use schemaVersion 1/exceptions or schemaVersion 2/groups");
    return [];
  }

  const exceptions = [];
  const groupIds = new Set();
  for (const [groupIndex, group] of registry.groups.entries()) {
    const prefix = `groups[${groupIndex}]`;
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof group.id !== "string" || !/^[a-z0-9][a-z0-9._:-]{2,80}$/i.test(group.id)) {
      errors.push(`${prefix}.id is invalid`);
    } else if (groupIds.has(group.id)) {
      errors.push(`duplicate exception group id: ${group.id}`);
    }
    groupIds.add(group.id);
    if (typeof group.finding !== "string" || !FINDING_PATTERN.test(group.finding)) {
      errors.push(`${prefix}.finding is invalid`);
    }
    errors.push(...validateSharedMetadata(group, prefix));
    if (!Array.isArray(group.operations) || group.operations.length === 0) {
      errors.push(`${prefix}.operations must be a non-empty array`);
      continue;
    }
    for (const [operationIndex, operation] of group.operations.entries()) {
      const operationPrefix = `${prefix}.operations[${operationIndex}]`;
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
        errors.push(`${operationPrefix} must be an object`);
        continue;
      }
      if (typeof operation.route !== "string" || !operation.route.startsWith("/api/") || operation.route.includes("*")) {
        errors.push(`${operationPrefix}.route must be an exact /api path without wildcards`);
      }
      if (!METHODS.has(operation.method)) errors.push(`${operationPrefix}.method is invalid`);
      if (typeof operation.owner !== "string" || !OWNER_PATTERN.test(operation.owner)) {
        errors.push(`${operationPrefix}.owner is invalid`);
      }
      exceptions.push({
        id: groupedExceptionId(group.id, operation.method, operation.route),
        route: operation.route,
        method: operation.method,
        finding: group.finding,
        owner: operation.owner,
        issue: group.issue,
        reason: group.reason,
        compensatingControls: group.compensatingControls,
        expiresOn: group.expiresOn,
      });
    }
  }
  return exceptions;
}

export function evaluateApiSecurityPolicy({ manifest, registry, now = new Date() }) {
  const errors = validateManifestShape(manifest);
  const exceptions = expandRegistry(registry, errors);

  const currentFindings = new Set();
  for (const entry of manifest?.routes ?? []) {
    for (const finding of entry.findings ?? []) currentFindings.add(findingKey(entry.route, entry.method, finding));
  }

  const exceptionKeys = new Set();
  const exceptionIds = new Set();
  const expired = [];
  const stale = [];
  const duplicate = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const [index, exception] of exceptions.entries()) {
    errors.push(...validateException(exception, index));
    if (!exception || typeof exception !== "object") continue;
    if (exceptionIds.has(exception.id)) duplicate.push(`duplicate exception id: ${exception.id}`);
    exceptionIds.add(exception.id);

    const key = findingKey(exception.route, exception.method, exception.finding);
    if (exceptionKeys.has(key)) duplicate.push(`duplicate exception target: ${key}`);
    exceptionKeys.add(key);

    if (validDate(String(exception.expiresOn ?? ""))) {
      const expiry = new Date(`${exception.expiresOn}T23:59:59.999Z`);
      if (expiry.getTime() < today.getTime()) expired.push(key);
    }
    if (!currentFindings.has(key)) stale.push(key);
  }

  const uncovered = [...currentFindings].filter((key) => !exceptionKeys.has(key)).sort();
  errors.push(...duplicate, ...expired.map((key) => `expired exception: ${key}`), ...stale.map((key) => `stale exception: ${key}`));

  return {
    ok: errors.length === 0 && uncovered.length === 0,
    errors,
    uncovered,
    currentFindings: [...currentFindings].sort(),
    coveredFindings: [...currentFindings].filter((key) => exceptionKeys.has(key)).sort(),
    exceptionCount: exceptionKeys.size,
  };
}
