import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "config/eslint-correctness-baseline.json");
const SUPPRESSIONS_PATH = path.join(ROOT, "eslint-suppressions.json");
const GOVERNED_RULES = [
  "@typescript-eslint/no-explicit-any",
  "react-hooks/immutability",
  "react-hooks/purity",
  "react-hooks/refs",
  "react-hooks/rules-of-hooks",
  "react-hooks/set-state-in-effect",
];
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const INLINE_DIRECTIVE = /^\s*(?:\/\/|\/\*|\{\/\*)\s*(eslint-disable(?:-next-line|-line)?)\b(.*)$/;
const GOVERNED_DESCRIPTION = /--\s+#\d+:\s+\S/;

function findingKey(finding) {
  return [
    finding.rule,
    finding.path,
    finding.line,
    finding.column,
  ].join(":");
}

function fail(message) {
  throw new Error(`eslint_correctness_authority:${message}`);
}

export function hasGovernedInlineException(line) {
  const directive = line.match(INLINE_DIRECTIVE);
  if (!directive) return true;
  if (directive[1] === "eslint-disable") return false;
  if (!GOVERNED_DESCRIPTION.test(directive[2])) return false;

  const [ruleList = ""] = directive[2].split(/\s+--\s+/u, 1);
  const rules = ruleList
    .trim()
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean);
  return rules.length === 1 && rules[0] !== "all";
}

export function compareBaseline(expected, actual) {
  const expectedKeys = expected.map(findingKey).sort();
  const actualKeys = actual.map(findingKey).sort();
  return {
    matches: JSON.stringify(expectedKeys) === JSON.stringify(actualKeys),
    expectedKeys,
    actualKeys,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function walkSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkSourceFiles(resolved));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(resolved);
    }
  }
  return files;
}

async function assertInlineExceptionPolicy() {
  const roots = ["scripts", "src", "tests"]
    .map((entry) => path.join(ROOT, entry));
  const files = (await Promise.all(roots.map(walkSourceFiles))).flat();
  const invalid = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (!hasGovernedInlineException(line)) {
        invalid.push(`${relative}:${index + 1}`);
      }
    }
  }
  if (invalid.length > 0) {
    fail(`inline_exception_requires_issue_reason:${invalid.join(",")}`);
  }
}

function expectedSuppressionCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    counts[entry.path] ??= {};
    counts[entry.path][entry.rule] ??= { count: 0 };
    counts[entry.path][entry.rule].count += 1;
  }
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, rules]) => [
        file,
        Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

export async function runAuthorityCheck() {
  const baseline = await readJson(BASELINE_PATH);
  if (baseline.version !== 1 || baseline.issue !== 162 || !Array.isArray(baseline.entries)) {
    fail("baseline_contract_invalid");
  }

  const duplicateKeys = baseline.entries
    .map(findingKey)
    .filter((key, index, all) => all.indexOf(key) !== index);
  if (duplicateKeys.length > 0) fail(`duplicate_baseline:${duplicateKeys.join(",")}`);
  for (const entry of baseline.entries) {
    if (
      entry.rule !== "react-hooks/set-state-in-effect" ||
      typeof entry.path !== "string" ||
      !Number.isInteger(entry.line) ||
      !Number.isInteger(entry.column) ||
      typeof entry.domain !== "string" ||
      typeof entry.reason !== "string"
    ) {
      fail(`baseline_entry_invalid:${JSON.stringify(entry)}`);
    }
  }

  const eslint = new ESLint({ cwd: ROOT });
  const representativeConfig = await eslint.calculateConfigForFile(
    "src/components/ThemeToggle.tsx",
  );
  for (const rule of GOVERNED_RULES) {
    const severity = representativeConfig?.rules?.[rule]?.[0];
    if (severity !== 2) fail(`rule_not_error:${rule}:${String(severity)}`);
  }

  const results = await eslint.lintFiles(["."]);
  const actual = [];
  const unexpected = [];
  for (const result of results) {
    const relative = path.relative(ROOT, result.filePath).split(path.sep).join("/");
    for (const message of result.messages) {
      if (!GOVERNED_RULES.includes(message.ruleId)) continue;
      const finding = {
        rule: message.ruleId,
        path: relative,
        line: message.line,
        column: message.column,
      };
      if (message.ruleId === "react-hooks/set-state-in-effect") actual.push(finding);
      else unexpected.push(finding);
    }
  }
  if (unexpected.length > 0) {
    fail(`unsuppressed_correctness_violation:${unexpected.map(findingKey).join(",")}`);
  }

  const comparison = compareBaseline(baseline.entries, actual);
  if (!comparison.matches) {
    const missing = comparison.expectedKeys.filter((key) => !comparison.actualKeys.includes(key));
    const added = comparison.actualKeys.filter((key) => !comparison.expectedKeys.includes(key));
    fail(`baseline_drift:missing=${missing.join("|")}:added=${added.join("|")}`);
  }

  const suppressions = await readJson(SUPPRESSIONS_PATH);
  const expectedSuppressions = expectedSuppressionCounts(baseline.entries);
  if (
    JSON.stringify(canonicalJson(suppressions)) !==
    JSON.stringify(canonicalJson(expectedSuppressions))
  ) {
    fail("eslint_suppressions_do_not_match_reviewed_baseline");
  }

  await assertInlineExceptionPolicy();
  console.log(
    `ESLint correctness authority passed: ${GOVERNED_RULES.length - 1} zero-debt rules, ` +
    `${baseline.entries.length} reviewed set-state baseline entries, no baseline growth.`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await runAuthorityCheck();
}
