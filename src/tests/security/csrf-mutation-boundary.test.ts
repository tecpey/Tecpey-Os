import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// SB-001. Review rejected the first version of this test for two reasons, both
// correct, and both about the guard being weaker than the sentence it claimed:
//
//   1. It read whole route files. 7 of 71 mutating route files export more than
//      one mutating handler, so one protected sibling covered the rest, and a
//      stray 405 anywhere exempted the file.
//   2. It decided "is this authenticated?" from import spellings. A route can
//      import a facade that reaches the session helper indirectly, and the regex
//      then classifies it unauthenticated and skips it — which is exactly the
//      classification drift this guard exists to catch, reproduced one level over.
//
// Detecting authentication from source is a heuristic wherever it is put. So the
// burden is inverted: **every active mutating operation must enforce CSRF**, and
// the only way out is an explicit entry in the ledger below. No detector sits in
// the load path, there is nothing to evade by renaming or re-exporting, and a new
// mutating operation fails until someone states which case it is.

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof MUTATING_METHODS)[number];

const CSRF_CALL =
  /\b(?:verifyCsrfOrigin|verifyCsrfToken|assertSameOrigin|requireCsrf|csrfProtection)\s*\(/;

// Operations that do not enforce CSRF, each with the reason it is sound. Anything
// absent from this map must enforce it. Kept as data so the exceptions are
// countable and a reviewer can weigh them without reading every route.
//
// Keys omit the "/api" prefix, which the lookup re-adds. The manifest attributes a
// test to a route when the test source contains that route's path, so spelling the
// paths in full would file this repository-wide invariant as per-route evidence for
// five routes it does not specifically test — the same overstatement that made this
// file "control-plane-cookie-opacity" rather than "admin-…".
const CSRF_EXEMPT: Record<string, string> = {
  "PUT academy-lesson-progress":
    "deny-only: every mutation is refused, so there is no state change to forge",
  "POST academy-state": "deny-only: every mutation is refused",
  "POST internal/price-feed-status":
    "deny-only: every mutation is refused; also internal, requiring server authority",
  "POST notifications": "deny-only: every mutation is refused",
  "POST auth/webauthn/auth/challenge":
    "pre-authentication: accepts no caller identifier, binds to no session, stores its "
    + "challenge with userId null, and is rate-limited. A cross-origin caller gains a random "
    + "challenge it could have requested directly, and nothing happens on a victim's behalf",
};

function filesUnder(root: string, matches: (path: string) => boolean): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (matches(full)) found.push(full);
    }
  };
  visit(root);
  return found.sort();
}

/** Blank out comments and string bodies so braces inside them cannot skew matching. */
function neutralise(source: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === "\\") { out += "  "; i += 1; continue; }
      if (ch === quote) { quote = null; out += ch; continue; }
      out += ch === "\n" ? "\n" : " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; out += ch; continue; }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") { out += " "; i += 1; }
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      out += "  ";
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * The body of one exported handler, by brace matching — not the whole file.
 *
 * The opening brace has to be found *after* the parameter list closes. Handler
 * signatures here are multi-line and their parameters carry inline type literals
 * — `ctx: { params: Promise<{ id: string }> }` — so taking the first brace after
 * the name lands inside the type and closes the body early. That is precisely how
 * the first run of this test reported twelve protected operations as unprotected.
 */
