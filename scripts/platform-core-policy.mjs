const REQUIRED_PLATFORM_TYPE_CONTRACTS = Object.freeze([
  "export type TenantId = string;",
  "export type WorkspaceId = string;",
  "export type UserId = string;",
  'export type TenantPlan = "free" | "pro" | "enterprise";',
  "workspaceId: WorkspaceId;",
  "membership: Membership | null;",
]);

const REQUIRED_PRODUCT_IDENTITIES = Object.freeze([
  'exchange: defineProduct({\n    id: "exchange"',
  'academy: defineProduct({\n    id: "academy"',
  'social: defineProduct({\n    id: "social"',
  'mentor: defineProduct({\n    id: "mentor"',
  'knowledge: defineProduct({\n    id: "knowledge"',
  'marketplace: defineProduct({\n    id: "marketplace"',
]);

function requireSource(findings, source, expected, label) {
  if (typeof source !== "string" || !source.includes(expected)) {
    findings.push(`${label} must retain ${expected}`);
  }
}

export function platformCoreFindings(sources) {
  const findings = [];
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    return ["platform core sources must be an object"];
  }

  for (const expected of [
    "if (value === undefined) return config.defaultEnabled;",
    'if (value === "true") return true;',
    'if (value === "false") return false;',
    "return false;",
    "availability controls, not authorization or release-launch gates",
  ]) {
    requireSource(findings, sources.featureFlags, expected, "Feature flag authority");
  }
  if (
    sources.featureFlags?.includes(
      'if (value === "false") return false;\n  return config.defaultEnabled;',
    )
  ) {
    findings.push("Malformed configured feature flags must not inherit an enabled default");
  }

  const productionSecure =
    sources.platformConfig?.indexOf(
      'if (process.env.NODE_ENV === "production") return true;',
    ) ?? -1;
  const explicitInsecure =
    sources.platformConfig?.indexOf(
      'if (process.env.TECPEY_COOKIE_SECURE === "false") return false;',
    ) ?? -1;
  if (
    productionSecure < 0 ||
    explicitInsecure < 0 ||
    productionSecure > explicitInsecure
  ) {
    findings.push(
      "Production cookie security must override every non-production insecure setting",
    );
  }
  for (const expected of [
    "export const ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60;",
    "Math.max(ACCESS_SESSION_MIN_AGE_SECONDS, configured)",
    "Math.min(",
  ]) {
    requireSource(
      findings,
      sources.platformConfig,
      expected,
      "Access-session lifetime authority",
    );
  }
  if (/export function sessionMaxAge\(\)/u.test(sources.platformConfig ?? "")) {
    findings.push(
      "Access-session authority must not expose a relative JWT duration that reads a second wall-clock timestamp",
    );
  }

  for (const expected of [
    "const issuedAt = Math.floor(Date.now() / 1000);",
    ".setIssuedAt(issuedAt)",
    ".setExpirationTime(issuedAt + sessionMaxAgeSeconds())",
  ]) {
    requireSource(
      findings,
      sources.unifiedSession,
      expected,
      "Unified-session timestamp authority",
    );
  }
  if (sources.unifiedSession?.includes(".setExpirationTime(sessionMaxAge())")) {
    findings.push(
      "Unified-session expiry must not read a second implicit wall-clock timestamp",
    );
  }

  for (const expected of REQUIRED_PLATFORM_TYPE_CONTRACTS) {
    requireSource(
      findings,
      sources.platformTypes,
      expected,
      "Platform context type contract",
    );
  }

  for (const expected of [
    'type ProductDefinition = Omit<Product, "isEnabled">;',
    "function defineProduct(definition: ProductDefinition): Product",
    "definition.featureFlag === null",
    ": isFeatureEnabled(definition.featureFlag)",
    "Readonly<Record<ProductId, Product>>",
  ]) {
    requireSource(
      findings,
      sources.productRegistry,
      expected,
      "Product registry authority",
    );
  }
  for (const identity of REQUIRED_PRODUCT_IDENTITIES) {
    requireSource(
      findings,
      sources.productRegistry,
      identity,
      "Product registry identity",
    );
  }
  if (
    /featureFlag:\s*"[^"]+",\s*\n\s*isEnabled:/u.test(
      sources.productRegistry ?? "",
    )
  ) {
    findings.push(
      "Product enabled state must derive from its declared featureFlag without a duplicate callback",
    );
  }

  return findings;
}

export function assertPlatformCore(sources) {
  const findings = platformCoreFindings(sources);
  if (findings.length > 0) {
    throw new Error(`Platform core authority failed:\n- ${findings.join("\n- ")}`);
  }
}
