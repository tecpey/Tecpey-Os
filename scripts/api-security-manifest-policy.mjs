const METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const METHOD_ORDER = ["POST", "PUT", "PATCH", "DELETE"];
const CLASSIFICATIONS = new Set(["public", "authenticated", "admin", "internal"]);
const MUTATION_MODES = new Set(["active", "deny-only"]);
const RISK_CLASSES = new Set(["admin", "ai-memory", "credential", "financial", "privacy", "progress"]);
const OVERRIDE_AUTHORITY_TYPES = new Set([
  "pre-authentication",
  "compatibility-pre-authentication",
  "admin-pre-authentication",
  "bootstrap-credential",
  "live-principal",
  "compatibility-alias",
]);
const FINDING_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const OWNER_PATTERN = /^[a-z0-9][a-z0-9._/-]{1,100}$/i;
const ISSUE_PATTERN = /^(?:#\d+|https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_PATH_PATTERN = /^src\/app\/api\/.+\/route\.ts$/;
const SOURCE_HASH_PATTERN = /^[a-f0-9]{24}$/;
const CONTROL_BOOLEAN_KEYS = [
  "csrf",
  "strictRevocation",
  "rateLimit",
  "expectsBody",
  "bodySizeLimit",
  "contentTypeCheck",
  "idempotency",
  "transaction",
  "verifiedPrincipal",
  "tenantFromVerifiedContext",
  "noStore",
  "audit",
  "redaction",
  "failClosed",
  "serviceIdentity",
  "setsCookie",
  "headerBodySizeHint",
  "explicitPublicCachePolicy",
];
const CONTROL_KEYS = new Set([
  ...CONTROL_BOOLEAN_KEYS,
  "rateLimitNamespace",
  "inputParser",
  "bodySizeLimitAuthority",
]);
const REQUIREMENT_KEYS = [
  "csrf",
  "strictRevocation",
  "rateLimit",
  "bodySizeLimit",
  "idempotency",
  "verifiedPrincipal",
  "noStore",
  "audit",
  "redaction",
  "serviceIdentity",
];
const REQUIREMENT_KEY_SET = new Set(REQUIREMENT_KEYS);
const TOTAL_KEYS = new Set([
  "routeFiles",
  "mutatingOperations",
  "activeOperations",
  "denyOnlyOperations",
  "operationsWithFindings",
  "findings",
  "findingCounts",
]);
const OPERATION_KEYS = new Set([
  "route",
  "method",
  "sourcePath",
  "sourceHash",
  "delegatedTo",
  "delegatedSourceHash",
  "mutationMode",
  "classification",
  "principalSource",
  "tenantSource",
  "risk",
  "controls",
  "requirements",
  "domainOwner",
  "testReferences",
  "findings",
  "evidenceSource",
  "operationOverride",
]);
const FINDING_RULES = [
  ["csrf", "csrf", "required_csrf_missing"],
  ["strictRevocation", "strictRevocation", "required_strict_revocation_missing"],
  ["bodySizeLimit", "bodySizeLimit", "parsed_body_without_size_limit"],
  ["rateLimit", "rateLimit", "public_mutation_without_rate_limit"],
  ["idempotency", "idempotency", "replayable_command_without_idempotency"],
  ["verifiedPrincipal", "verifiedPrincipal", "missing_verified_principal_source"],
  ["noStore", "noStore", "private_mutation_without_explicit_no_store"],
  ["audit", "audit", "missing_audit_or_observability_evidence"],
  ["redaction", "redaction", "missing_error_redaction_evidence"],
  ["serviceIdentity", "serviceIdentity", "internal_route_without_service_identity_evidence"],
];

export function findingKey(route, method, finding) {
  return `${method} ${route} :: ${finding}`;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function stringOrNull(value) {
  return value === null || typeof value === "string";
}

function uniqueStrings(values) {
  return Array.isArray(values)
    && values.every((value) => typeof value === "string")
    && new Set(values).size === values.length;
}

function rejectUnknownKeys(value, allowed, prefix, errors) {
  if (!object(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${prefix}.${key} is not allowed`);
  }
}

function expectedFindings(entry) {
  return FINDING_RULES
    .filter(([requirement, control]) => entry.requirements?.[requirement] === true && entry.controls?.[control] !== true)
    .map(([, , finding]) => finding)
    .sort();
}

function validateControls(entry, prefix, errors) {
  if (!object(entry.controls)) {
    errors.push(`${prefix}.controls must be an object`);
    return;
  }
  rejectUnknownKeys(entry.controls, CONTROL_KEYS, `${prefix}.controls`, errors);
  for (const key of CONTROL_BOOLEAN_KEYS) {
    if (typeof entry.controls[key] !== "boolean") errors.push(`${prefix}.controls.${key} must be boolean`);
  }
  if (!stringOrNull(entry.controls.rateLimitNamespace)) {
    errors.push(`${prefix}.controls.rateLimitNamespace must be string or null`);
  }
  if (!stringOrNull(entry.controls.inputParser)) {
    errors.push(`${prefix}.controls.inputParser must be string or null`);
  }
  if (!stringOrNull(entry.controls.bodySizeLimitAuthority)) {
    errors.push(`${prefix}.controls.bodySizeLimitAuthority must be string or null`);
  }
  if (entry.controls.bodySizeLimit === true && !entry.controls.bodySizeLimitAuthority) {
    errors.push(`${prefix}.controls.bodySizeLimit requires named enforceable authority`);
  }
  if (entry.controls.explicitPublicCachePolicy === true && entry.controls.noStore === true) {
    errors.push(`${prefix}.controls cannot claim both explicit public caching and no-store`);
  }
}

function validateRequirements(entry, prefix, errors) {
  if (!object(entry.requirements)) {
    errors.push(`${prefix}.requirements must be an object`);
    return;
  }
  rejectUnknownKeys(entry.requirements, REQUIREMENT_KEY_SET, `${prefix}.requirements`, errors);
  for (const key of REQUIREMENT_KEYS) {
    if (typeof entry.requirements[key] !== "boolean") errors.push(`${prefix}.requirements.${key} must be boolean`);
  }
}

function validateEvidence(entry, prefix, errors) {
  if (!object(entry.evidenceSource)) {
    errors.push(`${prefix}.evidenceSource must be an object`);
    return;
  }
  rejectUnknownKeys(entry.evidenceSource, new Set(["sourcePath", "method", "resolved"]), `${prefix}.evidenceSource`, errors);
  if (!SOURCE_PATH_PATTERN.test(entry.evidenceSource.sourcePath ?? "")) {
    errors.push(`${prefix}.evidenceSource.sourcePath is invalid`);
  }
  if (!METHODS.has(entry.evidenceSource.method)) {
    errors.push(`${prefix}.evidenceSource.method is invalid`);
  }
  if (entry.evidenceSource.resolved !== true) {
    errors.push(`${prefix}.evidenceSource must resolve on the exact source tree`);
  }
}

function validateOperationOverride(entry, prefix, errors) {
  if (entry.operationOverride === undefined) return;
  if (!object(entry.operationOverride)) {
    errors.push(`${prefix}.operationOverride must be an object`);
    return;
  }
  rejectUnknownKeys(
    entry.operationOverride,
    new Set(["authorityType", "reason", "issue"]),
    `${prefix}.operationOverride`,
    errors,
  );
  if (!OVERRIDE_AUTHORITY_TYPES.has(entry.operationOverride.authorityType)) {
    errors.push(`${prefix}.operationOverride.authorityType is invalid`);
  }
  if (typeof entry.operationOverride.reason !== "string" || entry.operationOverride.reason.trim().length < 30) {
    errors.push(`${prefix}.operationOverride.reason must contain at least 30 characters`);
  }
  if (typeof entry.operationOverride.issue !== "string" || !ISSUE_PATTERN.test(entry.operationOverride.issue)) {
    errors.push(`${prefix}.operationOverride.issue is invalid`);
  }
}

function validateManifestTotals(manifest, errors) {
  if (!object(manifest.totals)) {
    errors.push("manifest.totals must be an object");
    return;
  }
  rejectUnknownKeys(manifest.totals, TOTAL_KEYS, "manifest.totals", errors);
  const routes = manifest.routes ?? [];
  const findingCounts = {};
  for (const entry of routes) {
    for (const finding of entry.findings ?? []) findingCounts[finding] = (findingCounts[finding] ?? 0) + 1;
  }
  const expected = {
    mutatingOperations: routes.length,
    activeOperations: routes.filter((entry) => entry.mutationMode === "active").length,
    denyOnlyOperations: routes.filter((entry) => entry.mutationMode === "deny-only").length,
    operationsWithFindings: routes.filter((entry) => (entry.findings ?? []).length > 0).length,
    findings: routes.reduce((sum, entry) => sum + (entry.findings?.length ?? 0), 0),
  };
  if (!Number.isInteger(manifest.totals.routeFiles) || manifest.totals.routeFiles < 1) {
    errors.push("manifest.totals.routeFiles must be a positive integer");
  }
  for (const [key, value] of Object.entries(expected)) {
    if (manifest.totals[key] !== value) errors.push(`manifest.totals.${key} must equal ${value}`);
  }
  if (!object(manifest.totals.findingCounts)) {
    errors.push("manifest.totals.findingCounts must be an object");
    return;
  }
  for (const [finding, count] of Object.entries(manifest.totals.findingCounts)) {
    if (!FINDING_PATTERN.test(finding) || !Number.isInteger(count) || count < 1) {
      errors.push(`manifest.totals.findingCounts.${finding} is invalid`);
    }
  }
  const normalizedActual = JSON.stringify(
    Object.fromEntries(Object.entries(manifest.totals.findingCounts).sort(([left], [right]) => left.localeCompare(right))),
  );
  const normalizedExpected = JSON.stringify(
    Object.fromEntries(Object.entries(findingCounts).sort(([left], [right]) => left.localeCompare(right))),
  );
  if (normalizedActual !== normalizedExpected) errors.push("manifest.totals.findingCounts is inconsistent with routes");
}

function validateManifestShape(manifest) {
  const errors = [];
  if (!object(manifest) || manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion must equal 1");
  rejectUnknownKeys(manifest, new Set(["schemaVersion", "authority", "methods", "totals", "routes"]), "manifest", errors);
  if (manifest?.authority !== "generated-from-src-app-api-route-ts") errors.push("manifest.authority is invalid");
  if (JSON.stringify(manifest?.methods) !== JSON.stringify(METHOD_ORDER)) {
    errors.push("manifest.methods must exactly equal POST, PUT, PATCH, DELETE");
  }
  if (!Array.isArray(manifest?.routes)) errors.push("manifest.routes must be an array");

  const operations = new Set();
  let previousOperationKey = "";
  for (const [index, entry] of (manifest?.routes ?? []).entries()) {
    const prefix = `manifest.routes[${index}]`;
    if (!object(entry)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    rejectUnknownKeys(entry, OPERATION_KEYS, prefix, errors);
    if (typeof entry.route !== "string" || !entry.route.startsWith("/api/") || entry.route.includes("*")) {
      errors.push(`${prefix}.route must be an exact /api path without wildcards`);
    }
    if (!METHODS.has(entry.method)) errors.push(`${prefix}.method is invalid`);
    if (!SOURCE_PATH_PATTERN.test(entry.sourcePath ?? "")) errors.push(`${prefix}.sourcePath is invalid`);
    if (!SOURCE_HASH_PATTERN.test(entry.sourceHash ?? "")) errors.push(`${prefix}.sourceHash is invalid`);
    if (!stringOrNull(entry.delegatedTo)) errors.push(`${prefix}.delegatedTo must be string or null`);
    if (!stringOrNull(entry.delegatedSourceHash)) errors.push(`${prefix}.delegatedSourceHash must be string or null`);
    if (typeof entry.delegatedSourceHash === "string" && !SOURCE_HASH_PATTERN.test(entry.delegatedSourceHash)) {
      errors.push(`${prefix}.delegatedSourceHash is invalid`);
    }
    if (!MUTATION_MODES.has(entry.mutationMode)) errors.push(`${prefix}.mutationMode is invalid`);
    if (!CLASSIFICATIONS.has(entry.classification)) errors.push(`${prefix}.classification is invalid`);
    if (!stringOrNull(entry.principalSource)) errors.push(`${prefix}.principalSource must be string or null`);
    if (!stringOrNull(entry.tenantSource)) errors.push(`${prefix}.tenantSource must be string or null`);
    if (!uniqueStrings(entry.risk) || entry.risk.some((risk) => !RISK_CLASSES.has(risk))) {
      errors.push(`${prefix}.risk contains invalid or duplicate values`);
    }
    if (typeof entry.domainOwner !== "string" || entry.domainOwner.length < 1) {
      errors.push(`${prefix}.domainOwner is invalid`);
    }
    if (!uniqueStrings(entry.testReferences)) errors.push(`${prefix}.testReferences must contain unique strings`);
    if (!uniqueStrings(entry.findings)) errors.push(`${prefix}.findings must contain unique strings`);
    for (const finding of entry.findings ?? []) {
      if (!FINDING_PATTERN.test(finding)) errors.push(`${prefix} has invalid finding: ${finding}`);
    }

    validateControls(entry, prefix, errors);
    validateRequirements(entry, prefix, errors);
    validateEvidence(entry, prefix, errors);
    validateOperationOverride(entry, prefix, errors);

    if (object(entry.controls) && object(entry.requirements) && Array.isArray(entry.findings)) {
      const actual = [...entry.findings].sort();
      const expected = expectedFindings(entry);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(`${prefix}.findings do not match requirements and controls`);
      }
    }

    const operationKey = `${entry.route} ${entry.method}`;
    if (operations.has(operationKey)) errors.push(`duplicate operation: ${entry.method} ${entry.route}`);
    operations.add(operationKey);
    if (previousOperationKey && operationKey.localeCompare(previousOperationKey) < 0) {
      errors.push("manifest.routes must be sorted by route and method");
    }
    previousOperationKey = operationKey;
  }
  validateManifestTotals(manifest ?? {}, errors);
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
  if (!object(exception)) return [`${prefix} must be an object`];
  rejectUnknownKeys(
    exception,
    new Set(["id", "route", "method", "finding", "owner", "issue", "reason", "compensatingControls", "expiresOn"]),
    prefix,
    errors,
  );
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
  if (!object(registry)) {
    errors.push("exception registry must be an object");
    return [];
  }

  if (registry.schemaVersion === 1 && Array.isArray(registry.exceptions)) {
    rejectUnknownKeys(registry, new Set(["schemaVersion", "exceptions"]), "registry", errors);
    return registry.exceptions;
  }

  if (registry.schemaVersion !== 2 || !Array.isArray(registry.groups)) {
    errors.push("exception registry must use schemaVersion 1/exceptions or schemaVersion 2/groups");
    return [];
  }
  rejectUnknownKeys(registry, new Set(["schemaVersion", "groups"]), "registry", errors);

  const exceptions = [];
  const groupIds = new Set();
  for (const [groupIndex, group] of registry.groups.entries()) {
    const prefix = `groups[${groupIndex}]`;
    if (!object(group)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    rejectUnknownKeys(
      group,
      new Set(["id", "finding", "issue", "reason", "compensatingControls", "expiresOn", "operations"]),
      prefix,
      errors,
    );
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
      if (!object(operation)) {
        errors.push(`${operationPrefix} must be an object`);
        continue;
      }
      rejectUnknownKeys(operation, new Set(["route", "method", "owner"]), operationPrefix, errors);
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
    if (!object(exception)) continue;
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
  errors.push(
    ...duplicate,
    ...expired.map((key) => `expired exception: ${key}`),
    ...stale.map((key) => `stale exception: ${key}`),
  );

  return {
    ok: errors.length === 0 && uncovered.length === 0,
    errors,
    uncovered,
    currentFindings: [...currentFindings].sort(),
    coveredFindings: [...currentFindings].filter((key) => exceptionKeys.has(key)).sort(),
    exceptionCount: exceptionKeys.size,
  };
}
