import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ENV_PLACEHOLDER_TOKENS, containsEnvPlaceholder } from "../../lib/env-placeholders";

// Three separate copies of "what counts as an unfinished env value" had appeared:
// the deployment preflight's list, one inside alerts.ts, and one inside email.ts.
// Two of the three were subsets, and the preflight matched case-sensitively while
// the others did not — so a value could clear the preflight and then be refused by
// the runtime it had just cleared for launch.
//
// The preflight keeps its own literal because it runs on plain node with no
// TypeScript loader, and env:check is pinned as an exact string by the
// support-bundle rehearsal. That makes drift the real risk, so it is what these
// tests watch.

const PREFLIGHT = readFileSync("scripts/validate-env.mjs", "utf8");

function preflightTokens(): string[] {
  const match = PREFLIGHT.match(/const badTokens = \[([^\]]*)\]/);
  assert.ok(match, "scripts/validate-env.mjs must still declare badTokens as an array literal");
  return (match[1].match(/'([^']*)'/g) ?? []).map((quoted) => quoted.slice(1, -1));
}

test("the preflight and the runtime recognise exactly the same placeholders", () => {
  assert.deepEqual(
    preflightTokens().slice().sort(),
    ENV_PLACEHOLDER_TOKENS.slice().sort(),
    "scripts/validate-env.mjs and src/lib/env-placeholders.ts have drifted apart",
  );
});

test("the preflight matches case-insensitively, as the runtime does", () => {
  // A subtler drift than the list itself: identical tokens compared differently
  // still means a value one side accepts and the other rejects.
  assert.match(
    PREFLIGHT,
    /badTokens\.some\(\(token\) => value\.toLowerCase\(\)\.includes\(token\.toLowerCase\(\)\)\)/,
    "the preflight must lowercase both sides before comparing",
  );
});

test("every token is recognised regardless of case or surrounding text", () => {
  for (const token of ENV_PLACEHOLDER_TOKENS) {
    assert.equal(containsEnvPlaceholder(token), true, token);
    assert.equal(containsEnvPlaceholder(token.toLowerCase()), true, `lowercased ${token}`);
    assert.equal(containsEnvPlaceholder(token.toUpperCase()), true, `uppercased ${token}`);
    assert.equal(containsEnvPlaceholder(`https://${token}.tecpey.ir/hook`), true, `embedded ${token}`);
  }
});

test("a real value is not mistaken for a template", () => {
  for (const value of ["unit-test-value", "https://hooks.tecpey.ir/t/abc", ""]) {
    assert.equal(containsEnvPlaceholder(value), false, value);
  }
  assert.equal(containsEnvPlaceholder(undefined), false);
  assert.equal(containsEnvPlaceholder(null), false);
});

test("no module keeps a private copy of the placeholder list", () => {
  // The condition that caused this test to exist. Each of these modules reads the
  // shared authority; a reintroduced local array is the drift, not its symptom.
  for (const path of ["src/lib/email.ts", "src/lib/alerts.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.ok(
      source.includes("containsEnvPlaceholder"),
      `${path} must ask the shared authority whether a value is a placeholder`,
    );
    for (const token of ENV_PLACEHOLDER_TOKENS) {
      assert.ok(
        !source.includes(`"${token}"`),
        `${path} names the placeholder ${token} directly — read ENV_PLACEHOLDER_TOKENS instead`,
      );
    }
  }
});
