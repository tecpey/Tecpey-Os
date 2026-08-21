import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// docs/SECURITY_BLOCKERS.md answered "is this blocker still open?" in two places
// with two different answers. The reconciliation tables recorded SB-001 through
// SB-012 as closed; the Risk Matrix at the foot of the same file still listed them
// as "P0 — open inventory" and friends. A reader scanning for status hits the
// matrix first, so the stale answer was the one being read — I read it myself and
// reported two closed blockers as open.
//
// Same defect as the placeholder lists in #520 and the pin table in #522: one
// question, two owners. The matrix is now explicitly a restatement, and this test
// is what stops the restatement from drifting away from the thing it restates.

const DOC = readFileSync("docs/SECURITY_BLOCKERS.md", "utf8");

type Row = { id: string; cells: string[] };

function tableRows(section: string): Row[] {
  const rows: Row[] = [];
  for (const line of section.split(/\r?\n/)) {
    const cleaned = line.replace(/^>\s?/, "").trim();
    if (!cleaned.startsWith("|")) continue;
    const cells = cleaned.split("|").slice(1, -1).map((cell) => cell.trim());
    const id = cells[0];
    if (!/^SB-\d{3}$/.test(id)) continue;
    rows.push({ id, cells });
  }
  return rows;
}

function section(startMarker: string, endMarker: string): string {
  const start = DOC.indexOf(startMarker);
  assert.ok(start >= 0, `missing section: ${startMarker}`);
  const end = DOC.indexOf(endMarker, start + startMarker.length);
  return DOC.slice(start, end < 0 ? undefined : end);
}

/** "**Closed.**", "**Closed / bounded.**", "**Still open.**" → a comparable word. */
function verdict(text: string): "closed" | "open" | "candidate" | "unverified" {
  const lowered = text.toLowerCase();
  if (lowered.includes("still open")) return "open";
  if (lowered.includes("closure candidate")) return "candidate";
  if (lowered.includes("not verified") || lowered.includes("not reconciled")) return "unverified";
  if (lowered.includes("closed")) return "closed";
  return "open";
}

const reconciled = new Map<string, "closed" | "open" | "candidate" | "unverified">();
for (const marker of ["### P0 status against current code", "### P1 / P2 status against current code"]) {
  for (const row of tableRows(section(marker, "\n> ###"))) {
    // The P0 table carries an extra "original claim" column before the verdict.
    const verdictCell = row.cells.length >= 4 ? row.cells[2] : row.cells[1];
    reconciled.set(row.id, verdict(verdictCell));
  }
}

const matrix = new Map<string, "closed" | "open" | "candidate" | "unverified">();
for (const row of tableRows(section("## Risk Matrix", "\n---"))) {
  matrix.set(row.id, verdict(row.cells[row.cells.length - 1]));
}

test("both tables actually parsed", () => {
  // A parser that silently matches nothing would make every assertion below pass
  // while checking nothing — the failure mode these guards exist to prevent.
  assert.ok(reconciled.size >= 12, `reconciliation tables parsed ${reconciled.size} rows`);
  assert.ok(matrix.size >= 12, `risk matrix parsed ${matrix.size} rows`);
});

test("the Risk Matrix restates the reconciliation, it does not contradict it", () => {
  const disagreements: string[] = [];
  for (const [id, state] of reconciled) {
    const restated = matrix.get(id);
    if (restated === undefined) {
      disagreements.push(`${id}: reconciled as "${state}" but absent from the Risk Matrix`);
      continue;
    }
    if (restated !== state) {
      disagreements.push(`${id}: reconciled as "${state}", Risk Matrix says "${restated}"`);
    }
  }
  assert.deepEqual(
    disagreements,
    [],
    "docs/SECURITY_BLOCKERS.md states two different statuses for the same blocker",
  );
});

test("a blocker in the matrix but nowhere reconciled is marked as such", () => {
  // SB-010 has a description section but no verified-current-state row. Recording
  // it as an ordinary open P1 would imply someone had checked it against code.
  for (const [id, state] of matrix) {
    if (reconciled.has(id)) continue;
    assert.equal(
      state,
      "unverified",
      `${id} appears only in the Risk Matrix, so it must say it has not been reconciled`,
    );
  }
});

test("the matrix says it is a restatement", () => {
  // Without this line the table reads as an independent authority, which is how it
  // came to hold answers nobody was updating.
  const risk = section("## Risk Matrix", "\n---");
  assert.match(risk, /This table is a restatement/);
  assert.match(risk, /status against current code/);
});
