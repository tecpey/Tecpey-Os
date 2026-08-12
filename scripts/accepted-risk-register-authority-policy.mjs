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
const REVIEW_DATE_RE = /\b20\d{2}-\d{2}-\d{2}\b/;
const MEASURABLE_RE =
  /\b(?:zero|one|two|three|four|five|ten|fifteen|sixty|percent|minutes?|hours?|days?|weekly|non-zero|hard NO-GO|NO-GO)\b/i;

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseIsoReviewDate(value) {
  const match = value.match(REVIEW_DATE_RE);
  if (!match) return null;
  const [year, month, day] = match[0].split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  ) {
    return { date, token: match[0] };
  }

  return null;
}

function utcDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDay(date) {
  return date.toISOString().slice(0, 10);
}

function splitMarkdownTableRow(line) {
  const cells = [];
  let cell = "";
  let codeSpanTicks = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\\" && next) {
      cell += next === "|" ? "|" : `${char}${next}`;
      index += 1;
      continue;
    }

    if (char === "`") {
      let tickCount = 1;
      while (line[index + tickCount] === "`") tickCount += 1;

      if (codeSpanTicks === 0) {
        codeSpanTicks = tickCount;
      } else if (tickCount === codeSpanTicks) {
        codeSpanTicks = 0;
      }

      cell += "`".repeat(tickCount);
      index += tickCount - 1;
      continue;
    }

    if (char === "|" && codeSpanTicks === 0) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function parseMarkdownRow(line) {
  const trimmed = line.trim();
  const cells = splitMarkdownTableRow(trimmed);
  if (cells.length < 3) return null;
  if (normalize(cells[0]) !== "" || normalize(cells[cells.length - 1]) !== "") return null;
  return cells.slice(1, -1).map((cell) => normalize(cell));
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

export function evaluateAcceptedRiskRegisterAuthority(markdown, options = {}) {
  const failures = [];
  const normalized = normalize(markdown);
  const referenceDay =
    options.referenceDate === undefined || options.referenceDate === null ? null : utcDay(options.referenceDate);

  if (options.referenceDate !== undefined && options.referenceDate !== null && referenceDay === null) {
    failures.push("accepted-risk authority referenceDate must be a valid date");
  }

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

  const byRisk = new Map();
  for (const row of rows) {
    const risk = row[0];
    if (byRisk.has(risk)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: controlled-launch closure matrix has duplicate ${risk} rows`);
      continue;
    }
    byRisk.set(risk, row);
  }
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
    const parsedReviewDate = parseIsoReviewDate(reviewDate);
    if (!parsedReviewDate) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} review date must be exact, not phase-only`);
    } else if (referenceDay && parsedReviewDate.date < referenceDay) {
      failures.push(
        `docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} review date ${parsedReviewDate.token} is stale before ${formatUtcDay(
          referenceDay,
        )}`,
      );
    }
    if (!/\b(?:NO-GO|halts?|pauses?|Disable|Remove|block|revert|incident|stays NO-GO)\b/i.test(rollback)) {
      failures.push(`docs/LAUNCH_ACCEPTED_RISKS.md: ${risk} rollback trigger must name a halt, pause, disablement, incident or NO-GO action`);
    }
  }

  return failures;
}
