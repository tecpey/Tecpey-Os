import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** Recursive file listing — node:fs globSync is not in this project's type surface. */
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

// SB-001. The blocker asks for CSRF on every governed state-changing route, and
// the API security manifest already reports a finding when a route it classifies
// as cookie-authenticated lacks CSRF. The weak link is the classification itself:
//
//   csrf: cookieAuthenticated || entry.controls.setsCookie
//   cookieAuthenticated = classification is "authenticated" or "admin"
//
// and classification comes from detectPrincipalCall(), a list of regexes matched
// against handler source. A route that authenticates through a helper whose name
// none of those patterns match is classified "public", so requirements.csrf turns
// false and the manifest reports no finding — for a route that is in fact a
// cookie-authenticated mutation.
//
// This test is deliberately built on a different signal: module imports rather
// than call-name patterns. A novel helper still has to be imported from an auth
// authority, so this catches exactly the case the name patterns would miss. Two
// checks that can only fail together are one check; these two can fail apart.

const MUTATING_HANDLER = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g;

// Enforcement, as the manifest generator recognises it.
const CSRF_CALL =
  /\b(?:verifyCsrfOrigin|verifyCsrfToken|assertSameOrigin|requireCsrf|csrfProtection)\s*\(/;

// A route that answers every mutation with 405 has nothing to protect.
const DENY_ONLY = /\b405\b|method_not_allowed|read_only|put_only|creation_protected/i;

// Importing one of these is what makes a route a governed authenticated surface,
// whatever the helper it ends up calling is named.
const AUTH_AUTHORITY_IMPORT =
  /from\s+["'][^"']*(?:unified-session|route-guards|admin-auth|admin-control-plane|academy-auth|admin-passkey-service|[\w/-]*session[\w/-]*)["']/i;

function mutatingRouteFiles(): string[] {
  return filesUnder("src/app/api", (path) => path.endsWith("/route.ts")).filter((path) => {
    MUTATING_HANDLER.lastIndex = 0;
    return MUTATING_HANDLER.test(readFileSync(path, "utf8"));
  });
}

test("every authenticated mutating route enforces CSRF", () => {
  // The property SB-001 actually states, checked against source rather than
  // against the manifest's view of source.
  const unprotected: string[] = [];
  let authenticated = 0;

  for (const path of mutatingRouteFiles()) {
    const source = readFileSync(path, "utf8");
    if (!AUTH_AUTHORITY_IMPORT.test(source)) continue;
    authenticated += 1;
    if (CSRF_CALL.test(source)) continue;
    if (DENY_ONLY.test(source)) continue;
    unprotected.push(path);
  }

  assert.ok(
    authenticated > 0,
    "no route was recognised as authenticated — the import patterns have gone stale, " +
      "which would make this test pass by testing nothing",
  );
  assert.deepEqual(
    unprotected,
    [],
    "these mutating routes import an auth authority but neither enforce CSRF nor refuse " +
      "mutations, so a cross-origin request can act with the victim's cookies (SB-001)",
  );
});

test("the manifest's own CSRF requirement still fires", () => {
  // The generator is the gate that runs in CI. If the rule tying CSRF to
  // cookie-authenticated classification were removed, this test's sibling above
  // would still pass for every route it recognises, and the routes it does not
  // recognise would lose their only cover. Assert the rule exists.
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
