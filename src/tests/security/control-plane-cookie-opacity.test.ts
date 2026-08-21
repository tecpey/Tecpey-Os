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

// SB-002. The blocker is about a raw long-lived Admin token living in browser
// state, where stealing it would equal Admin compromise. The current design does
// not do that — the control-plane cookie carries a signed session JWT bound to a
// server-side admin_sessions row, and TECPEY_ADMIN_TOKEN is a bootstrap secret
// read from a request header — but nothing stops a future change from putting the
// raw token back. The blocker's own fix text is a maintenance instruction
// ("maintain … and remove raw browser token paths"), which is a property, and
// properties belong in tests rather than in a document nobody re-reads.

const PASSKEY_SERVICE = readFileSync("src/lib/admin-passkey-service.ts", "utf8");
const CONTROL_PLANE = readFileSync("src/lib/admin-control-plane.ts", "utf8");

test("the admin control-plane cookie is unreadable from the browser", () => {
  // httpOnly is what makes cookie theft require the host rather than a script,
  // and sameSite strict is what keeps a cross-site request from riding it.
  const setters = PASSKEY_SERVICE.match(
    /response\.cookies\.set\(\s*ADMIN_CONTROL_SESSION_COOKIE[\s\S]*?\}\)/g,
  );
  assert.ok(setters && setters.length >= 2, "expected the set and clear cookie writers");
  for (const setter of setters) {
    assert.match(setter, /httpOnly:\s*true/, "admin session cookie must stay httpOnly");
    assert.match(setter, /sameSite:\s*"strict"/, "admin session cookie must stay sameSite strict");
    assert.match(setter, /secure:\s*shouldUseSecureCookie\(\)/, "admin session cookie must stay secure-gated");
  }
});

test("the cookie carries a signed session reference, not a standing credential", () => {
  // The value must be verifiable and revocable: signed, and bound to a row that
  // can be deleted. A bearer secret would make revocation impossible.
  assert.match(CONTROL_PLANE, /SignJWT/, "the admin session value must be signed");
  assert.match(CONTROL_PLANE, /alg:\s*"HS256"/);
  assert.match(
    CONTROL_PLANE,
    /admin_session_secret_not_configured/,
    "signing must fail closed when no secret is configured",
  );
  assert.match(CONTROL_PLANE, /FROM admin_sessions/, "the session must resolve against a server-side row");
});

test("the bootstrap token is a header secret and never a cookie", () => {
  // TECPEY_ADMIN_TOKEN is the one long-lived admin secret. It exists to create the
  // first admin when none exist. Reading it from a cookie is what SB-002 forbids:
  // a cookie is replayed by the browser on every request, a header is not.
  assert.match(PASSKEY_SERVICE, /const ADMIN_BOOTSTRAP_HEADER = "x-tecpey-admin-token"/);
  assert.match(
    PASSKEY_SERVICE,
    /req\.headers\.get\(ADMIN_BOOTSTRAP_HEADER\)/,
    "the bootstrap token must be read from the request header",
  );
  assert.match(PASSKEY_SERVICE, /timingSafeEqual/, "comparison must not leak the secret by timing");
  assert.ok(
    !/cookies[\s\S]{0,80}TECPEY_ADMIN_TOKEN|TECPEY_ADMIN_TOKEN[\s\S]{0,80}cookies/.test(PASSKEY_SERVICE),
    "the bootstrap token must never travel as a cookie",
  );
});

test("no admin secret is reachable from client-side code", () => {
  // A NEXT_PUBLIC_ prefix or a use of the token inside a client component would
  // ship it to the browser bundle, which is the same compromise by another route.
  //
  // This match is deliberately not comment-aware, unlike the rehearsal pin check
  // where treating a comment as code made the guard weaker. Here the direction is
  // reversed: a commented-out admin-token reference in browser code fails the
  // test, which is a false positive at worst and never a missed leak. For a
  // secret boundary that is the trade to make.
  const clientFiles = [
    ...filesUnder("src/components", (p) => /\.tsx?$/.test(p)),
    ...filesUnder("src/hooks", (p) => /\.tsx?$/.test(p)),
    ...filesUnder("src/app", (p) => p.endsWith(".tsx")),
  ];
  const leaking: string[] = [];
  for (const path of clientFiles) {
    const source = readFileSync(path, "utf8");
    if (/TECPEY_ADMIN_TOKEN|NEXT_PUBLIC_[A-Z_]*ADMIN[A-Z_]*TOKEN/.test(source)) leaking.push(path);
  }
  assert.deepEqual(leaking, [], "admin token references must not appear in browser-shipped code (SB-002)");

  assert.ok(
    !/NEXT_PUBLIC_/.test(PASSKEY_SERVICE),
    "the admin passkey service must not expose anything through a NEXT_PUBLIC_ variable",
  );
});
