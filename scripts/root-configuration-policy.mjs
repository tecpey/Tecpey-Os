const REQUIRED_DOCKER_IGNORES = Object.freeze([
  ".git",
  ".github",
  ".next",
  "dist",
  "node_modules",
  "artifacts",
  ".agents",
  ".env",
  ".env.*",
]);

const REQUIRED_GIT_IGNORES = Object.freeze([
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.*.example",
]);
const ALLOWED_ENV_REINCLUSIONS = new Set([
  "!.env.example",
  "!.env.*.example",
]);
const ALLOWED_DOCKER_REINCLUSIONS = new Set([
  "!.env.example",
]);

function meaningfulLines(source) {
  if (typeof source !== "string") return new Set();
  return new Set(
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
}

function requireLine(findings, lines, required, label) {
  if (!lines.has(required)) findings.push(`${label} must contain the exact ${required} rule`);
}

function requireSource(findings, source, required, label) {
  if (typeof source !== "string" || !source.includes(required)) {
    findings.push(`${label} must retain ${required}`);
  }
}

function parseJson(findings, source, label) {
  try {
    return JSON.parse(source);
  } catch {
    findings.push(`${label} must be valid JSON`);
    return null;
  }
}

function protectedDockerTarget(target, protectedPath) {
  if (protectedPath.endsWith(".*")) {
    return target === protectedPath || target.startsWith(protectedPath.slice(0, -1));
  }
  return target === protectedPath || target.startsWith(`${protectedPath}/`);
}

export function rootConfigurationFindings(sources) {
  const findings = [];
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    return ["root configuration sources must be an object"];
  }

  const dockerIgnoreLines = meaningfulLines(sources.dockerIgnore);
  for (const required of REQUIRED_DOCKER_IGNORES) {
    requireLine(findings, dockerIgnoreLines, required, "Docker build context");
  }
  for (const line of dockerIgnoreLines) {
    if (!line.startsWith("!")) continue;
    if (ALLOWED_DOCKER_REINCLUSIONS.has(line)) continue;
    const target = line.slice(1).replace(/^\/+/u, "");
    const protectedPath = REQUIRED_DOCKER_IGNORES.find((required) =>
      protectedDockerTarget(target, required),
    );
    if (protectedPath) {
      findings.push(`Docker build context must not re-include ${target}`);
    }
  }

  const gitIgnoreLines = meaningfulLines(sources.gitIgnore);
  for (const required of REQUIRED_GIT_IGNORES) {
    requireLine(findings, gitIgnoreLines, required, "Git environment boundary");
  }
  for (const line of gitIgnoreLines) {
    if (/^!\.env(?:$|\.)/u.test(line) && !ALLOWED_ENV_REINCLUSIONS.has(line)) {
      findings.push(`Git environment boundary must not re-include ${line.slice(1)}`);
    }
  }

  for (const commonJsContract of [
    'files: ["**/*.cjs"]',
    'sourceType: "commonjs"',
    'module: "readonly"',
    'process: "readonly"',
    '"no-undef": "error"',
    '"no-unused-vars": ["error", { argsIgnorePattern: "^_" }]',
  ]) {
    requireSource(
      findings,
      sources.eslintConfig,
      commonJsContract,
      "ESLint CommonJS configuration",
    );
  }
  if (sources.eslintConfig?.includes('"*.config.cjs"')) {
    findings.push("ESLint must not ignore every present or future CommonJS configuration file");
  }
  if (sources.eslintConfig?.includes('"ecosystem.config.cjs"')) {
    findings.push("ESLint must not exclude the production PM2 configuration");
  }

  for (const requiredHeader of [
    '{ key: "X-Content-Type-Options", value: "nosniff" }',
    '{ key: "X-Frame-Options", value: "DENY" }',
    '{ key: "X-DNS-Prefetch-Control", value: "off" }',
    '{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }',
    '{ key: "X-XSS-Protection", value: "0" }',
    'value: "max-age=63072000; includeSubDomains; preload"',
  ]) {
    requireSource(findings, sources.nextConfig, requiredHeader, "Next security headers");
  }
  for (const requiredConfig of [
    "reactStrictMode: true",
    "poweredByHeader: false",
    "TECPEY_IMMUTABLE_BUILD_COMMIT_SHA: immutableBuildCommit",
    'source: "/:path*"',
  ]) {
    requireSource(findings, sources.nextConfig, requiredConfig, "Next runtime configuration");
  }
  if (sources.nextConfig?.includes('{ key: "X-DNS-Prefetch-Control", value: "on" }')) {
    findings.push("Next security headers must not enable speculative DNS prefetch");
  }

  const tsconfig = parseJson(findings, sources.tsconfig, "TypeScript configuration");
  if (tsconfig) {
    const compilerOptions = tsconfig.compilerOptions;
    if (!compilerOptions || typeof compilerOptions !== "object") {
      findings.push("TypeScript configuration must define compilerOptions");
    } else {
      for (const [key, expected] of [
        ["strict", true],
        ["noEmit", true],
        ["isolatedModules", true],
        ["moduleResolution", "bundler"],
        ["jsx", "react-jsx"],
      ]) {
        if (compilerOptions[key] !== expected) {
          findings.push(`TypeScript compilerOptions.${key} must equal ${String(expected)}`);
        }
      }
      if (
        !Array.isArray(compilerOptions.plugins) ||
        !compilerOptions.plugins.some((plugin) => plugin?.name === "next")
      ) {
        findings.push("TypeScript configuration must retain the Next.js plugin");
      }
    }
  }

  const kilo = parseJson(findings, sources.kiloConfig, "Kilo configuration");
  if (
    kilo &&
    (Object.keys(kilo).length !== 1 ||
      kilo.$schema !== "https://app.kilo.ai/config.json")
  ) {
    findings.push("Kilo configuration must remain schema-only");
  }

  requireSource(
    findings,
    sources.postcssConfig,
    '"@tailwindcss/postcss": {}',
    "PostCSS configuration",
  );
  requireSource(
    findings,
    sources.agents,
    "node_modules/next/dist/docs/",
    "Agent Next.js authority",
  );
  if (sources.claude?.trim() !== "@AGENTS.md") {
    findings.push("Claude instructions must delegate to the canonical AGENTS.md");
  }

  return findings;
}

export function assertRootConfiguration(sources) {
  const findings = rootConfigurationFindings(sources);
  if (findings.length > 0) {
    throw new Error(`Root configuration authority failed:\n- ${findings.join("\n- ")}`);
  }
}
