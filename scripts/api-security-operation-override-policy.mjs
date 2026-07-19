const METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CLASSIFICATIONS = new Set(["public", "authenticated", "admin", "internal"]);
const AUTHORITY_TYPES = new Set([
  "pre-authentication",
  "compatibility-pre-authentication",
  "admin-pre-authentication",
  "bootstrap-credential",
  "live-principal",
  "compatibility-alias",
]);
const SAFE_CONTROL_KEYS = new Set(["noStore", "verifiedPrincipal"]);
const SAFE_REQUIREMENT_KEYS = new Set(["csrf", "strictRevocation", "verifiedPrincipal"]);
const ISSUE_PATTERN = /^(?:#\d+|https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+)$/;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function falseOnlyRequirements(overrides, prefix, errors) {
  for (const [name, value] of Object.entries(overrides)) {
    if (!SAFE_REQUIREMENT_KEYS.has(name)) {
      errors.push(`${prefix}.requirementOverrides.${name} cannot be overridden`);
    }
    if (value !== false) {
      errors.push(`${prefix}.requirementOverrides.${name} must be false; positive evidence must come from source analysis`);
    }
  }
}

function validateControlOverrides(overrides, prefix, errors) {
  for (const [name, value] of Object.entries(overrides)) {
    if (!SAFE_CONTROL_KEYS.has(name)) {
      errors.push(`${prefix}.controlOverrides.${name} cannot be asserted manually`);
      continue;
    }
    if (typeof value !== "boolean") {
      errors.push(`${prefix}.controlOverrides.${name} must be boolean`);
    }
    if (name === "noStore" && value !== true) {
      errors.push(`${prefix}.controlOverrides.noStore may only strengthen the contract to true`);
    }
  }
}

function validateAuthorityType(override, entry, prefix, errors) {
  const requirementKeys = Object.keys(override.requirementOverrides);
  const control = override.controlOverrides;
  const principal = override.principalSource;

  switch (override.authorityType) {
    case "pre-authentication":
    case "compatibility-pre-authentication": {
      if (override.classification !== "public") {
        errors.push(`${prefix} pre-authentication authority must classify the operation as public`);
      }
      if (!entry.risk?.includes("credential")) {
        errors.push(`${prefix} pre-authentication authority requires credential risk evidence`);
      }
      if (!entry.controls?.rateLimit) {
        errors.push(`${prefix} pre-authentication authority requires source-derived rate limiting`);
      }
      if (!(principal === null || principal === undefined)) {
        errors.push(`${prefix} pre-authentication authority cannot claim an existing principal`);
      }
      if (control.verifiedPrincipal !== false || control.noStore !== true) {
        errors.push(`${prefix} pre-authentication authority requires verifiedPrincipal=false and noStore=true`);
      }
      if (entry.controls?.setsCookie && !entry.controls?.csrf) {
        errors.push(`${prefix} session-setting pre-authentication operations require source-derived CSRF protection`);
      }
      if (requirementKeys.some((key) => !["csrf", "strictRevocation", "verifiedPrincipal"].includes(key))) {
        errors.push(`${prefix} pre-authentication authority may only relax CSRF, strictRevocation, or verifiedPrincipal`);
      }
      break;
    }
    case "admin-pre-authentication": {
      if (override.classification !== "admin" || !entry.risk?.includes("admin")) {
        errors.push(`${prefix} admin pre-authentication authority requires admin classification and risk`);
      }
      if (!entry.controls?.rateLimit || !entry.controls?.csrf) {
        errors.push(`${prefix} admin pre-authentication authority requires source-derived rate limiting and CSRF`);
      }
      if (!(principal === null || principal === undefined)) {
        errors.push(`${prefix} admin pre-authentication authority cannot claim an existing principal`);
      }
      if (control.verifiedPrincipal !== false || control.noStore !== true) {
        errors.push(`${prefix} admin pre-authentication authority requires verifiedPrincipal=false and noStore=true`);
      }
      if (requirementKeys.some((key) => !["strictRevocation", "verifiedPrincipal"].includes(key))) {
        errors.push(`${prefix} admin pre-authentication authority may only relax strictRevocation and verifiedPrincipal`);
      }
      break;
    }
    case "bootstrap-credential": {
      if (override.classification !== "admin" || !entry.risk?.includes("admin")) {
        errors.push(`${prefix} bootstrap credential authority requires admin classification and risk`);
      }
      if (typeof principal !== "string" || principal.length < 3) {
        errors.push(`${prefix} bootstrap credential authority requires a named principal source`);
      }
      if (control.verifiedPrincipal !== true || control.noStore !== true) {
        errors.push(`${prefix} bootstrap credential authority requires verifiedPrincipal=true and noStore=true`);
      }
      if (!entry.controls?.rateLimit || !entry.controls?.csrf) {
        errors.push(`${prefix} bootstrap credential authority requires source-derived rate limiting and CSRF`);
      }
      if (requirementKeys.some((key) => key !== "strictRevocation")) {
        errors.push(`${prefix} bootstrap credential authority may only relax strictRevocation`);
      }
      break;
    }
    case "live-principal": {
      if (!["authenticated", "admin"].includes(override.classification ?? entry.classification)) {
        errors.push(`${prefix} live-principal authority requires authenticated or admin classification`);
      }
      if (typeof principal !== "string" || principal.length < 3 || control.verifiedPrincipal !== true) {
        errors.push(`${prefix} live-principal authority requires a named, verified principal source`);
      }
      if (requirementKeys.length > 0) {
        errors.push(`${prefix} live-principal authority cannot relax security requirements`);
      }
      break;
    }
    case "compatibility-alias": {
      if (!entry.delegatedTo || String(entry.delegatedTo).includes("unresolved")) {
        errors.push(`${prefix} compatibility alias must resolve to a canonical handler`);
      }
      if (requirementKeys.length > 0) {
        errors.push(`${prefix} compatibility alias cannot relax security requirements`);
      }
      if (Object.keys(control).some((key) => key !== "noStore") || control.noStore !== true) {
        errors.push(`${prefix} compatibility alias may only strengthen noStore=true`);
      }
      break;
    }
    default:
      errors.push(`${prefix}.authorityType is invalid`);
  }
}

