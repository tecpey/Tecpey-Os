import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { parseForESLint } from "@typescript-eslint/parser";

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
const INLINE_DIRECTIVE =
  /^\s*(?:(?:\/\/|\/\*|\{\/\*)\s*)?(eslint-disable(?:-next-line|-line)?)\b(.*?)(?:\*\/\}?)?\s*$/u;
const INLINE_RULE_CONFIGURATION = /^\s*eslint\s+(.+)$/u;
const GOVERNED_DESCRIPTION = /--\s+#\d+:\s+\S/;
const REVIEWED_BASELINE_KEYS = new Set([
  "react-hooks/set-state-in-effect:src/components/ThemeToggle.tsx:15:5",
  "react-hooks/set-state-in-effect:src/components/TradingViewChart.tsx:47:5",
  "react-hooks/set-state-in-effect:src/components/academy/AcademyCertificatesClient.tsx:40:21",
  "react-hooks/set-state-in-effect:src/components/academy/AcademyEngagementHub.tsx:43:19",
  "react-hooks/set-state-in-effect:src/components/academy/AcademyMentorCoachCenter.tsx:68:5",
  "react-hooks/set-state-in-effect:src/components/academy/AiMentorExperience.tsx:77:5",
  "react-hooks/set-state-in-effect:src/components/academy/GlobalAiMentorWidget.tsx:362:5",
  "react-hooks/set-state-in-effect:src/components/academy/TradingArenaProClient.tsx:142:5",
  "react-hooks/set-state-in-effect:src/components/academy/community/ChallengeCenter.tsx:321:10",
  "react-hooks/set-state-in-effect:src/components/academy/community/CommunityHub.tsx:199:5",
  "react-hooks/set-state-in-effect:src/components/academy/community/InstructorDashboard.tsx:86:5",
  "react-hooks/set-state-in-effect:src/components/academy/community/JournalDisciplineScorePanel.tsx:120:10",
  "react-hooks/set-state-in-effect:src/components/academy/community/PeerJournals.tsx:184:10",
  "react-hooks/set-state-in-effect:src/components/academy/community/ReputationEvidencePanel.tsx:39:10",
  "react-hooks/set-state-in-effect:src/components/academy/community/ReputationScoringConsentControl.tsx:204:10",
  "react-hooks/set-state-in-effect:src/components/academy/community/StudyGroups.tsx:127:5",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/JournalView.tsx:549:10",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/JournalView.tsx:558:5",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/ScenarioPlayer.tsx:190:36",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/ScenarioPlayer.tsx:202:7",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/ScenarioPlayer.tsx:510:5",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/TradingArenaDashboard.tsx:423:33",
  "react-hooks/set-state-in-effect:src/components/academy/trading-arena/TradingArenaExecutionClient.tsx:680:10",
  "react-hooks/set-state-in-effect:src/components/academy/v2/FlashcardDeck.tsx:259:5",
  "react-hooks/set-state-in-effect:src/components/academy/v2/FlashcardsPageClient.tsx:21:5",
  "react-hooks/set-state-in-effect:src/components/academy/v2/LearningInsightsDashboard.tsx:375:5",
  "react-hooks/set-state-in-effect:src/components/academy/v2/LessonPlayerV2.tsx:288:5",
  "react-hooks/set-state-in-effect:src/components/academy/v2/LessonPlayerV2Client.tsx:22:5",
  "react-hooks/set-state-in-effect:src/components/academy/v2/MentorV2.tsx:276:5",
  "react-hooks/set-state-in-effect:src/components/admin/AdminPasskeyAccessGate.tsx:223:10",
  "react-hooks/set-state-in-effect:src/components/admin/CommandCenterDashboard.tsx:101:10",
  "react-hooks/set-state-in-effect:src/components/crypto/SwapPanel.tsx:115:7",
  "react-hooks/set-state-in-effect:src/components/home/TecpeyHomeAI.tsx:311:5",
  "react-hooks/set-state-in-effect:src/components/learning-os/NotificationCenter.tsx:106:5",
  "react-hooks/set-state-in-effect:src/components/navbar/Navbar.tsx:228:5",
  "react-hooks/set-state-in-effect:src/hooks/useBaseCurrenciesPrice.ts:71:5",
  "react-hooks/set-state-in-effect:src/hooks/useMentorInsights.ts:90:7",
]);

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
  const normalized = line.replace(/\s+/gu, " ").trim();
  const ruleConfiguration = normalized.match(INLINE_RULE_CONFIGURATION);
  if (
    ruleConfiguration &&
    GOVERNED_RULES.some((rule) => ruleConfiguration[1].includes(rule))
  ) {
    return false;
  }
  const directive = normalized.match(INLINE_DIRECTIVE);
  if (!directive) return true;
  if (directive[1] === "eslint-disable") return false;
  if (!GOVERNED_DESCRIPTION.test(directive[2])) return false;

  const [ruleList = ""] = directive[2].split(/\s+--\s+/u, 1);
  const rules = ruleList
    .trim()
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean);
  return (
    rules.length === 1 &&
    rules[0] !== "all" &&
    !GOVERNED_RULES.includes(rules[0])
  );
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

export function unreviewedBaselineKeys(entries) {
  return entries
    .map(findingKey)
    .filter((key) => !REVIEWED_BASELINE_KEYS.has(key));
}

export function invalidInlineExceptionLines(source) {
  const parsed = parseForESLint(source, {
    comment: true,
    jsx: true,
    loc: true,
    range: true,
    sourceType: "module",
  });
  return (parsed.ast.comments ?? [])
    .filter((comment) => !hasGovernedInlineException(comment.value))
    .map((comment) => comment.loc.start.line);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function assertInlineExceptionPolicy(files) {
  const invalid = [];
  for (const file of new Set(files)) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    const source = await fs.readFile(file, "utf8");
    for (const line of invalidInlineExceptionLines(source)) {
      invalid.push(`${relative}:${line}`);
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
  const unreviewedKeys = unreviewedBaselineKeys(baseline.entries);
  if (unreviewedKeys.length > 0) {
    fail(`baseline_growth_not_reviewed:${unreviewedKeys.join(",")}`);
  }
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
  const results = await eslint.lintFiles(["."]);
  for (const result of results) {
    const relative = path.relative(ROOT, result.filePath).split(path.sep).join("/");
    const config = await eslint.calculateConfigForFile(result.filePath);
    for (const rule of GOVERNED_RULES) {
      const severity = config?.rules?.[rule]?.[0];
      if (severity !== 2) {
        fail(`rule_not_error:${relative}:${rule}:${String(severity)}`);
      }
    }
  }
  await assertInlineExceptionPolicy(results.map((result) => result.filePath));
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
