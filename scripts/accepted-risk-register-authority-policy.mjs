const REQUIRED_CONTROLLED_LAUNCH_RISKS = [
  "R-01",
  "R-02",
  "R-04",
  "R-05",
  "R-06",
  "R-07",
  "R-08",
  "R-09",
  "R-10",
];

const PLACEHOLDER_RE = /(^|[\s[\]`|])(?:N|X|Y|defined hours|TBD|TODO|placeholder)(?=$|[\s[\]`|,.])/i;
const REVIEW_DATE_RE = /\b(?:20\d{2}-\d{2}-\d{2}|Before Go decision|Before any [A-Za-z -]+re-scope)\b/;
const MEASURABLE_RE =
  /\b(?:zero|one|two|three|four|five|ten|fifteen|sixty|percent|minutes?|hours?|days?|weekly|non-zero|hard NO-GO|NO-GO)\b/i;

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => normalize(cell));
}

function extractClosureMatrix(markdown) {
  const marker = "### Controlled-launch closure matrix";
  const start = markdown.indexOf(marker);
  if (start === -1) return { rows: [], failures: [`docs/LAUNCH_ACCEPTED_RISKS.md: missing ${marker}`] };

  const nextSection = markdown.indexOf("\n### ", start + marker.length);
  const section = markdown.slice(start, nextSection === -1 ? markdown.length : nextSection);
  const lines = section.split(/\r?\n/);
  const rows = [];

  for (const line of lines) {
    const cells = parseMarkdownRow(line);
    if (!cells || cells.length !== 6) continue;
    if (cells[0] === "Risk" || /^-+$/.test(cells[0])) continue;
    if (/^R-\d{2}$/.test(cells[0])) rows.push(cells);
  }

  return { rows, failures: [] };
}

export function evaluateAcceptedRiskRegisterAuthority(markdown) {
  const failures = [];
  const normalized = normalize(markdown);

  for (const invariant of [
    "Controlled-launch closure update (2026-08-09)",
    "Controlled Launch Reconciliation Addendum",
    "Required accepted-risk closure before a Go decision",
    "Controlled-launch closure matrix",
    "The final Go/No-Go packet must cite this addendum",
    "keep the related capability explicitly NO-GO and product-disabled",
  ]) {
    if (!normalized.includes(normalize(invariant))) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: missing accepted-risk authority invariant: ${invariant}`);
    }
  }

  const { rows, failures: matrixFailures } = extractClosureMatrix(markdown);
  failures.push(...matrixFailures);

  const byRisk = new Map(rows.map((row) => [row[0], row]));
  for (const risk of REQUIRED_CONTROLLED_LAUNCH_RISKS) {
    if (!byRisk.has(risk)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: controlled-launch closure matrix is missing ${risk}`);
    }
  }

  if (byRisk.has("R-03")) {
    failures.push("docs/LAUNCH_ACCEPTED_RISKS.md: R-03 is superseded and must not be re-accepted for controlled launch");
  }

  for (const [risk, row] of byRisk) {
    const [, decision, threshold, owner, reviewDate, rollback] = row;
    const rowText = row.join(" | ");

    if (PLACEHOLDER_RE.test(rowText)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} closure row contains placeholder text`);
    }
    if (!decision || !threshold || !owner || !reviewDate || !rollback) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} closure row must fill decision, threshold, owner, review date and rollback trigger`);
    }
    if (!MEASURABLE_RE.test(threshold)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} threshold must be measurable or explicitly hard NO-GO`);
    }
    if (!owner.includes("+")) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} must have joint accountable owners`);
    }
    if (!REVIEW_DATE_RE.test(reviewDate)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} review date must be exact, not phase-only`);
    }
    if (!/\b(?:NO-GO|halts?|pauses?|Disable|Remove|block|revert|incident|stays NO-GO)\b/i.test(rollback)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} rollback trigger must name a halt, pause, disablement, incident or NO-GO action`);
    }
  }

  return failures;
}
