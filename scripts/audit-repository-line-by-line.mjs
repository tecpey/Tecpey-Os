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

const BINARY_EXTENSIONS = new Set([
  ".avif", ".bmp", ".eot", ".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".mp4",
  ".ogg", ".otf", ".pdf", ".png", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2", ".zip",
]);

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT_DIR, failOn: null, jsonOnly: false };
  for (const arg of argv) {
    if (arg.startsWith("--output-dir=")) args.outputDir = arg.slice("--output-dir=".length);
    else if (arg.startsWith("--fail-on=")) args.failOn = arg.slice("--fail-on=".length).toUpperCase();
    else if (arg === "--json-only") args.jsonOnly = true;
    else if (arg === "--help") {
      console.log(`Usage: node ${SCRIPT_PATH} [--output-dir=DIR] [--fail-on=P0|P1|P2|P3] [--json-only]`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.failOn && !(args.failOn in SEVERITY_RANK)) throw new Error(`Unsupported --fail-on severity: ${args.failOn}`);
  return args;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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

function classificationOf(filePath, binary) {
  const p = filePath.toLowerCase();
  if (binary) return "binary-asset";
  if (p.startsWith("public/charting_library/") || p.includes("/bundles/") || /\.min\.[cm]?js$/.test(p)) return "vendored-generated";
  if (p.startsWith("docs/engineering/phase39/") && p.includes("-candidates/")) return "archived-candidate";
  if (p.endsWith("package-lock.json") || p.endsWith(".lock")) return "generated-lock";
  if (p.startsWith("docs/")) return "documentation";
  if (p.startsWith("src/tests/") || /\.test\.[cm]?[jt]sx?$/.test(p)) return "test";
  if (p.startsWith("scripts/") || p.startsWith(".github/")) return "engineering-governance";
  return "runtime-source";
}

function looksBinary(filePath, buffer) {
  if (BINARY_EXTENSIONS.has(extensionOf(filePath))) return true;
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function isTestOrFixture(filePath) {
  return /(^|\/)(tests?|__tests__|fixtures?|mocks?)(\/|$)/i.test(filePath) || /\.test\.[cm]?[jt]sx?$/i.test(filePath);
}

function isDocumentation(filePath) {
  return filePath.endsWith(".md") || filePath.startsWith("docs/") || filePath === "README.md";
}

function isRuntimeSource(filePath) {
  return filePath.startsWith("src/") && !isTestOrFixture(filePath);
}

function isFinancialPath(filePath) {
  return /(exchange|matching|order|ledger|balance|wallet|withdraw|custody|trade|trading|arena|fee|pnl)/i.test(filePath);
}

function isSecurityPath(filePath) {
  return /(auth|session|security|admin|passkey|csrf|wallet|withdraw|custody|api-key|token)/i.test(filePath);
}

function contextualSeverity(filePath, runtimeSeverity, nonRuntimeSeverity = "P3") {
  return isRuntimeSource(filePath) || filePath === "server.ts" ? runtimeSeverity : nonRuntimeSeverity;
}

async function loadJsonIfPresent(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return fallback;
    throw new Error(`Unable to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeException(value) {
  return {
    path: String(value.path ?? ""),
    rule: String(value.rule ?? ""),
    line: value.line === undefined ? null : Number(value.line),
    owner: String(value.owner ?? ""),
    issue: String(value.issue ?? ""),
    reason: String(value.reason ?? ""),
    expiresAt: String(value.expiresAt ?? ""),
  };
}

function exceptionMatches(exception, finding) {
  return exception.path === finding.path && exception.rule === finding.rule && (exception.line === null || exception.line === finding.line);
}

function validateExceptions(exceptions) {
  const findings = [];
  const now = Date.now();
  for (const exception of exceptions) {
    if (!exception.path || !exception.rule || !exception.owner || !exception.issue || !exception.reason || !exception.expiresAt) {
      findings.push(baseFinding(EXCEPTIONS_PATH, 1, "qa.invalid_exception", "P1", "certain", "Every QA exception requires path, rule, owner, issue, reason and expiresAt.", JSON.stringify(exception)));
      continue;
    }
    const expiry = Date.parse(exception.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) {
      findings.push(baseFinding(EXCEPTIONS_PATH, 1, "qa.expired_exception", "P1", "certain", `QA exception expired or invalid for ${exception.path} / ${exception.rule}.`, JSON.stringify(exception)));
    }
  }
  return findings;
}

function sanitizeExcerpt(line) {
  const compact = String(line ?? "").trim().replace(/\s+/g, " ");
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function baseFinding(filePath, line, rule, severity, confidence, message, excerpt) {
  return { path: filePath, line, rule, severity, confidence, domain: domainOf(filePath), message, excerpt: sanitizeExcerpt(excerpt) };
}

function secretSeverity(filePath, line) {
  if (isRuntimeSource(filePath) && !/(canary|placeholder|example|sample|dummy|redacted|test)/i.test(line)) return "P0";
  return isDocumentation(filePath) || isTestOrFixture(filePath) ? "P2" : "P1";
}

function scanSupplyChainLine(filePath, line, lineNumber) {
  const findings = [];
  const push = (rule, severity, confidence, message) => findings.push(baseFinding(filePath, lineNumber, rule, severity, confidence, message, line));
  if (/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(line)) push("secret.private_key_block", secretSeverity(filePath, line), "certain", "Private-key material must never be committed.");
  if (/\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bsk-[A-Za-z0-9_-]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{20,}\b/.test(line)) push("secret.provider_token", secretSeverity(filePath, line), "high", "Possible live provider credential pattern.");
  if (/[\u202A-\u202E\u2066-\u2069]/u.test(line)) push("unicode.bidi_control", "P1", "certain", "Bidirectional control characters can hide source-code intent.");
  if (/[\u200B\u200D]/u.test(line) || (lineNumber > 1 && /\uFEFF/u.test(line))) push("unicode.zero_width", "P2", "high", "Unexpected zero-width character requires review; Persian ZWNJ U+200C is intentionally allowed.");
  return findings;
}

function scanLine(filePath, line, lineNumber) {
  const findings = scanSupplyChainLine(filePath, line, lineNumber);
  const push = (rule, severity, confidence, message) => findings.push(baseFinding(filePath, lineNumber, rule, severity, confidence, message, line));

  const secretAssignment = /\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`]{12,})["'`]/i.exec(line);
  if (secretAssignment) {
    const candidate = secretAssignment[2];
    const clearlyNonSecret = /(placeholder|example|sample|dummy|redacted|changeme|local-|test-|ci-|your[_-]|process\.env|<[^>]+>|\/|\.tsx?$|\.mjs$|^[A-Z0-9_]+$)/i.test(candidate);
    if (!clearlyNonSecret) push("secret.hardcoded_credential", secretSeverity(filePath, line), "high", "Possible hard-coded credential or secret literal.");
  }

  if (/\b(seed phrase|mnemonic)\b.{0,40}\b(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}\b/i.test(line)) {
    push("secret.mnemonic_phrase", secretSeverity(filePath, line), "high", "Possible wallet recovery phrase committed in text.");
  }

  if (/\b(TODO|FIXME|HACK|XXX|TEMPORARY|BYPASS)\b/i.test(line)) push("debt.marker", contextualSeverity(filePath, "P2", "P3"), "high", "Unresolved implementation or governance debt marker.");

  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(line)) push("error.empty_catch", contextualSeverity(filePath, "P1", "P2"), "certain", "Empty catch block silently discards failure evidence.");
  if (/\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*(?:\{\s*\}|undefined|null)\s*\)/.test(line)) push("error.swallowed_promise", contextualSeverity(filePath, "P2", "P3"), "high", "Promise rejection is explicitly swallowed or converted to an untyped null/undefined path.");
  if (/\bvoid\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/.test(line) && isRuntimeSource(filePath)) push("durability.fire_and_forget", "P2", "medium", "Fire-and-forget execution may hide write or delivery failure.");

  if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(line) && isRuntimeSource(filePath)) push("persistence.browser_authority", "P1", "high", "Browser persistence requires classification as disposable cache, UI preference, migration aid or prohibited source of truth.");

  if (/\bprocess\.env\b/.test(line) && !/(platform-config|validate-env|env-validation|\.test\.|scripts\/)/i.test(filePath)) push("config.direct_process_env", "P2", "high", "Direct environment access bypasses centralized configuration and validation.");

  if (/(^|[^\w$.])eval\s*\(/.test(line) || /\bnew\s+Function\s*\(/.test(line) || /\bFunction\s*\(\s*["'`]/.test(line)) push("security.dynamic_execution", contextualSeverity(filePath, "P0", "P2"), "certain", "JavaScript dynamic code execution is prohibited without an explicit sandboxed design.");
  if (/dangerouslySetInnerHTML/.test(line)) push("security.dangerous_html", contextualSeverity(filePath, "P2", "P3"), "high", "Raw HTML injection surface requires trusted serialization/sanitization evidence.");
  if (/\b(execFileSync|execSync|spawn|spawnSync)\s*\(|\bchild_process\.exec\s*\(/.test(line) && filePath !== SCRIPT_PATH) push("security.process_execution", contextualSeverity(filePath, "P1", "P2"), "high", "Process execution requires fixed arguments, no user input and bounded output.");
  if (/\bMath\.random\s*\(/.test(line) && isSecurityPath(filePath)) push("security.weak_randomness", contextualSeverity(filePath, "P1", "P3"), "high", "Security-sensitive randomness must use a cryptographically secure source.");

  if (isFinancialPath(filePath) && /\b(parseFloat|parseInt|Number)\s*\(|\.toFixed\s*\(|Math\.(round|floor|ceil)\s*\(/.test(line)) push("financial.numeric_precision", contextualSeverity(filePath, "P1", "P3"), "medium", "Financial-path conversion or rounding requires classification as non-financial metadata or Decimal/integer-unit proof.");

  if (/\b(client\.)?query\s*\(\s*`[^`]*\$\{/.test(line) || /\b(SELECT|INSERT|UPDATE|DELETE)\b[^\n]*\$\{/i.test(line)) push("sql.dynamic_interpolation", contextualSeverity(filePath, "P1", "P3"), "high", "Interpolated SQL requires proof that only reviewed SQL fragments—not user data—are inserted.");
  if (/\bSELECT\s+\*/i.test(line) && /query|sql|`/.test(line)) push("sql.select_star", contextualSeverity(filePath, "P2", "P3"), "medium", "SELECT * weakens schema control and may expose newly added sensitive columns.");

  if (/\b(describe|it|test)\.only\s*\(/.test(line)) push("test.focused_only", "P0", "certain", "Focused test prevents the full suite from executing.");
  if (/\b(describe|it|test)\.skip\s*\(/.test(line)) push("test.skipped", "P1", "certain", "Skipped test requires an explicit issue, owner and expiry.");

  if (/\bconsole\.(log|debug|info)\s*\(/.test(line) && isRuntimeSource(filePath)) push("observability.console_output", "P3", "high", "Production source should use governed structured logging.");
  if (/\b(error|err)\.message\b/.test(line) && /NextResponse\.json|Response\.json|json\s*\(/.test(line)) push("api.raw_error_exposure", contextualSeverity(filePath, "P1", "P3"), "medium", "Raw internal error text may be returned to a client.");
  if (/\bas\s+any\b|:\s*any\b|<any>/.test(line) && isRuntimeSource(filePath)) push("typescript.explicit_any", "P3", "high", "Explicit any weakens contract and trust-boundary verification.");
  if (/onClick=/.test(line) && /<(div|span)\b/.test(line) && !/(role=|tabIndex=|onKeyDown=|onKeyUp=)/.test(line)) push("accessibility.clickable_noninteractive", contextualSeverity(filePath, "P2", "P3"), "medium", "Clickable non-interactive element may be inaccessible to keyboard and assistive technology.");
  if (isDocumentation(filePath) && /\b(?:production[- ]ready|fully secure|100% complete|no risk)\b/i.test(line)) push("docs.unsupported_readiness_claim", "P2", "high", "Absolute readiness/security claim requires direct release evidence and current scope.");

  return findings;
}

function scanFileLevel(filePath, text, lines) {
  const findings = [];
  const add = (rule, severity, confidence, message, lineNumber = 1) => findings.push(baseFinding(filePath, lineNumber, rule, severity, confidence, message, lines[lineNumber - 1] ?? ""));

  if (/\/route\.[cm]?[jt]sx?$/.test(filePath) && /(?:request|req)\.json\s*\(/.test(text) && !/readBoundedJsonRequest|readBoundedRequestBody/.test(text)) {
    const index = text.search(/(?:request|req)\.json\s*\(/);
    add("api.unbounded_json_body", "P1", "high", "API route parses JSON without the governed bounded-body helper.", text.slice(0, index).split(/\r?\n/).length);
  }
  if (/\bfetch\s*\(/.test(text) && !/(AbortController|AbortSignal|signal\s*:|timeout|withTimeout)/.test(text) && isRuntimeSource(filePath)) {
    const index = text.search(/\bfetch\s*\(/);
    add("network.fetch_without_cancellation", "P2", "medium", "Network call has no visible cancellation or timeout boundary in the same file.", text.slice(0, index).split(/\r?\n/).length);
  }
  if (lines.length > 900 && isRuntimeSource(filePath)) add("maintainability.oversized_file", "P2", "certain", `Runtime source contains ${lines.length} lines and requires decomposition review.`);
  if (isDocumentation(filePath) && /\b\d{1,3}%\b/.test(text) && /(ready|readiness|complete|completion|progress|آماد|پیشرفت|تکمیل)/i.test(text)) {
    const index = text.search(/\b\d{1,3}%\b/);
    add("docs.percentage_claim", "P2", "medium", "Readiness percentage must link to a current, reproducible scoring model.", text.slice(0, index).split(/\r?\n/).length);
  }
  return findings;
}

function toMarkdown(report) {
  const out = [
    "# TecPey Repository-Wide Line Audit",
    "",
    `- Commit: \`${report.commit}\``,
    `- Generated: ${report.generatedAt}`,
    `- Tracked files: **${report.summary.totalFiles}**`,
    `- Text files inspected: **${report.summary.textFiles}**`,
    `- Binary files inventoried: **${report.summary.binaryFiles}**`,
    `- Text lines processed: **${report.summary.linesScanned.toLocaleString("en-US")}**`,
    `- Unsuppressed findings: **${report.summary.unsuppressedFindings}**`,
    "",
    "## Severity summary",
    "",
    "| Severity | Count |",
    "|---|---:|",
  ];
  for (const severity of ["P0", "P1", "P2", "P3", "INFO"]) out.push(`| ${severity} | ${report.summary.bySeverity[severity] ?? 0} |`);
  out.push("", "## Classification coverage", "", "| Classification | Files |", "|---|---:|");
  for (const [classification, count] of Object.entries(report.summary.byClassification).sort((a, b) => b[1] - a[1])) out.push(`| ${classification} | ${count} |`);
  out.push("", "## Domain summary", "", "| Domain | Findings |", "|---|---:|");
  for (const [domain, count] of Object.entries(report.summary.byDomain).sort((a, b) => b[1] - a[1])) out.push(`| ${domain} | ${count} |`);
  out.push("", "## Highest-priority findings", "", "| Severity | Path | Line | Rule | Finding |", "|---|---|---:|---|---|");
  for (const finding of report.findings.filter((item) => !item.suppressed).slice(0, 300)) out.push(`| ${finding.severity} | \`${finding.path}\` | ${finding.line} | \`${finding.rule}\` | ${finding.message.replaceAll("|", "\\|")} |`);
  out.push("", "> Every tracked text line is processed. Vendored/generated artifacts receive supply-chain and encoding checks rather than misleading application-semantic rules. Deterministic scanning remains an input to human review, runtime testing, financial reconciliation and operational drills.", "");
  return `${out.join("\n")}\n`;
}

function toSarif(report) {
  const rules = new Map();
  for (const finding of report.findings) if (!rules.has(finding.rule)) rules.set(finding.rule, { id: finding.rule, name: finding.rule.replaceAll(".", "_"), shortDescription: { text: finding.message }, properties: { severity: finding.severity, domain: finding.domain } });
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "TecPey Repository Line Audit", version: "1.1.0", rules: [...rules.values()] } },
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
  const byClassification = {};
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const filePath of trackedFiles) {
    const fileStat = await stat(filePath);
    const buffer = await readFile(filePath);
    totalBytes += buffer.length;
    const binary = looksBinary(filePath, buffer);
    const classification = classificationOf(filePath, binary);
    byClassification[classification] = (byClassification[classification] ?? 0) + 1;
    const entry = { path: filePath, domain: domainOf(filePath), classification, extension: extensionOf(filePath), bytes: buffer.length, executable: (fileStat.mode & 0o111) !== 0, sha256: sha256(buffer), binary, lines: null };

    if (binary) {
      binaryFiles += 1;
      inventory.push(entry);
      continue;
    }

    let text;
    try {
      text = decoder.decode(buffer);
    } catch {
      findings.push(baseFinding(filePath, 1, "encoding.invalid_utf8", "P1", "certain", "Tracked non-binary file is not valid UTF-8.", ""));
      inventory.push(entry);
      continue;
    }

    textFiles += 1;
    const lines = text.split(/\r?\n/);
    entry.lines = lines.length;
    linesScanned += lines.length;
    inventory.push(entry);

    if (filePath === SCRIPT_PATH) continue;
    if (classification === "vendored-generated" || classification === "generated-lock") {
      for (let index = 0; index < lines.length; index += 1) findings.push(...scanSupplyChainLine(filePath, lines[index], index + 1));
      continue;
    }
    for (let index = 0; index < lines.length; index += 1) findings.push(...scanLine(filePath, lines[index], index + 1));
    findings.push(...scanFileLevel(filePath, text, lines));
  }

  findings = findings.map((finding) => {
    const matched = exceptions.find((exception) => exceptionMatches(exception, finding));
    return matched ? { ...finding, suppressed: true, exception: matched } : { ...finding, suppressed: false };
  }).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));

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
    schemaVersion: 2,
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
      byClassification,
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
    console.log(`Files: ${trackedFiles.length}; text: ${textFiles}; binary: ${binaryFiles}; lines processed: ${linesScanned}`);
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