export function validateOperationOverride(override, entry, index = 0) {
  const errors = [];
  const prefix = `operations[${index}]`;
  if (!object(override)) return [`${prefix} must be an object`];
  if (typeof override.route !== "string" || !override.route.startsWith("/api/") || override.route.includes("*")) {
    errors.push(`${prefix}.route must be an exact /api path without wildcards`);
  }
  if (!METHODS.has(override.method)) errors.push(`${prefix}.method is invalid`);
  if (!AUTHORITY_TYPES.has(override.authorityType)) errors.push(`${prefix}.authorityType is invalid`);
  if (override.classification !== undefined && !CLASSIFICATIONS.has(override.classification)) {
    errors.push(`${prefix}.classification is invalid`);
  }
  if (!(override.principalSource === undefined || override.principalSource === null || typeof override.principalSource === "string")) {
    errors.push(`${prefix}.principalSource must be a string or null`);
  }
  if (!(override.tenantSource === undefined || override.tenantSource === null || typeof override.tenantSource === "string")) {
    errors.push(`${prefix}.tenantSource must be a string or null`);
  }
  if (!object(override.controlOverrides)) errors.push(`${prefix}.controlOverrides must be an object`);
  if (!object(override.requirementOverrides)) errors.push(`${prefix}.requirementOverrides must be an object`);
  if (object(override.controlOverrides)) validateControlOverrides(override.controlOverrides, prefix, errors);
  if (object(override.requirementOverrides)) falseOnlyRequirements(override.requirementOverrides, prefix, errors);
  if (typeof override.reason !== "string" || override.reason.trim().length < 30) {
    errors.push(`${prefix}.reason must contain at least 30 characters`);
  }
  if (typeof override.issue !== "string" || !ISSUE_PATTERN.test(override.issue)) {
    errors.push(`${prefix}.issue must be #number or a GitHub issue URL`);
  }
  if (entry && object(override.controlOverrides) && object(override.requirementOverrides)) {
    validateAuthorityType(override, entry, prefix, errors);
  }
  return errors;
}
