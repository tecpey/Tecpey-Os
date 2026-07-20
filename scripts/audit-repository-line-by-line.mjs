#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";

const SCRIPT_PATH = "scripts/audit-repository-line-by-line.mjs";
const POLICY_PATH = "config/repository-qa-policy.json";
const EXCEPTIONS_PATH = "config/repository-qa-exceptions.json";
const DEFAULT_OUTPUT_DIR = "repository-qa-artifacts";
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3, INFO: 4 };

function parseArgs(argv) {
  const result = {
    outputDir: DEFAULT_OUTPUT_DIR,
    failOn: null,
    jsonOnly: false,
  };
  for (const arg of argv) {
    if (arg.startsWith("--output-dir=")) result.outputDir = arg.slice("--output-dir=".length);
    else if (arg.startsWith("--fail-on=")) result.failOn = arg.slice("--fail-on=".length).toUpperCase();
    else if (arg === "--json-only") result.jsonOnly = true;
    else if (arg === "--help") {
      console.log(`Usage: node ${SCRIPT_PATH} [--output-dir=DIR] [--fail-on=P0|P1|P2|P3] [--json-only]`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (result.failOn && !(result.failOn in SEVERITY_RANK)) {
    throw new Error(`Unsupported --fail-on severity: ${result.failOn}`);
  }
  return result;
}

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function extensionOf(filePath) {
  const base = path.basename(filePath);
  if (!base.includes(".")) return "[none]";
  return path.extname(base).toLowerCase() || "[none]";
}

function domainOf(filePath) {
  const p = filePath.toLowerCase();
  if (p.startsWith(".github/")) return "ci-governance";
  if (p.startsWith("docs/")) return "documentation";
  if (p.startsWith("public/")) return "public-assets";
  if (p.startsWith("scripts/")) return "engineering-tooling";
  if (p.includes("/security/") || p.includes("auth") || p.includes("session") || p.includes("csrf") || p.includes("passkey")) return "identity-security";
  if (p.includes("exchange") || p.includes("matching") || p.includes("order") || p.includes("ledger") || p.includes("trade")) return "exchange";
  if (p.includes("wallet") || p.includes("withdraw") || p.includes("custody") || p.includes("chain")) return "wallet-custody";
  if (p.includes("arena")) return "trading-arena";
  if (p.includes("academy") || p.includes("lesson") || p.includes("certificate") || p.includes("quiz")) return "academy";
  if (p.includes("mentor") || p.includes("/ai/") || p.includes("ai-")) return "mentor-ai";
  if (p.includes("notification")) return "notifications";
  if (p.includes("crm") || p.includes("lead")) return "crm-privacy";
  if (p.includes("tenant") || p.includes("workspace") || p.includes("membership")) return "multi-tenant";
  if (p.includes("db-migrate") || p.includes("migration") || p.includes("database") || p.includes("/db")) return "database";
  if (p.startsWith("src/app/") || p.startsWith("src/components/")) return "frontend-product";
  if (p.startsWith("src/tests/")) return "tests";
  if (p.startsWith("src/lib/")) return "platform-core";
  return "repository-root";
}

const BINARY_EXTENSIONS = new Set([
  ".avif", ".bmp", ".eot", ".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".mp4",
  ".ogg", ".otf", ".pdf", ".png", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2", ".zip",
]);

function looksBinary(filePath, buffer) {
  if (BINARY_EXTENSIONS.has(extensionOf(filePath))) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function isTestOrFixture(filePath) {
  return /(^|\/)(tests?|__tests__|fixtures?|mocks?)(\/|$)/i.test(filePath) || /\.test\.[cm]?[jt]sx?$/i.test(filePath);
}

function isDocumentation(filePath) {
  return filePath.endsWith(".md") || filePath.startsWith("docs/") || filePath === "README.md";
}

function isFinancialPath(filePath) {
  return /(exchange|matching|order|ledger|balance|wallet|withdraw|custody|trade|trading|arena|fee|pnl)/i.test(filePath);
}

function isSecurityPath(filePath) {
  return /(auth|session|security|admin|passkey|csrf|wallet|withdraw|custody|api-key|token)/i.test(filePath);
}

function confidenceForContext(base, filePath) {
  if (isTestOrFixture(filePath) || isDocumentation(filePath)) return base === "certain" ? "high" : "medium";
  return base;
}

async function loadJsonIfPresent(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return fallback;
    throw new Error(`Unable to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeException(exception) {
  return {
    path: String(exception.path ?? ""),
    rule: String(exception.rule ?? ""),
    line: exception.line === undefined ? null : Number(exception.line),
    owner: String(exception.owner ?? ""),
    issue: String(exception.issue ?? ""),
    reason: String(exception.reason ?? ""),
    expiresAt: String(exception.expiresAt ?? ""),
  };
}

function exceptionMatches(exception, finding) {
  return exception.path === finding.path &&
    exception.rule === finding.rule &&
    (exception.line === null || exception.line === finding.line);
}

function validateExceptions(exceptions) {
  const findings = [];
  const now = Date.now();
  for (const exception of exceptions) {
    if (!exception.path || !exception.rule || !exception.owner || !exception.issue || !exception.reason || !exception.expiresAt) {
      findings.push({
        path: EXCEPTIONS_PATH,
        line: 1,
        rule: "qa.invalid_exception",
        severity: "P1",
        confidence: "certain",
        domain: "ci-governance",
        message: "Every QA exception requires path, rule, owner, issue, reason and expiresAt.",
        excerpt: JSON.stringify(exception),
      });
      continue;
    }
    const expires = Date.parse(exception.expiresAt);
    if (!Number.isFinite(expires) || expires <= now) {
      findings.push({
        path: EXCEPTIONS_PATH,
        line: 1,
        rule: "qa.expired_exception",
        severity: "P1",
        confidence: "certain",
        domain: "ci-governance",
        message: `QA exception is expired or invalid for ${exception.path} / ${exception.rule}.`,
        excerpt: JSON.stringify(exception),
      });
    }
  }
  return findings;
}

function sanitizeExcerpt(line) {
  const compact = line.trim().replace(/\s+/g, " ");
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function makeFinding({ filePath, lineNumber, rule, severity, confidence, message, line }) {
  return {
    path: filePath,
    line: lineNumber,
    rule,
    severity,
    confidence: confidenceForContext(confidence, filePath),
    domain: domainOf(filePath),
    message,
    excerpt: sanitizeExcerpt(line),
  };
}

function scanLine(filePath, line, lineNumber) {
  const findings = [];
  const push = (rule, severity, confidence, message) => findings.push(makeFinding({
    filePath, lineNumber, rule, severity, confidence, message, line,
  }));

  if (/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(line)) {
    push("secret.private_key_block", "P0", "certain", "Private-key material must never be committed.");
  }

  const secretAssignment = /\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`]{12,})["'`]/i.exec(line);
  if (secretAssignment) {
    const candidate = secretAssignment[2].toLowerCase();
    const clearlyPlaceholder = /(placeholder|example|sample|dummy|redacted|changeme|local-|test-|ci-|your[_-]|process\.env|<[^>]+>)/i.test(candidate);
    if (!clearlyPlaceholder) push("secret.hardcoded_credential", "P0", "high", "Possible hard-coded credential or secret literal.");
  }

  if (/\b(seed phrase|mnemonic)\b.{0,40}\b(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}\b/i.test(line)) {
    push("secret.mnemonic_phrase", "P0", "high", "Possible wallet recovery phrase committed in text.");
  }

  if (/[\u202A-\u202E\u2066-\u2069]/u.test(line)) {
    push("unicode.bidi_control", "P1", "certain", "Bidirectional control characters can hide source-code intent.");
  }
  if (/[\u200B-\u200D\uFEFF]/u.test(line) && lineNumber > 1) {
    push("unicode.zero_width", "P2", "high", "Unexpected zero-width character requires review.");
  }

  if (/\b(TODO|FIXME|HACK|XXX|TEMPORARY|BYPASS)\b/i.test(line)) {
    push("debt.marker", "P2", "high", "Unresolved implementation or governance debt marker.");
  }

  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(line)) {
    push("error.empty_catch", "P1", "certain", "Empty catch block silently discards failure evidence.");
  }
  if (/\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*(?:\{\s*\}|undefined|null)\s*\)/.test(line)) {
    push("error.swallowed_promise", "P1", "high", "Promise rejection is explicitly swallowed.");
  }
  if (/\bvoid\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/.test(line) && !isTestOrFixture(filePath)) {
    push("durability.fire_and_forget", "P2", "medium", "Fire-and-forget execution may hide write or delivery failure.");
  }

  if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(line) && filePath.startsWith("src/") && !isTestOrFixture(filePath)) {
    push("persistence.browser_authority", "P1", "high", "Browser persistence requires classification as disposable cache, migration aid or prohibited source of truth.");
  }

  if (/\bprocess\.env\b/.test(line) &&
      !/(platform-config|validate-env|env-validation|\.test\.|scripts\/)/i.test(filePath)) {
    push("config.direct_process_env", "P2", "high", "Direct environment access bypasses centralized configuration and validation.");
  }

  if (/\b(eval|Function)\s*\(/.test(line) || /new\s+Function\s*\(/.test(line)) {
    push("security.dynamic_execution", "P0", "certain", "Dynamic code execution is prohibited without an explicit sandboxed design.");
  }
  if (/dangerouslySetInnerHTML/.test(line)) {
    push("security.dangerous_html", "P1", "high", "Raw HTML injection surface requires sanitization and threat-model evidence.");
  }
  if (/\b(exec|execSync|spawn|spawnSync)\s*\(/.test(line) && filePath !== SCRIPT_PATH) {
    push("security.shell_execution", filePath.startsWith("scripts/") ? "P2" : "P1", "high", "Process or shell execution requires fixed arguments, no user input and bounded output.");
  }
  if (/\bMath\.random\s*\(/.test(line) && isSecurityPath(filePath)) {
    push("security.weak_randomness", "P1", "high", "Security-sensitive randomness must use a cryptographically secure source.");
  }

  if (isFinancialPath(filePath) && /\b(parseFloat|parseInt|Number)\s*\(|\.toFixed\s*\(|Math\.(round|floor|ceil)\s*\(/.test(line)) {
    push("financial.numeric_precision", "P1", "medium", "Financial-path number conversion or rounding requires Decimal/integer-unit proof.");
  }

  if (/\b(client\.)?query\s*\(\s*`[^`]*\$\{/.test(line) || /\b(SELECT|INSERT|UPDATE|DELETE)\b[^\n]*\$\{/i.test(line)) {
    push("sql.dynamic_interpolation", "P1", "high", "Interpolated SQL may bypass parameterization or ownership constraints.");
  }
  if (/\bSELECT\s+\*/i.test(line) && /query|sql|`/.test(line)) {
    push("sql.select_star", "P2", "medium", "SELECT * weakens schema control and may expose newly added sensitive columns.");
  }

  if (/\b(describe|it|test)\.only\s*\(/.test(line)) {
    push("test.focused_only", "P0", "certain", "Focused test prevents the full suite from executing.");
  }
  if (/\b(describe|it|test)\.skip\s*\(/.test(line)) {
    push("test.skipped", "P1", "certain", "Skipped test requires an explicit issue, owner and expiry.");
  }

  if (/\bconsole\.(log|debug|info)\s*\(/.test(line) && filePath.startsWith("src/") && !isTestOrFixture(filePath)) {
    push("observability.console_output", "P3", "high", "Production source should use governed structured logging.");
  }

  if (/\b(error|err)\.message\b/.test(line) && /NextResponse\.json|Response\.json|json\s*\(/.test(line)) {
    push("api.raw_error_exposure", "P1", "medium", "Raw internal error text may be returned to a client.");
  }

  if (/\bas\s+any\b|:\s*any\b|<any>/.test(line) && filePath.startsWith("src/") && !isTestOrFixture(filePath)) {
    push("typescript.explicit_any", "P3", "high", "Explicit any weakens contract and trust-boundary verification.");
  }

  if (/onClick=/.test(line) && /<(div|span)\b/.test(line) && !/(role=|tabIndex=|onKeyDown=|onKeyUp=)/.test(line)) {
    push("accessibility.clickable_noninteractive", "P2", "medium", "Clickable non-interactive element may be inaccessible to keyboard and assistive technology.");
  }

  if (isDocumentation(filePath) && /\b(?:production[- ]ready|fully secure|100% complete|no risk)\b/i.test(line)) {
    push("docs.unsupported_readiness_claim", "P1", "high", "Absolute readiness/security claim requires direct release evidence.");
  }

  return findings;
}

function scanFileLevel(filePath, text, lines) {
  const findings = [];
  const add = (rule, severity, confidence, message, lineNumber = 1) => findings.push(makeFinding({
    filePath,
    lineNumber,
    rule,
    severity,
    confidence,
    message,
    line: lines[lineNumber - 1] ?? "",
  }));

  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/s.test(text)) {
    const index = text.search(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/s);
    const lineNumber = text.slice(0, index).split(/\r?\n/).length;
    if (!findings.some((finding) => finding.rule === "error.empty_catch" && finding.line === lineNumber)) {
      add("error.empty_catch", "P1", "certain", "Empty catch block silently discards failure evidence.", lineNumber);
    }
  }

  if (/\/route\.[cm]?[jt]sx?$/.test(filePath) && /(?:request|req)\.json\s*\(/.test(text) && !/readBoundedJsonRequest|readBoundedRequestBody/.test(text)) {
    const index = text.search(/(?:request|req)\.json\s*\(/);
    add("api.unbounded_json_body", "P1", "high", "API route parses JSON without the governed bounded-body helper.", text.slice(0, index).split(/\r?\n/).length);
  }

  if (/\bfetch\s*\(/.test(text) && !/(AbortController|AbortSignal|signal\s*:|timeout|withTimeout)/.test(text) && !isTestOrFixture(filePath)) {
    const index = text.search(/\bfetch\s*\(/);
    add("network.fetch_without_cancellation", "P2", "medium", "Network call has no visible cancellation or timeout boundary in the same file.", text.slice(0, index).split(/\r?\n/).length);
  }

  if (lines.length > 900 && !isDocumentation(filePath)) {
    add("maintainability.oversized_file", "P2", "certain", `Source file contains ${lines.length} lines and requires decomposition review.`);
  }

  if (isDocumentation(filePath) && /\b\d{1,3}%\b/.test(text) && /(ready|readiness|complete|completion|progress|آماد|پیشرفت|تکمیل)/i.test(text)) {
    const index = text.search(/\b\d{1,3}%\b/);
    add("docs.percentage_claim", "P2", "medium", "Readiness percentage must link to a current, reproducible scoring model.", text.slice(0, index).split(/\r?\n/).length);
  }

  return findings;
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# TecPey Repository-Wide Line Audit");
  lines.push("");
  lines.push(`- Commit: \`${report.commit}\``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Tracked files: **${report.summary.totalFiles}**`);
  lines.push(`- Text files inspected: **${report.summary.textFiles}**`);
  lines.push(`- Binary files inventoried: **${report.summary.binaryFiles}**`);
  lines.push(`- Text lines scanned: **${report.summary.linesScanned.toLocaleString("en-US")}**`);
  lines.push(`- Unsuppressed findings: **${report.summary.unsuppressedFindings}**`);
  lines.push("");
  lines.push("## Severity summary");
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|---|---:|");
  for (const severity of ["P0", "P1", "P2", "P3", "INFO"]) {
    lines.push(`| ${severity} | ${report.summary.bySeverity[severity] ?? 0} |`);
  }
  lines.push("");
  lines.push("## Domain summary");
  lines.push("");
  lines.push("| Domain | Findings |");
  lines.push("|---|---:|");
  for (const [domain, count] of Object.entries(report.summary.byDomain).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${domain} | ${count} |`);
  }
  lines.push("");
  lines.push("## Highest-priority findings");
  lines.push("");
  lines.push("| Severity | Path | Line | Rule | Finding |");
  lines.push("|---|---|---:|---|---|");
  for (const finding of report.findings.filter((item) => !item.suppressed).slice(0, 250)) {
    lines.push(`| ${finding.severity} | \`${finding.path}\` | ${finding.line} | \`${finding.rule}\` | ${finding.message.replaceAll("|", "\\|")} |`);
  }
  lines.push("");
  lines.push("> Deterministic scanning is repository-wide, but it is not a substitute for domain-aware human review, runtime testing, financial reconciliation, threat modeling or operational drills.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function toSarif(report) {
  const rules = new Map();
  for (const finding of report.findings) {
    if (!rules.has(finding.rule)) {
      rules.set(finding.rule, {
        id: finding.rule,
        name: finding.rule.replaceAll(".", "_"),
        shortDescription: { text: finding.message },
        properties: { severity: finding.severity, domain: finding.domain },
      });
    }
  }
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "TecPey Repository Line Audit", version: "1.0.0", rules: [...rules.values()] } },
      results: report.findings.filter((finding) => !finding.suppressed).map((finding) => ({
        ruleId: finding.rule,
        level: finding.severity === "P0" || finding.severity === "P1" ? "error" : finding.severity === "P2" ? "warning" : "note",
        message: { text: finding.message },
        locations: [{ physicalLocation: { artifactLocation: { uri: finding.path }, region: { startLine: finding.line } } }],
        properties: { severity: finding.severity, confidence: finding.confidence, domain: finding.domain, excerpt: finding.excerpt },
      })),
    }],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = await loadJsonIfPresent(POLICY_PATH, { version: 1 });
  const exceptionDocument = await loadJsonIfPresent(EXCEPTIONS_PATH, { version: 1, exceptions: [] });
  const exceptions = (exceptionDocument.exceptions ?? []).map(normalizeException);

  const commit = git("rev-parse", "HEAD");
  const trackedFiles = git("ls-files", "-z").split("\0").filter(Boolean).sort();
  const inventory = [];
  let findings = validateExceptions(exceptions);
  let linesScanned = 0;
  let textFiles = 0;
  let binaryFiles = 0;
  let totalBytes = 0;

  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const filePath of trackedFiles) {
    const fileStat = await stat(filePath);
    const buffer = await readFile(filePath);
    totalBytes += buffer.length;
    const binary = looksBinary(filePath, buffer);
    const entry = {
      path: filePath,
      domain: domainOf(filePath),
      extension: extensionOf(filePath),
      bytes: buffer.length,
      executable: (fileStat.mode & 0o111) !== 0,
      sha256: sha256(buffer),
      binary,
      lines: null,
    };

    if (binary) {
      binaryFiles += 1;
      inventory.push(entry);
      continue;
    }

    let text;
    try {
      text = decoder.decode(buffer);
    } catch {
      findings.push(makeFinding({
        filePath,
        lineNumber: 1,
        rule: "encoding.invalid_utf8",
        severity: "P1",
        confidence: "certain",
        message: "Tracked non-binary file is not valid UTF-8.",
        line: "",
      }));
      inventory.push(entry);
      continue;
    }

    textFiles += 1;
    const lines = text.split(/\r?\n/);
    entry.lines = lines.length;
    linesScanned += lines.length;
    inventory.push(entry);

    if (filePath !== SCRIPT_PATH) {
      for (let index = 0; index < lines.length; index += 1) {
        findings.push(...scanLine(filePath, lines[index], index + 1));
      }
      findings.push(...scanFileLevel(filePath, text, lines));
    }
  }

  findings = findings.map((finding) => {
    const matched = exceptions.find((exception) => exceptionMatches(exception, finding));
    return matched ? { ...finding, suppressed: true, exception: matched } : { ...finding, suppressed: false };
  });
  findings.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.path.localeCompare(b.path) ||
    a.line - b.line ||
    a.rule.localeCompare(b.rule));

  const unsuppressed = findings.filter((finding) => !finding.suppressed);
  const bySeverity = Object.fromEntries(["P0", "P1", "P2", "P3", "INFO"].map((severity) => [severity, 0]));
  const byDomain = {};
  const byRule = {};
  for (const finding of unsuppressed) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    byDomain[finding.domain] = (byDomain[finding.domain] ?? 0) + 1;
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit,
    policy,
    summary: {
      totalFiles: trackedFiles.length,
      textFiles,
      binaryFiles,
      totalBytes,
      linesScanned,
      totalFindings: findings.length,
      suppressedFindings: findings.length - unsuppressed.length,
      unsuppressedFindings: unsuppressed.length,
      bySeverity,
      byDomain,
      byRule,
    },
    inventory,
    findings,
  };

  await mkdir(args.outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(args.outputDir, "repository-audit.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(args.outputDir, "repository-inventory.json"), `${JSON.stringify({ commit, generatedAt: report.generatedAt, inventory }, null, 2)}\n`),
    writeFile(path.join(args.outputDir, "repository-audit-report.md"), toMarkdown(report)),
    writeFile(path.join(args.outputDir, "repository-audit.sarif"), `${JSON.stringify(toSarif(report), null, 2)}\n`),
  ]);

  if (args.jsonOnly) console.log(JSON.stringify(report.summary));
  else {
    console.log(`Repository line audit complete for ${commit}`);
    console.log(`Files: ${trackedFiles.length}; text: ${textFiles}; binary: ${binaryFiles}; lines: ${linesScanned}`);
    console.log(`Findings: ${unsuppressed.length} unsuppressed (${bySeverity.P0} P0, ${bySeverity.P1} P1, ${bySeverity.P2} P2, ${bySeverity.P3} P3)`);
    console.log(`Artifacts: ${args.outputDir}`);
  }

  if (args.failOn) {
    const threshold = SEVERITY_RANK[args.failOn];
    const blocking = unsuppressed.filter((finding) => SEVERITY_RANK[finding.severity] <= threshold);
    if (blocking.length > 0) {
      console.error(`Repository line audit failed: ${blocking.length} finding(s) at ${args.failOn} or higher.`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
