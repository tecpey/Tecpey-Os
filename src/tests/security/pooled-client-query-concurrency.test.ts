import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

// pg 8 serializes queries issued concurrently on a single pooled client and
// warns:
//
//   Calling client.query() when the client is already executing a query is
//   deprecated and will be removed in pg@9.0
//
// So a Promise.all over queries that share one client never bought
// concurrency — it only bought a deprecation. This guard keeps that pattern
// from coming back.
//
// The rule is narrow on purpose: an expression inside a Promise.all array
// literal may not reference a `client`/`db` handle. Promise.all over helpers
// that each open their own withDb (collectAcademySignals and friends) is real
// parallelism across separate pooled connections and stays allowed, because
// those expressions never mention a client.

const SOURCE_ROOT = path.resolve(import.meta.dirname, "../..");
const CLIENT_REFERENCE = /\b(?:client|db)\s*(?:\.\s*query\b|,|\))/;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "tests") continue;
      files.push(...await sourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** Returns the source of every `Promise.all([...])` array literal in `source`. */
function promiseAllArrays(source: string): { body: string; line: number }[] {
  const found: { body: string; line: number }[] = [];
  const opener = /Promise\.all\(\s*\[/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === "[") depth += 1;
      else if (char === "]") depth -= 1;
      index += 1;
    }
    found.push({
      body: source.slice(start, index - 1),
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

describe("Pooled client query concurrency", () => {
  it("never issues concurrent queries on one pooled client", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SOURCE_ROOT)) {
      const source = await readFile(file, "utf8");
      if (!source.includes("Promise.all")) continue;
      for (const { body, line } of promiseAllArrays(source)) {
        if (CLIENT_REFERENCE.test(body)) {
          offenders.push(`${path.relative(SOURCE_ROOT, file)}:${line}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "Promise.all must not share one pooled client across its entries — await them in order "
        + `instead (pg serializes them anyway): ${offenders.join(", ")}`,
    );
  });

  it("still allows parallel helpers that each open their own connection", () => {
    // A regression in the guard itself would be silent, so pin the shape it
    // must keep accepting: entries that never mention a client handle.
    const allowed = `
      collectAcademySignals(studentId),
      collectTradingSignals(studentId),
      collectConversationSignals(studentId),
    `;
    assert.equal(CLIENT_REFERENCE.test(allowed), false);

    const rejected = `
      client.query('SELECT 1'),
      readAcademyMasterySeasonState(client, scope, studentId, "fa"),
    `;
    assert.equal(CLIENT_REFERENCE.test(rejected), true);
  });
});
