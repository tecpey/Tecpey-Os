import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.split("=");
    return [key, value.join("=") || true];
  }),
);

const inventoryPath = resolve(
  ROOT,
  String(args.get("--inventory") || ".artifacts/repository-audit/inventory.json"),
);
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

const RULES = [
  {
    id: "SECRET_PRIVATE_KEY_PEM",
    severity: "p0",
    title: "Private-key PEM marker is tracked",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    sensitive: true,
  },
  {
    id: "SECRET_CLOUD_TOKEN",
    severity: "p0",
    title: "Credential-shaped cloud or provider token is tracked",
    pattern: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/,
    sensitive: true,
  },
  {
    id: "UNSAFE_EVAL",
    severity: "p0",
    title: "Dynamic code execution requires explicit security review",
    pattern: /\b(?:eval\s*\(|new\s+Function\s*\()/,
    path: /\.(?:[cm]?[jt]sx?)$/,
  },
  {
    id: "API_UNBOUNDED_JSON_BODY",
    severity: "p1",
    title: "API route may parse an unbounded request body",
    pattern: /\b(?:request|req)\.json\s*\(\s*\)/,
    path: /^src\/app\/api\/.*\/route\.(?:ts|tsx|js|jsx)$/,
  },
  {
    id: "UNSAFE_HTML",
    severity: "p1",
    title: "Raw HTML rendering requires sanitization and provenance review",
    pattern: /dangerouslySetInnerHTML/,
    path: /\.(?:tsx|jsx)$/,
  },
  {
    id: "FINANCIAL_FLOAT_CONVERSION",
    severity: "p1",
    title: "Financial path converts values through binary floating point",
    pattern: /\b(?:Number|parseFloat|parseInt)\s*\(/,
    path: /(?:exchange|trading|order|matching|ledger|balance|wallet|withdraw|deposit|fee|pnl|custody)/i,
  },
  {
    id: "SECURITY_NONCRYPTO_RANDOM",
    severity: "p1",
    title: "Security or financial path uses Math.random",
    pattern: /\bMath\.random\s*\(/,
    path: /(?:security|auth|session|token|otp|passkey|wallet|withdraw|exchange|trading|order|idempotency)/i,
  },
  {
    id: "BROWSER_DURABLE_STATE_LEAD",
    severity: "p1",
    title: "Browser persistence requires authority classification",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    path: /^(?:src|app|components)\//,
  },
  {
    id: "FIRE_AND_FORGET_DURABLE_WRITE",
    severity: "p1",
    title: "Durable-looking write may be launched without awaiting outcome",
    pattern: /\bvoid\s+(?:await\s+)?[\w.]*?(?:save|persist|insert|update|delete|write|record|append|enqueue|publish)\w*\s*\(/i,
    path: /^(?:src|scripts)\//,
  },
  {
    id: "HARDCODED_BEARER",
    severity: "p1",
    title: "Hard-coded bearer authorization material requires secret review",
    pattern: /Authorization\s*[:=].*Bearer\s+[A-Za-z0-9._~-]{12,}/i,
    sensitive: true,
  },
  {
    id: "WEAK_DIGEST",
    severity: "p1",
    title: "Weak digest algorithm appears in an authority path",
    pattern: /createHash\s*\(\s*["'](?:md5|sha1)["']\s*\)/i,
    path: /^(?:src|scripts)\//,
  },
  {
    id: "SQL_INTERPOLATION_LEAD",
    severity: "p1",
    title: "SQL template interpolation requires injection review",
    pattern: /`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)[^`]*\$\{/i,
    path: /\.(?:ts|tsx|js|mjs|cjs)$/,
  },
  {
    id: "TYPESCRIPT_IGNORE",
    severity: "p2",
    title: "TypeScript diagnostic suppression requires justification",
    pattern: /@ts-(?:ignore|nocheck|expect-error)/,
    path: /\.(?:ts|tsx)$/,
  },
  {
    id: "EXPLICIT_ANY",
    severity: "p2",
    title: "Explicit any weakens a typed boundary",
    pattern: /(?:\bas\s+any\b|:\s*any\b|<any>)/,
    path: /\.(?:ts|tsx)$/,
  },
  {
    id: "ESLINT_DISABLE",
    severity: "p2",
    title: "ESLint suppression requires narrow documented scope",
    pattern: /eslint-disable/,
    path: /\.(?:ts|tsx|js|jsx|mjs|cjs)$/,
  },
  {
    id: "DIRECT_PROCESS_ENV",
    severity: "p2",
    title: "Scattered environment access may create configuration drift",
    pattern: /\bprocess\.env\./,
    path: /^src\//,
    exclude: /(?:platform-config|validate-env|env-validation|test|\.test\.)/i,
  },
  {
    id: "HARDCODED_EXTERNAL_HTTP",
    severity: "p2",
    title: "Hard-coded external HTTP endpoint requires trust and timeout review",
    pattern: /https?:\/\/[A-Za-z0-9.-]+/,
    path: /^(?:src|scripts)\//,
    exclude: /(?:test|fixture|mock|localhost|127\.0\.0\.1)/i,
  },
  {
    id: "CONSOLE_LOG_PRODUCTION",
    severity: "p2",
    title: "Direct console logging requires redaction and observability review",
    pattern: /\bconsole\.(?:log|debug|info)\s*\(/,
    path: /^src\//,
    exclude: /(?:test|fixture|mock|logger)/i,
  },
  {
    id: "TODO_DEBT_MARKER",
    severity: "p3",
    title: "Unresolved engineering marker requires ownership classification",
    pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/i,
    path: /^(?:src|scripts|\.github)\//,
  },
];

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sanitize(line, sensitive) {
  if (sensitive) return "[redacted: potentially sensitive match]";
  return line.replace(/\s+/g, " ").trim().slice(0, 220);
}

function applies(rule, path) {
  if (rule.path && !rule.path.test(path)) return false;
  if (rule.exclude && rule.exclude.test(path)) return false;
  return true;
}

const findings = [];
let scannedFiles = 0;
let scannedLines = 0;

for (const file of inventory.files) {
  if (!file.text) continue;
  const absolute = resolve(ROOT, file.path);
  const buffer = readFileSync(absolute);
  const actualDigest = digest(buffer);
  if (actualDigest !== file.digestSha256) {
    throw new Error(`Inventory digest mismatch for ${file.path}`);
  }

  scannedFiles += 1;
  const lines = buffer.toString("utf8").split(/\r?\n/);
  scannedLines += file.lines ?? lines.length;

  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!applies(rule, file.path)) continue;
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(line)) continue;
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        title: rule.title,
        path: file.path,
        line: index + 1,
        domain: file.domain,
        risk: file.risk,
        reviewBatch: file.reviewBatch,
        evidence: sanitize(line, rule.sensitive),
        status: "review-required",
        defectConfirmed: null,
        disposition: null,
      });
    }
  });
}

const severityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
findings.sort(
  (left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.ruleId.localeCompare(right.ruleId),
);

const countBy = (key) =>
  Object.fromEntries(
    [...new Set(findings.map((finding) => String(finding[key])))]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => [value, findings.filter((finding) => String(finding[key]) === value).length]),
  );

const report = {
  schemaVersion: 1,
  repository: inventory.repository,
  commit: inventory.commit,
  generatedAt: new Date().toISOString(),
  inventoryDigestSha256: digest(readFileSync(inventoryPath)),
  statement:
    "Pattern matches are review leads, not confirmed defects. Semantic review and adversarial evidence are required.",
  totals: {
    trackedFiles: inventory.totals.trackedFiles,
    scannedTextFiles: scannedFiles,
    scannedTextLines: scannedLines,
    findings: findings.length,
  },
  counts: {
    severity: countBy("severity"),
    rule: countBy("ruleId"),
    domain: countBy("domain"),
    reviewBatch: countBy("reviewBatch"),
  },
  findings,
};

function markdownReport() {
  const severityRows = ["p0", "p1", "p2", "p3"]
    .map((severity) => `| ${severity.toUpperCase()} | ${report.counts.severity[severity] ?? 0} |`)
    .join("\n");
  const ruleRows = Object.entries(report.counts.rule)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([rule, count]) => `| ${rule} | ${count} |`)
    .join("\n");

  return `# TecPey Repository Line Scanner\n\n` +
    `- Exact commit: \`${report.commit}\`\n` +
    `- Text files scanned: **${report.totals.scannedTextFiles}**\n` +
    `- Text lines scanned: **${report.totals.scannedTextLines}**\n` +
    `- Review leads: **${report.totals.findings}**\n\n` +
    `> Pattern matches are review leads, not confirmed defects. No severity label becomes a defect verdict without semantic review.\n\n` +
    `## Leads by severity\n\n| Severity | Count |\n|---|---:|\n${severityRows}\n\n` +
    `## Leads by rule\n\n| Rule | Count |\n|---|---:|\n${ruleRows || "| none | 0 |"}\n`;
}

function writeOutput(target, content) {
  const absolute = resolve(ROOT, String(target));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = markdownReport();
if (args.has("--json")) writeOutput(args.get("--json"), json);
if (args.has("--markdown")) writeOutput(args.get("--markdown"), markdown);
if (!args.has("--json") && !args.has("--markdown")) process.stdout.write(markdown);

const failOn = String(args.get("--fail-on") || "").toLowerCase();
if (failOn && severityOrder[failOn] !== undefined) {
  const threshold = severityOrder[failOn];
  if (findings.some((finding) => severityOrder[finding.severity] <= threshold)) {
    process.exitCode = 1;
  }
}