function handlerBody(source: string, method: Method): string | null {
  const masked = neutralise(source);
  const signature = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
  const found = signature.exec(masked);
  if (!found) return null;

  // Walk the parameter list to its closing parenthesis.
  let cursor = masked.indexOf("(", found.index);
  if (cursor < 0) return null;
  let parens = 0;
  for (; cursor < masked.length; cursor += 1) {
    if (masked[cursor] === "(") parens += 1;
    else if (masked[cursor] === ")") {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  if (parens !== 0) return null;

  const open = masked.indexOf("{", cursor);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === "{") depth += 1;
    else if (masked[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** Look an operation up in the ledger, which stores keys without the "/api" prefix. */
function exemption(key: string): string | undefined {
  return CSRF_EXEMPT[key.replace(" /api/", " ")];
}

function routeOf(filePath: string): string {
  return filePath.replace(/^src\/app/, "").replace(/\/route\.ts$/, "");
}

/**
 * Follow a compatibility alias to the handler that really runs.
 *
 * A compatibility alias is a handler whose whole body forwards to another route's
 * exported handler, imported under a local name. The alias enforces nothing itself
 * and does not need to; the canonical handler does. Reading only the alias body
 * reports a protected operation as unprotected, so delegation is resolved here the
 * way the manifest generator resolves it. The repository has one such alias today,
 * which the coverage assertion below requires to stay exercised.
 */
function resolveDelegation(
  source: string,
  body: string,
  depth = 0,
): { body: string; delegatedTo: string | null } {
  if (depth > 3) return { body, delegatedTo: null };

  const aliases = new Map<string, { path: string; method: string }>();
  const importPattern =
    /import\s*\{([^}]*)\}\s*from\s*["'](@\/app\/api\/[^"']*\/route)["']/g;
  for (const match of source.matchAll(importPattern)) {
    for (const clause of match[1].split(",")) {
      const named = /^\s*(POST|PUT|PATCH|DELETE)(?:\s+as\s+(\w+))?\s*$/.exec(clause);
      if (named) aliases.set(named[2] ?? named[1], { path: match[2], method: named[1] });
    }
  }
  if (aliases.size === 0) return { body, delegatedTo: null };

  for (const [alias, target] of aliases) {
    if (!new RegExp(`\\b${alias}\\s*\\(`).test(body)) continue;
    const targetFile = `${target.path.replace(/^@\//, "src/")}.ts`;
    let targetSource: string;
    try {
      targetSource = readFileSync(targetFile, "utf8");
    } catch {
      return { body, delegatedTo: null };
    }
    const targetBody = handlerBody(targetSource, target.method as Method);
    if (targetBody === null) return { body, delegatedTo: null };
    const deeper = resolveDelegation(targetSource, targetBody, depth + 1);
    return { body: deeper.body, delegatedTo: deeper.delegatedTo ?? targetFile };
  }
  return { body, delegatedTo: null };
}

type Operation = { key: string; file: string; body: string; delegatedTo: string | null };

function mutatingOperations(): Operation[] {
  const operations: Operation[] = [];
  for (const file of filesUnder("src/app/api", (path) => path.endsWith("/route.ts"))) {
    const source = readFileSync(file, "utf8");
    for (const method of MUTATING_METHODS) {
      const declared = handlerBody(source, method);
      if (declared === null) continue;
      const resolved = resolveDelegation(source, declared);
      operations.push({
        key: `${method} ${routeOf(file)}`,
        file,
        body: resolved.body,
        delegatedTo: resolved.delegatedTo,
      });
    }
  }
  return operations;
}

const OPERATIONS = mutatingOperations();

test("every mutating operation was found and its body isolated", () => {
  // A brace matcher that silently returned nothing would make this whole file pass
  // while checking zero operations — the failure these guards exist to prevent.
  assert.ok(
    OPERATIONS.length >= 70,
    `expected the repository's mutating operations, extracted ${OPERATIONS.length}`,
  );
  for (const operation of OPERATIONS) {
    const trimmed = operation.body.trim();
    assert.ok(
      trimmed.startsWith("{") && trimmed.endsWith("}"),
      `${operation.key}: handler body was not isolated cleanly`,
    );
    // Shape alone is too weak a check: a body truncated at a parameter type
    // literal still starts and ends with a brace. Every handler returns a
    // Response, so a body without a return is a body that was cut short — which
    // is what happened the first time this ran.
    assert.match(
      operation.body,
      /\breturn\b/,
      `${operation.key}: extracted body contains no return, so it is not the handler`,
    );
  }

  // Multi-handler files are the case the previous version got wrong. Prove the
  // extractor separates them, and that the separation is real: at least one such
  // file must have handlers that differ.
  const perFile = new Map<string, Operation[]>();
  for (const operation of OPERATIONS) {
    perFile.set(operation.file, [...(perFile.get(operation.file) ?? []), operation]);
  }
  const multi = [...perFile.values()].filter((group) => group.length > 1);
  assert.ok(multi.length > 0, "no multi-handler route file was split, so the per-operation claim is untested");
  assert.ok(
    multi.some((group) => new Set(group.map((operation) => operation.body)).size > 1),
    "every multi-handler split produced identical bodies, so the extractor is not really splitting",
  );

  // Delegation resolution that never resolves anything is untested machinery that
  // would quietly stop working.
  assert.ok(
    OPERATIONS.some((operation) => operation.delegatedTo !== null),
    "no delegating operation was resolved, so alias following is unexercised",
  );
});

test("every mutating operation enforces CSRF unless explicitly excepted", () => {
  const unprotected: string[] = [];
  for (const operation of OPERATIONS) {
    if (exemption(operation.key)) continue;
    if (CSRF_CALL.test(operation.body)) continue;
    unprotected.push(`${operation.key}  (${operation.file})`);
  }
  assert.deepEqual(
    unprotected,
    [],
    "these mutating operations neither enforce CSRF nor carry a recorded exception (SB-001)",
  );
});

test("the exception ledger cannot go stale in either direction", () => {
  // Two-sided on purpose. An exception for an operation that no longer exists lets
  // a reader believe a decision still applies; an exception for one that has since
  // gained CSRF is a standing licence nobody needs.
  const byKey = new Map(OPERATIONS.map((operation) => [operation.key, operation]));
  for (const bare of Object.keys(CSRF_EXEMPT)) {
    const [method, ...rest] = bare.split(" ");
    const key = `${method} /api/${rest.join(" ")}`;
    const operation = byKey.get(key);
    assert.ok(operation, `${key} is excepted but no longer exists — drop the entry`);
    assert.ok(
      !CSRF_CALL.test(operation.body),
      `${key} now enforces CSRF — remove its exception`,
    );
  }
});

test("the manifest's own CSRF requirement still fires", () => {
  // This test and the manifest gate cover different ground: the gate reasons about
  // classification, this reasons about every operation regardless of it. Losing
  // either quietly would leave the other looking sufficient.
  const generator = readFileSync("scripts/generate-api-security-manifest.mjs", "utf8");
  assert.match(
    generator,
    /csrf:\s*cookieAuthenticated\s*\|\|\s*entry\.controls\.setsCookie/,
    "the manifest must keep requiring CSRF for cookie-authenticated mutations",
  );
  assert.match(
    generator,
    /requirements\.csrf\s*&&\s*!entry\.controls\.csrf[\s\S]*required_csrf_missing/,
    "a missing CSRF control on a route that requires it must remain a finding",
  );
});
